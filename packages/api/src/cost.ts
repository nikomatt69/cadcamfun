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

/**
 * What a program made by the native CAM kernel says about its own cost: the cut length of every operation, the cycle time
 * (cutting, rapids and tool changes, from the replay of the NC) and the volume of the raw stock. A saved kernel program
 * carries no legacy `operations[].pathLength` or `stockDimensions`, so without this it would be priced at the setup alone.
 */
const kernelFacts = (data: unknown): { readonly pathLengthMm: number; readonly volumeM3: number; readonly minutes: number } | undefined => {
  const artifact = (data as { kernelArtifact?: unknown } | null)?.kernelArtifact as
    | { cycleTimeSeconds?: unknown; stock?: { initialVolume?: unknown }; operations?: ReadonlyArray<{ cutLength?: unknown }> }
    | undefined
  if (artifact === null || typeof artifact !== "object") return undefined
  const seconds = artifact.cycleTimeSeconds, volume = artifact.stock?.initialVolume
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0 || typeof volume !== "number" || !Number.isFinite(volume) || volume < 0 || !Array.isArray(artifact.operations)) return undefined
  let length = 0
  for (const op of artifact.operations) if (typeof op.cutLength === "number" && Number.isFinite(op.cutLength)) length += op.cutLength
  return { pathLengthMm: length, volumeM3: volume / 1e9, minutes: seconds / 60 }
}

export function calculateEstimate({ toolpath, settings, toolWear, materialCost }: CostInput): CostResult {
  const data = (toolpath.data ?? {}) as ToolpathData
  const kernel = kernelFacts(toolpath.data)

  let totalPathLengthMm = 0
  if (Array.isArray(data.operations)) {
    for (const op of data.operations) if (typeof op.pathLength === "number") totalPathLengthMm += op.pathLength
  }
  if (kernel !== undefined) totalPathLengthMm = kernel.pathLengthMm
  const materialVolumeM3 = kernel !== undefined
    ? kernel.volumeM3
    : data.stockDimensions
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
  // A kernel program knows its time (from the replay of the NC), so its effective feed is cut length over time.
  const feedRateMmMin = kernel !== undefined && kernel.minutes > 0 && totalPathLengthMm > 0 ? totalPathLengthMm / kernel.minutes : (data.parameters?.feedrate as number) || 1000
  const machineTimeMinutes = kernel !== undefined ? kernel.minutes : totalPathLengthMm > 0 && feedRateMmMin > 0 ? totalPathLengthMm / feedRateMmMin : 0

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
