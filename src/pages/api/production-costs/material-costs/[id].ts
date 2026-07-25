// src/pages/api/production-costs/material-costs/[id].ts
import { NextApiRequest, NextApiResponse } from "next";
import { requireAuth } from "src/lib/api/auth";
import { prisma } from "@/src/lib/prisma";

/**
 * API endpoint for managing a specific material cost by ID
 *
 * GET: Retrieve a specific material cost
 * PUT: Update a specific material cost
 * DELETE: Delete a specific material cost
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
    return res.status(400).json({ message: "Material Cost ID is required and must be a string." });
  }

  const materialCost = await prisma.materialCost.findFirst({
    where: {
      id,
      OR: [{ ownerId: userId }, { organization: { users: { some: { userId } } } }]
    },
    include: {
      owner: { select: { id: true } },
      organization: { select: { id: true } },
      material: { select: { id: true, name: true } } // For context
    }
  });

  if (!materialCost) {
    return res.status(404).json({ message: "Material Cost not found or access denied." });
  }

  switch (req.method) {
    case "GET":
      // Refetch with full details for the response payload
      const detailedCost = await prisma.materialCost.findUnique({
        where: { id: materialCost.id }, // Use validated id
        include: {
          material: true,
          owner: { select: { id: true, name: true, email: true } },
          organization: { select: { id: true, name: true } }
        }
      });
      return res.status(200).json(detailedCost);

    case "PUT":
      const canUpdate =
        materialCost.ownerId === userId ||
        (materialCost.organizationId ? await hasOrganizationWriteAccess(userId, materialCost.organizationId) : false);
      if (!canUpdate) {
        return res.status(403).json({ message: "You do not have permission to update this Material Cost." });
      }
      try {
        const { materialId, costPerUnit, wasteFactor, minimumCharge, currencyCode } = req.body;

        // materialId is generally not updatable for an existing cost record.
        // If it were, complex validation for the new materialId would be needed.

        const updateData: {
          costPerUnit?: number;
          wasteFactor?: number;
          minimumCharge?: number;
          currencyCode?: string;
          updatedAt: Date;
        } = { updatedAt: new Date() };

        if (costPerUnit !== undefined) updateData.costPerUnit = Number(costPerUnit);
        if (wasteFactor !== undefined) updateData.wasteFactor = Number(wasteFactor);
        if (minimumCharge !== undefined) updateData.minimumCharge = Number(minimumCharge);
        if (currencyCode !== undefined) updateData.currencyCode = String(currencyCode);

        const updatedMaterialCost = await prisma.materialCost.update({
          where: { id: materialCost.id },
          data: updateData,
          include: { material: true }
        });
        return res.status(200).json(updatedMaterialCost);
      } catch (error) {
        console.error("Error updating Material Cost:", error);
        if ((error as any).code === "P2025") {
          return res.status(404).json({ message: "Material Cost not found for update." });
        }
        return res.status(500).json({ message: "Failed to update Material Cost." });
      }

    case "DELETE":
      const canDelete =
        materialCost.ownerId === userId ||
        (materialCost.organizationId ? await hasOrganizationWriteAccess(userId, materialCost.organizationId) : false);
      if (!canDelete) {
        return res.status(403).json({ message: "You do not have permission to delete this Material Cost." });
      }
      try {
        await prisma.materialCost.delete({
          where: { id: materialCost.id }
        });
        return res.status(200).json({ message: "Material Cost deleted successfully." });
      } catch (error) {
        console.error("Error deleting Material Cost:", error);
        if ((error as any).code === "P2025") {
          return res.status(404).json({ message: "Material Cost not found for deletion." });
        }
        return res.status(500).json({ message: "Failed to delete Material Cost." });
      }

    default:
      res.setHeader("Allow", ["GET", "PUT", "DELETE"]);
      return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
  }
}
