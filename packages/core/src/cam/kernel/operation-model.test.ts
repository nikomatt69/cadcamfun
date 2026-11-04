/** Spec 69 C6: operation ids and dependencies, enable / disable, copy / mirror / pattern of operations, setups and jobs. */
import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { copyOperation, patternOperation, patternSetups, resolveOperations, transformJob, transformOperation, type CamArtifact, type ManufacturingJob, type OperationSpec } from "./index.ts"
import { runJob } from "./execute.ts"

setDefaultTimeout(100_000)

const block = {
  positions: [0, 0, 0, 60, 0, 0, 60, 40, 0, 0, 40, 0, 0, 0, 10, 60, 0, 10, 60, 40, 10, 0, 40, 10],
  indices: [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]
}
const stock = { min: { x: -3, y: -3, z: 0 }, max: { x: 63, y: 43, z: 10 } }
const rect = (x0: number, y0: number, x1: number, y1: number) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]

const pocket = { id: "pocket", strategy: "pocket", tool: "flat-6", region: { boundary: rect(10, 10, 30, 25) }, top: 10, bottom: 6, allowance: 0, finish: true } as OperationSpec
const holes = { id: "holes", strategy: "drill", tool: "drill-5", points: [{ x: 45, y: 12 }, { x: 45, y: 30 }], top: 10, bottom: 0 } as OperationSpec
const outline = { id: "outline", strategy: "profile", tool: "flat-6", loop: rect(0, 0, 60, 40), side: "outside", top: 10, bottom: 0, allowance: 0, finish: true } as OperationSpec

const job = (operations: ReadonlyArray<OperationSpec>): ManufacturingJob => ({
  schemaVersion: 1, id: "om", name: "Operation model", material: "6061", part: { kind: "meshes", meshes: [block] }, stock, operations, quality: { resolution: 0.4 }
})
const ok = (r: ReturnType<typeof runJob>): CamArtifact => {
  if (r.status !== "ok") throw new Error(r.issues.map((i) => i.message).join("; "))
  return r.value
}
const ids = (ops: ReadonlyArray<OperationSpec>): string[] => ops.map((o) => o.id)

describe("resolveOperations", () => {
  test("dependencies order the operations, stably", () => {
    const r = resolveOperations([{ ...outline, dependsOn: ["pocket", "holes"] }, pocket, holes])
    if (r.status !== "ok") throw new Error("must resolve")
    expect(ids(r.value)).toEqual(["pocket", "holes", "outline"])
    const same = resolveOperations([pocket, holes, outline])
    if (same.status !== "ok") throw new Error("must resolve")
    expect(ids(same.value)).toEqual(["pocket", "holes", "outline"])
  })
  test("a disabled operation is dropped; depending on it, a missing id and a cycle are refused with the ids", () => {
    const off = resolveOperations([pocket, { ...holes, enabled: false }, outline])
    if (off.status !== "ok") throw new Error("must resolve")
    expect(ids(off.value)).toEqual(["pocket", "outline"])
    const onDisabled = resolveOperations([{ ...holes, enabled: false }, { ...outline, dependsOn: ["holes"] }])
    expect(onDisabled.status === "failed" && onDisabled.issues[0]!.message).toMatch(/holes.*disabled/)
    const missing = resolveOperations([{ ...outline, dependsOn: ["ghost"] }])
    expect(missing.status === "failed" && missing.issues[0]!.message).toMatch(/ghost/)
    const cycle = resolveOperations([{ ...pocket, dependsOn: ["outline"] }, { ...outline, dependsOn: ["pocket"] }])
    expect(cycle.status === "failed" && cycle.issues[0]!.message).toMatch(/cycle: pocket, outline/)
  })
  test("the kernel honours them: disabled leaves no NC, the order follows the dependency", () => {
    const a = ok(runJob(job([{ ...outline, dependsOn: ["pocket"] }, pocket, { ...holes, enabled: false }])))
    expect(a.operations.map((o) => o.id)).toEqual(["pocket", "outline"])
    expect(a.nc).not.toMatch(/G8[123]/)
    const bad = runJob(job([{ ...pocket, dependsOn: ["outline"] }, { ...outline, dependsOn: ["pocket"] }]))
    expect(bad.status).toBe("failed")
  })
})

describe("transform, copy and pattern of an operation", () => {
  test("a translation moves points and heights; a mirror reverses rings and keeps the cut area", () => {
    const t = transformOperation(pocket, { kind: "translate", dx: 5, dy: -2, dz: 1 })
    if (t.status !== "ok" || t.value.strategy !== "pocket") throw new Error("must move")
    expect(t.value.region.boundary[0]).toEqual({ x: 15, y: 8 })
    expect([t.value.top, t.value.bottom]).toEqual([11, 7])
    const m = transformOperation(pocket, { kind: "mirror", axis: "x", at: 30 })
    if (m.status !== "ok" || m.value.strategy !== "pocket") throw new Error("must mirror")
    expect(m.value.region.boundary.map((p) => p.x).sort((a, b) => a - b)).toEqual([30, 30, 50, 50])
    // the first point of the mirrored ring is the last of the mirrored original: the winding is reversed
    expect(m.value.region.boundary[0]).toEqual({ x: 50, y: 25 })
  })
  test("a mirror flips the hand of a thread; a five-axis operation is refused with its reason", () => {
    const thread = { id: "th", strategy: "thread", tool: "tm", center: { x: 5, y: 5 }, diameter: 8, pitch: 1.25, internal: true, top: 10, length: 6 } as OperationSpec
    const m = transformOperation(thread, { kind: "mirror", axis: "y", at: 0 })
    expect(m.status === "ok" && m.value.strategy === "thread" && m.value.rightHand).toBe(false)
    const five = { id: "mx", strategy: "multiaxis", tool: "ball-6", top: 20, stepover: 1 } as OperationSpec
    const r = transformOperation(five, { kind: "mirror", axis: "x", at: 0 })
    expect(r.status === "failed" && r.issues[0]!.message).toMatch(/five-axis/)
    expect(transformOperation(five, { kind: "translate", dx: 1, dy: 1 }).status).toBe("ok")
  })
  test("copy renames, dependencies inside the copy follow, and a linear and a polar pattern place the copies", () => {
    const c = copyOperation({ ...outline, dependsOn: ["outline"] } as OperationSpec, "outline2", { kind: "translate", dx: 100, dy: 0 })
    if (c.status !== "ok") throw new Error("must copy")
    expect(c.value.id).toBe("outline2")
    const lin = patternOperation(holes, { kind: "linear", count: 3, dx: 0, dy: 20 })
    if (lin.status !== "ok" || lin.value[2]!.strategy !== "drill") throw new Error("must pattern")
    expect(ids(lin.value)).toEqual(["holes", "holes.1", "holes.2"])
    expect(lin.value[2]!.points[0]).toEqual({ x: 45, y: 52 })
    const polar = patternOperation({ ...holes, points: [{ x: 10, y: 0 }] } as OperationSpec, { kind: "polar", count: 4, cx: 0, cy: 0 })
    if (polar.status !== "ok" || polar.value[1]!.strategy !== "drill") throw new Error("must pattern")
    expect(polar.value[1]!.points[0]!.x).toBeCloseTo(0, 9)
    expect(polar.value[1]!.points[0]!.y).toBeCloseTo(10, 9)
    expect(patternOperation(holes, { kind: "linear", count: 0, dx: 1, dy: 0 }).status).toBe("failed")
  })
  test("a setup pattern gives each copy its own ids and no datum", () => {
    const r = patternSetups({ id: "s", workOffset: "G54", operations: [pocket] }, { count: 3, dx: 100, dy: 0 })
    if (r.status !== "ok") throw new Error("must pattern")
    expect(r.value.map((s) => s.id)).toEqual(["s", "s.1", "s.2"])
    expect(r.value[2]!.workOffset).toBeUndefined()
    expect(r.value[2]!.operations![0]!.id).toBe("pocket.2")
    expect(patternSetups({ id: "s" }, { count: 7, dx: 1, dy: 0 }).status).toBe("failed")
  })
})

describe("transformJob: the moved job's NC is the original's NC", () => {
  test("a translated job (part, stock, operations) posts the same program", () => {
    const original = job([pocket, holes, outline])
    const moved = transformJob(original, { kind: "translate", dx: 130, dy: -70 })
    if (moved.status !== "ok") throw new Error(moved.issues.map((i) => i.message).join("; "))
    const a = ok(runJob(original)), b = ok(runJob(moved.value))
    expect(a.nc.length).toBeGreaterThan(500)
    expect(a.nc).toMatch(/G8[123]/)
    expect(b.nc).toBe(a.nc)
    expect(b.release).toBe(a.release)
    expect(b.stock.finalVolume).toBe(a.stock.finalVolume)
  })
  test("a mirrored job still verifies and removes the same volume", () => {
    const original = job([pocket, outline])
    const mirrored = transformJob(original, { kind: "mirror", axis: "x", at: 30 })
    if (mirrored.status !== "ok") throw new Error(mirrored.issues.map((i) => i.message).join("; "))
    const a = ok(runJob(original)), b = ok(runJob(mirrored.value))
    expect(b.release).toBe(a.release)
    expect(Math.abs(b.stock.finalVolume - a.stock.finalVolume)).toBeLessThan(a.stock.finalVolume * 0.002)
  })
})
