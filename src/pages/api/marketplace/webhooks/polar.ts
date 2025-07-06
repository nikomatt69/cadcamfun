import { NextApiRequest, NextApiResponse } from "next";
import { Webhooks } from "@polar-sh/nextjs";
import { prisma } from "@/src/lib/prisma";

const webhookHandler = Webhooks({
  webhookSecret: process.env.POLAR_WEBHOOK_SECRET!,

  // Handle order paid (successful payment) - Updated to use onOrderPaid instead of onOrderCreated
  onOrderPaid: async (payload) => {
    console.log("💰 Order paid:", payload);

    try {
      const { metadata } = payload;
      const userId = metadata?.userId;
      const itemId = metadata?.itemId;
      const sellerId = metadata?.sellerId;

      if (!userId || !itemId || !sellerId) {
        console.error("Missing metadata in order payload");
        return;
      }

      // Update order to completed status
      const order = await prisma.marketplaceOrder.update({
        where: { id: payload.id },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          polarPaymentId: payload.id,
        },
      });

      // Update item download count
      await prisma.marketplaceItem.update({
        where: { id: itemId },
        data: {
          downloadCount: {
            increment: 1,
          },
          updatedAt: new Date(),
        },
      });

      // Update seller total sales and revenue
      await prisma.marketplaceSeller.update({
        where: { id: sellerId },
        data: {
          totalSales: {
            increment: 1,
          },
          totalRevenue: {
            increment: payload.amount / 100, // Convert from cents
          },
          updatedAt: new Date(),
        },
      });

      console.log("✅ Order record created:", order.id);
    } catch (error) {
      console.error("❌ Error handling order payment:", error);
    }
  },

  // Handle order creation (pending state)
  onOrderCreated: async (payload) => {
    console.log("📝 Order created (pending):", payload);

    try {
      const { metadata } = payload;
      const userId = metadata?.userId;
      const itemId = metadata?.itemId;
      const sellerId = metadata?.sellerId;

      if (!userId || !itemId || !sellerId) {
        console.error("Missing metadata in order payload");
        return;
      }

      // Create pending order record in database
      await prisma.marketplaceOrder.create({
        data: {
          id: payload.id,
          buyerId: userId,
          itemId: itemId,
          sellerId: sellerId,
          orderNumber: payload.id,
          unitPrice: payload.amount / 100, // Convert from cents
          commissionAmount: 0,
          sellerAmount: payload.amount / 100,
          quantity: 1,
          status: "PENDING", // Mark as pending until payment is confirmed
          totalPrice: payload.amount / 100, // Convert from cents
          currencyCode: payload.currency,
          polarCheckoutId: payload.checkout?.id,
          metadata: metadata,
        },
      });

      console.log("✅ Pending order record created:", payload.id);
    } catch (error) {
      console.error("❌ Error handling order creation:", error);
    }
  },

  // Handle checkout completion
  onCheckoutUpdated: async (payload) => {
    console.log("🛒 Checkout updated:", payload);

    if (payload.status === "confirmed") {
      // Checkout is confirmed, order should be created soon
      console.log("✅ Checkout confirmed, waiting for order creation...");
    }
  },

  // Handle product updates
  onProductUpdated: async (payload) => {
    console.log("📦 Product updated:", payload);

    try {
      // Find marketplace item by polar product ID
      const item = await prisma.marketplaceItem.findFirst({
        where: { polarProductId: payload.id },
      });

      if (item) {
        // Update item information if needed
        await prisma.marketplaceItem.update({
          where: { id: item.id },
          data: {
            // Update any relevant fields from Polar product
            updatedAt: new Date(),
          },
        });
        console.log("✅ Marketplace item updated:", item.id);
      }
    } catch (error) {
      console.error("❌ Error handling product update:", error);
    }
  },

  // Handle subscription events (for future subscription products)
  onSubscriptionCreated: async (payload) => {
    console.log("🔄 Subscription created:", payload);
    // Handle subscription logic if needed for recurring marketplace items
  },

  onSubscriptionUpdated: async (payload) => {
    console.log("🔄 Subscription updated:", payload);
    // Handle subscription updates
  },

  // Handle customer events
  onCustomerCreated: async (payload) => {
    console.log("👤 Customer created:", payload);
  },

  // Generic payload handler for debugging
  onPayload: async (payload) => {
    console.log("📨 Received webhook payload:", {
      type: payload.type,
      id: payload.data?.id || "unknown",
      timestamp: new Date().toISOString(),
    });
  },
});

export default webhookHandler;
