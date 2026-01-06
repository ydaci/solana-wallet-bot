import express from "express";
import Stripe from "stripe";
import dotenv from "dotenv";
import { creditUserAfterPayment, watchGuildWallets } from "./wallet";
import { connectMongo, getUserCredits } from "./mongo";
import { Client, GatewayIntentBits, SlashCommandBuilder } from "discord.js";
import { constructWebhookEvent, handleStripeWebhook } from "./stripe";

dotenv.config();

export const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const app = express();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2025-12-15.clover" });

await connectMongo();
app.use(express.json());

/* =========================
   🔹 STRIPE CHECKOUT
========================= */
app.post("/create-checkout-session", async (req, res) => {
    const { guildId, userId, productId } = req.body;
    if (!guildId || !userId || !productId) return res.status(400).json({ error: "Missing guildId, userId or productId" });

    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ["card"],
            mode: "payment",
            line_items: [{ price: productId, quantity: 1 }],
            success_url: `${process.env.SUCCESS_URL}?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: process.env.CANCEL_URL!,
            metadata: { guildId, userId, productId },
        });
        res.json({ url: session.url });
    } catch (err) {
        console.error("Stripe session creation failed:", err);
        res.status(500).json({ error: "Stripe session creation failed" });
    }
});

/* =========================
   🔹 WEBHOOK STRIPE 
========================= */
app.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
    const sig = req.headers["stripe-signature"]!;
    let event: Stripe.Event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
    } catch (err) {
        console.error("Webhook signature error:", err);
        return res.status(400).send(`Webhook Error: ${err}`);
    }

    if (event.type === "checkout.session.completed") {
        const session = event.data.object as Stripe.Checkout.Session;
        const { guildId, userId, productId } = session.metadata || {};

        if (guildId && userId && productId) {
            let plan: "PRO" | "ELITE";

            if (productId === process.env.PRICE_PRO) {
                plan = "PRO";
            } else if (productId === process.env.PRICE_ELITE) {
                plan = "ELITE";
            } else {
                console.error("❌ Unknown productId:", productId);
                return res.status(400).json({ error: "Unknown productId" });
            }

            await creditUserAfterPayment(guildId, userId, plan);
        }
    }

    res.json({ received: true });
});

/* =========================
   🔹 WHITELIST
========================= */


app.post("/stripe-webhook", express.raw({ type: "application/json" }), (req, res) => {
    try {
        const sigHeader = req.headers["stripe-signature"];
        if (!sigHeader) return res.status(400).send("Missing Stripe signature");

        const sig = Array.isArray(sigHeader) ? sigHeader[0] : sigHeader;
        const event = constructWebhookEvent(req.body, sig);
        handleStripeWebhook(event);
        res.status(200).send("ok");
    } catch (err) {
        console.error("Webhook error:", err);
        res.status(400).send(`Webhook Error: ${err}`);
    }
});


/* =========================
   🔹 DISCORD COMMANDS
========================= */
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const guildId = interaction.guildId!;
    const userId = interaction.user.id;

    if (interaction.commandName === "credits") {
        const credits = await getUserCredits(guildId, userId);
        await interaction.reply({ content: `💎 You have ${credits} credits.`, ephemeral: true });
    }
});

async function registerCommands() {
    const commands = [
        new SlashCommandBuilder().setName("credits").setDescription("Show your credit balance")
    ].map(c => c.toJSON());

    const rest = new (await import("discord.js")).REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN!);
    for (const guild of client.guilds.cache.values()) {
        await rest.put(`/applications/${client.user!.id}/guilds/${guild.id}/commands`, { body: commands });
    }
}

/* =========================
   ▶️ LAUNCH
========================= */
client.once("ready", async () => {
    console.log(`🤖 Logged in as ${client.user!.tag}`);
    registerCommands();
    setInterval(watchGuildWallets, 30_000);
});

client.login(process.env.DISCORD_TOKEN!);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`💳 Stripe server running on port ${PORT}`));
