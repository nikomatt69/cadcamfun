// src/pages/api/production-costs/estimates/[id].ts
import { NextApiRequest, NextApiResponse } from "next";
import { requireAuth } from "@/src/lib/api/auth";
import { prisma } from "@/src/lib/prisma";

/**
 * API endpoint for managing a specific production cost estimate by ID
 *
 * GET: Retrieve a specific production cost estimate
 * PUT: Update a specific production cost estimate
 * DELETE: Delete a specific production cost estimate
 */

async function hasOrganizationWriteAccess(userId: string, organizationId: string): Promise<boolean> {
  if (!organizationId) return false;
  const userOrg = await prisma.userOrganization.findFirst({
    where: {
      userId,
      organizationId,
      role: { in: ["ADMIN", "MANAGER"] }
    }
  });
  return !!userOrg;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const { id } = req.query;
  if (!id || typeof id !== "string") {
    return res.status(400).json({ message: "Estimate ID is required and must be a string." });
  }

  // Initial fetch for existence and access check metadata
  const estimate = await prisma.productionCostEstimate.findFirst({
    where: {
      id,
      OR: [{ ownerId: userId }, { organization: { users: { some: { userId } } } }]
    },
    include: {
      owner: { select: { id: true } },
      organization: { select: { id: true } }
    }
  });

  if (!estimate) {
    return res.status(404).json({ message: "Estimate not found or access denied." });
  }

  switch (req.method) {
    case "GET":
      // Refetch with full details for the response
      const detailedEstimate = await prisma.productionCostEstimate.findUnique({
        where: { id: estimate.id },
        include: {
          toolpath: { select: { id: true, name: true, projectId: true } },
          operationCost: true,
          // costSettings: true, // Temporarily removed due to linter error - pending schema review
          owner: { select: { id: true, name: true, email: true } },
          organization: { select: { id: true, name: true } }
        }
      });
      // Ensure the found estimate from detailed fetch still pertains to the user (redundant if initial check is solid)
      if (
        !detailedEstimate ||
        (detailedEstimate.ownerId !== userId &&
          !(
            detailedEstimate.organizationId &&
            (await prisma.userOrganization.count({
              where: { userId, organizationId: detailedEstimate.organizationId }
            }))
          ))
      ) {
        return res.status(404).json({ message: "Estimate not found or access denied after detailed fetch." });
      }
      return res.status(200).json(detailedEstimate);

    case "PUT":
      const canUpdate =
        estimate.ownerId === userId ||
        (estimate.organizationId ? await hasOrganizationWriteAccess(userId, estimate.organizationId) : false);
      if (!canUpdate) {
        return res.status(403).json({ message: "You do not have permission to update this Estimate." });
      }
      try {
        // For now, only allow updating limited fields like notes, currencyCode, or details.
        // Most fields are calculated and should be updated via recalculation.
        const { currencyCode, details, notes /* add notes to Prisma schema if needed */ } = req.body;

        const updateData: {
          currencyCode?: string;
          details?: any; // Prisma JSON type
          notes?: string;
          updatedAt: Date;
        } = { updatedAt: new Date() };

        if (currencyCode !== undefined) updateData.currencyCode = String(currencyCode);
        if (details !== undefined) updateData.details = details; // Assuming details is a JSON field
        if (notes !== undefined) updateData.notes = String(notes);

        if (Object.keys(updateData).length === 1 && "updatedAt" in updateData) {
          return res.status(400).json({ message: "No updatable fields provided." });
        }

        const updatedEstimate = await prisma.productionCostEstimate.update({
          where: { id: estimate.id },
          data: updateData,
          include: {
            toolpath: { select: { id: true, name: true } },
            owner: { select: { id: true, name: true } },
            organization: { select: { id: true, name: true } }
            // costSettings: true, // Temporarily removed
          }
        });
        return res.status(200).json(updatedEstimate);
      } catch (error) {
        console.error("Error updating Estimate:", error);
        if ((error as any).code === "P2025") {
          return res.status(404).json({ message: "Estimate not found for update." });
        }
        return res.status(500).json({ message: "Failed to update Estimate." });
      }

    case "DELETE":
      const canDelete =
        estimate.ownerId === userId ||
        (estimate.organizationId ? await hasOrganizationWriteAccess(userId, estimate.organizationId) : false);
      if (!canDelete) {
        return res.status(403).json({ message: "You do not have permission to delete this Estimate." });
      }
      try {
        await prisma.productionCostEstimate.delete({
          where: { id: estimate.id }
        });
        return res.status(200).json({ message: "Estimate deleted successfully." });
      } catch (error) {
        console.error("Error deleting Estimate:", error);
        if ((error as any).code === "P2025") {
          return res.status(404).json({ message: "Estimate not found for deletion." });
        }
        return res.status(500).json({ message: "Failed to delete Estimate." });
      }

    default:
      res.setHeader("Allow", ["GET", "PUT", "DELETE"]);
      return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
  }
}
