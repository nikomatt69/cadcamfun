import type { CalculatedEstimate, EstimateCreate, EstimateDetails, MaterialCostDetails, OperationCostDetails, ToolWearDetails } from "@cadcamfun/api"

export type CostKind = "estimates" | "material-costs" | "tool-wear" | "operation-costs"
export type RateKind = Exclude<CostKind, "estimates">
export type CostEntry =
  | { readonly kind: "estimates"; readonly row: typeof EstimateDetails.Type }
  | { readonly kind: "material-costs"; readonly row: typeof MaterialCostDetails.Type }
  | { readonly kind: "tool-wear"; readonly row: typeof ToolWearDetails.Type }
  | { readonly kind: "operation-costs"; readonly row: typeof OperationCostDetails.Type }
export type RateEntry = Exclude<CostEntry, { kind: "estimates" }>

export const COST_TABS: readonly { id: CostKind; label: string }[] = [
  { id: "estimates", label: "Estimates" }, { id: "material-costs", label: "Materials" },
  { id: "tool-wear", label: "Tool wear" }, { id: "operation-costs", label: "Operation rates" },
]

export const costTitle = (entry: CostEntry): string => {
  switch (entry.kind) {
    case "estimates": return entry.row.toolpath.name
    case "material-costs": return entry.row.material.name
    case "tool-wear": return entry.row.tool.name
    case "operation-costs": return entry.row.name
  }
}

export const costMoney = (value: number, currency: string): string => {
  try { return new Intl.NumberFormat("en", { style: "currency", currency }).format(value) }
  catch { return `${value.toFixed(2)} ${currency}` }
}

export const costSubtitle = (entry: CostEntry): string => {
  const money = (n: number) => costMoney(n, entry.row.currencyCode)
  switch (entry.kind) {
    case "estimates": return `${money(entry.row.totalCost)} · ${entry.row.machineTime.toFixed(1)} min machining`
    case "material-costs": return `${money(entry.row.costPerUnit)}/m³ · ${entry.row.wasteFactor}% waste · minimum ${money(entry.row.minimumCharge)}`
    case "tool-wear": return `${entry.row.wearRatePerMeter}%/m · replacement ${money(entry.row.replacementCost)}`
    case "operation-costs": return `${money(entry.row.machineHourlyRate)}/h machine · ${money(entry.row.operatorHourlyRate)}/h operator · ${entry.row.setupTime} min setup`
  }
}

/** Accept decimal commas from the phone keyboard; refuse empty, negative and non-finite money/rates. */
export const costNumber = (text: string, label: string): number => {
  const normalized = text.trim().replace(",", ".")
  if (!/^\d+(?:\.\d*)?$/.test(normalized)) throw new Error(`${label} must be a non-negative number`)
  const number = Number(normalized)
  if (!Number.isFinite(number)) throw new Error(`${label} must be a finite number`)
  return number
}

export const costCurrency = (text: string): string => {
  const code = text.trim().toUpperCase()
  if (!/^[A-Z]{3}$/.test(code)) throw new Error("Enter a three-letter currency code, such as EUR")
  return code
}

/** Save exactly the server's calculation, including its ownership scope and measurement provenance. */
export const estimateInput = (result: typeof CalculatedEstimate.Type): typeof EstimateCreate.Type => ({
  toolpathId: result.toolpathId, organizationId: result.organizationId,
  totalCost: result.totalCost, materialCost: result.materialCost, toolWearCost: result.toolWearCost,
  machineTime: result.machineTime, machineTimeCost: result.machineTimeCost,
  operatorTime: result.operatorTime, operatorTimeCost: result.operatorTimeCost,
  setupCost: result.setupCost, currencyCode: result.currencyCode, details: result.details,
})

export const estimateNotes = (details: unknown): string =>
  typeof details === "object" && details !== null && "notes" in details && typeof details.notes === "string" ? details.notes : ""

export const estimateLines = (row: Pick<typeof CalculatedEstimate.Type, "materialCost" | "toolWearCost" | "machineTimeCost" | "operatorTimeCost" | "setupCost" | "totalCost">) => [
  { label: "Material", value: row.materialCost }, { label: "Tool wear", value: row.toolWearCost },
  { label: "Machine run", value: row.machineTimeCost }, { label: "Operator", value: row.operatorTimeCost },
  { label: "Setup", value: row.setupCost }, { label: "Total", value: row.totalCost },
]
