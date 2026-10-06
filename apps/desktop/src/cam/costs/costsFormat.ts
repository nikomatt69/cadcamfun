/**
 * Formatting + report helpers of the legacy `productionCostsService` (locale `it-IT`, as there), plus the
 * mapping from the sidecar's estimate shape to the one the legacy screens read (`details.materialVolume`, ...).
 */

export interface EstimateDetailsView {
  materialId?: string | undefined
  toolId?: string | undefined
  /** mm³ */
  materialVolume?: number | undefined
  /** mm */
  toolPathLength?: number | undefined
  toolWearPercentage?: number | undefined
  /** mm/min */
  feedRate?: number | undefined
}

/** An estimate as the screens use it: the sidecar row with its `details` flattened to the legacy keys. */
export interface CostEstimateView {
  id: string
  toolpathId: string
  materialCost: number
  toolWearCost: number
  machineTime: number
  machineTimeCost: number
  operatorTime: number
  operatorTimeCost: number
  setupCost: number
  totalCost: number
  currencyCode: string
  details: EstimateDetailsView
  createdAt: string
  updatedAt: string
}

export function formatCurrency(value: number, currencyCode: string = "EUR"): string {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: currencyCode }).format(value)
}

export function formatPercentage(value: number): string {
  return new Intl.NumberFormat("it-IT", { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value / 100)
}

export function formatTime(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const mins = Math.round(minutes % 60)
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`
}

export function formatVolume(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(2)} cm³` : `${value.toFixed(2)} mm³`
}

export function formatDimension(value: number): string {
  return `${value.toFixed(2)} mm`
}

export function generateCostReport(estimate: CostEstimateView, includeDetails: boolean = false): string {
  let report = `--- Cost Report ---
Toolpath ID: ${estimate.toolpathId}
Total Cost: ${formatCurrency(estimate.totalCost, estimate.currencyCode)}
Date: ${new Date(estimate.updatedAt).toLocaleString("it-IT")}

Breakdown:
- Material Cost: ${formatCurrency(estimate.materialCost, estimate.currencyCode)}
- Tool Wear Cost: ${formatCurrency(estimate.toolWearCost, estimate.currencyCode)}
- Machine Time: ${formatTime(estimate.machineTime)}
- Machine Time Cost: ${formatCurrency(estimate.machineTimeCost, estimate.currencyCode)}
- Operator Time Cost: ${formatCurrency(estimate.operatorTimeCost, estimate.currencyCode)}
- Setup Cost: ${formatCurrency(estimate.setupCost, estimate.currencyCode)}
`
  if (includeDetails && estimate.details) {
    report += "\nDetails:\n"
    if (estimate.details.materialId) report += `- Material ID: ${estimate.details.materialId}\n`
    if (estimate.details.toolId) report += `- Tool ID: ${estimate.details.toolId}\n`
    if (estimate.details.materialVolume) report += `- Material Volume: ${formatVolume(estimate.details.materialVolume)}\n`
    if (estimate.details.toolPathLength) report += `- Toolpath Length: ${formatDimension(estimate.details.toolPathLength)}\n`
    if (estimate.details.toolWearPercentage) report += `- Tool Wear: ${formatPercentage(estimate.details.toolWearPercentage)}\n`
    if (estimate.details.feedRate) report += `- Feed Rate: ${estimate.details.feedRate} mm/min\n`
  }
  report += "--- End of Report ---"
  return report
}

/** Flattens the sidecar `details` ({ inputs, calculatedValues, ... }) into the keys the legacy UI reads. */
export function toEstimateView(row: {
  id: string; toolpathId: string; materialCost: number; toolWearCost: number; machineTime: number; machineTimeCost: number
  operatorTime: number; operatorTimeCost: number; setupCost: number; totalCost: number; currencyCode: string
  details: unknown; createdAt: string; updatedAt: string
}): CostEstimateView {
  const raw = (typeof row.details === "object" && row.details !== null ? row.details : {}) as Record<string, any>
  const inputs = (raw["inputs"] ?? {}) as Record<string, any>
  const values = (raw["calculatedValues"] ?? {}) as Record<string, any>
  const volumeM3 = typeof values["materialVolumeM3"] === "number" ? values["materialVolumeM3"] : undefined
  return {
    id: row.id,
    toolpathId: row.toolpathId,
    materialCost: row.materialCost,
    toolWearCost: row.toolWearCost,
    machineTime: row.machineTime,
    machineTimeCost: row.machineTimeCost,
    operatorTime: row.operatorTime,
    operatorTimeCost: row.operatorTimeCost,
    setupCost: row.setupCost,
    totalCost: row.totalCost,
    currencyCode: row.currencyCode,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    details: {
      materialId: inputs["materialId"] ?? raw["materialId"] ?? undefined,
      toolId: inputs["toolId"] ?? raw["toolId"] ?? undefined,
      materialVolume: volumeM3 !== undefined ? volumeM3 * 1e9 : raw["materialVolume"],
      toolPathLength: values["totalPathLengthMm"] ?? raw["toolPathLength"],
      toolWearPercentage: raw["toolWearPercentage"],
      feedRate: values["feedRateMmMin"] ?? raw["feedRate"]
    }
  }
}
