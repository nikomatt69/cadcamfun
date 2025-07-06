// src/pages/api/production-costs/operation-costs/[id].ts
import { NextApiRequest, NextApiResponse } from "next";
import { requireAuth } from "@/src/lib/api/auth";
import { prisma } from "@/src/lib/prisma";

/**
 * API endpoint for managing a specific operation cost by ID
 *
 * GET: Retrieve a specific operation cost
 * PUT: Update a specific operation cost
 * DELETE: Delete a specific operation cost
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
    return res.status(400).json({ message: "Operation Cost ID is required and must be a string." });
  }

  const operationCost = await prisma.operationCost.findFirst({
    where: {
      id,
      OR: [{ ownerId: userId }, { organization: { users: { some: { userId } } } }]
    },
    include: {
      owner: { select: { id: true } },
      organization: { select: { id: true } }
    }
  });

  if (!operationCost) {
    return res.status(404).json({ message: "Operation Cost not found or access denied." });
  }

  switch (req.method) {
    case "GET":
      const detailedCost = await prisma.operationCost.findUnique({
        where: { id: operationCost.id },
        include: {
          owner: { select: { id: true, name: true, email: true } },
          organization: { select: { id: true, name: true } }
        }
      });
      return res.status(200).json(detailedCost);

    case "PUT":
      const canUpdate =
        operationCost.ownerId === userId ||
        (operationCost.organizationId ? await hasOrganizationWriteAccess(userId, operationCost.organizationId) : false);
      if (!canUpdate) {
        return res.status(403).json({ message: "You do not have permission to update this Operation Cost." });
      }
      try {
        const { name, machineHourlyRate, operatorHourlyRate, setupTime, currencyCode } = req.body;

        const updateData: {
          name?: string;
          machineHourlyRate?: number;
          operatorHourlyRate?: number;
          setupTime?: number;
          currencyCode?: string;
          updatedAt: Date;
        } = { updatedAt: new Date() };

        if (name !== undefined && String(name).trim() !== operationCost.name) {
          const newName = String(name).trim();
          if (!newName) {
            return res.status(400).json({ message: "Operation Cost name cannot be empty." });
          }
          const conflictWhere: any = {
            name: newName,
            NOT: { id: operationCost.id }
          };
          if (operationCost.organizationId) {
            conflictWhere.organizationId = operationCost.organizationId;
          } else {
            conflictWhere.ownerId = userId;
            conflictWhere.organizationId = null;
          }
          const existingByName = await prisma.operationCost.findFirst({ where: conflictWhere });

          if (existingByName) {
            return res
              .status(409)
              .json({ message: `An Operation Cost with the name "${newName}" already exists in this scope.` });
          }
          updateData.name = newName;
        }
        if (machineHourlyRate !== undefined) updateData.machineHourlyRate = Number(machineHourlyRate);
        if (operatorHourlyRate !== undefined) updateData.operatorHourlyRate = Number(operatorHourlyRate);
        if (setupTime !== undefined) updateData.setupTime = Number(setupTime);
        if (currencyCode !== undefined) updateData.currencyCode = String(currencyCode);

        const updatedOperationCost = await prisma.operationCost.update({
          where: { id: operationCost.id },
          data: updateData,
          include: {
            owner: { select: { id: true, name: true } },
            organization: { select: { id: true, name: true } }
          }
        });
        return res.status(200).json(updatedOperationCost);
      } catch (error) {
        console.error("Error updating Operation Cost:", error);
        if ((error as any).code === "P2025") {
          return res.status(404).json({ message: "Operation Cost not found for update." });
        } else if ((error as any).code === "P2002") {
          return res.status(409).json({ message: "Operation Cost name conflict (unique constraint failed)." });
        }
        return res.status(500).json({ message: "Failed to update Operation Cost." });
      }

    case "DELETE":
      const canDelete =
        operationCost.ownerId === userId ||
        (operationCost.organizationId ? await hasOrganizationWriteAccess(userId, operationCost.organizationId) : false);
      if (!canDelete) {
        return res.status(403).json({ message: "You do not have permission to delete this Operation Cost." });
      }
      try {
        await prisma.operationCost.delete({
          where: { id: operationCost.id }
        });
        return res.status(200).json({ message: "Operation Cost deleted successfully." });
      } catch (error) {
        console.error("Error deleting Operation Cost:", error);
        if ((error as any).code === "P2025") {
          return res.status(404).json({ message: "Operation Cost not found for deletion." });
        }
        return res.status(500).json({ message: "Failed to delete Operation Cost." });
      }

    default:
      res.setHeader("Allow", ["GET", "PUT", "DELETE"]);
      return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
  }
}
