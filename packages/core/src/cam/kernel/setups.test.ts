/** Spec 69 C1 and C5: a job with several setups, and the part coverage only the union of them can state. */
import { describe, expect, setDefaultTimeout, test } from "bun:test"
import type { Mesh64 } from "../model/element-mesh.ts"
import { coverageOf, runSetups, type MultiSetupJob, type SetupsArtifact } from "./setups.ts"
import { findMachine } from "./machines.ts"

setDefaultTimeout(100_000)

const boxMesh = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Mesh64 => {
  const p = [x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0, x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1]
  const i = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]
  return { positions: Float64Array.from(p), indices: Uint32Array.from(i) }
}

describe("coverageOf: the surface area some setup faces", () => {
  const box = [boxMesh(0, 0, 0, 20, 10, 5)]
  const total = 2 * (20 * 10 + 20 * 5 + 10 * 5)
  test("from +Z alone the bottom (200 mm2) faces away; the four walls stand vertical and the top faces up", () => {
    const c = coverageOf(box, [{ id: "a", orientation: "+Z" }])
    expect(c.total).toBeCloseTo(total, 9)
    expect(c.uncovered).toBeCloseTo(20 * 10, 9)
  })
  test("a flip adds the bottom: +Z and -Z cover the box exactly, each side counted once", () => {
    const c = coverageOf(box, [{ id: "a", orientation: "+Z" }, { id: "b", orientation: "-Z" }])
    expect(c.uncovered).toBeCloseTo(0, 9)
    expect(c.bySetup["a"]! + c.bySetup["b"]!).toBeCloseTo(total, 9)
    expect(c.bySetup["b"]).toBeCloseTo(200, 9)
  })
  test("a side setup alone leaves the opposite end face uncovered", () => {
    const c = coverageOf(box, [{ id: "x", orientation: "+X" }])
    expect(c.uncovered).toBeCloseTo(10 * 5, 9)
  })
})

describe("runSetups: two fixings of a plate", () => {
  const away = { id: "vise-jaw", min: { x: 60, y: -30, z: -40 }, max: { x: 80, y: 30, z: 40 } }
  const job = (orientations: ReadonlyArray<"+Z" | "-Z">): MultiSetupJob => ({
    schemaVersion: 1, id: "plate2", name: "Plate", material: "6061", part: { kind: "elements", elements: [{ id: "plate", type: "cube", x: 0, y: 0, z: 0, width: 40, height: 30, depth: 8 }] },
    machine: findMachine("vmc-standard")!, quality: { resolution: 0.4 },
    setups: orientations.map((o, k) => ({ id: `s${k + 1}`, orientation: o, fixtures: [away] }))
  })
  const run = (j: MultiSetupJob): SetupsArtifact => {
    const r = runSetups(j)
    if (r.status !== "ok") throw new Error(r.issues.map((i) => i.message).join("; "))
    return r.value
  }

  test("each setup gets its own work offset and program; the union covers the plate, so part-coverage passes", () => {
    const a = run(job(["+Z", "-Z"]))
    expect(a.setups.map((s) => s.workOffset)).toEqual(["G54", "G55"])
    expect(a.setups[0]!.artifact.nc).toContain("G54")
    expect(a.setups[1]!.artifact.nc).toContain("G55")
    expect(a.setups[1]!.artifact.setupOrientation).toBe("-Z")
    const cov = a.claims.find((c) => c.id === "part-coverage")!
    expect(cov.status).toBe("passed")
    expect(a.coverage.uncovered).toBeCloseTo(0, 6)
    expect(a.notes.join(" ")).toMatch(/not carried/)
  })

  test("the one-sided job leaves the underside uncovered with its area, and is not released", () => {
    const a = run(job(["+Z"]))
    const cov = a.claims.find((c) => c.id === "part-coverage")!
    expect(cov.status).toBe("unresolved")
    expect(cov.detail).toMatch(/1200\.0 mm²/)
    expect(a.release).not.toBe("verified-program")
  })

  test("duplicate setup ids and a shared work offset are refused with the reason", () => {
    const dup = runSetups({ ...job(["+Z", "-Z"]), setups: [{ id: "s", orientation: "+Z" }, { id: "s", orientation: "-Z" }] })
    expect(dup.status).toBe("failed")
    const same = runSetups({ ...job(["+Z", "-Z"]), setups: [{ id: "a", workOffset: "G54" }, { id: "b", orientation: "-Z", workOffset: "G54" }] })
    expect(same.status).toBe("failed")
    if (same.status === "failed") expect(same.issues[0]!.message).toMatch(/same work offset/)
  })
})
