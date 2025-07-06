// src/pages/api/production-costs/estimates/calculate.ts
import { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/src/lib/prisma";
import { requireAuth } from "@/src/lib/api/auth";
import { ProductionCostEstimate, CostSettings } from "@/src/types/costs";

// Helper function to get the most appropriate cost settings for the user/organization
async function getEffectiveCostSettings(
  userId: string,
  organizationId?: string | null,
  costSettingsId?: string | null
): Promise<CostSettings> {
  // 1. If costSettingsId is provided, try to fetch it (check access)
  if (costSettingsId) {
    const specificSettings = await prisma.costSettings.findFirst({
      where: {
        id: costSettingsId,
        OR: [
          { ownerId: userId },
          { organizationId: organizationId || undefined, organization: { users: { some: { userId } } } }
        ]
      }
    });
    if (specificSettings) return specificSettings as CostSettings;
  }
  // 2. If organizationId is provided, try to fetch org settings
  if (organizationId) {
    const orgSettings = await prisma.costSettings.findFirst({
      // Use undefined instead of null to avoid the type error
      where: {
        organizationId,
        ownerId: undefined
      }
    });
    if (orgSettings) return orgSettings as CostSettings;
  }
  // 3. Try to fetch user's personal default settings
  const userSettings = await prisma.costSettings.findFirst({
    where: {
      ownerId: userId,
      organizationId: undefined // Use undefined instead of null
    }
  });
  if (userSettings) return userSettings as CostSettings;

  // 4. Fallback to system defaults
  return {
    id: "SYSTEM_DEFAULT",
    name: "System Default Settings",
    defaultCurrencyCode: "EUR",
    defaultMachineHourlyRate: 50,
    defaultOperatorHourlyRate: 30,
    defaultSetupTime: 30,
    calculateAutomatically: false,
    ownerId: undefined, // Use undefined instead of null
    organizationId: undefined, // Use undefined instead of null
    createdAt: new Date(),
    updatedAt: new Date()
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
  }

  try {
    const { toolpathId, costSettingsId, organizationId: reqOrganizationId } = req.body;

    if (!toolpathId || typeof toolpathId !== "string") {
      return res.status(400).json({ message: "Toolpath ID is required and must be a string." });
    }

    const toolpath = await prisma.toolpath.findFirst({
      where: {
        id: toolpathId,
        OR: [
          { createdBy: userId },
          { project: { OR: [{ ownerId: userId }, { organization: { users: { some: { userId } } } }] } }
        ]
      },
      include: {
        Material: true,
        Tool: true,
        project: { select: { organizationId: true } }
      }
    });

    if (!toolpath) {
      return res.status(404).json({ message: "Toolpath not found or access denied." });
    }

    const effectiveOrganizationId = reqOrganizationId || toolpath.project?.organizationId || null;

    const settings = await getEffectiveCostSettings(userId, effectiveOrganizationId, costSettingsId);

    let relevantToolWearCost = null;
    if (toolpath.Tool?.id) {
      relevantToolWearCost = await prisma.toolWearCost.findFirst({
        where: {
          toolId: toolpath.Tool.id,
          OR: [{ organizationId: effectiveOrganizationId }, { ownerId: userId, organizationId: null }]
        },
        orderBy: { updatedAt: "desc" }
      });
    }

    let relevantMaterialCost = null;
    if (toolpath.Material?.id) {
      relevantMaterialCost = await prisma.materialCost.findFirst({
        where: {
          materialId: toolpath.Material.id,
          OR: [{ organizationId: effectiveOrganizationId }, { ownerId: userId, organizationId: null }]
        },
        orderBy: { updatedAt: "desc" }
      });
    }

    const defaultOperationCostFallback = {
      name: "Default Operation Parameters",
      machineHourlyRate: settings.defaultMachineHourlyRate,
      operatorHourlyRate: settings.defaultOperatorHourlyRate,
      setupTimeMinutes: settings.defaultSetupTime,
      currencyCode: settings.defaultCurrencyCode
    };
    const actualOperationCostsData = [defaultOperationCostFallback];

    const toolpathData = toolpath.data as any;
    let totalPathLengthMm = 0;
    let materialVolumeM3 = 0;

    if (toolpathData?.operations && Array.isArray(toolpathData.operations)) {
      for (const op of toolpathData.operations) {
        if (typeof op.pathLength === "number") totalPathLengthMm += op.pathLength;
      }
    }
    if (toolpathData?.stockDimensions) {
      materialVolumeM3 =
        (toolpathData.stockDimensions.x * toolpathData.stockDimensions.y * toolpathData.stockDimensions.z) /
        (1000 * 1000 * 1000);
    }

    let calculatedToolWearCost = 0;
    if (relevantToolWearCost && totalPathLengthMm > 0) {
      const pathLengthM = totalPathLengthMm / 1000;
      calculatedToolWearCost =
        ((pathLengthM * relevantToolWearCost.wearRatePerMeter) / 100) * relevantToolWearCost.replacementCost;
    }

    let calculatedMaterialCost = 0;
    if (relevantMaterialCost && materialVolumeM3 > 0) {
      const costPerM3 = relevantMaterialCost.costPerUnit;
      const volumeWithWaste = materialVolumeM3 * (1 + (relevantMaterialCost.wasteFactor || 0) / 100);
      calculatedMaterialCost = Math.max(volumeWithWaste * costPerM3, relevantMaterialCost.minimumCharge || 0);
    }

    const feedRateMmMin = (toolpathData?.parameters?.feedrate as number) || 1000;
    const machineTimeMinutes = totalPathLengthMm > 0 && feedRateMmMin > 0 ? totalPathLengthMm / feedRateMmMin : 0;

    let totalSetupTimeMinutes = 0;
    let totalSetupCost = 0;
    let machineTimeCost = 0;
    let operatorTimeCost = 0;

    const primaryOperationData = actualOperationCostsData[0];
    totalSetupTimeMinutes = primaryOperationData.setupTimeMinutes || 0;
    totalSetupCost =
      (totalSetupTimeMinutes / 60) * (primaryOperationData.machineHourlyRate + primaryOperationData.operatorHourlyRate);

    machineTimeCost = (machineTimeMinutes / 60) * primaryOperationData.machineHourlyRate;
    const operatorTimeMinutes = machineTimeMinutes + totalSetupTimeMinutes;
    operatorTimeCost = (operatorTimeMinutes / 60) * primaryOperationData.operatorHourlyRate;

    const finalTotalCost =
      calculatedMaterialCost + calculatedToolWearCost + machineTimeCost + operatorTimeCost + totalSetupCost;

    const calculationDetails: any = {
      sourceSettingsId: settings.id !== "SYSTEM_DEFAULT" ? settings.id : undefined,
      inputs: {
        toolpathId: toolpath.id,
        toolId: toolpath.Tool?.id || null,
        materialId: toolpath.Material?.id || null
      },
      calculatedValues: {
        totalPathLengthMm,
        materialVolumeM3,
        feedRateMmMin,
        machineTimeMinutes,
        operatorTimeMinutes,
        totalSetupTimeMinutes
      },
      costBreakdown: {
        material: calculatedMaterialCost,
        toolWear: calculatedToolWearCost,
        machineRun: machineTimeCost,
        operator: operatorTimeCost,
        setup: totalSetupCost
      }
    };

    const result: Omit<ProductionCostEstimate, "id" | "createdAt" | "updatedAt"> = {
      toolpathId: toolpath.id,
      materialCost: calculatedMaterialCost,
      toolWearCost: calculatedToolWearCost,
      machineTime: machineTimeMinutes,
      machineTimeCost,
      operatorTime: operatorTimeMinutes,
      operatorTimeCost,
      setupCost: totalSetupCost,
      totalCost: finalTotalCost,
      currencyCode: primaryOperationData.currencyCode,
      details: calculationDetails,
      operationCostId: undefined,
      ownerId: userId,
      organizationId: effectiveOrganizationId
    };

    return res.status(200).json(result);
  } catch (error: any) {
    console.error("Error calculating estimate:", error);
    return res.status(500).json({ message: `Internal server error: ${error.message}` });
  }
}
