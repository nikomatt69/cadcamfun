// Port of the production-cost maths in the legacy `/api/production-costs/estimates/calculate` route (pure, no I/O).

export interface CostSettingsLike {
  readonly id: string
  readonly defaultCurrencyCode: string
  readonly defaultMachineHourlyRate: number
  readonly defaultOperatorHourlyRate: number
  readonly defaultSetupTime: number
}

/** Used when neither a specific, organisation nor user cost-settings row exists. */
export const SYSTEM_DEFAULT_SETTINGS: CostSettingsLike = {
  id: "SYSTEM_DEFAULT",
  defaultCurrencyCode: "EUR",
  defaultMachineHourlyRate: 50,
  defaultOperatorHourlyRate: 30,
  defaultSetupTime: 30
}

export interface ToolWearLike { readonly wearRatePerMeter: number; readonly replacementCost: number }
export interface MaterialCostLike { readonly costPerUnit: number; readonly wasteFactor: number | null; readonly minimumCharge: number | null }

export interface CostInput {
  readonly toolpath: { readonly id: string; readonly data: unknown; readonly toolId: string | null; readonly materialId: string | null }
  readonly settings: CostSettingsLike
  readonly toolWear: ToolWearLike | null
  readonly materialCost: MaterialCostLike | null
}

export interface CostResult {
  readonly materialCost: number
  readonly toolWearCost: number
  readonly machineTime: number
  readonly machineTimeCost: number
  readonly operatorTime: number
  readonly operatorTimeCost: number
  readonly setupCost: number
  readonly totalCost: number
  readonly currencyCode: string
  readonly details: {
    readonly sourceSettingsId?: string
    readonly inputs: { toolpathId: string; toolId: string | null; materialId: string | null }
    readonly calculatedValues: {
      totalPathLengthMm: number; materialVolumeM3: number; feedRateMmMin: number
      machineTimeMinutes: number; operatorTimeMinutes: number; totalSetupTimeMinutes: number
    }
    readonly costBreakdown: { material: number; toolWear: number; machineRun: number; operator: number; setup: number }
  }
}

type ToolpathData = {
  operations?: Array<{ pathLength?: unknown }>
  stockDimensions?: { x: number; y: number; z: number }
  parameters?: { feedrate?: number }
}

export function calculateEstimate({ toolpath, settings, toolWear, materialCost }: CostInput): CostResult {
  const data = (toolpath.data ?? {}) as ToolpathData

  let totalPathLengthMm = 0
  if (Array.isArray(data.operations)) {
    for (const op of data.operations) if (typeof op.pathLength === "number") totalPathLengthMm += op.pathLength
  }
  const materialVolumeM3 = data.stockDimensions
    ? (data.stockDimensions.x * data.stockDimensions.y * data.stockDimensions.z) / (1000 * 1000 * 1000)
    : 0

  let calculatedToolWearCost = 0
  if (toolWear && totalPathLengthMm > 0) {
    const pathLengthM = totalPathLengthMm / 1000
    calculatedToolWearCost = ((pathLengthM * toolWear.wearRatePerMeter) / 100) * toolWear.replacementCost
  }

  let calculatedMaterialCost = 0
  if (materialCost && materialVolumeM3 > 0) {
    const volumeWithWaste = materialVolumeM3 * (1 + (materialCost.wasteFactor || 0) / 100)
    calculatedMaterialCost = Math.max(volumeWithWaste * materialCost.costPerUnit, materialCost.minimumCharge || 0)
  }

  // `||` (not `??`) on purpose: a feed rate of 0 falls back to 1000, as in legacy.
  const feedRateMmMin = (data.parameters?.feedrate as number) || 1000
  const machineTimeMinutes = totalPathLengthMm > 0 && feedRateMmMin > 0 ? totalPathLengthMm / feedRateMmMin : 0

  const machineRate = settings.defaultMachineHourlyRate
  const operatorRate = settings.defaultOperatorHourlyRate
  const totalSetupTimeMinutes = settings.defaultSetupTime || 0
  const setupCost = (totalSetupTimeMinutes / 60) * (machineRate + operatorRate)
  const machineTimeCost = (machineTimeMinutes / 60) * machineRate
  const operatorTimeMinutes = machineTimeMinutes + totalSetupTimeMinutes
  const operatorTimeCost = (operatorTimeMinutes / 60) * operatorRate
  const totalCost = calculatedMaterialCost + calculatedToolWearCost + machineTimeCost + operatorTimeCost + setupCost

  return {
    materialCost: calculatedMaterialCost,
    toolWearCost: calculatedToolWearCost,
    machineTime: machineTimeMinutes,
    machineTimeCost,
    operatorTime: operatorTimeMinutes,
    operatorTimeCost,
    setupCost,
    totalCost,
    currencyCode: settings.defaultCurrencyCode,
    details: {
      ...(settings.id !== "SYSTEM_DEFAULT" ? { sourceSettingsId: settings.id } : {}),
      inputs: { toolpathId: toolpath.id, toolId: toolpath.toolId, materialId: toolpath.materialId },
      calculatedValues: { totalPathLengthMm, materialVolumeM3, feedRateMmMin, machineTimeMinutes, operatorTimeMinutes, totalSetupTimeMinutes },
      costBreakdown: { material: calculatedMaterialCost, toolWear: calculatedToolWearCost, machineRun: machineTimeCost, operator: operatorTimeCost, setup: setupCost }
    }
  }
}
