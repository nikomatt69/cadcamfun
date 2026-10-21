import { describe, expect, test } from "bun:test"
import { runJob, type CamArtifact, type ManufacturingJob } from "./index.ts"
import { findMachine } from "./machines.ts"

const base = (extra: Partial<ManufacturingJob> = {}): ManufacturingJob => ({
  schemaVersion: 1, id: "tb", name: "Plate", material: "6061", machine: findMachine("vmc-standard")!, quality: { resolution: 0.4, tolerance: 0.01 },
  part: { kind: "elements", elements: [{ id: "plate", type: "cube", width: 30, height: 20, depth: 5 }] }, ...extra
})
/** A machine that states how accurately it holds a position: the machine's own share of the deviation is then known. */
const accurate = (): ManufacturingJob["machine"] => ({
  ...findMachine("vmc-standard")!, accuracy: { positioningMm: 0.005 }
})
const run = (job: ManufacturingJob): CamArtifact => {
  const r = runJob(job)
  if (r.status !== "ok") throw new Error(r.issues.map((i) => i.message).join("; "))
  return r.value
}

describe("the tolerance budget of an artifact (spec 29 §3)", () => {
  test("its terms add up to the achieved bound, each with its basis, and the request is the job's tolerance", () => {
    const b = run(base()).tolerance!
    expect(b.requested).toBe(0.01)
    expect(b.terms.map((t) => t.id)).toEqual(["source-tessellation", "part-model", "path", "nc-rounding", "stock-replay"])
    expect(b.terms.every((t) => t.mm > 0 && t.basis.length > 10)).toBe(true)
    expect(b.achieved).toBeCloseTo(b.terms.reduce((s, t) => s + t.mm, 0), 5)
    // The grid cell (0.4 mm) is far above 0.01 mm: the program cannot be promised to the requested tolerance.
    expect(b.met).toBe(false)
    expect(b.achieved).toBeGreaterThan(b.requested)
    // A machine that states its positioning accuracy leaves no unbounded source.
    expect(run(base({ machine: accurate() })).tolerance!.unbounded).toEqual([])
    // A machine that does not says so, rather than promising a deviation it cannot keep.
    expect(b.unbounded).toEqual(["the machine states no positioning accuracy, so the machine's own share of the deviation is unknown"])
  })

  test("the cell terms follow the resolution: a finer grid promises a smaller deviation", () => {
    const coarse = run(base({ quality: { resolution: 0.4, tolerance: 0.01 } })).tolerance!
    const fine = run(base({ quality: { resolution: 0.1, tolerance: 0.01 } })).tolerance!
    expect(fine.achieved).toBeLessThan(coarse.achieved)
    expect(fine.terms.find((t) => t.id === "stock-replay")!.mm).toBeLessThan(coarse.terms.find((t) => t.id === "stock-replay")!.mm)
  })

  test("the NC rounding term follows the post's decimals", () => {
    const three = run(base()).tolerance!.terms.find((t) => t.id === "nc-rounding")!.mm
    const two = run(base({ post: { options: { decimals: 2 } } as never })).tolerance!.terms.find((t) => t.id === "nc-rounding")!.mm
    expect(two).toBeCloseTo(three * 10, 5)
  })

  test("a mesh part has an unbounded source: the budget says so and is never met", () => {
    const mesh = { positions: [0, 0, 0, 10, 0, 0, 0, 10, 0, 0, 0, 10], indices: [0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3] }
    const r = runJob(base({ part: { kind: "meshes", meshes: [mesh] }, stock: { min: { x: -2, y: -2, z: -2 }, max: { x: 12, y: 12, z: 12 } } }))
    if (r.status === "ok") {
      expect(r.value.tolerance!.unbounded).toContain("the part is a mesh of unknown accuracy")
      expect(r.value.tolerance!.met).toBe(false)
      expect(r.value.tolerance!.terms.some((t) => t.id === "source-tessellation")).toBe(false)
    }
  })

  test("it is informational: the release level and the claims are what they were", () => {
    const a = run(base())
    expect(["blocked", "preview", "verified-program"]).toContain(a.release)
    expect(a.claims.some((c) => (c.id as string) === "tolerance")).toBe(false)
  })
})
