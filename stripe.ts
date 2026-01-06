import Stripe from "stripe";
import dotenv from "dotenv";
import { addGuildToWhitelist } from "./wallet"; // Import of the whitelist function

dotenv.config();

if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY missing");
if (!process.env.PRICE_PRO) throw new Error("PRICE_PRO missing");
if (!process.env.PRICE_ELITE) throw new Error("PRICE_ELITE missing");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2025-12-15.clover" });

// 🔹 Centralized Price IDs
export const STRIPE_PRICES = {
    PRO: process.env.PRICE_PRO!,
    ELITE: process.env.PRICE_ELITE!,
};

// 🔹 Fonction to get the PriceId in function of the plan
export function getPriceId(plan: "PRO" | "ELITE") {
    return STRIPE_PRICES[plan];
}

// 🔹 Fonction to create a checkout session
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
        metadata: { guildId, userId, productId: priceId, plan }, // add of the plan in the metadata
    });

    return session.url;
}

// 🔹 Function to validate the Stripe webhook
export function constructWebhookEvent(rawBody: Buffer, sig: string): Stripe.Event {
    if (!process.env.STRIPE_WEBHOOK_SECRET) throw new Error("STRIPE_WEBHOOK_SECRET missing");

    return stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET!);
}

// 🔹 Webhook handler to connect to the Express server
export async function handleStripeWebhook(event: Stripe.Event) {
    switch (event.type) {
        case "checkout.session.completed":
            const session = event.data.object as Stripe.Checkout.Session;
            const guildId = session.metadata?.guildId;
            const userId = session.metadata?.userId;
            const plan = session.metadata?.plan as "PRO" | "ELITE";

            if (!guildId || !userId || !plan) {
                console.warn("⚠️ Missing metadata in Stripe session:", session.id);
                return;
            }

            // 🔹 Automatic add to the whitelist
            await addGuildToWhitelist(guildId, plan, 30); // 30 days byt default
            console.log(`✅ Guild ${guildId} added to whitelist after payment for plan ${plan}`);
            break;

        default:
            console.log(`ℹ️ Unhandled Stripe event type: ${event.type}`);
    }
}

export default stripe;
