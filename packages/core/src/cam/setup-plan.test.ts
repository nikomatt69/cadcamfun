import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { booleanBrep, makeBox, makeCylinder, type Brep } from "../cad/brep/index.ts"
import { frame } from "../cad/brep/math.ts"
import { rebuildExact } from "../cad/history-brep.ts"
import { buildRecipe } from "../cad/recipes.ts"
import { planSetups } from "./setup-plan.ts"

setDefaultTimeout(100_000)

const X = { x: 1, y: 0, z: 0 }, Y = { x: 0, y: 1, z: 0 }, Z = { x: 0, y: 0, z: 1 }
const drill = (at: { x: number; y: number; z: number }, axis: { x: number; y: number; z: number }, r = 3, h = 12): Brep =>
  makeCylinder(r, h, frame(at, axis))
const cut = (a: Brep, b: Brep): Brep => booleanBrep(a, b, "subtract").brep

/** A 40 x 30 x 20 block: faces 40x30 (top, bottom), 40x20 (front, back), 30x20 (left, right). */
const block = () => makeBox(40, 30, 20)
const orientations = (p: ReturnType<typeof planSetups>) => p.setups.map((s) => s.orientation)

describe("setup planning on the exact model", () => {
  test("a plain block needs one setup: the bottom is the fixturing face", () => {
    const p = planSetups(block())
    expect(orientations(p)).toEqual(["+Z"])
    expect(p.held).toHaveLength(1)
    expect(p.held[0]!.area).toBeCloseTo(40 * 30, 6)
    expect(p.uncovered).toHaveLength(0)
    expect(p.area).toBeCloseTo(2 * 40 * 20 + 2 * 30 * 20 + 40 * 30, 6)
    expect(p.setups[0]!.share).toBeCloseTo(1, 9)
    expect(p.setups[0]!.prismatic.ok).toBe(true)
  })

  test("what one orientation reaches is the closed-form face area", () => {
    const p = planSetups(block())
    const total = 2 * 40 * 20 + 2 * 30 * 20 + 40 * 30 // the bottom is held
    const at = (o: string) => p.reach.find((r) => r.orientation === o)!
    expect(at("+Z").area).toBeCloseTo(total, 6) // top + four walls
    expect(at("-Z").area).toBeCloseTo(2 * 40 * 20 + 2 * 30 * 20, 6) // the four walls, the top looks away
    expect(at("-X").area).toBeCloseTo(40 * 30 + 2 * 40 * 20 + 30 * 20, 6) // top, front, back, left; the right wall looks away
    expect(at("+Y").faces).toBe(4)
  })

  test("without a fixturing face the underside needs its own setup", () => {
    const p = planSetups(block(), { fixture: "none" })
    expect(p.held).toHaveLength(0)
    expect(orientations(p).sort()).toEqual(["+Z", "-Z"])
    expect(p.uncovered).toHaveLength(0)
  })

  test("holes from three sides give three setups and each hole belongs to the setup that drills it", () => {
    let part = block()
    part = cut(part, drill({ x: 10, y: 10, z: 10 }, Z, 3, 12)) // from the top, Ø6
    part = cut(part, drill({ x: 28, y: 15, z: 10 }, X, 2, 14)) // from +X, Ø4
    part = cut(part, drill({ x: 20, y: 18, z: 10 }, Y, 1.5, 14)) // from +Y, Ø3
    const p = planSetups(part)
    expect(orientations(p).sort()).toEqual(["+X", "+Y", "+Z"])
    expect(p.uncovered).toHaveLength(0)
    expect(p.indexed).toHaveLength(0)
    const dia = (o: string) => p.setups.find((s) => s.orientation === o)!.holes.map((h) => h.diameter)
    expect(dia("+Z")).toEqual([expect.closeTo(6, 6)])
    expect(dia("+X")).toEqual([expect.closeTo(4, 6)])
    expect(dia("+Y")).toEqual([expect.closeTo(3, 6)])
    // Every face is first-reached by exactly one setup.
    const all = p.setups.flatMap((s) => [...s.faces])
    expect(new Set(all).size).toBe(all.length)
    expect(p.setups.reduce((s, x) => s + x.share, 0)).toBeCloseTo(1, 9)
    // Seen from each side the part is 2.5D: the holes of the other sides are plugged, and each setup finds exactly its own hole.
    for (const s of p.setups) expect(s.prismatic).toEqual({ ok: true, holes: 1, pockets: 0, outlines: 1 })
  })

  test("a top hole alone stays one prismatic setup with the hole", () => {
    const p = planSetups(cut(block(), drill({ x: 20, y: 15, z: 8 }, Z, 4, 14)))
    expect(orientations(p)).toEqual(["+Z"])
    const s = p.setups[0]!
    expect(s.prismatic).toEqual({ ok: true, holes: 1, pockets: 0, outlines: 1 })
    expect(s.holes).toHaveLength(1)
    expect(s.holes[0]!.depth).toBeCloseTo(12, 6)
  })

  test("a face no allowed orientation reaches is reported with the reason, never dropped", () => {
    const part = cut(block(), drill({ x: 28, y: 15, z: 10 }, X, 2, 14))
    const p = planSetups(part, { allowed: ["+Z"] })
    expect(orientations(p)).toEqual(["+Z"])
    expect(p.uncovered.length).toBeGreaterThan(0)
    expect(p.uncovered.every((u) => u.kind === "cylinder" || u.kind === "plane")).toBe(true)
    expect(p.uncovered.some((u) => u.reason.includes("not allowed"))).toBe(true)
    // The side hole is drilled from +X, which this plan does not use.
    expect(p.indexed).toHaveLength(1)
    expect(p.notes.join(" ")).toContain("+X")
  })

  test("a cavity inside the solid is enclosed", () => {
    const part = cut(makeBox(40, 40, 40), makeBox(10, 10, 10, frame({ x: 15, y: 15, z: 15 }, Z)))
    const p = planSetups(part)
    expect(p.uncovered).toHaveLength(6)
    expect(p.uncovered.every((u) => u.reason === "enclosed: no axis direction sees it")).toBe(true)
    expect(p.uncovered.reduce((s, u) => s + u.area, 0)).toBeCloseTo(6 * 100, 6)
  })

  test("a hole at 45 degrees is not an axis setup: it needs indexing", () => {
    const s = Math.SQRT1_2
    const part = cut(block(), drill({ x: 12, y: 15, z: 14 }, { x: s, y: 0, z: s }, 2, 12))
    const p = planSetups(part)
    expect(p.indexed).toHaveLength(1)
    expect(p.indexed[0]!.diameter).toBeCloseTo(4, 6)
    expect(p.notes.join(" ")).toContain("3+2")
  })

  test("a counterbored mounting plate is one +Z setup: tessellation slivers on the bore walls do not hide them", () => {
    const recipe = buildRecipe("mounting_plate", { width: 120, depth: 80, thickness: 12, fastener: "M5", counterbore: true })
    const exact = rebuildExact(recipe.history)
    const brep = exact.bodies[0]!.brep
    if (brep === undefined) throw new Error(exact.bodies[0]!.reason)
    const p = planSetups(brep)
    expect(orientations(p)).toEqual(["+Z"])
    expect(p.uncovered).toEqual([])
    expect(p.setups[0]!.holes).toHaveLength(4)
    expect(p.setups[0]!.share).toBeCloseTo(1, 9)
  })

  test("the plan is deterministic", () => {
    const part = cut(block(), drill({ x: 28, y: 15, z: 10 }, X, 2, 14))
    expect(JSON.stringify(planSetups(part))).toBe(JSON.stringify(planSetups(part)))
  })

  test("an empty allowed list is refused", () => {
    expect(() => planSetups(block(), { allowed: [] })).toThrow(RangeError)
  })
})
