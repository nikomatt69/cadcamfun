import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { brep } from "@cadcamfun/core"
import { parametricReport } from "../src/parametric.ts"
import { runParametricExact } from "../src/actions/parametric.ts"
import type { ActionContext } from "../src/actions/action.ts"

setDefaultTimeout(60_000)

/** A 40 × 30 × 10 plate with a Ø8 through hole, written as the assistant writes it (sketch shapes). */
const plate = {
  parameters: { width: 40, depth: 30, thick: 10 },
  features: [
    { id: "s", type: "sketch", plane: "XY", sketch: { entities: [], constraints: [], shapes: [{ id: "r", kind: "rectangle", at: [0, 0], width: "width", height: "depth" }] } },
    { id: "plate", type: "extrude", sketch: "s", depth: "thick", operation: "new" },
    { id: "h", type: "hole", plane: "XY", offset: "thick", at: [20, 15], diameter: 8, depth: "thick" }
  ]
} as never

const context = { handlers: {}, projectId: "p" } as unknown as ActionContext

describe("the assistant's view of the exact model", () => {
  test("every validation report carries the exact volume and topology of each body", () => {
    const report = parametricReport(plate) as unknown as { ok: boolean; exact: Array<Record<string, unknown>> }
    expect(report.ok).toBe(true)
    const body = report.exact[0]!
    expect(body["exact"]).toBe(true)
    expect(body["valid"]).toBe(true)
    expect(Math.abs((body["volumeMm3"] as number) - (12000 - Math.PI * 16 * 10))).toBeLessThan(1e-3)
    expect(body["throughHoles"]).toBe(1)
    expect(body["surfaces"]).toEqual({ plane: 6, cylinder: 1 })
  })

  test("parametric_exact returns the STEP file of the exact bodies, which reads back as the same solid", async () => {
    const out = (await runParametricExact({ history: plate, includeStep: true, name: "plate" } as never, context)) as Record<string, unknown>
    expect(out["ok"]).toBe(true)
    expect(out["exported"]).toEqual(["plate"])
    const step = out["step"] as string
    expect(step.startsWith("ISO-10303-21;")).toBe(true)
    const back = brep.readStepBreps(step)
    expect(back.warnings).toEqual([])
    expect(Math.abs(brep.massProperties(back.parts[0]!.brep).volume - (12000 - Math.PI * 160))).toBeLessThan(1e-6)
  })

  test("a body built with a mesh-only feature says why it has no exact model", async () => {
    const filleted = { ...(plate as object), features: [...(plate as { features: unknown[] }).features, { id: "f", type: "fillet", radius: 1 }] } as never
    const out = (await runParametricExact({ history: filleted } as never, context)) as { bodies: Array<Record<string, unknown>> }
    expect(out.bodies[0]!["exact"]).toBe(false)
    expect(String(out.bodies[0]!["reason"])).toContain("fillet")
  })

  test("exactly one of elementId and history is required", async () => {
    const out = (await runParametricExact({} as never, context)) as Record<string, unknown>
    expect(out["ok"]).toBe(false)
  })
})
