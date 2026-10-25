import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { makeApp } from "./helpers.ts"
import { Context, Effect } from "effect"
import { AuthRepo } from "../src/repos/auth-repo.ts"
import { ProductionCostRepo } from "../src/repos/production-cost-repo.ts"
import { AuthTokens } from "../src/services/auth-tokens.ts"

let app: Awaited<ReturnType<typeof makeApp>>
beforeAll(async () => { app = await makeApp() })
afterAll(async () => { await app.dispose() })

// The project-scoped route answers through the legacy envelope helpers
// (`{ success, data }`); the flat routes answer with the bare row. A toolpath row also
// has its own `data` field, so the envelope is detected by its `success` flag.
const unwrap = <T>(r: { body: unknown }): T =>
  (typeof r.body === "object" && r.body !== null && "success" in r.body && "data" in r.body
    ? (r.body as unknown as { data: T }).data
    : r.body) as T

/** A project plus a profile toolpath, so the estimate endpoints have a real target. */
async function seedToolpath(name: string, gcode: string) {
  const project = await app.call("/api/projects", { method: "POST", json: { name: `Project ${name}` } })
  const tool = await app.call("/api/tools", {
    method: "POST",
    json: { name: `Tool ${name}`, type: "endmill", diameter: 6, material: "carbide" }
  })
  const material = await app.call("/api/materials", {
    method: "POST",
    json: { name: `Material ${name}`, properties: { density: 2700 } }
  })
  // The legacy project-scoped route reads the project id from the query string.
  const toolpath = await app.call(`/api/projects/${project.body.id}/toolpaths?projectId=${project.body.id}`, {
    method: "POST",
    json: {
      name,
      type: "mill",
      operationType: "profile",
      toolId: unwrap<{ id: string }>(tool).id,
      materialId: unwrap<{ id: string }>(material).id,
      gcode,
      data: { stockDimensions: { x: 100, y: 50, z: 10 } }
    }
  })
  return {
    project,
    tool: unwrap<{ id: string }>(tool),
    material: unwrap<{ id: string }>(material),
    toolpath: unwrap<{ id: string }>(toolpath)
  }
}

const squareGcode = ["G21", "G90", "G0 X0 Y0", "G1 Z-1 F100", "G1 X10 F600", "G1 Y10", "G1 X0", "G1 Y0", "G0 Z5"].join("\n")

describe("/api/production-costs authorization", () => {
  test("every route requires the launch token", async () => {
    for (const path of ["/api/production-costs/estimates", "/api/production-costs/material-costs", "/api/production-costs/tool-wear", "/api/production-costs/operation-costs"]) {
      expect((await app.call(path, { auth: false })).status).toBe(401)
    }
  })

  test("an unknown organisation is forbidden on create", async () => {
    const r = await app.call("/api/production-costs/operation-costs", {
      method: "POST",
      json: { name: "x", machineHourlyRate: 1, operatorHourlyRate: 1, organizationId: "org-missing" }
    })
    expect(r.status).toBe(403)
  })

  test("an unknown row is not found rather than empty", async () => {
    expect((await app.call("/api/production-costs/material-costs/nope")).status).toBe(404)
    expect((await app.call("/api/production-costs/estimates/nope")).status).toBe(404)
  })
})

describe("/api/production-costs/estimates/calculate", () => {
  test("derives machine time from the stored G-code and the persisted rate", async () => {
    const { toolpath } = await seedToolpath("calculate", squareGcode)
    const r = await app.call("/api/production-costs/estimates/calculate", {
      method: "POST",
      json: { toolpathId: toolpath.id }
    })
    expect(r.status).toBe(200)
    // Feed moves only: the 1 mm plunge plus four 10 mm sides (the closing X0Y0 move is
    // the start point again, so it adds nothing). Rapids are excluded.
    expect(r.body.details.calculatedValues.totalPathLengthMm).toBeCloseTo(41, 6)
    expect(r.body.details.calculatedValues.feedRateMmMin).toBe(600)
    expect(r.body.details.calculatedValues.machineTimeMinutes).toBeCloseTo(41 / 600, 9)
    // System defaults: 50/h machine + 30/h operator, 30 min setup.
    expect(r.body.details.calculatedValues.totalSetupTimeMinutes).toBe(30)
    expect(r.body.machineTimeCost).toBeCloseTo((41 / 600 / 60) * 50, 9)
    expect(r.body.operatorTime).toBeCloseTo(41 / 600 + 30, 9)
    expect(r.body.setupCost).toBeCloseTo((30 / 60) * (50 + 30), 9)
    expect(r.body.currencyCode).toBe("EUR")
  })

  test("material volume from the stock box feeds the material cost", async () => {
    const { material, toolpath } = await seedToolpath("material", squareGcode)
    const cost = await app.call("/api/production-costs/material-costs", {
      method: "POST",
      json: { materialId: material.id, costPerUnit: 5, wasteFactor: 10 }
    })
    expect(cost.status).toBe(201)
    const r = await app.call("/api/production-costs/estimates/calculate", {
      method: "POST",
      json: { toolpathId: toolpath.id }
    })
    // 100 x 50 x 10 mm = 0.00005 m^3, plus 10% waste, at 5 per unit.
    expect(r.body.details.calculatedValues.materialVolumeM3).toBeCloseTo(0.00005, 12)
    expect(r.body.materialCost).toBeCloseTo(0.00005 * 1.1 * 5, 12)
  })

  test("a missing toolpath is a 404, not a zero estimate", async () => {
    const r = await app.call("/api/production-costs/estimates/calculate", {
      method: "POST",
      json: { toolpathId: "nope" }
    })
    expect(r.status).toBe(404)
  })
})

describe("/api/production-costs persistence", () => {
  test("material cost, tool wear and operation cost round-trip", async () => {
    const { tool, material } = await seedToolpath("crud", squareGcode)

    const wear = await app.call("/api/production-costs/tool-wear", {
      method: "POST",
      json: { toolId: tool.id, wearRatePerMeter: 10, replacementCost: 20 }
    })
    expect(wear.status).toBe(201)
    expect(wear.body.tool.id).toBe(tool.id)
    expect(wear.body.replacementThreshold).toBe(100)
    expect((await app.call(`/api/production-costs/tool-wear/${wear.body.id}`)).body.wearRatePerMeter).toBe(10)
    const patched = await app.call(`/api/production-costs/tool-wear/${wear.body.id}`, {
      method: "PUT",
      json: { wearRatePerMeter: 15 }
    })
    expect(patched.body.wearRatePerMeter).toBe(15)
    expect((await app.call("/api/production-costs/tool-wear")).body).toHaveLength(1)
    expect((await app.call(`/api/production-costs/tool-wear/${wear.body.id}`, { method: "DELETE" })).status).toBe(200)
    expect((await app.call(`/api/production-costs/tool-wear/${wear.body.id}`)).status).toBe(404)

    const operation = await app.call("/api/production-costs/operation-costs", {
      method: "POST",
      json: { name: "3-axis mill", machineHourlyRate: 60, operatorHourlyRate: 25 }
    })
    expect(operation.status).toBe(201)
    expect(operation.body.setupTime).toBe(30)
    expect((await app.call("/api/production-costs/operation-costs")).body.map((r: { name: string }) => r.name)).toEqual(["3-axis mill"])

    const materialCost = await app.call("/api/production-costs/material-costs", {
      method: "POST",
      json: { materialId: material.id, costPerUnit: 2 }
    })
    expect(materialCost.status).toBe(201)
    expect(materialCost.body.material.id).toBe(material.id)
    const listed = await app.call(`/api/production-costs/material-costs?materialId=${material.id}`)
    expect(listed.body).toHaveLength(1)
    const updated = await app.call(`/api/production-costs/material-costs/${materialCost.body.id}`, {
      method: "PUT",
      json: { costPerUnit: 3 }
    })
    expect(updated.body.costPerUnit).toBe(3)
    expect(updated.body.material.id).toBe(material.id)
  })

  test("a stored estimate is listed, updated and deleted", async () => {
    const { toolpath } = await seedToolpath("stored", squareGcode)
    const created = await app.call("/api/production-costs/estimates", {
      method: "POST",
      json: { toolpathId: toolpath.id, totalCost: 12.5, materialCost: 2, machineTimeCost: 10.5 }
    })
    expect(created.status).toBe(201)
    expect(created.body.toolpath.id).toBe(toolpath.id)
    expect(created.body.operationCost).toBeNull()
    expect(created.body.totalCost).toBe(12.5)

    const listed = await app.call(`/api/production-costs/estimates?toolpathId=${toolpath.id}`)
    expect(listed.body.map((r: { id: string }) => r.id)).toEqual([created.body.id])

    const updated = await app.call(`/api/production-costs/estimates/${created.body.id}`, {
      method: "PUT",
      json: { notes: "quoted to customer" }
    })
    expect(updated.status).toBe(200)
    expect((updated.body.details as { notes: string }).notes).toBe("quoted to customer")

    expect((await app.call(`/api/production-costs/estimates/${created.body.id}`, { method: "DELETE" })).status).toBe(200)
    expect((await app.call(`/api/production-costs/estimates/${created.body.id}`)).status).toBe(404)
  })
})

describe("production cost account isolation", () => {
  test("calculation skips another account's rates and cost creation cannot expose private resources", async () => {
    const { tool, material, toolpath } = await seedToolpath("isolation", squareGcode)
    const services = await app.services()
    const auth = Context.get(services, AuthRepo)
    const repo = Context.get(services, ProductionCostRepo)
    const tokens = Context.get(services, AuthTokens)
    const foreign = await Effect.runPromise(auth.createUser({ email: "foreign-costs@example.com", name: "Foreign", passwordHash: "unused" }))
    if (!foreign) throw new Error("Expected a fresh account")
    const session = tokens.sign({ userId: foreign.id, email: "foreign-costs@example.com", type: "session" }, 3600)
    const headers = { "x-session-token": session }
    // Old databases may contain costs linked to a resource owned by another account. A Promise inside
    // Array.find was truthy and selected these private rates even though the cost list hid them.
    await Effect.runPromise(repo.createMaterialCost(foreign.id, { materialId: material.id, costPerUnit: 999999 }))
    await Effect.runPromise(repo.createToolWear(foreign.id, { toolId: tool.id, wearRatePerMeter: 100, replacementCost: 999999 }))
    const calculate = () => app.call("/api/production-costs/estimates/calculate", { method: "POST", json: { toolpathId: toolpath.id } })
    const noRates = await calculate()
    expect(noRates.status).toBe(200)
    expect(noRates.body.materialCost).toBe(0)
    expect(noRates.body.toolWearCost).toBe(0)
    expect((await app.call("/api/production-costs/material-costs", { method: "POST", json: { materialId: material.id, costPerUnit: 5 } })).status).toBe(201)
    expect((await app.call("/api/production-costs/tool-wear", { method: "POST", json: { toolId: tool.id, wearRatePerMeter: 10, replacementCost: 20 } })).status).toBe(201)
    const ownRates = await calculate()
    expect(ownRates.body.materialCost).toBeCloseTo(0.00005 * 5, 12)
    expect(ownRates.body.toolWearCost).toBeCloseTo(0.041 * 0.1 * 20, 12)
    for (const [path, json] of [
      ["material-costs", { materialId: material.id, costPerUnit: 5 }],
      ["tool-wear", { toolId: tool.id, wearRatePerMeter: 10, replacementCost: 20 }],
    ] as const) expect((await app.call(`/api/production-costs/${path}`, { method: "POST", json, headers })).status).toBe(404)

    const privateRate = await app.call("/api/production-costs/operation-costs", { method: "POST", headers, json: { name: "Private rate", machineHourlyRate: 10, operatorHourlyRate: 10 } })
    expect(privateRate.status).toBe(201)
    expect((await app.call("/api/production-costs/estimates", { method: "POST", json: { toolpathId: toolpath.id, totalCost: 10, operationCostId: privateRate.body.id } })).status).toBe(404)
    const estimate = await app.call("/api/production-costs/estimates", { method: "POST", json: { toolpathId: toolpath.id, totalCost: 10 } })
    expect(estimate.status).toBe(201)
    for (const method of ["GET", "PUT", "DELETE"]) {
      expect((await app.call(`/api/production-costs/estimates/${estimate.body.id}`, { method, headers, ...(method === "PUT" ? { json: { notes: "foreign" } } : {}) })).status).toBe(404)
    }
    expect((await app.call("/api/production-costs/estimates", { headers })).body).toEqual([])
  })
})
