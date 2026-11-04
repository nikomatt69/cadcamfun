/** Spec 69 B2: the tri-dexel verdict is a structured field of the stock summary (`stock.triDexel`), present only when the table turns. */
import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { rebuildExact } from "../../cad/history-brep.ts"
import { model } from "../../cad/script.ts"
import { swarfWalls } from "../swarf-walls.ts"
import { DEFAULT_CUTTERS, findCutter, runJob, type ManufacturingJob } from "./index.ts"
import { findMachine } from "./machines.ts"

setDefaultTimeout(120_000)

const m = model()
m.extrude(m.sketch("XY").circle([0, 0], 20), { depth: 30, taper: 5 })
const history = m.build()
const cone = { id: "cone", type: "parametric", name: "Cone", x: 0, y: 0, z: 0, history }
const exact = rebuildExact(history).bodies[0]!.brep!
const wall = swarfWalls(exact).walls.find((w) => exact.faces[w.face]!.surface.kind === "cone")!.wall
const flat = findCutter(DEFAULT_CUTTERS, "flat-10")!
const trunnion = findMachine("trunnion-5ax")!
const swarf: ManufacturingJob = {
  schemaVersion: 1, id: "swarf", name: "Swarf cone", material: "6061", part: { kind: "elements", elements: [cone] },
  stock: { min: { x: -24, y: -24, z: 0 }, max: { x: 24, y: 24, z: 31 } }, tools: [flat],
  operations: [{ id: "swarf-cone", strategy: "multiaxis", mode: "swarf", tool: flat.id, top: 30, stepover: 20, walls: [wall] }],
  machine: { ...trunnion, fiveAxis: { ...trunnion.fiveAxis!, rotation: [-720, 720] as const } }, quality: { resolution: 0.5 }
}

describe("stock.triDexel", () => {
  test("a five-axis job reports the tri-dexel figures with their declared error", () => {
    const r = runJob(swarf)
    if (r.status !== "ok") throw new Error(r.issues.map((i) => i.message).join("; "))
    const t = r.value.stock.triDexel!
    expect(t).toBeDefined()
    expect(t.complete).toBe(true)
    expect(t.errorBound).toBeGreaterThan(0)
    expect(t.cell).toBeGreaterThan(0)
    expect(t.poses).toBeGreaterThan(100)
    expect(t.gouge.depth).toBeLessThanOrEqual(t.errorBound + 0.01)
    expect(r.value.claims.find((c) => c.id === "no-gouge")!.status).toBe("passed")
  })

  test("a three-axis job has no tri-dexel field", () => {
    const r = runJob({ schemaVersion: 1, id: "p", name: "Plate", material: "6061", part: { kind: "elements", elements: [{ id: "b", type: "cube", width: 20, height: 20, depth: 5 }] }, machine: findMachine("vmc-standard")!, quality: { resolution: 0.5 } })
    if (r.status !== "ok") throw new Error("must run")
    expect(r.value.stock.triDexel).toBeUndefined()
  })
})
