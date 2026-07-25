// src/pages/api/production-costs/material-costs/index.ts
import { NextApiRequest, NextApiResponse } from "next";
import { requireAuth } from "src/lib/api/auth";
import { prisma } from "@/src/lib/prisma";

/**
 * API endpoint for managing material costs
 *
 * GET: Retrieve all material costs accessible to the user
 * POST: Create a new material cost
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  switch (req.method) {
    case "GET":
      try {
        const { materialId, organizationId } = req.query;

        const whereClause: any = {
          OR: [{ ownerId: userId }, { organization: { users: { some: { userId } } } }]
        };

        if (materialId && typeof materialId === "string") {
          whereClause.materialId = materialId;
        }

        if (organizationId && typeof organizationId === "string") {
          const userInOrg = await prisma.userOrganization.findFirst({
            where: { userId, organizationId }
          });
          if (userInOrg) {
            whereClause.organizationId = organizationId;
            delete whereClause.OR; // Filter specifically by this org
          } else {
            return res
              .status(403)
              .json({ message: "Access to specified organization denied or organization not found." });
          }
        }

        const materialCosts = await prisma.materialCost.findMany({
          where: whereClause,
          include: {
            material: true,
            owner: { select: { id: true, name: true } },
            organization: { select: { id: true, name: true } }
          },
          orderBy: {
            material: { name: "asc" }
          }
        });

        return res.status(200).json(materialCosts);
      } catch (error) {
        console.error("Error fetching Material Costs:", error);
        return res.status(500).json({ message: "Failed to fetch Material Costs." });
      }

    case "POST":
      try {
        const { materialId, costPerUnit, wasteFactor, minimumCharge, currencyCode, organizationId } = req.body;

        if (!materialId || typeof costPerUnit !== "number") {
          return res
            .status(400)
            .json({ message: "Material ID and cost per unit are required and must be valid types." });
        }

        const material = await prisma.material.findFirst({
          where: {
            id: materialId,
            OR: [
              { ownerId: userId },
              { isPublic: true },
              { organizationId: organizationId, organization: { users: { some: { userId } } } }
            ]
          }
        });

        if (!material) {
          return res.status(404).json({
            message: "Material not found, not public, or not accessible by the user within the specified organization."
          });
        }

        if (organizationId) {
          const userInOrg = await prisma.userOrganization.findFirst({
            where: { userId, organizationId }
          });
          if (!userInOrg) {
            return res
              .status(403)
              .json({ message: "User is not a member of the specified organization for the cost record." });
          }
          if (material.ownerId !== userId && material.organizationId !== organizationId && !material.isPublic) {
            return res.status(403).json({
              message:
                "The selected material does not belong to the specified organization, is not public, nor owned by the user."
            });
          }
        } else {
          if (material.ownerId !== userId && !material.isPublic) {
            return res.status(403).json({
              message:
                "Material must be owned by the user or be public if the cost is not associated with an organization."
            });
          }
        }

        const existingCost = await prisma.materialCost.findFirst({
          where: {
            materialId,
            ownerId: userId,
            organizationId: organizationId || null
          }
        });

        if (existingCost) {
          return res
            .status(409)
            .json({ message: "A Material Cost for this material by this user/organization already exists." });
        }

        const newMaterialCost = await prisma.materialCost.create({
          data: {
            materialId,
            costPerUnit: Number(costPerUnit),
            wasteFactor: wasteFactor !== undefined ? Number(wasteFactor) : 0,
            minimumCharge: minimumCharge !== undefined ? Number(minimumCharge) : 0,
            currencyCode: currencyCode || "EUR",
            ownerId: userId,
            organizationId: organizationId || null
          },
          include: { material: true }
        });
        return res.status(201).json(newMaterialCost);
      } catch (error) {
        console.error("Error creating Material Cost:", error);
        return res.status(500).json({ message: "Failed to create Material Cost." });
      }

    default:
      res.setHeader("Allow", ["GET", "POST"]);
      return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
  }
}
