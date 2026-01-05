// stripe.ts
import Stripe from "stripe";
import dotenv from "dotenv";

dotenv.config();

if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY missing");
if (!process.env.PRICE_PRO) throw new Error("PRICE_PRO missing");
if (!process.env.PRICE_ELITE) throw new Error("PRICE_ELITE missing");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2025-12-15.clover" });

// 🔹 Price IDs centralisés
export const STRIPE_PRICES = {
    PRO: process.env.PRICE_PRO!,
    ELITE: process.env.PRICE_ELITE!,
};

// 🔹 Fonction pour récupérer le Price ID en fonction du plan
export function getPriceId(plan: "PRO" | "ELITE") {
    return STRIPE_PRICES[plan];
}

// 🔹 Fonction pour créer une session checkout
export async function createCheckoutSession(
    guildId: string,
    userId: string,
    plan: "PRO" | "ELITE"
) {
    const priceId = getPriceId(plan);

    const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        mode: "payment",
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${process.env.SUCCESS_URL}?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: process.env.CANCEL_URL!,
        metadata: { guildId, userId, productId: priceId },
    });

    return session.url;
}

// 🔹 Fonction pour valider le webhook Stripe
export function constructWebhookEvent(rawBody: Buffer, sig: string): Stripe.Event {
    if (!process.env.STRIPE_WEBHOOK_SECRET) throw new Error("STRIPE_WEBHOOK_SECRET missing");

    return stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET!);
}

export default stripe;
