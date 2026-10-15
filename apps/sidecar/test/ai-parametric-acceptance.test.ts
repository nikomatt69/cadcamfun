import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { buildTools, type ToolHandlersShape } from "@cadcamfun/ai"
import { makeApp } from "./helpers.ts"

let app: Awaited<ReturnType<typeof makeApp>>
let handlers: ToolHandlersShape
let projectId: string
const ctx = { sessionId: "s", projectId: "p", signal: new AbortController().signal }
const run = async (id: string, input: unknown) => JSON.parse(await buildTools(handlers, projectId).find((t) => t.id === id)!.execute(input, ctx))

const history = {
  parameters: { width: 40, height: 25, thick: 6, bore: 8 },
  features: [
    { id: "s1", type: "sketch", plane: "XY", sketch: { shapes: [{ id: "r", kind: "rectangle", at: [0, 0], width: "width", height: "height" }] } },
    { id: "plate", type: "extrude", sketch: "s1", depth: "thick", operation: "new" },
    { id: "h1", type: "hole", plane: "XY", offset: "thick", at: [20, 12.5], diameter: "bore", depth: "thick" }
  ]
}
const checks = [
  { kind: "extent", name: "length", axis: "x", nominal: 40, tolerance: { plus: 0.05, minus: 0.05 } },
  { kind: "hole", name: "bore", feature: "h1", diameter: { nominal: 8, tolerance: { plus: 0.015, minus: 0 } }, through: true },
  { kind: "hole_count", name: "holes", nominal: 1 }
]

beforeAll(async () => {
  app = await makeApp()
  handlers = await app.toolHandlers()
  projectId = (await app.call("/api/projects", { method: "POST", json: { name: "Acceptance" } })).body.id
})
afterAll(async () => { await app.dispose() })

describe("parametric_test measures what was asked (AI-11 Step 10)", () => {
  test("the variant with the right volume band but the wrong bore is rejected; the right one is accepted", async () => {
    const created = await run("cad_edit", { action: "parametric_create", name: "Plate", history })
    expect(created.ok).toBe(true)
    const elementId = created.ids?.[0] ?? created.elementId
    const out = await run("cad", {
      action: "parametric_test", elementId,
      cases: [
        { name: "as drawn", parameters: {}, minVolumeMm3: 5600, maxVolumeMm3: 5800, checks },
        { name: "bore 8.4", parameters: { bore: 8.4 }, minVolumeMm3: 5600, maxVolumeMm3: 5800, checks }
      ]
    })
    const [drawn, wide] = out.cases
    expect(drawn).toMatchObject({ name: "as drawn", passed: true, acceptance: { accepted: true } })
    expect(wide.volumeMm3).toBeGreaterThan(5600)
    expect(wide.volumeMm3).toBeLessThan(5800)
    expect(wide.passed).toBe(false)
    expect(wide.acceptance.accepted).toBe(false)
    expect(wide.failures.join(" ")).toContain("bore: fail (measured 8.4")
    expect(out.ok).toBe(false)
    expect(out.mutated).toBe(false)
  }, 120_000)
})
