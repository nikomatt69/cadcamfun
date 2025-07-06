// src/pages/api/production-costs/operation-costs/index.ts
import { NextApiRequest, NextApiResponse } from "next";
import { requireAuth } from "@/src/lib/api/auth";
import { prisma } from "@/src/lib/prisma";

/**
 * API endpoint for managing operation costs
 *
 * GET: Retrieve all operation costs accessible to the user
 * POST: Create a new operation cost
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  switch (req.method) {
    case "GET":
      try {
        const { organizationId } = req.query; // Allow filtering by organizationId

        const whereClause: any = {
          OR: [{ ownerId: userId }, { organization: { users: { some: { userId } } } }]
        };

        // If organizationId is specified, filter by that directly if the user is part of it.
        if (organizationId && typeof organizationId === "string") {
          const userInOrg = await prisma.userOrganization.findFirst({
            where: { userId, organizationId }
          });
          if (userInOrg) {
            whereClause.organizationId = organizationId;
            delete whereClause.OR;
          } else {
            return res
              .status(403)
              .json({ message: "Access to specified organization denied or organization not found." });
          }
        }

        const operationCosts = await prisma.operationCost.findMany({
          where: whereClause,
          include: {
            owner: { select: { id: true, name: true } },
            organization: { select: { id: true, name: true } }
          },
          orderBy: {
            name: "asc" // Order by operation name
          }
        });
        return res.status(200).json(operationCosts);
      } catch (error) {
        console.error("Error fetching Operation Costs:", error);
        return res.status(500).json({ message: "Failed to fetch Operation Costs." });
      }

    case "POST":
      try {
        const { name, machineHourlyRate, operatorHourlyRate, setupTime, currencyCode, organizationId } = req.body;

        if (
          !name ||
          String(name).trim() === "" ||
          typeof machineHourlyRate !== "number" ||
          typeof operatorHourlyRate !== "number"
        ) {
          return res
            .status(400)
            .json({ message: "Name, machine hourly rate, and operator hourly rate are required and must be valid." });
        }
        const trimmedName = String(name).trim();

        // If organizationId is provided, ensure user is part of that organization.
        if (organizationId) {
          const userInOrg = await prisma.userOrganization.findFirst({
            where: { userId, organizationId }
          });
          if (!userInOrg) {
            return res
              .status(403)
              .json({ message: "User is not a member of the specified organization for the cost record." });
          }
        }

        // Prevent duplicate OperationCost name within the same scope (user or organization)
        const conflictWhere: any = {
          name: trimmedName
        };
        if (organizationId) {
          conflictWhere.organizationId = organizationId;
        } else {
          conflictWhere.ownerId = userId;
          conflictWhere.organizationId = null; // Explicitly for personal costs
        }
        const existingCost = await prisma.operationCost.findFirst({ where: conflictWhere });

        if (existingCost) {
          return res
            .status(409)
            .json({ message: `An Operation Cost with the name "${trimmedName}" already exists in this scope.` });
        }

        const newOperationCost = await prisma.operationCost.create({
          data: {
            name: trimmedName,
            machineHourlyRate: Number(machineHourlyRate),
            operatorHourlyRate: Number(operatorHourlyRate),
            setupTime: setupTime !== undefined ? Number(setupTime) : 30, // Default setup time
            currencyCode: currencyCode || "EUR",
            ownerId: userId,
            organizationId: organizationId || null
          },
          include: {
            owner: { select: { id: true, name: true } },
            organization: { select: { id: true, name: true } }
          }
        });
        return res.status(201).json(newOperationCost);
      } catch (error) {
        console.error("Error creating Operation Cost:", error);
        if ((error as any).code === "P2002") {
          // Unique constraint failed (likely name)
          return res
            .status(409)
            .json({ message: "An Operation Cost with this name already exists (unique constraint failed)." });
        }
        return res.status(500).json({ message: "Failed to create Operation Cost." });
      }

    default:
      res.setHeader("Allow", ["GET", "POST"]);
      return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
  }
}
