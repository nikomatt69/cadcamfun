import { NextApiRequest, NextApiResponse } from "next";
import { buffer } from "micro";
import { prisma } from "src/lib/prisma";
import crypto from "crypto";
import { WEBHOOK_SECRET } from "@/src/lib/lemonsqueezy";

// Disable the default body parser
export const config = {
  api: {
    bodyParser: false
  }
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  try {
    // Get the raw request body
    const rawBody = await buffer(req);
    const signature = req.headers["x-signature"] as string;

    // Verify webhook signature
    const webhookSecret = WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error("LEMONSQUEEZY_WEBHOOK_SECRET is not set");
      return res.status(500).json({ message: "Server configuration error" });
    }

    const hmac = crypto.createHmac("sha256", webhookSecret);
    const digest = Buffer.from(hmac.update(rawBody).digest("hex"), "utf8");
    const signatureBuffer = Buffer.from(signature || "", "utf8");

    if (!crypto.timingSafeEqual(digest, signatureBuffer)) {
      console.error("Invalid webhook signature");
      return res.status(401).json({ message: "Invalid signature" });
    }

    // Parse the webhook payload
    const payload = JSON.parse(rawBody.toString());
    const { meta, data } = payload;

    // Process based on event type
    switch (meta.event_name) {
      case "subscription_created":
        await handleSubscriptionCreated(data);
        break;
      case "subscription_updated":
        await handleSubscriptionUpdated(data);
        break;
      case "subscription_cancelled":
        await handleSubscriptionCancelled(data);
        break;
      case "subscription_resumed":
        await handleSubscriptionResumed(data);
        break;
      case "subscription_expired":
        await handleSubscriptionExpired(data);
        break;
      case "order_created":
        // Handle new orders if needed
        break;
      default:
        console.log(`Unhandled event: ${meta.event_name}`);
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error("Error processing webhook:", error);
    return res.status(500).json({ message: "Failed to process webhook" });
  }
}

// Helper functions for event handling

async function handleSubscriptionCreated(data: any) {
  const attributes = data.attributes;
  const metadata = attributes.custom_data || {};
  const userId = metadata.user_id;

  if (!userId) {
    console.error("No user_id in subscription metadata");
    return;
  }

  // Get variant ID from product
  const variantId = attributes.variant_id?.toString();

  // Update or create subscription record
  await prisma.subscription.upsert({
    where: { userId },
    update: {
      lsSubscriptionId: data.id,
      lsCustomerId: attributes.customer_id?.toString(),
      lsVariantId: variantId,
      status: attributes.status,
      lsCurrentPeriodEnd: new Date(attributes.renews_at || attributes.ends_at),
      cancelAtPeriodEnd: attributes.cancelled,
      plan: variantId // Store the variant ID as the plan
    },
    create: {
      userId,
      lsSubscriptionId: data.id,
      lsCustomerId: attributes.customer_id?.toString(),
      lsVariantId: variantId,
      status: attributes.status,
      lsCurrentPeriodEnd: new Date(attributes.renews_at || attributes.ends_at),
      cancelAtPeriodEnd: attributes.cancelled,
      plan: variantId // Store the variant ID as the plan
    }
  });
}

async function handleSubscriptionUpdated(data: any) {
  const attributes = data.attributes;
  const subscription = await prisma.subscription.findFirst({
    where: { lsSubscriptionId: data.id }
  });

  if (!subscription) {
    console.error(`Subscription not found: ${data.id}`);
    return;
  }

  // Get variant ID from product
  const variantId = attributes.variant_id?.toString();

  // Update subscription record
  await prisma.subscription.update({
    where: { id: subscription.id },
    data: {
      lsVariantId: variantId,
      status: attributes.status,
      lsCurrentPeriodEnd: new Date(attributes.renews_at || attributes.ends_at),
      cancelAtPeriodEnd: attributes.cancelled,
      plan: variantId // Update the plan
    }
  });
}

async function handleSubscriptionCancelled(data: any) {
  const attributes = data.attributes;
  const subscription = await prisma.subscription.findFirst({
    where: { lsSubscriptionId: data.id }
  });

  if (!subscription) {
    console.error(`Subscription not found: ${data.id}`);
    return;
  }

  // Update subscription record
  await prisma.subscription.update({
    where: { id: subscription.id },
    data: {
      status: attributes.status,
      cancelAtPeriodEnd: true,
      lsCurrentPeriodEnd: new Date(attributes.ends_at)
    }
  });
}

async function handleSubscriptionResumed(data: any) {
  const attributes = data.attributes;
  const subscription = await prisma.subscription.findFirst({
    where: { lsSubscriptionId: data.id }
  });

  if (!subscription) {
    console.error(`Subscription not found: ${data.id}`);
    return;
  }

  // Update subscription record
  await prisma.subscription.update({
    where: { id: subscription.id },
    data: {
      status: attributes.status,
      cancelAtPeriodEnd: false,
      lsCurrentPeriodEnd: new Date(attributes.renews_at)
    }
  });
}

async function handleSubscriptionExpired(data: any) {
  const subscription = await prisma.subscription.findFirst({
    where: { lsSubscriptionId: data.id }
  });

  if (!subscription) {
    console.error(`Subscription not found: ${data.id}`);
    return;
  }

  // Update subscription record to free plan
  await prisma.subscription.update({
    where: { id: subscription.id },
    data: {
      status: "expired",
      plan: "free", // Revert to free plan
      lsVariantId: null
    }
  });
}
