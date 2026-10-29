/**
 * Formatting + report helpers of the legacy `productionCostsService` (locale `it-IT`, as there), plus the
 * mapping from the sidecar's estimate shape to the one the legacy screens read (`details.materialVolume`, ...).
 */
import { currentLocale, t } from "../../../i18n/index.ts"

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
  return new Intl.NumberFormat(currentLocale(), { style: "currency", currency: currencyCode }).format(value)
}

export function formatPercentage(value: number): string {
  return new Intl.NumberFormat(currentLocale(), { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value / 100)
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
  let report = `${t("costs.report.title")}
${t("costs.report.toolpath", { id: estimate.toolpathId })}
${t("costs.report.total", { cost: formatCurrency(estimate.totalCost, estimate.currencyCode) })}
${t("costs.report.date", { date: new Date(estimate.updatedAt).toLocaleString(currentLocale()) })}

${t("costs.report.breakdown")}
- ${t("costs.report.material", { cost: formatCurrency(estimate.materialCost, estimate.currencyCode) })}
- ${t("costs.report.toolWear", { cost: formatCurrency(estimate.toolWearCost, estimate.currencyCode) })}
- ${t("costs.report.machineTime", { time: formatTime(estimate.machineTime) })}
- ${t("costs.report.machineTimeCost", { cost: formatCurrency(estimate.machineTimeCost, estimate.currencyCode) })}
- ${t("costs.report.operator", { cost: formatCurrency(estimate.operatorTimeCost, estimate.currencyCode) })}
- ${t("costs.report.setup", { cost: formatCurrency(estimate.setupCost, estimate.currencyCode) })}
`
  if (includeDetails && estimate.details) {
    report += `\n${t("costs.report.details")}\n`
    if (estimate.details.materialId) report += `- ${t("costs.report.materialId", { id: estimate.details.materialId })}\n`
    if (estimate.details.toolId) report += `- ${t("costs.report.toolId", { id: estimate.details.toolId })}\n`
    if (estimate.details.materialVolume) report += `- ${t("costs.report.volume", { value: formatVolume(estimate.details.materialVolume) })}\n`
    if (estimate.details.toolPathLength) report += `- ${t("costs.report.length", { value: formatDimension(estimate.details.toolPathLength) })}\n`
    if (estimate.details.toolWearPercentage) report += `- ${t("costs.report.wear", { value: formatPercentage(estimate.details.toolWearPercentage) })}\n`
    if (estimate.details.feedRate) report += `- ${t("costs.report.feed", { value: estimate.details.feedRate })}\n`
  }
  report += t("costs.report.end")
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
