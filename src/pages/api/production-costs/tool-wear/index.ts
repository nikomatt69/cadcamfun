/**
 * API Route for tool wear costs
 *
 * GET: Returns all tool wear costs accessible to the user
 * POST: Creates a new tool wear cost
 */
import { NextApiRequest, NextApiResponse } from "next";
import { requireAuth } from "@/src/lib/api/auth";
import { prisma } from "@/src/lib/prisma";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  switch (req.method) {
    case "GET":
      try {
        const { toolId, organizationId } = req.query;

        const whereClause: any = {
          OR: [{ ownerId: userId }, { organization: { users: { some: { userId } } } }]
        };

        if (toolId && typeof toolId === "string") {
          whereClause.toolId = toolId;
        }

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

        const toolWearCosts = await prisma.toolWearCost.findMany({
          where: whereClause,
          include: {
            tool: true,
            owner: { select: { id: true, name: true } },
            organization: { select: { id: true, name: true } }
          },
          orderBy: {
            tool: { name: "asc" }
          }
        });
        return res.status(200).json(toolWearCosts);
      } catch (error) {
        console.error("Error fetching Tool Wear Costs:", error);
        return res.status(500).json({ message: "Failed to fetch Tool Wear Costs." });
      }

    case "POST":
      try {
        const { toolId, wearRatePerMeter, replacementCost, replacementThreshold, currencyCode, organizationId } =
          req.body;

        if (!toolId || typeof wearRatePerMeter !== "number" || typeof replacementCost !== "number") {
          return res
            .status(400)
            .json({ message: "Tool ID, wear rate, and replacement cost are required and must be valid types." });
        }

        const tool = await prisma.tool.findFirst({
          where: {
            id: toolId,
            OR: [{ ownerId: userId }, { organizationId: organizationId, organization: { users: { some: { userId } } } }]
          }
        });

        if (!tool) {
          return res.status(404).json({ message: "Tool not found or not accessible by the user." });
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
          if (tool.ownerId !== userId && tool.organizationId !== organizationId) {
            return res.status(403).json({
              message: "The selected tool does not belong to the specified organization or the user directly."
            });
          }
        } else {
          if (tool.ownerId !== userId) {
            return res
              .status(403)
              .json({ message: "Tool must be owned by the user if the cost is not associated with an organization." });
          }
        }

        const existingCost = await prisma.toolWearCost.findFirst({
          where: {
            toolId,
            ownerId: userId,
            organizationId: organizationId || null
          }
        });

        if (existingCost) {
          return res
            .status(409)
            .json({ message: "A Tool Wear Cost for this tool already exists (for this owner/organization scope)." });
        }

        const newToolWearCost = await prisma.toolWearCost.create({
          data: {
            toolId,
            wearRatePerMeter,
            replacementCost,
            replacementThreshold: replacementThreshold !== undefined ? Number(replacementThreshold) : 100,
            currencyCode: currencyCode || "EUR",
            ownerId: userId,
            organizationId: organizationId || null
          },
          include: { tool: true }
        });
        return res.status(201).json(newToolWearCost);
      } catch (error) {
        console.error("Error creating Tool Wear Cost:", error);
        return res.status(500).json({ message: "Failed to create Tool Wear Cost." });
      }

    default:
      res.setHeader("Allow", ["GET", "POST"]);
      return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
  }
}
