import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { brep, model } from "@cadcamfun/core"
import { ACTION_CONTRACTS } from "@cadcamfun/api"
import { Schema } from "effect"
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
  test("recovery warnings survive validation and the exact-action wire contract, with and without STEP", async () => {
    const m = model()
    m.extrude(m.sketch("XY").rectangle([0, 0], 10, 10), { depth: 10 })
    m.hole({ id: "bore", plane: "XY", offset: 10, at: [2, 5], diameter: 4, depth: 10 })
    const history = m.build()
    expect(parametricReport(history).warnings.some((warning) => warning.includes("bore:") && warning.includes("displaced"))).toBe(true)
    for (const includeStep of [false, true]) {
      const result = await runParametricExact({ history, includeStep } as never, context)
      const decoded = Schema.decodeUnknownSync(ACTION_CONTRACTS["cad.parametric_exact"]!.result! as Schema.Decoder<unknown>)(result) as { warnings: string[]; step?: string }
      expect(decoded.warnings.some((warning) => warning.includes("bore:") && warning.includes("displaced"))).toBe(true)
      expect(new Set(decoded.warnings).size).toBe(decoded.warnings.length)
      if (includeStep) expect(decoded.step).toStartWith("ISO-10303-21;")
    }
  })
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
    // A non-uniform scale is exact now (spec 40 U4); an ellipsoid still has no rational surface in the kernel and is refused with a reason.
    const m = model()
    m.primitive({ element: "ellipsoid", params: { radiusX: 8, radiusY: 5, radiusZ: 4 } })
    const ellipsoid = m.build() as never
    const out = (await runParametricExact({ history: ellipsoid } as never, context)) as { bodies: Array<Record<string, unknown>> }
    expect(out.bodies[0]!["exact"]).toBe(false)
    expect(String(out.bodies[0]!["reason"]).toLowerCase()).toContain("ellipsoid")
  })

  test("a filleted body keeps its exact model (rolling-ball fillets of the exact solid)", async () => {
    const filleted = { ...(plate as object), features: [...(plate as { features: unknown[] }).features, { id: "f", type: "fillet", radius: 1 }] } as never
    const out = (await runParametricExact({ history: filleted } as never, context)) as { bodies: Array<Record<string, unknown>> }
    expect(out.bodies[0]!["exact"]).toBe(true)
  }, 120_000)

  test("exactly one of elementId and history is required", async () => {
    const out = (await runParametricExact({} as never, context)) as Record<string, unknown>
    expect(out["ok"]).toBe(false)
  })
})
