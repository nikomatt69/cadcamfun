// src/pages/api/production-costs/tool-wear/[id].ts
import { NextApiRequest, NextApiResponse } from "next";
import { requireAuth } from "@/src/lib/api/auth";
import { prisma } from "@/src/lib/prisma";

/**
 * API endpoint for managing a specific tool wear cost by ID
 *
 * GET: Retrieve a specific tool wear cost
 * PUT: Update a specific tool wear cost
 * DELETE: Delete a specific tool wear cost
 */

// Helper function to check organization write access (similar to materials API)
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
    return res.status(400).json({ message: "Tool Wear Cost ID is required and must be a string." });
  }

  const toolWearCost = await prisma.toolWearCost.findFirst({
    where: {
      id,
      OR: [{ ownerId: userId }, { organization: { users: { some: { userId } } } }]
    },
    include: {
      owner: { select: { id: true } },
      organization: { select: { id: true } },
      tool: { select: { id: true, name: true } } // For context
    }
  });

  if (!toolWearCost) {
    return res.status(404).json({ message: "Tool Wear Cost not found or access denied." });
  }

  switch (req.method) {
    case "GET":
      // Refetch with full details for the response payload
      const detailedCost = await prisma.toolWearCost.findUnique({
        where: { id: toolWearCost.id }, // Use validated id
        include: {
          tool: true,
          owner: { select: { id: true, name: true, email: true } },
          organization: { select: { id: true, name: true } }
        }
      });
      return res.status(200).json(detailedCost);

    case "PUT":
      const canUpdate =
        toolWearCost.ownerId === userId ||
        (toolWearCost.organizationId ? await hasOrganizationWriteAccess(userId, toolWearCost.organizationId) : false);
      if (!canUpdate) {
        return res.status(403).json({ message: "You do not have permission to update this Tool Wear Cost." });
      }
      try {
        const { wearRatePerMeter, replacementCost, replacementThreshold, currencyCode } = req.body;

        // toolId is generally not updatable for an existing cost record.
        // If it were, complex validation for the new toolId would be needed.

        const updateData: {
          wearRatePerMeter?: number;
          replacementCost?: number;
          replacementThreshold?: number;
          currencyCode?: string;
          updatedAt: Date;
        } = { updatedAt: new Date() };

        if (wearRatePerMeter !== undefined) updateData.wearRatePerMeter = Number(wearRatePerMeter);
        if (replacementCost !== undefined) updateData.replacementCost = Number(replacementCost);
        if (replacementThreshold !== undefined) updateData.replacementThreshold = Number(replacementThreshold);
        if (currencyCode !== undefined) updateData.currencyCode = String(currencyCode);

        const updatedToolWearCost = await prisma.toolWearCost.update({
          where: { id: toolWearCost.id },
          data: updateData,
          include: { tool: true }
        });
        return res.status(200).json(updatedToolWearCost);
      } catch (error) {
        console.error("Error updating Tool Wear Cost:", error);
        if ((error as any).code === "P2025") {
          return res.status(404).json({ message: "Tool Wear Cost not found for update." });
        }
        return res.status(500).json({ message: "Failed to update Tool Wear Cost." });
      }

    case "DELETE":
      const canDelete =
        toolWearCost.ownerId === userId ||
        (toolWearCost.organizationId ? await hasOrganizationWriteAccess(userId, toolWearCost.organizationId) : false);
      if (!canDelete) {
        return res.status(403).json({ message: "You do not have permission to delete this Tool Wear Cost." });
      }
      try {
        await prisma.toolWearCost.delete({
          where: { id: toolWearCost.id }
        });
        return res.status(200).json({ message: "Tool Wear Cost deleted successfully." });
      } catch (error) {
        console.error("Error deleting Tool Wear Cost:", error);
        if ((error as any).code === "P2025") {
          return res.status(404).json({ message: "Tool Wear Cost not found for deletion." });
        }
        return res.status(500).json({ message: "Failed to delete Tool Wear Cost." });
      }

    default:
      res.setHeader("Allow", ["GET", "PUT", "DELETE"]);
      return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
  }
}
