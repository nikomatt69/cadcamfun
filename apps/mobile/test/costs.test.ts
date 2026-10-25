import { describe, expect, test } from "bun:test"
import type { CalculatedEstimate } from "@cadcamfun/api"
import { costCurrency, costNumber, estimateInput, estimateLines, estimateNotes } from "../lib/costs"
import { CompanionClient, type Transport } from "../lib/client"

const calculation: typeof CalculatedEstimate.Type = {
  toolpathId: "path /1", organizationId: "org-1", ownerId: "owner", currencyCode: "EUR",
  materialCost: 1, toolWearCost: 2, machineTime: 3, machineTimeCost: 4,
  operatorTime: 5, operatorTimeCost: 6, setupCost: 7, totalCost: 20,
  details: {
    inputs: { toolpathId: "path /1", materialId: "m", toolId: "t" },
    calculatedValues: { totalPathLengthMm: 100, materialVolumeM3: 0.001, feedRateMmMin: 100, machineTimeMinutes: 3, operatorTimeMinutes: 5, totalSetupTimeMinutes: 2 },
    costBreakdown: { material: 1, toolWear: 2, machineRun: 4, operator: 6, setup: 7 }, sourceSettingsId: "desktop-settings",
  },
}

describe("mobile production costs", () => {
  test("saving preserves amounts, measurements and organization without copying server-owned identifiers", () => {
    const saved = estimateInput(calculation)
    expect(saved).toEqual({ toolpathId: "path /1", organizationId: "org-1", currencyCode: "EUR", materialCost: 1, toolWearCost: 2, machineTime: 3, machineTimeCost: 4, operatorTime: 5, operatorTimeCost: 6, setupCost: 7, totalCost: 20, details: calculation.details })
    expect(saved).not.toHaveProperty("ownerId")
    expect(estimateLines(calculation).map((line) => line.value)).toEqual([1, 2, 4, 6, 7, 20])
    expect(estimateNotes({ ...calculation.details, notes: "Quote A" })).toBe("Quote A")
    expect(estimateNotes(null)).toBe("")
  })

  test("decimal input accepts commas and zero, refuses empty, negative and non-finite rates", () => {
    expect(costNumber(" 12,5 ", "Rate")).toBe(12.5)
    expect(costNumber("0", "Rate")).toBe(0)
    for (const text of ["", " ", "-1", "NaN", "Infinity", "1,2,3", "1.000,00", "1e999", "9".repeat(400)]) expect(() => costNumber(text, "Rate")).toThrow()
    expect(costCurrency(" eur ")).toBe("EUR")
    for (const text of ["", "EU", "123", "EURO"]) expect(() => costCurrency(text)).toThrow()
  })

  test("the client uses all 21 contracts, encodes ids and propagates write throttling", async () => {
    const calls: { path: string; method: string; body?: unknown }[] = []
    const transport: Transport = {
      request: async (path, method, body) => { calls.push({ path, method, body }); return { status: 200, body: "{}" } },
      async *stream() {},
    }
    const phone = new CompanionClient(transport)
    await phone.estimates("project /1"); await phone.estimate("estimate /1")
    await phone.calculateEstimate({ toolpathId: calculation.toolpathId, organizationId: calculation.organizationId })
    await phone.createEstimate(estimateInput(calculation)); await phone.updateEstimate("estimate /1", { notes: "quote" }); await phone.deleteEstimate("estimate /1")
    await phone.materialCosts(); await phone.materialCost("material /1")
    await phone.createMaterialCost({ materialId: "m", costPerUnit: 10 }); await phone.updateMaterialCost("material /1", { costPerUnit: 20 }); await phone.deleteMaterialCost("material /1")
    await phone.toolWearCosts(); await phone.toolWearCost("wear /1")
    await phone.createToolWearCost({ toolId: "t", wearRatePerMeter: 1, replacementCost: 10 }); await phone.updateToolWearCost("wear /1", { replacementCost: 20 }); await phone.deleteToolWearCost("wear /1")
    await phone.operationCosts(); await phone.operationCost("operation /1")
    await phone.createOperationCost({ name: "Mill", machineHourlyRate: 50, operatorHourlyRate: 30 }); await phone.updateOperationCost("operation /1", { setupTime: 40 }); await phone.deleteOperationCost("operation /1")
    expect(calls).toHaveLength(21)
    expect(calls[0]?.path).toBe("/api/production-costs/estimates?projectId=project%20%2F1")
    expect(calls[1]?.path).toBe("/api/production-costs/estimates/estimate%20%2F1")
    expect(calls[3]?.body).toEqual(estimateInput(calculation))
    transport.request = async () => ({ status: 429, body: '{"message":"Busy"}', headers: { "retry-after": "1" } })
    await expect(phone.createEstimate(estimateInput(calculation))).rejects.toMatchObject({ status: 429, retryAfterMs: 1000 })
  })
})
