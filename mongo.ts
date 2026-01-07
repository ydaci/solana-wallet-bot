import { MongoClient, Collection } from "mongodb";

export interface GuildDocument {
    guildId: string;
    wallets: string[];
    walletChannelId?: string;
    plan: "FREE" | "PRO" | "ELITE";
    createdAt: Date;
    expiresAt: Date;
    credits?: Record<string, number>;
}

export interface TransactionDocument {
    guildId: string;
    userId: string;
    productId: string;
    amount: number;
    date: Date;
}

export type Plan = "FREE" | "PRO" | "ELITE";

const PLAN_RULES = {
    FREE: { maxWallets: 2, cooldown: 10000 },
    PRO: { maxWallets: 10, cooldown: 3000 },
    ELITE: { maxWallets: 50, cooldown: 1000 },
};


let client: MongoClient;
export let guildsCollection: Collection<GuildDocument>;
let transactionsCollection: Collection<TransactionDocument>;

export async function connectMongo() {
    if (guildsCollection && transactionsCollection) return;

    if (!process.env.MONGO_URI) {
        throw new Error("MONGO_URI missing");
    }

    client = new MongoClient(process.env.MONGO_URI);
    await client.connect();

    const db = client.db("solanaBotDB");
    guildsCollection = db.collection("guilds");
    transactionsCollection = db.collection("transactions");

    console.log("✅ MongoDB connected");
}

function getGuildsCollection(): Collection<GuildDocument> {
    if (!guildsCollection) {
        throw new Error("Mongo not initialized. Call connectMongo()");
    }
    return guildsCollection;
}

function getTransactionsCollection(): Collection<TransactionDocument> {
    if (!transactionsCollection) {
        throw new Error("Mongo not initialized. Call connectMongo()");
    }
    return transactionsCollection;
}

/* =========================
   🔹 GUILD HELPERS
========================= */
async function ensureGuild(guildId: string) {
    await getGuildsCollection().updateOne(
        { guildId },
        {
            $setOnInsert: {
                guildId,
                wallets: [],
                plan: "FREE",
                createdAt: new Date(),
                expiresAt: new Date(0),
            },
        },
        { upsert: true }
    );
}

/* =========================
   🔹 WALLETS
========================= */
export async function canUseBot(guildId: string): Promise<boolean> {
    const guild = await guildsCollection.findOne({ guildId });
    if (!guild) return false;

    if (guild.plan === "FREE") return true;

    return guild.expiresAt > new Date();
}

export async function addWallet(guildId: string, wallet: string) {
    await ensureGuild(guildId);

    const guild = await getGuildsCollection().findOne({ guildId });
    if (!guild) throw new Error("Guild not found");

    const currentWallets = guild.wallets || [];
    const plan = guild.plan;
    const maxWallets = PLAN_RULES[plan].maxWallets;

    if (currentWallets.includes(wallet)) {
        // Wallet is already present : nothing to do
        return;
    }

    if (currentWallets.length >= maxWallets) {
        throw new Error(
            `Wallet limit reached for plan ${plan} (${currentWallets.length}/${maxWallets})`
        );
    }

    await getGuildsCollection().updateOne(
        { guildId },
        { $addToSet: { wallets: wallet } }
    );
}

export async function removeWallet(guildId: string, wallet: string) {
    await ensureGuild(guildId);

    const guild = await getGuildsCollection().findOne({ guildId });
    if (!guild) throw new Error("Guild not found");

    const currentWallets = guild.wallets || [];
    if (!currentWallets.includes(wallet)) {
        // Wallet is not present : nothing to do
        return;
    }

    await getGuildsCollection().updateOne(
        { guildId },
        { $pull: { wallets: wallet } }
    );
}

export async function getWallets(guildId: string): Promise<string[]> {
    await ensureGuild(guildId);

    const doc = await getGuildsCollection().findOne({ guildId });
    return doc?.wallets || [];
}

/* =========================
   🔹 ALERT CHANNEL
========================= */
export async function setAlertChannel(
    guildId: string,
    channelId: string
) {
    await ensureGuild(guildId);

    await getGuildsCollection().updateOne(
        { guildId },
        { $set: { walletChannelId: channelId } }
    );
}

export async function getAlertChannel(
    guildId: string
): Promise<string | null> {
    await ensureGuild(guildId);

    const doc = await getGuildsCollection().findOne({ guildId });
    return doc?.walletChannelId ?? null;
}

/* =========================
   🔹 PLAN (A2 CORE)
========================= */
export async function getGuildPlan(
    guildId: string
): Promise<Plan> {
    await ensureGuild(guildId);

    const doc = await getGuildsCollection().findOne({ guildId });
    return (doc?.plan as Plan) || "FREE";
}

export async function setGuildPlan(
    guildId: string,
    plan: Plan
) {
    await ensureGuild(guildId);

    await getGuildsCollection().updateOne(
        { guildId },
        { $set: { plan } }
    );
}

/* =========================
   🔹 TRANSACTIONS & CREDITS
========================= */
export async function addTransaction(
    guildId: string,
    userId: string,
    productId: string,
    amount: number
) {
    await getTransactionsCollection().insertOne({
        guildId,
        userId,
        productId,
        amount,
        date: new Date(),
    });
}

export async function addCreditsToUser(
    guildId: string,
    userId: string,
    amount: number
) {
    await ensureGuild(guildId);

    await getGuildsCollection().updateOne(
        { guildId },
        { $inc: { [`credits.${userId}`]: amount } },
        { upsert: true }
    );
}

export async function getUserCredits(
    guildId: string,
    userId: string
): Promise<number> {
    await ensureGuild(guildId);

    const doc = await getGuildsCollection().findOne({ guildId });
    return doc?.credits?.[userId] || 0;
}

export async function activateGuild(
    guildId: string,
    plan: Plan,
    durationInDays: number
) {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + durationInDays);

    await getGuildsCollection().updateOne(
        { guildId },
        {
            $set: {
                plan,
                expiresAt,
                status: "active"
            }
        },
        { upsert: true }
    );
}