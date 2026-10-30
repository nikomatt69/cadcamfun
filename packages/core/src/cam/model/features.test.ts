import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { blendBrep, blendCandidates, booleanBrep, frame, makeBox, makeCylinder, polyhedron, recognizeHoles, selectBlendEdges, validateBrep, type Brep } from "../../cad/brep/index.ts"
import { recognizeNamedFeatures, scoreRecognition, type ExpectedFeature, type NamedFeature, type NamedFeatureKind } from "./features.ts"

setDefaultTimeout(180_000)

// ---------------------------------------------------------------- a SYNTHETIC corpus
//
// Every part below is built in this file with the exact B-rep kernel (a box, Boolean cuts, exact blends), and what it contains is known
// from how it was built. It is a small synthetic corpus, NOT the 40-part reference set of spec 72 step 0.2: the figures it gives say the
// recogniser is right on these constructions, nothing about real parts.

interface Part {
  readonly name: string
  readonly brep: Brep
  readonly expected: ReadonlyArray<ExpectedFeature>
}

const at = (x: number, y: number, z: number, tolerance = 1): Pick<ExpectedFeature, "at" | "tolerance"> => ({ at: { x, y, z }, tolerance })
const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Brep => makeBox(x1 - x0, y1 - y0, z1 - z0, frame({ x: x0, y: y0, z: z0 }))
const cut = (a: Brep, ...tools: Brep[]): Brep => tools.reduce((s, t) => booleanBrep(s, t, "subtract").brep, a)
const base = (): Brep => box(0, 0, 0, 60, 40, 20)
const round = (b: Brep, size: number, style: "fillet" | "chamfer", s: Parameters<typeof selectBlendEdges>[1]): Brep => {
  const r = blendBrep(b, selectBlendEdges(blendCandidates(b), s), size, style)
  if (r.failures.length > 0 || r.rejected.length > 0) throw new Error(`blend failed: ${[...r.failures, ...r.rejected].join("; ")}`)
  return r.brep
}
const topEdges = { within: { min: [-1, -1, 19] as const, max: [61, 41, 21] as const } }

const corpus = (): Part[] => [
  { name: "plain block", brep: base(), expected: [] },
  { name: "open slot, both ends open", brep: cut(base(), box(-5, 15, 10, 65, 25, 25)), expected: [{ kind: "slot", ...at(30, 20, 15) }] },
  { name: "slot closed at one end", brep: cut(base(), box(15, 15, 10, 65, 25, 25)), expected: [{ kind: "slot", ...at(37.5, 20, 15) }] },
  { name: "round-ended slot closed at both ends", brep: cut(base(), booleanBrep(booleanBrep(box(15, 15, 10, 45, 25, 25), makeCylinder(5, 15, frame({ x: 15, y: 20, z: 10 })), "union").brep, makeCylinder(5, 15, frame({ x: 45, y: 20, z: 10 })), "union").brep), expected: [{ kind: "slot", ...at(30, 20, 15) }] },
  { name: "step across the part", brep: cut(base(), box(-5, -5, 12, 25, 45, 25)), expected: [{ kind: "step", ...at(12.5, 20, 16) }] },
  { name: "chamfered top edges", brep: round(base(), 2, "chamfer", { kind: "convex", ...topEdges }), expected: [{ kind: "chamfer-band", ...at(30, 20, 19) }] },
  { name: "rounded vertical edges", brep: round(base(), 4, "fillet", { kind: "convex", parallel: "z" }), expected: [2, 58].flatMap((x) => [2, 38].map((y): ExpectedFeature => ({ kind: "fillet-band", ...at(x, y, 10) }))) },
  { name: "rounded top edges", brep: round(base(), 3, "fillet", { kind: "convex", ...topEdges }), expected: [{ kind: "fillet-band", ...at(30, 20, 18.5, 2) }] },
  { name: "closed rectangular pocket", brep: cut(base(), box(10, 10, 12, 40, 30, 25)), expected: [] },
  { name: "counterbored hole and a through hole", brep: cut(base(), makeCylinder(4, 30, frame({ x: 15, y: 20, z: -2 })), makeCylinder(8, 8, frame({ x: 15, y: 20, z: 14 }))), expected: [] },
  {
    name: "ramp (a long sloped face is not a chamfer)",
    brep: polyhedron(
      [{ x: 0, y: 0, z: 0 }, { x: 60, y: 0, z: 0 }, { x: 60, y: 40, z: 0 }, { x: 0, y: 40, z: 0 }, { x: 0, y: 0, z: 20 }, { x: 0, y: 40, z: 20 }],
      [[0, 3, 2, 1], [0, 1, 4], [3, 5, 2], [0, 4, 5, 3], [1, 2, 5, 4]]
    ),
    expected: []
  },
  {
    name: "ring groove on a shaft",
    brep: cut(makeCylinder(15, 40), booleanBrep(makeCylinder(20, 5, frame({ x: 0, y: 0, z: 15 })), makeCylinder(12, 5, frame({ x: 0, y: 0, z: 15 })), "subtract").brep),
    expected: [{ kind: "groove", ...at(0, 0, 17.5) }]
  },
  {
    name: "V-groove (two sloped faces meeting concavely are not chamfers)",
    brep: cut(base(), polyhedron(
      [{ x: -5, y: 10, z: 22 }, { x: -5, y: 30, z: 22 }, { x: -5, y: 20, z: 12 }, { x: 65, y: 10, z: 22 }, { x: 65, y: 30, z: 22 }, { x: 65, y: 20, z: 12 }],
      [[0, 1, 2], [3, 5, 4], [0, 2, 5, 3], [1, 4, 5, 2], [0, 3, 4, 1]]
    )),
    expected: []
  },
  {
    name: "pocket with sloped walls (not vertical: no slot, no step)",
    brep: cut(base(), polyhedron(
      [{ x: 15, y: 10, z: 10 }, { x: 35, y: 10, z: 10 }, { x: 35, y: 30, z: 10 }, { x: 15, y: 30, z: 10 }, { x: 10, y: 5, z: 21 }, { x: 40, y: 5, z: 21 }, { x: 40, y: 35, z: 21 }, { x: 10, y: 35, z: 21 }],
      [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [3, 7, 6, 2], [0, 4, 7, 3], [1, 2, 6, 5]]
    )),
    expected: []
  },
  {
    name: "ring groove inside a bore",
    brep: cut(base(), makeCylinder(8, 30, frame({ x: 30, y: 20, z: -5 })), booleanBrep(makeCylinder(11, 4, frame({ x: 30, y: 20, z: 8 })), makeCylinder(8, 4, frame({ x: 30, y: 20, z: 8 })), "subtract").brep),
    expected: [{ kind: "groove", ...at(30, 20, 10, 2) }]
  },
  {
    name: "slot with filleted floor corners (the band between floor and wall is looked through)",
    // The cutter is a box with its bottom long edges rounded: the part gets the concave fillets.
    brep: cut(base(), round(box(-5, 15, 10, 65, 25, 25), 2, "fillet", { kind: "convex", parallel: "x", within: { min: [-6, 14, 9], max: [66, 26, 11] } })),
    expected: [{ kind: "slot", ...at(30, 20, 15, 2) }, { kind: "fillet-band", ...at(30, 17, 11, 2) }, { kind: "fillet-band", ...at(30, 23, 11, 2) }]
  },
  {
    name: "slot and chamfer together",
    brep: round(cut(base(), box(-5, 15, 10, 65, 25, 25)), 1.5, "chamfer", { kind: "convex", parallel: "x", within: { min: [-1, 14, 19], max: [61, 26, 21] } }),
    expected: [{ kind: "slot", ...at(30, 20, 15, 2) }, { kind: "chamfer-band", ...at(30, 15.75, 19.25, 1.5) }, { kind: "chamfer-band", ...at(30, 24.25, 19.25, 1.5) }]
  }
]

const parts = corpus()
const part = (name: string): Part => parts.find((p) => p.name === name)!
const kinds = (fs: ReadonlyArray<NamedFeature>): string[] => fs.map((f) => f.kind).sort()

describe("the synthetic corpus is sound", () => {
  test("every part is a valid solid", () => {
    for (const p of parts) expect(validateBrep(p.brep).issues.map((i) => `${p.name}: ${i.message}`)).toEqual([])
  })
})

describe("slots, steps, grooves and bands with their faces", () => {
  test("an open slot: two facing walls and a floor, with width, depth and length", () => {
    const f = recognizeNamedFeatures(part("open slot, both ends open").brep)
    expect(kinds(f)).toEqual(["slot"])
    const s = f[0]!
    expect(s.width).toBeCloseTo(10, 6)
    expect(s.depth).toBeCloseTo(10, 6)
    expect(s.length).toBeCloseTo(60, 6)
    expect(s.floorZ).toBeCloseTo(10, 6)
    expect(s.topZ).toBeCloseTo(20, 6)
    expect(s.ends).toEqual(["open", "open"])
    expect(s.faces).toHaveLength(3)
    // The faces are the floor and the two walls of the B-rep.
    const brep = part("open slot, both ends open").brep
    expect(brep.faces[s.floor!]!.surface.kind).toBe("plane")
    expect(s.walls!.map((w) => brep.faces[w]!.surface.kind)).toEqual(["plane", "plane"])
  })

  test("a slot closed at one end has the end wall among its faces, and the other end open", () => {
    const f = recognizeNamedFeatures(part("slot closed at one end").brep)
    expect(kinds(f)).toEqual(["slot"])
    expect(f[0]!.faces).toHaveLength(4)
    expect([...f[0]!.ends!].sort()).toEqual(["closed", "open"])
    expect(f[0]!.length).toBeCloseTo(45, 6)
  })

  test("a round-ended slot (closed at both ends) is a slot with round ends", () => {
    const f = recognizeNamedFeatures(part("round-ended slot closed at both ends").brep)
    expect(kinds(f)).toEqual(["slot"])
    expect(f[0]!.ends).toEqual(["round", "round"])
    expect(f[0]!.width).toBeCloseTo(10, 5)
  })

  test("a step has one wall: its height and the floor Z", () => {
    const f = recognizeNamedFeatures(part("step across the part").brep)
    expect(kinds(f)).toEqual(["step"])
    expect(f[0]).toMatchObject({ floorZ: expect.closeTo(12, 6), depth: expect.closeTo(8, 6), length: expect.closeTo(40, 6) })
    expect(f[0]!.faces).toHaveLength(2)
  })

  test("a ring groove: the floor cylinder and the two rings, with width, depth, diameter and outside/inside", () => {
    const f = recognizeNamedFeatures(part("ring groove on a shaft").brep)
    expect(kinds(f)).toEqual(["groove"])
    expect(f[0]).toMatchObject({ width: expect.closeTo(5, 6), depth: expect.closeTo(3, 6), diameter: expect.closeTo(24, 6), external: true })
    expect(f[0]!.faces).toHaveLength(3)
  })

  test("a chamfer ring: one band of four faces, 2 mm wide at 45 degrees, with the closed loop of its lower edge", () => {
    const f = recognizeNamedFeatures(part("chamfered top edges").brep)
    expect(kinds(f)).toEqual(["chamfer-band"])
    const c = f[0]!
    expect(c.faces).toHaveLength(4)
    expect(c.convex).toBe(true)
    expect(c.size).toBeCloseTo(2 * Math.SQRT2, 3)
    expect(c.turn).toBeCloseTo(45, 3)
    expect(c.upperZ).toBeCloseTo(20, 6)
    expect(c.lowerZ).toBeCloseTo(18, 6)
    // The lower edges lie on the walls: the outline of the part.
    expect(c.loops).toHaveLength(1)
    // Material is inside the loop (an outline), so the cone runs outside it.
    expect(c.loopSides).toEqual(["outside"])
    const xs = c.loops![0]!.map((p) => p.x), ys = c.loops![0]!.map((p) => p.y)
    const extent = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
    ;[0, 60, 0, 40].forEach((v, i) => expect(extent[i]!).toBeCloseTo(v, 9))
  })

  test("rounded vertical edges are four fillet bands of radius 4; rounded top edges are one band of radius 3", () => {
    const v = recognizeNamedFeatures(part("rounded vertical edges").brep)
    expect(kinds(v)).toEqual(["fillet-band", "fillet-band", "fillet-band", "fillet-band"])
    for (const b of v) { expect(b.size).toBeCloseTo(4, 6); expect(b.convex).toBe(true); expect(b.faces).toHaveLength(1) }
    const t = recognizeNamedFeatures(part("rounded top edges").brep)
    expect(t.every((f) => f.kind === "fillet-band" && Math.abs(f.size! - 3) < 1e-6 && f.convex === true)).toBe(true)
    expect(t.length).toBeGreaterThan(0)
  })

  test("a slot whose floor corners are filleted: the fillets are bands and are part of the slot's faces, the slot is still a slot", () => {
    const f = recognizeNamedFeatures(part("slot with filleted floor corners (the band between floor and wall is looked through)").brep)
    expect(kinds(f)).toEqual(["fillet-band", "fillet-band", "slot"])
    const slot = f.find((x) => x.kind === "slot")!
    expect(slot.width).toBeCloseTo(10, 6)
    expect(slot.faces).toHaveLength(5)
    for (const b of f.filter((x) => x.kind === "fillet-band")) { expect(b.convex).toBe(false); expect(b.size).toBeCloseTo(2, 6); expect(slot.faces).toEqual(expect.arrayContaining([...b.faces])) }
  })

  test("an internal ring groove is found as a groove inside the bore", () => {
    const f = recognizeNamedFeatures(part("ring groove inside a bore").brep)
    expect(kinds(f)).toEqual(["groove"])
    expect(f[0]).toMatchObject({ external: false, width: expect.closeTo(4, 6), depth: expect.closeTo(3, 6), diameter: expect.closeTo(22, 6) })
  })

  test("not features: a closed pocket, holes, a ramp, a V-groove and sloped pocket walls are named nothing", () => {
    expect(recognizeNamedFeatures(part("V-groove (two sloped faces meeting concavely are not chamfers)").brep)).toEqual([])
    expect(recognizeNamedFeatures(part("pocket with sloped walls (not vertical: no slot, no step)").brep)).toEqual([])
    expect(recognizeNamedFeatures(part("closed rectangular pocket").brep)).toEqual([])
    expect(recognizeNamedFeatures(part("counterbored hole and a through hole").brep)).toEqual([])
    expect(recognizeNamedFeatures(part("ramp (a long sloped face is not a chamfer)").brep)).toEqual([])
    expect(recognizeNamedFeatures(part("plain block").brep)).toEqual([])
    // The holes stay with the hole recognition.
    expect(recognizeHoles(part("counterbored hole and a through hole").brep).length).toBe(1)
  })

  test("a slot with a chamfer along both of its top edges: the slot and two bands, on their own faces", () => {
    const f = recognizeNamedFeatures(part("slot and chamfer together").brep)
    expect(kinds(f)).toEqual(["chamfer-band", "chamfer-band", "slot"])
    const slot = f.find((x) => x.kind === "slot")!
    for (const chamfer of f.filter((x) => x.kind === "chamfer-band")) expect(slot.faces.some((i) => chamfer.faces.includes(i))).toBe(false)
  })
})

describe("precision and recall on the synthetic corpus", () => {
  test("per feature kind over all parts: reported, and every figure is 1 on these constructions", () => {
    const kindsList: NamedFeatureKind[] = ["slot", "step", "groove", "chamfer-band", "fillet-band"]
    const total = Object.fromEntries(kindsList.map((k) => [k, { expected: 0, found: 0, tp: 0 }])) as Record<NamedFeatureKind, { expected: number; found: number; tp: number }>
    const misses: string[] = []
    for (const p of parts) {
      const found = recognizeNamedFeatures(p.brep)
      const score = scoreRecognition(p.expected, found)
      for (const k of kindsList) {
        total[k].expected += score[k].expected; total[k].found += score[k].found; total[k].tp += score[k].truePositive
        if (score[k].precision < 1 || score[k].recall < 1) misses.push(`${p.name}: ${k} precision ${score[k].precision.toFixed(2)} recall ${score[k].recall.toFixed(2)} (found ${score[k].found}, expected ${score[k].expected})`)
      }
    }
    const table = kindsList.map((k) => `${k.padEnd(13)} expected ${String(total[k].expected).padStart(2)} found ${String(total[k].found).padStart(2)} precision ${(total[k].found === 0 ? 1 : total[k].tp / total[k].found).toFixed(2)} recall ${(total[k].expected === 0 ? 1 : total[k].tp / total[k].expected).toFixed(2)}`)
    console.log(`synthetic corpus (${parts.length} parts, NOT the 40-part set):\n${table.join("\n")}`)
    expect(misses).toEqual([])
    // Every kind is exercised by the corpus: a figure of 1 over zero expectations would prove nothing.
    for (const k of kindsList) expect(total[k].expected).toBeGreaterThan(0)
  })

  test("the scoring itself: a miss, a false alarm and a wrong kind are counted", () => {
    const f = (kind: NamedFeatureKind, x: number): NamedFeature => ({ id: "f", kind, faces: [], bounds: { min: { x: x - 1, y: 0, z: 0 }, max: { x: x + 1, y: 0, z: 0 } } })
    const s = scoreRecognition([{ kind: "slot", at: { x: 0, y: 0, z: 0 }, tolerance: 0.5 }, { kind: "slot", at: { x: 10, y: 0, z: 0 }, tolerance: 0.5 }], [f("slot", 0), f("step", 10), f("slot", 30)])
    expect(s.slot).toMatchObject({ expected: 2, found: 2, truePositive: 1, precision: 0.5, recall: 0.5 })
    expect(s.step).toMatchObject({ expected: 0, found: 1, precision: 0, recall: 1 })
  })
})
