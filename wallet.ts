import "dotenv/config";
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  REST,
  Routes,
  SlashCommandBuilder,
  TextChannel,
  ThreadChannel,
} from "discord.js";
import { setTimeout } from "timers/promises";

import {
  connectMongo,
  addWallet,
  removeWallet,
  getWallets,
  setAlertChannel,
  getAlertChannel,
  getGuildPlan,
  setGuildPlan,
  addCreditsToUser,
  getUserCredits,
  Plan,
} from "./mongo";

/* =========================
   🔹 DISCORD SETUP
========================= */
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const DISCORD_TOKEN = process.env.DISCORD_TOKEN!;
if (!DISCORD_TOKEN) throw new Error("DISCORD_TOKEN missing");

/* =========================
   🔹 SOLANA SETUP
========================= */
const SOLANA_RPC =
  process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
const connection = new Connection(SOLANA_RPC, "confirmed");

/* =========================
   🔹 PLANS & COOLDOWNS
========================= */
const PLAN_LIMITS: Record<Plan, number> = { FREE: 2, PRO: 10, ELITE: 50 };
const COMMAND_COOLDOWNS: Record<Plan, number> = {
  FREE: 10_000,
  PRO: 3_000,
  ELITE: 1_000,
};
const cooldowns = new Map<string, number>();

/* =========================
   🔹 HELPERS
========================= */
function isValidSolanaAddress(address: string) {
  try {
    new PublicKey(address.trim());
    return true;
  } catch {
    return false;
  }
}

function withBranding(embed: EmbedBuilder) {
  return embed.setFooter({ text: "Powered by Solana Wallet Bot" });
}

function isTextChannel(
  channel: any
): channel is TextChannel | ThreadChannel {
  return channel instanceof TextChannel || channel instanceof ThreadChannel;
}

async function sendDiscordEmbed(guildId: string, embed: EmbedBuilder) {
  try {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;

    const channelId = await getAlertChannel(guildId);
    if (!channelId) return;

    const channel = await guild.channels.fetch(channelId);
    if (!channel || !isTextChannel(channel)) return;

    await channel.send({ embeds: [withBranding(embed)] });
  } catch (e) {
    console.error("❌ Failed to send embed:", e);
  }
}

/* =========================
   🔹 LAST SIGNATURE CACHE
========================= */
const lastProcessedSignature: Record<
  string,
  Record<string, string | null>
> = {};

/* =========================
   🔹 INIT WALLET CURSOR (ANTI-SPAM)
========================= */
async function initWalletCursor(guildId: string, wallet: PublicKey) {
  const sigs = await connection.getSignaturesForAddress(wallet, { limit: 1 });
  if (!sigs.length) return;

  lastProcessedSignature[guildId] ??= {};
  lastProcessedSignature[guildId][wallet.toBase58()] = sigs[0].signature;
}

/* =========================
   🔹 WATCHER SOLANA
========================= */
async function watchGuildWallets() {
  for (const guild of client.guilds.cache.values()) {
    const guildId = guild.id;
    lastProcessedSignature[guildId] ??= {};

    const wallets = await getWallets(guildId);
    if (!wallets.length) continue;

    for (const address of wallets) {
      if (!isValidSolanaAddress(address)) continue;

      const wallet = new PublicKey(address);
      const walletKey = wallet.toBase58();

      try {
        const signatures = await connection.getSignaturesForAddress(wallet, {
          limit: 10,
        });

        if (!signatures.length) continue;

        const lastSig = lastProcessedSignature[guildId][walletKey];

        if (!lastSig) {
          lastProcessedSignature[guildId][walletKey] =
            signatures[0].signature;
          continue;
        }

        const newSignatures = [];
        for (const sig of signatures) {
          if (sig.signature === lastSig) break;
          newSignatures.push(sig);
        }

        if (!newSignatures.length) continue;

        for (const sig of newSignatures.reverse()) {
          const tx = await connection.getTransaction(sig.signature, {
            maxSupportedTransactionVersion: 0,
          });

          if (!tx?.meta) continue;

          let solAmount = 0;
          let type: "IN" | "OUT" = "OUT";

          const accountKeys = tx.transaction.message.getAccountKeys();
          let i = 0;

          for (const segment of accountKeys.keySegments()) {
            for (const key of segment) {
              if (key.equals(wallet)) {
                const pre = tx.meta.preBalances[i] ?? 0;
                const post = tx.meta.postBalances[i] ?? 0;
                solAmount = Math.abs(post - pre) / LAMPORTS_PER_SOL;
                type = post > pre ? "IN" : "OUT";
              }
              i++;
            }
          }

          if (solAmount === 0) continue;

          const embed = new EmbedBuilder()
            .setTitle("🚨 New Solana Transaction")
            .setDescription(
              `[View on Solscan](https://solscan.io/tx/${sig.signature})`
            )
            .addFields(
              { name: "Wallet", value: walletKey },
              { name: "Amount (SOL)", value: solAmount.toFixed(4) },
              { name: "Type", value: type }
            )
            .setColor(type === "IN" ? 0x00ff00 : 0xff0000)
            .setTimestamp();

          await sendDiscordEmbed(guildId, embed);
          await setTimeout(500);
        }

        lastProcessedSignature[guildId][walletKey] =
          signatures[0].signature;
      } catch (e: any) {
        if (e.message?.includes("429")) {
          await setTimeout(5000);
        } else {
          console.error("❌ Watcher error:", e);
        }
      }
    }
  }
}

/* =========================
   🔹 CREDIT USER AFTER PAYMENT
========================= */
export async function creditUserAfterPayment(
  guildId: string,
  userId: string,
  plan: Plan
) {
  // 🔹 Déterminer le nombre max de wallets selon le plan
  const maxWallets = PLAN_LIMITS[plan];

  // 🔹 Mettre à jour le plan dans Mongo
  await setGuildPlan(guildId, plan);

  // 🔹 Récupérer les crédits existants (2 arguments seulement)
  const currentCredits = await getUserCredits(guildId, userId);

  // 🔹 Ajouter les crédits manquants si nécessaire
  if (currentCredits < maxWallets) {
    const creditsToAdd = maxWallets - currentCredits;
    await addCreditsToUser(guildId, userId, creditsToAdd);
  }

  console.log(
    `✅ User ${userId} in guild ${guildId} credited with plan ${plan} (max wallets: ${maxWallets})`
  );
}

/* =========================
   🔹 DISCORD COMMANDS
========================= */
async function registerCommands() {
  const commands = [
    new SlashCommandBuilder()
      .setName("setchannel")
      .setDescription("Set the wallet alert channel")
      .addChannelOption((o) =>
        o.setName("channel").setDescription("Alert channel").setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName("addwallet")
      .setDescription("Add a Solana wallet to monitor")
      .addStringOption((o) =>
        o.setName("wallet").setDescription("Wallet address").setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName("removewallet")
      .setDescription("Remove a monitored wallet")
      .addStringOption((o) =>
        o.setName("wallet").setDescription("Wallet address").setRequired(true)
      ),
  ].map((c) => c.toJSON());

  const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);

  for (const guild of client.guilds.cache.values()) {
    await rest.put(
      Routes.applicationGuildCommands(client.user!.id, guild.id),
      { body: commands }
    );
  }
}

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const guildId = interaction.guildId!;
  const plan = await getGuildPlan(guildId);

  if (interaction.commandName === "setchannel") {
    const channel = interaction.options.getChannel("channel", true);
    if (!isTextChannel(channel))
      return interaction.reply({
        content: "❌ Must be a text channel",
        ephemeral: true,
      });

    await setAlertChannel(guildId, channel.id);
    return interaction.reply({
      content: "✅ Alert channel set",
      ephemeral: true,
    });
  }

  if (interaction.commandName === "addwallet") {
    const wallet = interaction.options.getString("wallet", true).trim();
    if (!isValidSolanaAddress(wallet))
      return interaction.reply({
        content: "❌ Invalid wallet",
        ephemeral: true,
      });

    const wallets = await getWallets(guildId);
    const limit = PLAN_LIMITS[plan];
    if (wallets.length >= limit)
      return interaction.reply({
        content: `❌ Wallet limit reached (${plan} – ${limit})`,
        ephemeral: true,
      });

    await addWallet(guildId, wallet);
    await initWalletCursor(guildId, new PublicKey(wallet));

    return interaction.reply({
      content: "✅ Wallet added\n🔕 Existing transactions ignored",
      ephemeral: true,
    });
  }

  if (interaction.commandName === "removewallet") {
    const wallet = interaction.options.getString("wallet", true).trim();
    await removeWallet(guildId, wallet);
    return interaction.reply({
      content: "✅ Wallet removed",
      ephemeral: true,
    });
  }
});

/* =========================
   ▶️ MAIN
========================= */
async function main() {
  await connectMongo();
  await client.login(DISCORD_TOKEN);

  client.once("ready", async () => {
    console.log(`🤖 Logged in as ${client.user!.tag}`);
    await registerCommands();
    setInterval(watchGuildWallets, 30_000);
  });
}

export { watchGuildWallets };
main();
