/**
 * Kernel finding of the AI-to-kernel audit (2026-11-02): a fillet whose radius is larger than half of an adjacent face was accepted
 * silently and returned a WRONG solid instead of a refusal. A 60 x 40 x 8 plate with its four vertical edges filleted at R30 cannot
 * exist (two R30 arcs need 60 mm on the 40 mm side); the history built, `ok` was true, no issue was raised, and the plate came out
 * 56.55 mm long instead of 60 (the four corners were cut as if the arcs overlapped).
 *
 * The strips two parallel blended edges take on the face between them must fit in it (`stripConflicts`, cad/blend-spec.ts). The
 * mesh rebuild, the exact B-rep blend and the exact replay all refuse what does not fit, for fillets, variable fillets and chamfers,
 * with a message that names the largest size that does, and the failure stays with the one feature.
 */
import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { rebuild, type History } from "./history.ts"
import { rebuildExact } from "./history-brep.ts"
import { blendBrep, blendCandidates, blendCollisions, makeBox, massProperties, selectBlendEdges } from "./brep/index.ts"
import { meshVolume } from "./solid.ts"

setDefaultTimeout(180_000)

const rectangle = (id: string, at: [number, number]) =>
  ({ id, type: "sketch", plane: "XY", sketch: { entities: [], constraints: [], shapes: [{ id: `${id}-r`, kind: "rectangle", at, width: "w", height: "h" }] } })

const plate = (radius: number, rounding: Record<string, unknown> = {}, edges: Record<string, unknown> = { parallel: "z" }): History => ({
  parameters: { w: 60, h: 40, t: 8, r: radius },
  features: [
    rectangle("s", [0, 0]),
    { id: "plate", type: "extrude", sketch: "s", depth: "t", operation: "new" },
    { id: "round", type: "fillet", radius: "r", edges, ...rounding }
  ]
} as unknown as History)

const extent = (history: History) => {
  const out = rebuild(history)
  let min = Infinity, max = -Infinity, volume = 0
  for (const body of out.bodies) {
    volume += Math.abs(meshVolume(body.mesh))
    for (let i = 0; i < body.mesh.positions.length; i += 3) { min = Math.min(min, body.mesh.positions[i]!); max = Math.max(max, body.mesh.positions[i]!) }
  }
  return { out, issues: out.issues, errors: out.issues.filter((i) => i.severity === "error"), length: max - min, volume }
}

const PLATE = 60 * 40 * 8

describe("a fillet larger than the faces it rounds", () => {
  test("R5 is fine: the plate keeps its 60 mm length", () => {
    const { errors, length } = extent(plate(5))
    expect(errors).toEqual([])
    expect(length).toBeCloseTo(60, 3)
  })

  test("R30 on the 40 mm side is refused with an error that names the limit; it does not silently shorten the part", () => {
    const { errors, out, volume } = extent(plate(30))
    expect(errors).toHaveLength(1)
    expect(errors[0]!.feature).toBe("round")
    expect(errors[0]!.message).toMatch(/does not fit/)
    expect(errors[0]!.message).toMatch(/radius 30 exceeds the maximum 20 for this edge/)
    expect(errors[0]!.message).toMatch(/only 40\.00 mm wide, but the two fillets need 60\.00 mm/)
    expect(errors[0]!.remedy).toMatch(/at most 20 mm/)
    // The feature failed as a whole: the plate is left as it was (the whole 60 x 40 x 8 block).
    expect(out.states?.["round"]?.state).toBe("failed")
    expect(volume).toBeCloseTo(PLATE, 3)
  })

  test("a radius exactly at the limit (R20: a stadium) builds; just over it fails", () => {
    const at = extent(plate(20))
    expect(at.errors).toEqual([])
    expect(at.length).toBeCloseTo(60, 3)
    // Four quarter discs of R20 removed per 8 mm: the 40 mm side becomes two semicircles.
    expect(at.volume).toBeLessThan(PLATE - 4 * (400 - Math.PI * 100) * 8 + 5)
    expect(at.volume).toBeGreaterThan(PLATE - 4 * (400 - Math.PI * 100) * 8 - 20)
    const over = extent(plate(20.05))
    expect(over.errors).toHaveLength(1)
    expect(over.errors[0]!.message).toMatch(/maximum 20 for this edge/)
  })

  test("the 60 mm side alone would take R30: two edges on the long face are at the limit and build", () => {
    const { errors, length } = extent(plate(30, {}, { parallel: "z", within: { min: [-1, -1, -1], max: [61, 1, 9] } }))
    expect(errors).toEqual([])
    expect(length).toBeCloseTo(60, 3)
  })

  test("the limit holds for each pair: edges on the 40 mm face are refused even when the 60 mm face would take them", () => {
    const { errors } = extent(plate(30, {}, { parallel: "z", within: { min: [59, -1, -1], max: [61, 41, 9] } }))
    expect(errors).toHaveLength(1)
    expect(errors[0]!.message).toMatch(/maximum 20 for this edge/)
  })

  test("no false alarm: all twelve edges of the plate at a size the 8 mm walls take build, the next size up is refused with the 4 mm limit", () => {
    const all = { kind: "convex" }
    const fits = extent(plate(3.9, {}, all))
    expect(fits.errors).toEqual([])
    expect(fits.length).toBeCloseTo(60, 3)
    const over = extent(plate(4.1, {}, all))
    expect(over.errors).toHaveLength(1)
    expect(over.errors[0]!.message).toMatch(/radius 4\.1 exceeds the maximum 4 for this edge/)
    expect(over.errors[0]!.remedy).toMatch(/at most 4 mm/)
  })

  test("a chamfer is refused likewise: at the limit it builds, just over it fails, and the message says what fits", () => {
    expect(extent(plate(5, { style: "chamfer" })).errors).toEqual([])
    expect(extent(plate(20, { style: "chamfer" })).errors).toEqual([])
    const over = extent(plate(20.5, { style: "chamfer" }))
    expect(over.errors).toHaveLength(1)
    expect(over.errors[0]!.message).toMatch(/The chamfer does not fit/)
    expect(over.errors[0]!.message).toMatch(/distance 20\.5 exceeds the maximum 20 for this edge/)
    expect(over.errors[0]!.message).toMatch(/only 40\.00 mm wide, but the two chamfers need 41\.00 mm/)
    expect(over.out.states?.["round"]?.state).toBe("failed")
    expect(over.volume).toBeCloseTo(PLATE, 3)
  })

  test("an unequal chamfer (two distances) is checked with its own setbacks on each face", () => {
    // The edges along x between the top and the sides: the first distance goes on the top (40 mm between its two edges), the
    // second on the 8 mm sides. 18 + 18 fits the top, 25 + 25 does not; 3 + 3 fits the side.
    const edges = { parallel: "x", within: { min: [-1, -1, 7], max: [61, 41, 9] } }
    expect(extent(plate(18, { style: "chamfer", secondDistance: 3 }, edges)).errors).toEqual([])
    const over = extent(plate(25, { style: "chamfer", secondDistance: 3 }, edges))
    expect(over.errors).toHaveLength(1)
    expect(over.errors[0]!.message).toMatch(/The chamfer does not fit/)
    expect(over.errors[0]!.message).toMatch(/only 40\.00 mm wide, but the two chamfers need 50\.00 mm/)
  })

  test("a variable fillet is refused when either end is too wide for the face between two edges", () => {
    expect(extent(plate(5, { radiusEnd: 15 })).errors).toEqual([])
    const over = extent(plate(15, { radiusEnd: 30 }))
    expect(over.errors).toHaveLength(1)
    expect(over.errors[0]!.message).toMatch(/The fillet does not fit/)
    expect(over.errors[0]!.message).toMatch(/exceeds the maximum 20 for this edge/)
    expect(over.out.states?.["round"]?.state).toBe("failed")
    expect(over.volume).toBeCloseTo(PLATE, 3)
  })

  test("the failure stays with the feature: a later independent feature still builds, a dependant is skipped", () => {
    const history = plate(30)
    const more = {
      ...history,
      features: [
        ...history.features,
        rectangle("s2", [100, 0]),
        { id: "block", type: "extrude", sketch: "s2", depth: "t", operation: "new" },
        { id: "round2", type: "fillet", radius: 2, edges: { parallel: "z" }, targets: ["block"] }
      ]
    } as unknown as History
    const out = rebuild(more)
    expect(out.states?.["round"]?.state).toBe("failed")
    expect(out.states?.["block"]?.state).toBe("ok")
    expect(out.states?.["round2"]?.state).toBe("ok")
    expect(out.issues.filter((i) => i.severity === "error").map((i) => i.feature)).toEqual(["round"])
    expect(out.bodies).toHaveLength(2)
  })

  test("the exact replay follows: the refused fillet leaves the exact plate untouched, a fitting one rounds it", () => {
    const refused = rebuildExact(plate(30))
    expect(refused.bodies).toHaveLength(1)
    expect(refused.bodies[0]!.brep).toBeDefined()
    expect(massProperties(refused.bodies[0]!.brep!).volume).toBeCloseTo(PLATE, 3)
    const fitted = rebuildExact(plate(5))
    expect(massProperties(fitted.bodies[0]!.brep!).volume).toBeCloseTo(PLATE - 4 * (25 - Math.PI * 25 / 4) * 8, 2)
  })
})

describe("the exact B-rep blend refuses the same sizes", () => {
  const box = makeBox(60, 40, 8)
  const vertical = (b: typeof box) => selectBlendEdges(blendCandidates(b, 25), { parallel: "z" })

  test("R30 on the four vertical edges: every edge is refused with the limit and the body is not cut", () => {
    const edges = vertical(box)
    expect(edges).toHaveLength(4)
    const res = blendBrep(box, edges, 30)
    expect(res.blended).toBe(0)
    expect(res.rejected).toHaveLength(4)
    expect(res.rejected[0]).toMatch(/radius 30 exceeds the maximum 20 for this edge/)
    expect(massProperties(res.brep).volume).toBeCloseTo(PLATE, 6)
  })

  test("R20 (the limit) builds the stadium, a chamfer of 20 too, 20.5 does not", () => {
    const edges = vertical(box)
    const fillet = blendBrep(box, edges, 20)
    expect(fillet.rejected).toEqual([])
    expect(fillet.failures).toEqual([])
    expect(massProperties(fillet.brep).volume).toBeCloseTo(PLATE - 4 * (400 - Math.PI * 100) * 8, 1)
    expect(blendBrep(box, edges, 20, "chamfer").rejected).toEqual([])
    expect(blendBrep(box, edges, 20.5, "chamfer").rejected).toHaveLength(4)
  })

  test("variable radii: the check runs on both ends of each edge", () => {
    const edges = vertical(box)
    const ends = (a: number, b: number) => blendCollisions(edges, "fillet", () => [a, b])
    expect(ends(5, 15).size).toBe(0)
    expect(ends(15, 20).size).toBe(0)
    expect(ends(15, 30).size).toBe(4)
    expect([...ends(15, 30).values()][0]).toMatch(/exceeds the maximum/)
  })
})
