/** Spec 69 C7: machining limits - no cut outside the boundary, avoid regions keep their stock. */
import { describe, expect, setDefaultTimeout, test } from "bun:test"
import type { Toolpath } from "../ir.ts"
import { interpretGcode } from "../testing/gcode-interpreter.ts"
import type { CamArtifact, ManufacturingJob, OperationSpec } from "./index.ts"
import { runJob } from "./execute.ts"
import { allowedAt, limitToolpath } from "./limits.ts"

setDefaultTimeout(100_000)

const rect = (x0: number, y0: number, x1: number, y1: number) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]
const block = {
  positions: [0, 0, 0, 80, 0, 0, 80, 60, 0, 0, 60, 0, 0, 0, 10, 80, 0, 10, 80, 60, 10, 0, 60, 10],
  indices: [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]
}
const job = (operations: ReadonlyArray<OperationSpec>): ManufacturingJob => ({
  schemaVersion: 1, id: "lim", name: "Limits", material: "6061", part: { kind: "meshes", meshes: [block] },
  stock: { min: { x: 0, y: 0, z: 0 }, max: { x: 80, y: 60, z: 10 } }, operations, quality: { resolution: 0.4 }, origin: "stock-corner"
})
const face = (limits?: object): OperationSpec => ({ id: "face", strategy: "face", tool: "flat-6", bottom: 8, ...(limits ? { limits } : {}) }) as OperationSpec
const ok = (r: ReturnType<typeof runJob>): CamArtifact => {
  if (r.status !== "ok") throw new Error(r.issues.map((i) => i.message).join("; "))
  return r.value
}
/** Feed (cutting) motions of the NC, in work coordinates, sampled along each segment. */
const cutPoints = (nc: string): Array<{ x: number; y: number; z: number }> => {
  const out: Array<{ x: number; y: number; z: number }> = []
  let prev: { x: number; y: number; z: number } | undefined
  for (const s of interpretGcode(nc).segments) {
    if (s.kind === "dwell") continue
    if (s.kind === "linear" && prev !== undefined && s.to.z < 5 - 1e-6) {
      const n = Math.max(1, Math.ceil(Math.hypot(s.to.x - prev.x, s.to.y - prev.y) / 0.25))
      for (let i = 0; i <= n; i++) out.push({ x: prev.x + ((s.to.x - prev.x) * i) / n, y: prev.y + ((s.to.y - prev.y) * i) / n, z: s.to.z })
    }
    prev = { x: s.to.x, y: s.to.y, z: s.to.z }
  }
  return out
}

describe("allowedAt", () => {
  const limits = { boundary: rect(10, 10, 50, 40), avoid: [rect(25, 20, 35, 30)] }
  test("the cutter's edge obeys the regions by default, the centre only on request", () => {
    expect(allowedAt(limits, 3, 12, 25)).toBe(false)
    expect(allowedAt(limits, 3, 14, 25)).toBe(true)
    expect(allowedAt(limits, 3, 23, 25)).toBe(false)
    expect(allowedAt(limits, 3, 20, 25)).toBe(true)
    expect(allowedAt({ ...limits, containment: "centre" }, 3, 23, 25)).toBe(true)
  })
})

describe("limitToolpath", () => {
  const path: Toolpath = { id: "t", name: "t", toolId: "x", moves: [
    { _tag: "Rapid", to: { x: 0, y: 5, z: 10 } }, { _tag: "Linear", to: { x: 0, y: 5, z: -1 }, feed: 100 }, { _tag: "Linear", to: { x: 40, y: 5, z: -1 }, feed: 300 }
  ] } as unknown as Toolpath
  test("a cut crossing the boundary stops at it, lifts and never cuts outside", () => {
    const r = limitToolpath(path, { boundary: rect(10, 0, 30, 10), containment: "centre" }, 3, 10)
    expect(r.clipped).toBeGreaterThan(0)
    const cuts = r.toolpath.moves.filter((m) => m._tag === "Linear")
    const last = cuts[cuts.length - 1] as { to: { x: number } }
    expect(last.to.x).toBeCloseTo(30, 3)
    // before the boundary: lifted, no cut with x < 10
    for (const m of r.toolpath.moves) if (m._tag === "Linear" && (m as { to: { x: number; z: number } }).to.z < 5) expect((m as { to: { x: number } }).to.x).toBeGreaterThanOrEqual(10 - 1e-3)
  })
})

describe("limits in a kernel job", () => {
  const free = ok(runJob(job([face()])))
  const boundary = rect(20, 15, 60, 45)
  const bounded = ok(runJob(job([face({ boundary })])))
  const avoid = rect(30, 20, 50, 40)
  const avoided = ok(runJob(job([face({ avoid: [avoid] })])))

  test("the facing cut stays inside the boundary, a tool radius from its edge, and leaves the stock outside", () => {
    expect(free.stock.finalVolume).toBeLessThan(80 * 60 * 8 + 1)
    const pts = cutPoints(bounded.nc)
    expect(pts.length).toBeGreaterThan(50)
    for (const p of pts) expect(allowedAt({ boundary }, 3, p.x, p.y)).toBe(true)
    // the stock outside stays: far more material than the unlimited facing, and none of it was gouged
    expect(bounded.stock.finalVolume - free.stock.finalVolume).toBeGreaterThan(80 * 60 * 2 - 40 * 30 * 2 - 800)
    expect(bounded.operations[0]!.warnings.join(" ")).toMatch(/limits clipped/)
  })

  test("the avoid region keeps its stock and no cut enters it", () => {
    const pts = cutPoints(avoided.nc)
    expect(pts.length).toBeGreaterThan(50)
    for (const p of pts) expect(allowedAt({ avoid: [avoid] }, 3, p.x, p.y)).toBe(true)
    const kept = avoided.stock.finalVolume - free.stock.finalVolume
    // the avoided 20 x 20 mm (plus the cutter radius around it) keeps its 2 mm of stock
    expect(kept).toBeGreaterThan(20 * 20 * 2 * 0.9)
    expect(kept).toBeLessThan(26 * 26 * 2 * 1.1)
  })

  test("without limits the program is the same as before", () => {
    expect(ok(runJob(job([face()]))).nc).toBe(free.nc)
  })

  test("a five-axis operation with limits is refused with the reason", () => {
    const r = runJob(job([{ id: "mx", strategy: "multiaxis", tool: "ball-6", top: 20, stepover: 1, limits: { boundary } } as OperationSpec]))
    expect(r.status === "failed" && r.issues.map((i) => i.message).join(" ")).toMatch(/machine coordinates/)
  })
})
