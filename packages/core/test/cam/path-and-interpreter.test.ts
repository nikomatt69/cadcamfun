import { describe, expect, test } from "bun:test"
import * as core from "../../src/index.ts"
import type { Vec2 } from "../../src/cad/vec.ts"
import {
  circlePath,
  pathFromPoints,
  pathLength,
  pathPolyline,
  pointOnSeg,
  reversePath,
  rotateClosedPath,
  segStarts,
  startTangent
} from "../../src/cam/path.ts"
import { interpretGcode } from "../../src/cam/testing/gcode-interpreter.ts"

const square: Vec2[] = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]

describe("path utilities", () => {
  test("a closed path ends at its start and has the ring length", () => {
    const p = pathFromPoints(square, true)
    expect(p.segs.at(-1)!.to).toEqual(p.start)
    expect(pathLength(p)).toBeCloseTo(40, 12)
  })

  test("reversing keeps the length, flips arcs and ends where the original started", () => {
    const open = pathFromPoints(square, false)
    const rev = reversePath(open)
    expect(rev.start).toEqual({ x: 0, y: 10 })
    expect(rev.segs.at(-1)!.to).toEqual({ x: 0, y: 0 })
    expect(pathLength(rev)).toBeCloseTo(30, 12)
    const c = circlePath({ x: 0, y: 0 }, 5, false)
    const r = reversePath(c)
    expect(r.segs[0]).toMatchObject({ kind: "Arc", clockwise: true })
    expect(pathLength(r)).toBeCloseTo(2 * Math.PI * 5, 9)
  })

  test("rotating a closed path starts it mid-segment without changing its length", () => {
    const p = pathFromPoints(square, true)
    const r = rotateClosedPath(p, 1, 4)
    expect(r.start).toEqual({ x: 10, y: 4 })
    expect(pathLength(r)).toBeCloseTo(40, 12)
    expect(r.segs.at(-1)!.to).toEqual(r.start)
    const starts = segStarts(r)
    expect(starts[0]).toEqual(r.start)
  })

  test("rotating at a segment end starts at the next corner", () => {
    const r = rotateClosedPath(pathFromPoints(square, true), 0, 10)
    expect(r.start).toEqual({ x: 10, y: 0 })
    expect(pathLength(r)).toBeCloseTo(40, 12)
  })

  test("points on arcs follow the sweep direction", () => {
    const c = circlePath({ x: 0, y: 0 }, 2, false)
    const q = pointOnSeg(c.start, c.segs[0]!, (2 * Math.PI * 2) / 4)
    expect(q.x).toBeCloseTo(0, 9)
    expect(q.y).toBeCloseTo(2, 9)
    expect(startTangent(c)).toEqual({ x: -0, y: 1 })
    expect(pathPolyline(c, 0.01).length).toBeGreaterThan(8)
  })
})

describe("reference interpreter", () => {
  test("strips comments, line numbers and program markers, converts inches", () => {
    const r = interpretGcode("%\nO1000 (PROG)\nN10 G20 G90 (units)\nG0 X1 Y1 Z1 ; rapid\nN20 G1 X2 F10\nM30\n%\n")
    expect(r.errors).toEqual([])
    expect(r.end).toEqual({ x: 50.8, y: 25.4, z: 25.4 })
    expect(r.ended).toBe(true)
    expect(r.cutLength).toBeCloseTo(25.4, 9)
  })

  test("arcs by I/J and by R agree, full circles are 2 pi r", () => {
    const ij = interpretGcode("G0 X5 Y0\nG3 X0 Y5 I-5 J0 F100")
    const rr = interpretGcode("G0 X5 Y0\nG3 X0 Y5 R5 F100")
    expect(ij.cutLength).toBeCloseTo(rr.cutLength, 9)
    expect(ij.cutLength).toBeCloseTo((Math.PI * 5) / 2, 9)
    expect(interpretGcode("G0 X5 Y0\nG2 X5 Y0 I-5 J0 F100").cutLength).toBeCloseTo(2 * Math.PI * 5, 9)
  })

  test("canned cycles replay as peck strokes and honour G98/G99 and G80", () => {
    const r = interpretGcode("G0 X0 Y0 Z10\nG83 G99 X0 Y0 Z-8 R2 Q4 F100\nG80\nG0 Z10")
    expect(r.errors).toEqual([])
    expect(r.minZ).toBe(-8)
    // R = 2: 4 mm to z = -2, then 4.5 mm from -1.5 to -6, then 2.5 mm from -5.5 to -8.
    expect(r.cutLength).toBeCloseTo(4 + 4.5 + 2.5, 9)
  })

  test("dwell units", () => {
    const s = interpretGcode("G4 P500", { dwell: "milliseconds" }).segments[0]
    expect(s).toMatchObject({ kind: "dwell", seconds: 0.5 })
  })

  test("unsupported motion words are reported instead of ignored", () => {
    expect(interpretGcode("G18\nG1 X1 F10").errors.length).toBe(1)
    expect(interpretGcode("G18").errors.length).toBe(1)
  })
})

describe("package barrel", () => {
  test("cad is exported flat and as a namespace; cam only as a namespace", () => {
    expect(typeof core.boundingBox).toBe("function")
    expect(typeof core.cad.tessellate).toBe("function")
    expect(typeof core.cam.generateProfile).toBe("function")
    expect(typeof core.cam.posts.generic?.emit).toBe("function")
    expect((core as Record<string, unknown>)["generateProfile"]).toBeUndefined()
  })
})
