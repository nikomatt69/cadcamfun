/** Spec 69 C2 stock model, and the roughed-then-finished five-axis fixture of spec 72 step 0.5 (milestone M1). */
import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { rebuildExact } from "../../cad/history-brep.ts"
import { model } from "../../cad/script.ts"
import { partMeshes } from "../model/model.ts"
import { swarfWalls } from "../swarf-walls.ts"
import { DEFAULT_CUTTERS, findCutter, runJob, type CamArtifact, type Cutter, type ManufacturingJob, type OperationSpec } from "./index.ts"
import { findMachine } from "./machines.ts"

setDefaultTimeout(100_000)

const run = (job: ManufacturingJob): CamArtifact => {
  const r = runJob(job)
  if (r.status !== "ok") throw new Error(r.issues.map((i) => i.message).join("; "))
  return r.value
}
const claim = (a: CamArtifact, id: string) => a.claims.find((c) => c.id === id)!

describe("C2: the stock is not always a box", () => {
  const plate = { id: "plate", type: "cube", x: 0, y: 0, z: 5, width: 20, height: 20, depth: 10 }
  const bar: ManufacturingJob = {
    schemaVersion: 1, id: "bar", name: "Plate from bar", material: "6061", part: { kind: "elements", elements: [plate] },
    stockModel: { kind: "cylinder", center: { x: 0, y: 0 }, radius: 18, z0: 0, z1: 11 }, machine: findMachine("vmc-standard")!, quality: { resolution: 0.4 }
  }

  test("a bar stock has the closed-form volume of its cylinder, and its box is the bounds of the bar", () => {
    const a = run(bar)
    expect(a.stockBounds.min.x).toBeCloseTo(-18, 6)
    expect(a.stockBounds.max.z).toBeCloseTo(11, 6)
    const exact = Math.PI * 18 * 18 * 11
    // The polygon has 128 facets inscribed in the circle: its area is 0.13 % under the disc, and the height field reads cells (0.4 mm).
    expect(Math.abs(a.stock.initialVolume - exact) / exact).toBeLessThan(0.02)
    // The box version of the same job has far more material: the bar corners are not stock.
    const box = run({ ...bar, stockModel: undefined, stock: { min: { x: -18, y: -18, z: 0 }, max: { x: 18, y: 18, z: 11 } } })
    expect(box.stock.initialVolume).toBeGreaterThan(a.stock.initialVolume * 1.2)
  })

  test("the job still cuts the part out of the bar and the replay accounts for the bar's shape", () => {
    const a = run(bar)
    expect(a.operations.every((o) => o.status === "ok")).toBe(true)
    expect(claim(a, "no-gouge").status).toBe("passed")
    expect(a.stock.finalVolume).toBeLessThan(a.stock.initialVolume)
  })

  test("a part that does not fit the stock model is refused, and a bad cylinder is an invalid input", () => {
    const small = runJob({ ...bar, stockModel: { kind: "cylinder", center: { x: 0, y: 0 }, radius: 5, z0: 0, z1: 11 } })
    expect(small.status).toBe("failed")
    const bad = runJob({ ...bar, stockModel: { kind: "cylinder", center: { x: 0, y: 0 }, radius: -1, z0: 0, z1: 11 } })
    expect(bad.status).toBe("failed")
    if (bad.status === "failed") expect(bad.issues[0]!.tag).toBe("InvalidInput")
  })
})

describe("M1: a roughed-then-finished five-axis fixture reaches verified-program", () => {
  const cone = (r: number) => { const m = model(); m.extrude(m.sketch("XY").circle([0, 0], r), { depth: 30, taper: 5 }); return m.build() }
  const history = cone(20)
  const element = { id: "cone", type: "parametric", name: "Cone", x: 0, y: 0, z: 0, history }
  const exact = rebuildExact(history).bodies[0]!.brep!
  const wall = swarfWalls(exact).walls.find((w) => exact.faces[w.face]!.surface.kind === "cone")!.wall
  const flat = findCutter(DEFAULT_CUTTERS, "flat-10")!
  const trunnion = findMachine("trunnion-5ax")!
  const machine = { ...trunnion, fiveAxis: { ...trunnion.fiveAxis!, rotation: [-720, 720] as const } }
  // The semi-finished stock: the cone with 0.3 mm left on the wall (what a roughing leaves for the flank finish).
  const rough = partMeshes([{ id: "cone-rough", type: "parametric", name: "Cone", x: 0, y: 0, z: 0, history: cone(20.3) }] as never, { tolerance: 0.01 })!.meshes[0]!
  const swarf: OperationSpec = { id: "swarf-cone", strategy: "multiaxis", mode: "swarf", tool: flat.id, top: 30, stepover: 20, walls: [wall] }
  const job = (tool: Cutter = flat): ManufacturingJob => ({
    schemaVersion: 1, id: "m1", name: "Swarf cone from rough", material: "6061", part: { kind: "elements", elements: [element] },
    stockModel: { kind: "mesh", mesh: { positions: Array.from(rough.positions), indices: Array.from(rough.indices) } }, tools: [tool], operations: [{ ...swarf, tool: tool.id }], machine, quality: { resolution: 0.2 }
  })

  test("every claim passes with the declared error stated, and the release is verified-program", () => {
    const a = run(job())
    for (const c of a.claims) if (c.id !== "machine-travel") expect({ id: c.id, status: c.status }).toEqual({ id: c.id, status: "passed" })
    expect(claim(a, "material-removed").detail).toMatch(/declared error 0\.\d+ mm/)
    expect(a.release).toBe("verified-program")
    expect(a.nc).toMatch(/\bA-?\d/)
  })

  test("the same job with a wide holder low on the tool collides with the stock and is not released", () => {
    const wide: Cutter = { ...flat, id: "flat-10-wide", holder: { diameter: 80, length: 20 }, stickout: 26 }
    const a = run(job(wide))
    expect(["failed", "unresolved"]).toContain(claim(a, "holder-clearance").status)
    expect(a.release).not.toBe("verified-program")
  })
})
