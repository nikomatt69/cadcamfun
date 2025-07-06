// src/pages/api/production-costs/estimates/index.ts
import { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/src/lib/prisma";
import { requireAuth } from "@/src/lib/api/auth";

/**
 * API endpoint for managing production cost estimates
 *
 * GET: Retrieve all cost estimates accessible to the user
 * POST: Create a new cost estimate
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  switch (req.method) {
    case "GET":
      try {
        const { toolpathId, organizationId, projectId } = req.query;

        const whereClause: any = {
          OR: [{ ownerId: userId }, { organization: { users: { some: { userId } } } }]
        };

        if (toolpathId && typeof toolpathId === "string") {
          whereClause.toolpathId = toolpathId;
        }

        if (projectId && typeof projectId === "string") {
          // Ensure user has access to this project before filtering by it
          const projectAccess = await prisma.project.findFirst({
            where: {
              id: projectId,
              OR: [{ ownerId: userId }, { organization: { users: { some: { userId } } } }]
            }
          });
          if (!projectAccess) {
            return res.status(403).json({ message: "Access to specified project denied or project not found." });
          }
          whereClause.toolpath = { projectId: projectId };
        }

        if (organizationId && typeof organizationId === "string") {
          const userInOrg = await prisma.userOrganization.findFirst({
            where: { userId, organizationId }
          });
          if (userInOrg) {
            whereClause.organizationId = organizationId;
            if (whereClause.OR) delete whereClause.OR; // Prioritize specific org filter
          } else {
            return res
              .status(403)
              .json({ message: "Access to specified organization denied or organization not found." });
          }
        }

        const estimates = await prisma.productionCostEstimate.findMany({
          where: whereClause,
          include: {
            toolpath: { select: { id: true, name: true, projectId: true } },
            operationCost: true, // Or select specific fields
            owner: { select: { id: true, name: true } },
            organization: { select: { id: true, name: true } }
          },
          orderBy: {
            updatedAt: "desc"
          }
        });
        return res.status(200).json(estimates);
      } catch (error) {
        console.error("Error fetching estimates:", error);
        return res.status(500).json({ message: "Failed to fetch estimates." });
      }

    case "POST":
      try {
        const {
          toolpathId,
          materialCost,
          toolWearCost,
          machineTime,
          machineTimeCost,
          operatorTime,
          operatorTimeCost,
          setupCost,
          totalCost,
          currencyCode,
          details,
          operationCostId,
          costSettingsId,
          organizationId
        } = req.body;

        if (!toolpathId || totalCost === undefined || totalCost === null) {
          // totalCost can be 0
          return res.status(400).json({ message: "Toolpath ID and Total Cost are required." });
        }

        // Verify toolpath access
        const toolpath = await prisma.toolpath.findFirst({
          where: {
            id: toolpathId,
            OR: [
              { createdBy: userId }, // Direct creator
              { project: { OR: [{ ownerId: userId }, { organization: { users: { some: { userId } } } }] } } // Via project access
            ]
          },
          include: { project: { select: { organizationId: true } } } // Get project's orgId
        });

        if (!toolpath) {
          return res.status(404).json({ message: "Toolpath not found or access denied." });
        }

        let effectiveOrganizationId = organizationId || toolpath.project?.organizationId || null;

        if (effectiveOrganizationId) {
          const userInOrg = await prisma.userOrganization.findFirst({
            where: { userId, organizationId: effectiveOrganizationId }
          });
          if (!userInOrg) {
            return res
              .status(403)
              .json({ message: "User is not a member of the specified/project organization for the estimate." });
          }
        }

        // Optional: Check for existing estimate for this toolpathId if they should be unique per user/org scope
        // const existingEstimate = await prisma.productionCostEstimate.findFirst({ where: { toolpathId, ownerId: userId, organizationId: effectiveOrganizationId }});
        // if (existingEstimate) {
        //    return res.status(409).json({ message: 'An estimate for this toolpath already exists for this user/organization.'});
        // }

        const createData: any = {
          toolpathId,
          materialCost: materialCost !== undefined ? Number(materialCost) : 0,
          toolWearCost: toolWearCost !== undefined ? Number(toolWearCost) : 0,
          machineTime: machineTime !== undefined ? Number(machineTime) : 0,
          machineTimeCost: machineTimeCost !== undefined ? Number(machineTimeCost) : 0,
          operatorTime: operatorTime !== undefined ? Number(operatorTime) : 0,
          operatorTimeCost: operatorTimeCost !== undefined ? Number(operatorTimeCost) : 0,
          setupCost: setupCost !== undefined ? Number(setupCost) : 0,
          totalCost: Number(totalCost),
          currencyCode: currencyCode || "EUR",
          details: details || {},
          operationCostId: operationCostId || null,
          ownerId: userId,
          organizationId: effectiveOrganizationId
        };

        if (costSettingsId !== undefined) {
          createData.costSettingsId = costSettingsId === null ? null : String(costSettingsId);
        } else {
          // If you want to ensure it's not sent if undefined, or send null explicitly
          // createData.costSettingsId = null; // Or omit it entirely if schema allows undefined
        }

        const newEstimate = await prisma.productionCostEstimate.create({
          data: createData,
          include: {
            toolpath: { select: { id: true, name: true } },
            operationCost: true,
            owner: { select: { id: true, name: true } },
            organization: { select: { id: true, name: true } }
          }
        });
        return res.status(201).json(newEstimate);
      } catch (error: any) {
        console.error("Error creating estimate:", error);
        if (error.code === "P2003") {
          // Foreign key constraint failed (e.g. toolpathId, operationCostId, costSettingsId invalid)
          return res.status(400).json({
            message: `Invalid ID provided for related entity (e.g., toolpath, operation cost, or settings). Details: ${error.meta?.field_name}`
          });
        }
        return res.status(500).json({ message: "Failed to create estimate." });
      }

    default:
      res.setHeader("Allow", ["GET", "POST"]);
      return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
  }
}
