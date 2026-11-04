/** Spec 69 B5: the machine-collision check names the pair (tool part x machine body) and includes the spindle housing. */
import { describe, expect, test } from "bun:test"
import type { GSegment } from "../testing/gcode-interpreter.ts"
import { checkNcClearance, runJob, type Cutter, type ManufacturingJob, type TableGeometry } from "./index.ts"
import { findMachine } from "./machines.ts"

const flat: Cutter = { id: "t", name: "t", kind: "flat", diameter: 10, flutes: 3, material: "carbide", coating: "altin", fluteLength: 22, shankDiameter: 10, stickout: 40 }
const table: TableGeometry = { cx: 0, cy: 0, top: -30, length: 200, width: 200 }
const cutterOf = (): Cutter => flat
const linear = (line: number, from: { x: number; y: number; z: number }, to: { x: number; y: number; z: number }): GSegment => ({ kind: "linear", from, to, feed: 100, line })
const tall = { name: "vise", centre: { x: 26, y: 0, z: 75 }, half: { x: 14, y: 20, z: 15 } }
const pass = [linear(1, { x: 0, y: 0, z: 0 }, { x: 0, y: 5, z: 0 })]

describe("machine collision pairs", () => {
  test("a shank in the table names the pair", () => {
    const r = checkNcClearance([linear(2, { x: 0, y: 0, z: 10 }, { x: 0, y: 0, z: -60 })], cutterOf, table)
    expect(r.first!.pair).toMatch(/^(shank|holder) x table$/)
  })

  test("a fixture body in the tool's path names the fixture", () => {
    const r = checkNcClearance([linear(3, { x: -40, y: 0, z: 0 }, { x: 40, y: 0, z: 0 })], cutterOf, table, { fixtures: [{ name: "vise", centre: { x: 0, y: 0, z: 20 }, half: { x: 5, y: 20, z: 15 } }] })
    expect(r.first!.pair).toMatch(/^(shank|holder) x fixture vise$/)
  })

  test("the spindle housing collides with a tall fixture the holder clears, and is named; without the housing it is clear", () => {
    const without = checkNcClearance(pass, cutterOf, table, { fixtures: [tall] })
    expect(without.first).toBeUndefined()
    const withHousing = checkNcClearance(pass, cutterOf, table, { fixtures: [tall], housing: { radius: 20, height: 60 } })
    expect(withHousing.first).toBeDefined()
    expect(withHousing.first!.pair).toBe("housing x fixture vise")
  })

  test("a housing that stays clear of every body leaves the move clear", () => {
    const r = checkNcClearance(pass, cutterOf, table, { fixtures: [tall], housing: { radius: 8, height: 60 } })
    expect(r.first).toBeUndefined()
    expect(r.unresolved).toBe(0)
  })
})

describe("machine collision pairs in a job", () => {
  const job = (fixtures: ManufacturingJob["fixtures"]): ManufacturingJob => ({
    schemaVersion: 1, id: "pairs", name: "Block", material: "6061",
    part: { kind: "elements", elements: [{ id: "block", type: "cube", x: 20, y: 20, z: 5, width: 40, height: 40, depth: 10 }] },
    stock: { min: { x: -4, y: -4, z: 0 }, max: { x: 44, y: 44, z: 11 } },
    operations: [{ id: "contour", strategy: "profile", tool: "flat-6-n", loop: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 40 }, { x: 0, y: 40 }], side: "outside", top: 10, bottom: 0 }],
    machine: findMachine("vmc-standard")!, quality: { resolution: 0.4 }, ...(fixtures !== undefined ? { fixtures } : {})
  })
  const clamp = [{ id: "clamp", min: { x: 41, y: 10, z: 0 }, max: { x: 50, y: 30, z: 14 } }]

  test("a clamp in the contour path fails machine-clearance and the issue lists the pair", () => {
    const r = runJob(job(clamp))
    if (r.status !== "ok") throw new Error(r.issues.map((i) => i.message).join("; "))
    expect(r.value.claims.find((c) => c.id === "machine-clearance")!.status).toBe("failed")
    expect(r.value.issues.some((i) => i.tag === "HolderCollision" && /pair (shank|holder) x fixture clamp/.test(i.message))).toBe(true)
  })

  test("without the clamp the same program is clear", () => {
    const r = runJob(job(undefined))
    if (r.status !== "ok") throw new Error(r.issues.map((i) => i.message).join("; "))
    expect(r.value.claims.find((c) => c.id === "machine-clearance")!.status).toBe("passed")
  })
})
