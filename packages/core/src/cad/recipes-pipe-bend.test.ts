import { describe, expect, test } from "bun:test"
import { historyVolume, rebuild, withParameter, type History } from "./history.ts"
import { buildRecipe } from "./recipes.ts"

/**
 * pipe_bend rebuilds: a hollow section swept along a rounded route is a Boolean of tens of thousands of triangles, and the time grows
 * with the arc's point count (the default Ø30, R45 elbow takes minutes). The pipes here are small (Ø10 x 1) so each rebuild is seconds.
 */
const SLOW = 110_000
const rel = (got: number, want: number) => Math.abs(got - want) / Math.abs(want)
const PIPE = { outerDiameter: 10, wall: 1, legA: 20, legB: 20, bendRadius: 8 }
/** Centre-line length of a bend of `radius` turning `degrees` between two runs: the runs less two setbacks, plus the arc. */
const bendLength = (legA: number, legB: number, degrees: number, radius: number): number => {
  const turn = (degrees * Math.PI) / 180
  return legA + legB - 2 * radius * Math.tan(turn / 2) + radius * turn
}
const tube = (od: number, wall: number, length: number): number => Math.PI * ((od / 2) ** 2 - (od / 2 - wall) ** 2) * length
const volumeOf = (h: History) => historyVolume(rebuild(h))

describe("pipe_bend rebuilds", () => {
  test("a rounded 90 degree bend: one solid, fully constrained sketches, volume pi (R^2 - r^2) x (runs - 2 R tan(a/2) + R a) within 0.3 %", () => {
    const res = buildRecipe("pipe_bend", PIPE)
    expect(res.derived["centrelineLength"]).toBeCloseTo(bendLength(20, 20, 90, 8), 3)
    const r = rebuild(res.history)
    expect(r.issues).toEqual([])
    expect(r.bodies).toHaveLength(1)
    expect(Object.values(r.sketches).map((s) => s.solve.status)).toEqual(["fully-constrained", "fully-constrained"])
    expect(rel(historyVolume(r), tube(10, 1, bendLength(20, 20, 90, 8)))).toBeLessThan(0.003)
  }, SLOW)

  test("135 degrees at R12 on 30 mm runs (a 29.8 mm setback): the same formula", () => {
    const input = { outerDiameter: 10, wall: 1, legA: 30, legB: 30, bendRadius: 12, bendAngle: 135 }
    const res = buildRecipe("pipe_bend", input)
    expect(res.derived["centrelineLength"]).toBeCloseTo(bendLength(30, 30, 135, 12), 3)
    const r = rebuild(res.history)
    expect(r.issues).toEqual([])
    expect(rel(historyVolume(r), tube(10, 1, bendLength(30, 30, 135, 12)))).toBeLessThan(0.003)
  }, SLOW)

  test("bendRadius 0 is the mitred elbow of before: volume pi (R^2 - r^2)(L1 + L2) within 0.5 %, and the default-size one too", () => {
    const small = rebuild(buildRecipe("pipe_bend", { ...PIPE, bendRadius: 0 }).history)
    expect(small.issues).toEqual([])
    expect(rel(historyVolume(small), tube(10, 1, 40))).toBeLessThan(0.005)
    const big = rebuild(buildRecipe("pipe_bend", { bendRadius: 0 }).history) // Ø30 x 3, 2 runs of 100: 12 000 triangles, seconds
    expect(big.issues).toEqual([])
    expect(big.bodies).toHaveLength(1)
    expect(rel(historyVolume(big), tube(30, 3, 200))).toBeLessThan(0.005)
  }, SLOW)

  test("a rounded bend has less material than the mitred elbow of the same runs, and a wider bend less than a tighter one", () => {
    const mitre = volumeOf(buildRecipe("pipe_bend", { ...PIPE, bendRadius: 0 }).history)
    const tight = volumeOf(buildRecipe("pipe_bend", { ...PIPE, bendRadius: 6 }).history)
    const wide = volumeOf(buildRecipe("pipe_bend", { ...PIPE, bendRadius: 10 }).history)
    expect(tight).toBeLessThan(mitre)
    expect(wide).toBeLessThan(tight)
  }, SLOW)

  test("editing the wall, a run, the bend radius and the angle rebuilds with the right material", () => {
    const h = buildRecipe("pipe_bend", PIPE).history
    expect(rel(volumeOf(withParameter(h, "wall", 1.5)), tube(10, 1.5, bendLength(20, 20, 90, 8)))).toBeLessThan(0.003)
    expect(rel(volumeOf(withParameter(h, "legA", 26)), tube(10, 1, bendLength(26, 20, 90, 8)))).toBeLessThan(0.003)
    expect(rel(volumeOf(withParameter(h, "bendRadius", 12)), tube(10, 1, bendLength(20, 20, 90, 12)))).toBeLessThan(0.003)
    expect(rel(volumeOf(withParameter(h, "bend", 60)), tube(10, 1, bendLength(20, 20, 60, 8)))).toBeLessThan(0.003)
  }, SLOW)

  test("the second run leaves at the bend angle: a 60 degree elbow ends at (20 + 20 cos 60, 20 sin 60) plus the pipe's radius", () => {
    const r = rebuild(withParameter(buildRecipe("pipe_bend", PIPE).history, "bend", 60))
    expect(r.issues).toEqual([])
    const b = r.bodies[0]!.mesh.positions
    let maxX = -Infinity, maxY = -Infinity
    for (let i = 0; i < b.length; i += 3) { maxX = Math.max(maxX, b[i]!); maxY = Math.max(maxY, b[i + 1]!) }
    expect(maxX).toBeGreaterThan(20 + 20 * Math.cos(Math.PI / 3))
    expect(maxX).toBeLessThan(20 + 20 * Math.cos(Math.PI / 3) + 5 + 0.5)
    expect(maxY).toBeGreaterThan(20 * Math.sin(Math.PI / 3))
    expect(maxY).toBeLessThan(20 * Math.sin(Math.PI / 3) + 5 + 0.5)
  }, SLOW)
})
