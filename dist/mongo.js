"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.guildsCollection = void 0;
exports.connectMongo = connectMongo;
exports.canUseBot = canUseBot;
exports.addWallet = addWallet;
exports.removeWallet = removeWallet;
exports.getWallets = getWallets;
exports.setAlertChannel = setAlertChannel;
exports.getAlertChannel = getAlertChannel;
exports.getGuildPlan = getGuildPlan;
exports.setGuildPlan = setGuildPlan;
exports.addTransaction = addTransaction;
exports.addCreditsToUser = addCreditsToUser;
exports.getUserCredits = getUserCredits;
const mongodb_1 = require("mongodb");
let client;
let transactionsCollection;
async function connectMongo() {
    if (exports.guildsCollection && transactionsCollection)
        return;
    if (!process.env.MONGO_URI) {
        throw new Error("MONGO_URI missing");
    }
    client = new mongodb_1.MongoClient(process.env.MONGO_URI);
    await client.connect();
    const db = client.db("solanaBotDB");
    exports.guildsCollection = db.collection("guilds");
    transactionsCollection = db.collection("transactions");
    console.log("✅ MongoDB connected");
}
function getGuildsCollection() {
    if (!exports.guildsCollection) {
        throw new Error("Mongo not initialized. Call connectMongo()");
    }
    return exports.guildsCollection;
}
function getTransactionsCollection() {
    if (!transactionsCollection) {
        throw new Error("Mongo not initialized. Call connectMongo()");
    }
    return transactionsCollection;
}
/* =========================
   🔹 GUILD HELPERS
========================= */
async function ensureGuild(guildId) {
    await getGuildsCollection().updateOne({ guildId }, {
        $setOnInsert: {
            guildId,
            wallets: [],
            plan: "FREE",
            createdAt: new Date(),
        },
    }, { upsert: true });
}
/* =========================
   🔹 WALLETS
========================= */
async function canUseBot(guildId) {
    const guild = await exports.guildsCollection.findOne({ guildId });
    if (!guild)
        return false;
    return guild.expiresAt > new Date();
}
async function addWallet(guildId, wallet) {
    await ensureGuild(guildId);
    await getGuildsCollection().updateOne({ guildId }, { $addToSet: { wallets: wallet } });
}
async function removeWallet(guildId, wallet) {
    await ensureGuild(guildId);
    await getGuildsCollection().updateOne({ guildId }, { $pull: { wallets: wallet } });
}
async function getWallets(guildId) {
    await ensureGuild(guildId);
    const doc = await getGuildsCollection().findOne({ guildId });
    return doc?.wallets || [];
}
/* =========================
   🔹 ALERT CHANNEL
========================= */
async function setAlertChannel(guildId, channelId) {
    await ensureGuild(guildId);
    await getGuildsCollection().updateOne({ guildId }, { $set: { walletChannelId: channelId } });
}
async function getAlertChannel(guildId) {
    await ensureGuild(guildId);
    const doc = await getGuildsCollection().findOne({ guildId });
    return doc?.walletChannelId ?? null;
}
/* =========================
   🔹 PLAN (A2 CORE)
========================= */
async function getGuildPlan(guildId) {
    await ensureGuild(guildId);
    const doc = await getGuildsCollection().findOne({ guildId });
    return doc?.plan || "FREE";
}
async function setGuildPlan(guildId, plan) {
    await ensureGuild(guildId);
    await getGuildsCollection().updateOne({ guildId }, { $set: { plan } });
}
/* =========================
   🔹 TRANSACTIONS & CREDITS
========================= */
async function addTransaction(guildId, userId, productId, amount) {
    await getTransactionsCollection().insertOne({
        guildId,
        userId,
        productId,
        amount,
        date: new Date(),
    });
}
async function addCreditsToUser(guildId, userId, amount) {
    await ensureGuild(guildId);
    await getGuildsCollection().updateOne({ guildId }, { $inc: { [`credits.${userId}`]: amount } }, { upsert: true });
}
async function getUserCredits(guildId, userId) {
    await ensureGuild(guildId);
    const doc = await getGuildsCollection().findOne({ guildId });
    return doc?.credits?.[userId] || 0;
}
