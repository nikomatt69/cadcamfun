/**
 * An oversize fillet reaches the assistant as a refusal it can act on, through the REAL tools (`cad`, `cad_edit`) and the REAL
 * kernel. A 60 x 40 x 8 plate with its four vertical edges filleted at R30 cannot exist (two R30 arcs need 60 mm on the 40 mm
 * side); the kernel used to build a 56.55 mm part and report success. Now `parametric_validate` says it does not build, names the
 * limit (20 mm), and `parametric_create` stores nothing and says why.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { buildTools, type ToolHandlersShape } from "@cadcamfun/ai"
import { makeApp } from "./helpers.ts"

let app: Awaited<ReturnType<typeof makeApp>>
let handlers: ToolHandlersShape
let projectId: string
const SLOW = 110_000

const tool = async (id: string, input: Record<string, unknown>) => {
  const definition = buildTools(handlers, projectId).find((t) => t.id === id)
  if (definition === undefined) throw new Error(`Tool ${id} is not registered`)
  return JSON.parse(await definition.execute(input as never, { sessionId: "s", projectId: "p", signal: new AbortController().signal })) as any
}

beforeAll(async () => {
  app = await makeApp(); handlers = await app.toolHandlers()
  projectId = (await app.call("/api/projects", { method: "POST", json: { name: "Oversize fillet" } })).body.id
})
afterAll(async () => { await app.dispose() })

const plate = (radius: number, rounding: Record<string, unknown> = {}) => ({
  parameters: { w: 60, h: 40, t: 8, r: radius },
  features: [
    { id: "s", type: "sketch", plane: "XY", sketch: { shapes: [{ id: "r", kind: "rectangle", at: [0, 0], width: "w", height: "h" }] } },
    { id: "plate", type: "extrude", sketch: "s", depth: "t", operation: "new" },
    { id: "round", type: "fillet", radius: "r", edges: { parallel: "z" }, ...rounding }
  ]
})

describe("an oversize blend, told to the assistant", () => {
  test("parametric_validate: R30 does not build, the failure names the edge, the limit and the face that is too narrow", async () => {
    const checked = await tool("cad", { action: "parametric_validate", history: plate(30) })
    expect(checked.ok).toBe(false)
    expect(checked.verification.verdict).toBe("failed")
    const error = checked.issues.find((i: { severity: string }) => i.severity === "error")
    expect(error.feature).toBe("round")
    expect(error.message).toContain("radius 30 exceeds the maximum 20")
    expect(error.message).toContain("only 40.00 mm wide")
    expect(error.remedy).toContain("at most 20 mm")
    // The diagnosis hands the model the usual fix, with the kernel's own number first.
    const cause = checked.diagnosis.rootCauses[0]
    expect(cause.feature).toBe("round")
    expect(cause.hint).toContain("at most 20 mm")
    expect(cause.hint).toContain("select fewer edges")
    // The feature failed on its own: nothing of the plate is left cut, so the exact plate is the whole block.
    expect(checked.volumeMm3).toBeCloseTo(60 * 40 * 8, 1)
  }, SLOW)

  test("parametric_create refuses it: nothing is stored and the error carries the cause and the number to use", async () => {
    const refused = await tool("cad_edit", { action: "parametric_create", name: "Plate R30", history: plate(30) })
    expect(refused.ok).toBe(false)
    expect(refused.error).toContain("Nothing was created")
    expect(refused.error).toContain("round:")
    expect(refused.error).toContain("exceeds the maximum 20")
    expect(refused.error).toContain("at most 20 mm")
  }, SLOW)

  test("the same part at the limit (R20) is accepted and stored, and a chamfer over the limit is refused likewise", async () => {
    const fine = await tool("cad_edit", { action: "parametric_create", name: "Plate R20", history: plate(20) })
    expect(fine.ok).toBe(true)
    expect(fine.verification.sizeMm.x).toBeCloseTo(60, 2)
    const chamfer = await tool("cad", { action: "parametric_validate", history: plate(20.5, { style: "chamfer" }) })
    expect(chamfer.ok).toBe(false)
    expect(chamfer.diagnosis.rootCauses[0].message).toContain("distance 20.5 exceeds the maximum 20")
  }, SLOW)
})
