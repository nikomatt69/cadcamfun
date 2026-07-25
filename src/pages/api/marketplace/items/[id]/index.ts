import { NextApiRequest, NextApiResponse } from "next";
import { requireAuth } from "src/lib/api/auth";
import { prisma } from "@/src/lib/prisma";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { id } = req.query;

  if (!id || typeof id !== "string") {
    return res.status(400).json({ message: "Invalid item ID" });
  }

  try {
    if (req.method === "GET") {
      return await getMarketplaceItem(req, res, id);
    } else if (req.method === "DELETE") {
      const userId = await requireAuth(req, res);

      if (!userId) return;
      return await deleteMarketplaceItem(req, res, userId, id);
    } else if (req.method === "PUT") {
      const userId = await requireAuth(req, res);

      if (!userId) return;
      return await updateMarketplaceItem(req, res, userId, id);
    }

    res.setHeader("Allow", ["GET", "DELETE", "PUT"]);
    return res
      .status(405)
      .json({ message: `Method ${req.method} Not Allowed` });
  } catch (error) {
    console.error("Marketplace item API error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}

async function getMarketplaceItem(
  req: NextApiRequest,
  res: NextApiResponse,
  itemId: string
) {
  const item = await prisma.marketplaceItem.findUnique({
    where: { id: itemId },
    include: {
      seller: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              image: true,
            },
          },
        },
      },
      reviews: {
        include: {
          buyer: {
            select: {
              id: true,
              name: true,
              image: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      },
      _count: {
        select: {
          reviews: true,
          orders: true,
        },
      },
    },
  });

  if (!item) {
    return res.status(404).json({ message: "Item not found" });
  }

  // Only show approved items to non-owners
  if (item.status !== "APPROVED" && req.headers.authorization) {
    const userId = await requireAuth(req, res);

    if (userId !== item.seller.userId) {
      return res.status(404).json({ message: "Item not found" });
    }
  }

  return res.status(200).json(item);
}

async function deleteMarketplaceItem(
  req: NextApiRequest,
  res: NextApiResponse,
  userId: string,
  itemId: string
) {
  // Find the item and verify ownership
  const item = await prisma.marketplaceItem.findUnique({
    where: { id: itemId },
    include: {
      seller: true,
      orders: true,
    },
  });

  if (!item) {
    return res.status(404).json({ message: "Item not found" });
  }

  // Check if user owns this item
  if (item.seller.userId !== userId) {
    return res.status(403).json({
      message: "You can only delete your own items",
    });
  }

  // Check if item has any completed orders
  const hasCompletedOrders = item.orders.some(
    (order) => order.status === "COMPLETED"
  );

  if (hasCompletedOrders) {
    return res.status(400).json({
      message:
        "Cannot delete items that have been purchased. You can set them as inactive instead.",
    });
  }

  try {
    // Delete related records first
    await prisma.$transaction(async (tx) => {
      // Delete reviews
      await tx.marketplaceReview.deleteMany({
        where: { itemId: itemId },
      });

      // Delete pending orders
      await tx.marketplaceOrder.deleteMany({
        where: {
          itemId: itemId,
          status: { in: ["PENDING", "FAILED"] },
        },
      });

      // Delete collection items
      await tx.marketplaceCollectionItem.deleteMany({
        where: { itemId: itemId },
      });

      // Delete wishlist entries
      await tx.marketplaceWishlist.deleteMany({
        where: { itemId: itemId },
      });

      // Finally delete the item
      await tx.marketplaceItem.delete({
        where: { id: itemId },
      });
    });

    console.log(`✅ Item deleted: ${itemId} by user: ${userId}`);

    return res.status(200).json({
      message: "Item deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting marketplace item:", error);
    return res.status(500).json({
      message: "Failed to delete item",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

async function updateMarketplaceItem(
  req: NextApiRequest,
  res: NextApiResponse,
  userId: string,
  itemId: string
) {
  const {
    title,
    description,
    shortDescription,
    price,
    tags,
    category,
    subcategory,
    previewImages,
    featured,
  } = req.body;

  // Find the item and verify ownership
  const item = await prisma.marketplaceItem.findUnique({
    where: { id: itemId },
    include: {
      seller: true,
    },
  });

  if (!item) {
    return res.status(404).json({ message: "Item not found" });
  }

  // Check if user owns this item
  if (item.seller.userId !== userId) {
    return res.status(403).json({
      message: "You can only edit your own items",
    });
  }

  try {
    const updatedItem = await prisma.marketplaceItem.update({
      where: { id: itemId },
      data: {
        title: title || item.title,
        description: description || item.description,
        shortDescription: shortDescription || item.shortDescription,
        price: price !== undefined ? price : item.price,
        tags: tags || item.tags,
        category: category || item.category,
        subcategory: subcategory || item.subcategory,
        previewImages: previewImages || item.previewImages,
        featured: featured !== undefined ? featured : item.featured,
        updatedAt: new Date(),
        // Reset approval status if significant changes are made
        status:
          title || description || price !== undefined
            ? "PENDING_REVIEW"
            : item.status,
        approvedAt:
          title || description || price !== undefined ? null : item.approvedAt,
        approvedBy:
          title || description || price !== undefined ? null : item.approvedBy,
      },
      include: {
        seller: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                image: true,
              },
            },
          },
        },
      },
    });

    console.log(`✅ Item updated: ${itemId} by user: ${userId}`);

    return res.status(200).json(updatedItem);
  } catch (error) {
    console.error("Error updating marketplace item:", error);
    return res.status(500).json({
      message: "Failed to update item",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
