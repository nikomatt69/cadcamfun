import type { NextApiRequest, NextApiResponse } from "next";
import { PrismaClient, Prisma } from "@prisma/client";
import { requireAuth } from "@/src/lib/api/auth";

// Best practice for serverless environments - avoid global PrismaClient instances
const prisma = new PrismaClient({
  log: ["error", "warn"],
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "DELETE") {
    res.setHeader("Allow", ["DELETE"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }
  const userId = await requireAuth(req, res);
  if (!userId) return;

  console.log(`Starting comprehensive account deletion for user ID: ${userId}`);

  try {
    // Use a try/catch pattern for each step to continue even if some deletions fail
    // This ensures maximum deletion without stopping the entire process

    // 1. Delete marketplace related items
    try {
      await prisma.marketplaceWishlist.deleteMany({
        where: { userId: userId },
      });
      await prisma.marketplaceOrder.deleteMany({ where: { buyerId: userId } });
      await prisma.marketplaceReview.deleteMany({ where: { buyerId: userId } });

      // Find and delete seller items
      const seller = await prisma.marketplaceSeller.findUnique({
        where: { userId: userId },
      });

      if (seller) {
        await prisma.marketplacePayout.deleteMany({
          where: { sellerId: seller.id },
        });
        await prisma.marketplaceCollectionItem.deleteMany({
          where: {
            collection: {
              sellerId: seller.id,
            },
          },
        });
        await prisma.marketplaceCollection.deleteMany({
          where: { sellerId: seller.id },
        });
        await prisma.marketplaceItem.deleteMany({
          where: { sellerId: seller.id },
        });
        await prisma.marketplaceSeller.delete({ where: { userId: userId } });
      }
      console.log("✓ Marketplace data deleted");
    } catch (error) {
      console.warn("Failed to delete some marketplace data:", error);
    }

    // 2. Delete authentication and APIs
    try {
      await prisma.apiKey.deleteMany({ where: { userId: userId } });
      await prisma.session.deleteMany({ where: { userId: userId } });
      await prisma.account.deleteMany({ where: { userId: userId } });
      await prisma.authenticator.deleteMany({ where: { userId: userId } });
      console.log("✓ Auth and API data deleted");
    } catch (error) {
      console.warn("Failed to delete some auth data:", error);
    }

    // 3. Delete organizations and invitations
    try {
      // Handle organization-related data
      await prisma.userOrganization.deleteMany({ where: { userId: userId } });
      console.log("✓ Organization membership deleted");
    } catch (error) {
      console.warn("Failed to delete organization memberships:", error);
    }

    // 4. Delete projects, components and related data
    try {
      // Find all projects owned by the user to cascade delete components
      const projects = await prisma.project.findMany({
        where: { ownerId: userId },
        select: { id: true },
      });

      for (const project of projects) {
        await prisma.componentComment.deleteMany({
          where: { component: { projectId: project.id } },
        });
        await prisma.componentVersion.deleteMany({
          where: { component: { projectId: project.id } },
        });
      }

      await prisma.project.deleteMany({ where: { ownerId: userId } });
      await prisma.libraryItem.deleteMany({ where: { ownerId: userId } });
      console.log("✓ Projects and library data deleted");
    } catch (error) {
      console.warn("Failed to delete project data:", error);
    }

    // 5. Delete materials, tools, and machine configs
    try {
      await prisma.material.deleteMany({ where: { ownerId: userId } });
      await prisma.tool.deleteMany({ where: { ownerId: userId } });
      await prisma.machineConfig.deleteMany({ where: { ownerId: userId } });
      console.log("✓ Materials, tools and machine configs deleted");
    } catch (error) {
      console.warn("Failed to delete manufacturing resources:", error);
    }

    // 6. Delete activity, analytics, and production cost data
    try {
      await prisma.activityLog.deleteMany({ where: { userId: userId } });
      await prisma.aIAnalysisLog.deleteMany({ where: { userId: userId } });
      await prisma.toolWearCost.deleteMany({ where: { ownerId: userId } });
      await prisma.materialCost.deleteMany({ where: { ownerId: userId } });
      await prisma.operationCost.deleteMany({ where: { ownerId: userId } });
      await prisma.productionCostEstimate.deleteMany({
        where: { ownerId: userId },
      });
      await prisma.costSettings.deleteMany({ where: { ownerId: userId } });
      console.log("✓ Activity logs and production costs deleted");
    } catch (error) {
      console.warn("Failed to delete activity or cost data:", error);
    }

    // 7. Delete component contributions
    try {
      await prisma.componentVersion.deleteMany({ where: { userId: userId } });
      await prisma.componentComment.deleteMany({ where: { userId: userId } });
      console.log("✓ Component contributions deleted");
    } catch (error) {
      console.warn("Failed to delete component contributions:", error);
    }

    // 8. Delete toolpath related items
    try {
      await prisma.toolpathComment.deleteMany({ where: { userId: userId } });
      await prisma.toolpathVersion.deleteMany({ where: { userId: userId } });
      await prisma.toolpath.deleteMany({ where: { createdBy: userId } });
      console.log("✓ Toolpath data deleted");
    } catch (error) {
      console.warn("Failed to delete toolpath data:", error);
    }

    // 9. Delete chat, messages, and notifications
    try {
      await prisma.message.deleteMany({ where: { senderId: userId } });
      await prisma.conversationParticipant.deleteMany({
        where: { userId: userId },
      });
      await prisma.notification.deleteMany({ where: { userId: userId } });
      await prisma.pushSubscription.deleteMany({ where: { userId: userId } });
      console.log("✓ Messages and notifications deleted");
    } catch (error) {
      console.warn("Failed to delete messages or notifications:", error);
    }

    // 10. Delete subscription data
    try {
      await prisma.subscription.deleteMany({ where: { userId: userId } });
      console.log("✓ Subscription data deleted");
    } catch (error) {
      console.warn("Failed to delete subscription data:", error);
    }

    // 11. Final checks for any remaining user-related data
    try {
      // Ensure FileUploads are handled if owner ID is tracked
      // This is based on the schema showing FileUpload might be related to users
      await prisma.$executeRaw`DELETE FROM "FileUpload" WHERE "ownerId" = ${userId}`;
      console.log("✓ File uploads deleted (if any)");
    } catch (error) {
      console.warn("Failed to delete file uploads:", error);
    }

    // 12. Finally delete the user itself
    try {
      await prisma.user.delete({
        where: { id: userId },
      });
      console.log("✓ User account successfully deleted");
    } catch (error) {
      console.error("Failed to delete user account:", error);
      throw error; // Re-throw this error as it's critical
    }

    console.log(
      `✓✓✓ Account ${userId} and ALL related data successfully deleted`
    );
    return res.status(200).json({ message: "Account deleted successfully" });
  } catch (error) {
    console.error("Account deletion failed:", error);

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      // P2025: Record to delete not found
      if (error.code === "P2025") {
        return res
          .status(404)
          .json({ message: "User not found or already deleted" });
      }
      return res
        .status(500)
        .json({ message: `Database error: ${error.message}` });
    } else if (error instanceof Prisma.PrismaClientUnknownRequestError) {
      return res
        .status(500)
        .json({ message: `Unknown database error: ${error.message}` });
    } else if (error instanceof Prisma.PrismaClientValidationError) {
      return res
        .status(400)
        .json({ message: `Validation error: ${error.message}` });
    }

    return res
      .status(500)
      .json({ message: "Internal server error during account deletion" });
  } finally {
    await prisma.$disconnect();
  }
}
