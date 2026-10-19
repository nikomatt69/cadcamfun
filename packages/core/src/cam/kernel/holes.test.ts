import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { buildRecipe } from "../../cad/recipes.ts"
import type { Feature, History } from "../../cad/history.ts"
import { expandCycle, makeProgram, type CycleMove, type Toolpath } from "../ir.ts"
import { posts } from "../post/index.ts"
import { interpretGcode } from "../testing/gcode-interpreter.ts"
import { DEFAULT_CUTTERS, MACHINES, cuttingData, findCutter, findMachine, planOnly, reamDrill, requireMaterial, runJob, type CamArtifact, type ManufacturingJob } from "./index.ts"

setDefaultTimeout(100_000)

const VMC = MACHINES[0]!.limits
const tool = (id: string) => findCutter(DEFAULT_CUTTERS, id)!

// ---------------------------------------------------------------- the cycles in the IR and the posts

const cycle = (over: Partial<CycleMove>): CycleMove => ({ _tag: "Cycle", cycle: "tap", to: { x: 10, y: 5, z: -12 }, feed: 1250, peckDepth: 0, dwellSeconds: 0, retractHeight: 2, pitch: 1.25, ...over })
const path = (moves: Toolpath["moves"], rpm = 1000): Toolpath => ({ id: "t", name: "Tap", toolId: "tap-m8", spindleRpm: rpm, coolant: "flood", moves })
const emit = (id: "generic" | "fanuc" | "haas" | "grbl", moves: Toolpath["moves"], rpm = 1000, useCannedCycles = true): string =>
  posts[id]!.emit(makeProgram("p", [path(moves, rpm)]), { useCannedCycles })

describe("rigid tapping and reaming cycles", () => {
  const start: Toolpath["moves"] = [{ _tag: "Rapid", to: { x: 10, y: 5, z: 10 } }]

  test("fanuc puts the spindle in position control (M29 S) before G84, whose feed is pitch x speed", () => {
    const nc = emit("fanuc", [...start, cycle({}), { ...cycle({}), to: { x: 30, y: 5, z: -12 } }])
    const lines = nc.split("\n")
    const m29 = lines.findIndex((l) => l === "M29 S1000")
    const g84 = lines.findIndex((l) => l.startsWith("G84"))
    expect(m29).toBeGreaterThan(-1)
    expect(g84).toBe(m29 + 1)
    // Already over the first hole (X/Y are modal), so the cycle block carries the depth, R plane and feed.
    expect(lines[g84]).toBe("G84 G99 Z-12.000 R2.000 F1250")
    expect(lines).toContain("X30.000")
    expect(lines.filter((l) => l.startsWith("M29"))).toHaveLength(1)
    // The independent interpreter replays the tap: to the bottom and back to R at the same feed.
    const run = interpretGcode(nc)
    expect(run.errors).toEqual([])
    expect(run.minZ).toBeCloseTo(-12, 9)
  })

  test("generic and haas tap with G84 alone; a control without the cycle refuses instead of losing the spindle reversal", () => {
    expect(emit("generic", [...start, cycle({})])).toContain("G84 G99 Z-12.000 R2.000 F1250")
    expect(emit("haas", [...start, cycle({})])).not.toContain("M29")
    expect(() => emit("grbl", [...start, cycle({})])).toThrow(/rigid tapping needs the control's G84/)
    expect(() => emit("generic", [...start, cycle({})], 1000, false)).toThrow(/rigid tapping/)
    // A feed that is not one pitch per turn would strip the thread: refused.
    expect(() => emit("generic", [...start, cycle({ feed: 1000 })])).toThrow(/pitch/)
    expect(() => emit("generic", [...start, cycle({ pitch: undefined } as never)])).toThrow(/pitch/)
  })

  test("a reaming cycle is G85, and expands to feed in and feed out where the control has no cycles", () => {
    const ream = cycle({ cycle: "ream", feed: 300, pitch: undefined } as never)
    expect(emit("fanuc", [...start, ream])).toContain("G85 G99 Z-12.000 R2.000 F300")
    const grbl = emit("grbl", [...start, ream])
    expect(grbl).not.toContain("G85")
    const moves = expandCycle(ream, { x: 10, y: 5, z: 10 })
    const feeds = moves.filter((m) => m._tag === "Linear")
    expect(feeds.map((m) => m._tag === "Linear" && m.to.z)).toEqual([-12, 2])
    expect(feeds.every((m) => m._tag === "Linear" && m.feed === 300)).toBe(true)
    expect(interpretGcode(grbl).minZ).toBeCloseTo(-12, 9)
  })
})

// ---------------------------------------------------------------- cutting data

describe("cutting data of taps and reamers", () => {
  test("a tap advances one pitch per revolution, slower than a drill of its size, with its tapping torque", () => {
    const steel = requireMaterial("C45")
    const tap = cuttingData({ material: steel, cutter: tool("tap-m8"), cut: "tap", machine: VMC, depth: 12 })
    expect(tap.feedPerRev).toBe(1.25)
    expect(tap.feed).toBeCloseTo(1.25 * tap.rpm, 9)
    const drill = cuttingData({ material: steel, cutter: { ...tool("drill-6.8"), material: "hss-co", coating: "ticn", diameter: 8 }, cut: "drill", machine: VMC, depth: 12 })
    expect(tap.vcRecommended / drill.vcRecommended).toBeCloseTo(0.45, 3)
    expect(tap.torqueNm).toBeGreaterThan(1)
    expect(tap.torqueNm).toBeLessThan(VMC.torqueNm!)
    expect(tap.exceeded).toEqual([])
    // On a machine whose feed cannot follow, the spindle slows down: still one pitch per turn.
    const slow = cuttingData({ material: requireMaterial("6061"), cutter: tool("tap-m8"), cut: "tap", machine: { ...VMC, maxFeed: 500 }, depth: 12 })
    expect(slow.feed).toBeCloseTo(1.25 * slow.rpm, 9)
    expect(slow.feed).toBeLessThanOrEqual(500)
    expect(slow.limitedBy).toContain("machine feed")
  })

  test("a reamer runs slower than a drill and feeds 2.5 times as much per turn, over the pre-drill's allowance", () => {
    const al = requireMaterial("6061")
    const ream = cuttingData({ material: al, cutter: tool("reamer-8"), cut: "ream", machine: VMC, depth: 12 })
    const drill = cuttingData({ material: al, cutter: { ...tool("drill-8"), coating: "tin" }, cut: "drill", machine: VMC, depth: 12 })
    expect(ream.vcRecommended / drill.vcRecommended).toBeCloseTo(0.6, 3)
    expect(ream.feedPerRev! / drill.feedPerRev!).toBeCloseTo(2.5, 1)
    expect(ream.ae).toBeCloseTo((8 - reamDrill(8)) / 2, 9)
    expect(reamDrill(8)).toBe(7.7)
    expect(reamDrill(5)).toBe(4.8)
  })
})

// ---------------------------------------------------------------- planning and the whole job

const recipe = buildRecipe("mounting_plate", { width: 120, depth: 80, thickness: 12, fastener: "M5", counterbore: true })
const plateWith = (extra: Feature[], parameters: History["parameters"] = {}) => ({
  id: "plate", type: "parametric", name: "Plate", x: 0, y: 0, z: 0,
  history: { parameters: { ...recipe.history.parameters, ...parameters }, features: [...recipe.history.features, ...extra] } satisfies History
})
const stock = { min: { x: -3, y: -3, z: 0 }, max: { x: 123, y: 83, z: 13 } }
const job = (material: string, elements: ReadonlyArray<Record<string, unknown>>, over: Partial<ManufacturingJob> = {}): ManufacturingJob => ({
  schemaVersion: 1, id: "holes", name: "Holes", material, part: { kind: "elements", elements }, stock, ...over
})
const tapped = (id: string, x: number, depth: number, threadDepth: number): Feature =>
  ({ id, type: "hole", plane: "XY", offset: "thick", at: [x, 40], diameter: 5, depth, thread: { designation: "M6", depth: threadDepth } })

describe("planning tapped and fitted holes", () => {
  test("on a control that taps, a tapped hole is drilled then tapped to the thread plus the tap's lead", () => {
    const r = planOnly(job("C45", [plateWith([tapped("through", 40, 12, 12), tapped("blind", 80, 11, 8)])]))
    if (r.status !== "ok") throw new Error(r.issues.map((i) => i.message).join("; "))
    const ops = r.value.operations
    const taps = ops.filter((o) => o.strategy === "drill" && o.cut === "tap")
    expect(taps.map((o) => o.tool)).toEqual(["tap-m6", "tap-m6"])
    // Through: 12 mm of thread plus 2.5 pitches below; blind: 8 + 2.5 = 10.5 mm, above the 11 mm drilled depth.
    expect(taps.map((o) => (o.strategy === "drill" ? o.bottom : 0)).sort((a, b) => a - b)).toEqual([12 - 12 - 2.5, 12 - 10.5])
    expect(ops.some((o) => o.strategy === "thread")).toBe(false)
    // After the tap drill.
    const drill = ops.findIndex((o) => o.strategy === "drill" && o.tool === "drill-5")
    expect(drill).toBeGreaterThan(-1)
    expect(ops.findIndex((o) => o.strategy === "drill" && o.cut === "tap")).toBeGreaterThan(drill)
    expect(r.value.notes.some((n) => /lead runs 2.5 mm below the part/.test(n))).toBe(true)
  })

  test("the thread is milled when the control cannot tap, the material breaks taps, or a blind hole has no room for the lead", () => {
    const router = planOnly(job("6061", [plateWith([tapped("t", 40, 12, 12)])], { machine: findMachine("cnc-router")! }))
    if (router.status !== "ok") throw new Error("plan failed")
    expect(router.value.operations.some((o) => o.strategy === "thread" && o.tool === "threadmill-p1")).toBe(true)
    expect(router.value.operations.some((o) => o.strategy === "drill" && o.cut === "tap")).toBe(false)
    const hard = planOnly(job("hardened", [plateWith([tapped("t", 40, 12, 12)])]))
    if (hard.status !== "ok") throw new Error("plan failed")
    expect(hard.value.operations.some((o) => o.strategy === "thread")).toBe(true)
    const short = planOnly(job("C45", [plateWith([tapped("short", 40, 8, 8)])]))
    if (short.status !== "ok") throw new Error("plan failed")
    expect(short.value.operations.some((o) => o.strategy === "thread")).toBe(true)
    expect(short.value.notes.some((n) => /needs 10.5 mm for the thread and its lead, the hole is 8 mm deep: the thread is milled/.test(n))).toBe(true)
  })

  test("an H7 bore is drilled 0.3 mm under size and reamed; without the reamer the plan says it cannot hold the fit", () => {
    const bore: Feature = { id: "pin", type: "hole", plane: "XY", offset: "thick", at: [60, 40], diameter: 8, depth: 12, fit: "H7" }
    const r = planOnly(job("6061", [plateWith([bore])]))
    if (r.status !== "ok") throw new Error("plan failed")
    const ops = r.value.operations
    const ream = ops.findIndex((o) => o.strategy === "drill" && o.cut === "ream")
    expect(ops[ream]).toMatchObject({ tool: "reamer-8", strategy: "drill", cut: "ream", bottom: -0.5 })
    const pre = ops.findIndex((o) => o.strategy === "drill" && o.tool === "drill-7.7")
    expect(pre).toBeGreaterThan(-1)
    expect(pre).toBeLessThan(ream)
    const without = planOnly(job("6061", [plateWith([bore])], { tools: DEFAULT_CUTTERS.filter((t) => t.kind !== "reamer") }))
    if (without.status !== "ok") throw new Error("plan failed")
    expect(without.value.notes.some((n) => /Hole pin Ø8 H7: no Ø8 reamer in the library; it is drilled or bored, which does not hold H7/.test(n))).toBe(true)
  })
})

describe("a job with tapped and reamed holes", () => {
  const ok = (r: ReturnType<typeof runJob>): CamArtifact => {
    if (r.status !== "ok") throw new Error(r.issues.map((i) => i.message).join("; "))
    return r.value
  }

  test("is a verified program: G84 at pitch x speed, G85, the replay agrees and no thread counts as a gouge", () => {
    const a = ok(runJob(job("6061", [plateWith([
      tapped("through", 40, 12, 12), tapped("blind", 80, 11, 8),
      { id: "pin", type: "hole", plane: "XY", offset: "thick", at: [60, 20], diameter: 8, depth: 12, fit: "H7" }
    ])])))
    const tap = a.operations.find((o) => o.cut === "tap")!
    expect(tap.status).toBe("ok")
    expect(tap.cutting!.feed).toBeCloseTo(1 * tap.cutting!.rpm, 9)
    expect(a.operations.find((o) => o.cut === "ream")!.status).toBe("ok")
    const lines = a.nc.split("\n")
    const g84 = lines.find((l) => /^G84\b/.test(l))!
    expect(g84).toBeDefined()
    // M29 S<rpm> just before it, with the speed the operation runs at, and F = 1 mm x that speed.
    const m29 = lines[lines.indexOf(g84) - 1]!
    expect(m29).toBe(`M29 S${Math.round(tap.cutting!.rpm)}`)
    expect(g84).toContain(`F${Math.round(tap.cutting!.rpm)}`)
    expect(lines.some((l) => /^G85\b/.test(l))).toBe(true)
    expect(interpretGcode(a.nc).errors).toEqual([])
    const claim = (id: string) => a.claims.find((c) => c.id === id)!.status
    expect(claim("nc-replay")).toBe("passed")
    expect(claim("no-gouge")).toBe("passed")
    expect(claim("operations-complete")).toBe("passed")
  })
})
