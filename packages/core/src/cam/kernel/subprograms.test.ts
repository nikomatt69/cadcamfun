import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { buildRecipe } from "../../cad/recipes.ts"
import { interpretGcode } from "../testing/gcode-interpreter.ts"
import { runJob, type CamArtifact, type ManufacturingJob } from "./index.ts"

setDefaultTimeout(110_000)

const recipe = buildRecipe("mounting_plate", { width: 120, depth: 80, thickness: 12, fastener: "M5", counterbore: true })
const plate = { id: "plate", type: "parametric", name: "Plate", x: 0, y: 0, z: 0, history: recipe.history }
const job = (post?: ManufacturingJob["post"]): ManufacturingJob => ({
  schemaVersion: 1, id: "plate-job", name: "Plate", material: "6061", part: { kind: "elements", elements: [plate] },
  stock: { min: { x: -3, y: -3, z: 0 }, max: { x: 123, y: 83, z: 13 } }, ...(post !== undefined ? { post } : {})
})
const ok = (r: ReturnType<typeof runJob>): CamArtifact => {
  if (r.status !== "ok") throw new Error(r.issues.map((i) => i.message).join("; "))
  return r.value
}

describe("subprograms in a kernel job", () => {
  const flat = ok(runJob(job()))
  const subbed = ok(runJob(job({ options: { subprograms: true } })))

  test("the four counterbores of the plate are one subprogram and four calls", () => {
    const l = subbed.nc.trimEnd().split("\n")
    expect(l.filter((x) => /^M98 P\d+$/.test(x)).length).toBeGreaterThanOrEqual(4)
    expect(l.filter((x) => /^O100[1-9]$/.test(x)).length).toBeGreaterThanOrEqual(1)
    expect(l.length).toBeLessThan(flat.nc.trimEnd().split("\n").length / 2)
    expect(subbed.notes.some((n) => /subprogram/.test(n))).toBe(true)
    expect(flat.nc).not.toContain("M98")
    expect(flat.notes.some((n) => /subprogram/.test(n))).toBe(false)
  })

  test("the independent replay of the shorter NC reaches the same verdict on every claim", () => {
    expect(subbed.release).toBe(flat.release)
    expect(subbed.claims.map((c) => [c.id, c.status])).toEqual(flat.claims.map((c) => [c.id, c.status]))
    expect(subbed.claims.find((c) => c.id === "nc-replay")!.status).toBe("passed")
    expect(subbed.issues.map((i) => i.tag).sort()).toEqual(flat.issues.map((i) => i.tag).sort())
  })

  test("each operation keeps its own tool and its removed volume, although its motion runs inside a shared subprogram", () => {
    expect(subbed.operations.map((o) => o.id)).toEqual(flat.operations.map((o) => o.id))
    for (let i = 0; i < flat.operations.length; i++) {
      const a = flat.operations[i]!, b = subbed.operations[i]!
      expect(b.removedVolume, a.id).toBeGreaterThanOrEqual(a.removedVolume * 0.98 - 1)
      expect(b.removedVolume, a.id).toBeLessThanOrEqual(a.removedVolume * 1.02 + 1)
      expect(b.cutLength, a.id).toBeCloseTo(a.cutLength, 0)
    }
    expect(subbed.stock.finalVolume / flat.stock.finalVolume).toBeCloseTo(1, 3)
  })

  test("the program the viewer draws is unchanged, and the NC replays to the same cut length", () => {
    expect(subbed.program).toEqual(flat.program)
    const a = interpretGcode(flat.nc, { dwell: "milliseconds" }), b = interpretGcode(subbed.nc, { dwell: "milliseconds" })
    expect(b.errors).toEqual([])
    expect(b.cutLength).toBeCloseTo(a.cutLength, 1)
    expect(b.minZ).toBeCloseTo(a.minZ, 3)
    expect(b.tools).toEqual(a.tools)
  })

  test("the evidence is bound to the NC the machine gets, so the two programs have different identities", () => {
    expect(subbed.identity.nc).not.toBe(flat.identity.nc)
    expect(subbed.identity.part).toBe(flat.identity.part)
  })
})
