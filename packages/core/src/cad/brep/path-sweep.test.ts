import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { booleanBrep, circleProfileLoop, frame, makeBox, massProperties, rectangleProfileLoop, sewSolids, sweepPath, validateBrep, type Brep, type PathPiece } from "./index.ts"

setDefaultTimeout(60_000)

const PI = Math.PI
const v = (x: number, y: number, z: number) => ({ x, y, z })
const start = { x: v(1, 0, 0), y: v(0, 1, 0) }
const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b)
const solid = (b: Brep): number => {
  const rep = validateBrep(b)
  expect(rep.issues.map((i) => i.message)).toEqual([])
  expect(rep.manifoldSolid).toBe(true)
  return massProperties(b).volume
}

const elbow: PathPiece[] = [{ kind: "line", a: v(0, 0, 0), b: v(0, 0, 20) }, { kind: "line", a: v(0, 0, 20), b: v(20, 0, 20) }]
const bent: PathPiece[] = [
  { kind: "line", a: v(0, 0, 0), b: v(0, 0, 20) },
  { kind: "arc", center: v(10, 0, 20), axis: v(0, 1, 0), from: v(0, 0, 20), angle: PI / 2 },
  { kind: "line", a: v(10, 0, 30), b: v(30, 0, 30) }
]

describe("exact sweep along a path of lines and arcs", () => {
  test("a mitred elbow keeps the section area times the centre-line length (round and rectangular sections)", () => {
    expect(rel(solid(sweepPath({ loops: [circleProfileLoop({ x: 0, y: 0 }, 2)] }, start, elbow)), PI * 4 * 40)).toBeLessThan(1e-12)
    expect(rel(solid(sweepPath({ loops: [rectangleProfileLoop(-2, -1, 2, 1)] }, start, elbow)), 8 * 40)).toBeLessThan(1e-12)
  })

  test("a bend is a revolution of the section (a torus for a round pipe), a tube keeps its bore", () => {
    const pipe = sweepPath({ loops: [circleProfileLoop({ x: 0, y: 0 }, 2)] }, start, bent)
    expect(rel(solid(pipe), PI * 4 * (40 + 5 * PI))).toBeLessThan(1e-12)
    expect(pipe.faces.filter((f) => f.surface.kind === "torus").length).toBe(1)
    const tube = sweepPath({ loops: [circleProfileLoop({ x: 0, y: 0 }, 2), circleProfileLoop({ x: 0, y: 0 }, 1.5)] }, start, bent)
    expect(rel(solid(tube), PI * (4 - 2.25) * (40 + 5 * PI))).toBeLessThan(1e-12)
  })

  test("closed paths: a square frame mitred at every corner, and a ring (a torus)", () => {
    const square: PathPiece[] = [
      { kind: "line", a: v(0, 0, 0), b: v(40, 0, 0) }, { kind: "line", a: v(40, 0, 0), b: v(40, 40, 0) },
      { kind: "line", a: v(40, 40, 0), b: v(0, 40, 0) }, { kind: "line", a: v(0, 40, 0), b: v(0, 0, 0) }
    ]
    // A 4 x 2 section lying flat: the frame is the 44 x 44 square less the 36 x 36 one, 2 high.
    expect(rel(solid(sweepPath({ loops: [rectangleProfileLoop(-2, -1, 2, 1)] }, { x: v(0, 1, 0), y: v(0, 0, 1) }, square, { closed: true })), (44 * 44 - 36 * 36) * 2)).toBeLessThan(1e-12)
    const ring: PathPiece[] = [{ kind: "arc", center: v(0, 0, 0), axis: v(0, 0, 1), from: v(10, 0, 0), angle: 2 * PI }]
    expect(rel(solid(sweepPath({ loops: [circleProfileLoop({ x: 0, y: 0 }, 2)] }, { x: v(1, 0, 0), y: v(0, 0, 1) }, ring, { closed: true })), 2 * PI * PI * 10 * 4)).toBeLessThan(1e-12)
  })

  test("a bend tighter than the section, or a path that turns back, is refused", () => {
    const tight: PathPiece[] = [{ kind: "arc", center: v(1, 0, 0), axis: v(0, 1, 0), from: v(0, 0, 0), angle: PI / 2 }]
    expect(() => sweepPath({ loops: [circleProfileLoop({ x: 0, y: 0 }, 2)] }, start, tight)).toThrow(RangeError)
    const back: PathPiece[] = [{ kind: "line", a: v(0, 0, 0), b: v(0, 0, 10) }, { kind: "line", a: v(0, 0, 10), b: v(0, 0, 5) }]
    expect(() => sweepPath({ loops: [circleProfileLoop({ x: 0, y: 0 }, 2)] }, start, back)).toThrow(RangeError)
  })
})

describe("sewing solids that share a face", () => {
  test("two boxes face to face sew into the union the Boolean gives; boxes that only overlap a face's part are left to it", () => {
    const a = makeBox(10, 10, 10), b = makeBox(10, 10, 10, frame(v(0, 0, 10)))
    const sewn = sewSolids(a, b)
    expect(sewn).toBeDefined()
    expect(rel(solid(sewn!), 2000)).toBeLessThan(1e-12)
    expect(rel(massProperties(booleanBrep(a, b, "union").brep).volume, 2000)).toBeLessThan(1e-12)
    expect(sewSolids(a, makeBox(10, 10, 10, frame(v(5, 0, 10))))).toBeUndefined()
  })
})
