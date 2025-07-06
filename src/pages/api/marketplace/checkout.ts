import { NextApiRequest, NextApiResponse } from "next";
import { requireAuth } from "@/src/lib/api/auth";
import { prisma } from "@/src/lib/prisma";
import { POLAR_CONFIG } from "@/src/lib/polar/config";
import { Polar } from "@polar-sh/sdk";

const polar = new Polar({
  accessToken: POLAR_CONFIG.accessToken,
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const userId = await requireAuth(req, res);
  if (!userId) return;

  try {
    const { itemId, successUrl, cancelUrl } = req.body;

    if (!itemId) {
      return res.status(400).json({ message: "Item ID is required" });
    }

    // Get the marketplace item from database
    const item = await prisma.marketplaceItem.findUnique({
      where: { id: itemId },
      include: {
        seller: true,
      },
    });

    if (!item) {
      return res.status(404).json({ message: "Item not found" });
    }

    if (!item.polarProductId) {
      return res
        .status(400)
        .json({ message: "Product not available for purchase" });
    }

    // Get user information
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Create checkout session with Polar
    const checkoutSession = await polar.checkouts.create({
      products: [item.polarProductId],
      successUrl:
        successUrl ||
        `${process.env.NEXTAUTH_URL}/marketplace/purchase/success?item=${itemId}`,
      customerEmail: user.email,
      metadata: {
        userId: userId,
        itemId: itemId,
        sellerId: item.sellerId,
      },
    });

    return res.status(200).json({
      checkoutUrl: checkoutSession.url,
      checkoutId: checkoutSession.id,
    });
  } catch (error) {
    console.error("Checkout creation error:", error);
    return res.status(500).json({
      message: "Failed to create checkout session",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
