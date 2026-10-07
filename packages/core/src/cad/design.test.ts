import { describe, expect, test } from "bun:test"
import { elementBounds } from "../cam/generator/elements.ts"
import { DESIGN_SPACE, checkModel } from "./design.ts"

const boundsOf = (e: Record<string, unknown>) => {
  try { const b = elementBounds(e as never); return Number.isFinite(b.min.x) ? { min: b.min, max: b.max } : undefined } catch { return undefined }
}
const codes = (elements: Array<Record<string, unknown>>, options = {}) => checkModel(elements, { boundsOf, ...options }).map((i) => i.code)
const cube = (id: string, x: number, y: number, z: number, size = 10) => ({ id, type: "cube", x, y, z, width: size, height: size, depth: size })

describe("design space", () => {
  test("states the conventions the editor really uses", () => {
    expect(DESIGN_SPACE.handedness).toBe("right-handed")
    expect(DESIGN_SPACE.angles.rotation).toContain("DEGREES")
    expect(DESIGN_SPACE.angles.arcs).toContain("RADIANS")
    expect(DESIGN_SPACE.solidAxes.cylinder).toContain("along Z")
    expect(DESIGN_SPACE.solidAxes.cube).toContain("width is the X extent")
  })
})

describe("checkModel", () => {
  test("a sound model has no findings", () => {
    expect(codes([cube("a", 0, 0, 5), cube("b", 10, 0, 5)])).toEqual([])
  })

  test("sizes must be positive, finite and plausible", () => {
    expect(codes([{ id: "a", type: "cylinder", x: 0, y: 0, z: 0, radius: -2, height: 10 }])).toContain("NON_POSITIVE_SIZE")
    expect(codes([{ id: "a", type: "sphere", x: NaN, y: 0, z: 0, radius: 5 }])).toContain("NON_FINITE")
    expect(codes([{ id: "a", type: "cube", x: 0, y: 0, z: 0, width: 50_000, height: 5, depth: 5 }])).toContain("SUSPECT_SCALE")
  })

  test("a feature smaller than the drawing tolerance cannot exist", () => {
    expect(codes([{ id: "a", type: "cube", x: 0, y: 0, z: 0, width: 0.005, height: 5, depth: 5 }], { tolerance: 0.01 })).toContain("BELOW_TOLERANCE")
    expect(codes([cube("a", 0, 0, 0, 0.05)], { tolerance: 0.01 })).not.toContain("BELOW_TOLERANCE")
  })

  test("rotation is degrees: radian look-alikes are caught", () => {
    const rot = (x: number) => [{ ...cube("a", 0, 0, 0), rotation: { x, y: 0, z: 0 } }]
    expect(codes(rot(1.5708))).toContain("ROTATION_IN_RADIANS")
    expect(codes(rot(3.1416))).toContain("ROTATION_IN_RADIANS")
    expect(codes(rot(90))).not.toContain("ROTATION_IN_RADIANS")
    expect(codes(rot(0))).not.toContain("ROTATION_IN_RADIANS")
    expect(codes([{ ...cube("a", 0, 0, 0), rotation: "90" }])).toContain("BAD_ROTATION")
    expect(checkModel(rot(1.5708) as never).find((i) => i.code === "ROTATION_IN_RADIANS")?.message).toContain("Did you mean 90")
  })

  test("booleans need two operands that exist", () => {
    expect(codes([cube("a", 0, 0, 0), { id: "b", type: "boolean-subtract", operands: ["a"] }])).toContain("BOOLEAN_OPERANDS")
    expect(codes([cube("a", 0, 0, 0), { id: "b", type: "boolean-subtract", operands: ["a", "ghost"] }])).toContain("BOOLEAN_OPERANDS")
    expect(codes([cube("a", 0, 0, 0), cube("c", 5, 0, 0), { id: "b", type: "boolean-subtract", operands: ["a", "c"] }])).not.toContain("BOOLEAN_OPERANDS")
  })

  test("a revolution profile must stay on one side of its axis", () => {
    expect(codes([{ id: "r", type: "revolution", profile: [{ x: -3, y: 0 }, { x: 5, y: 10 }] }])).toContain("REVOLUTION_NEGATIVE_RADIUS")
  })

  test("duplicates and floating parts are found", () => {
    expect(codes([cube("a", 0, 0, 0), cube("b", 0, 0, 0)])).toContain("DUPLICATE")
    const floating = checkModel([cube("a", 0, 0, 0), cube("b", 5, 0, 0), cube("far", 500, 500, 500)], { boundsOf })
    expect(floating.filter((i) => i.code === "FLOATING").map((i) => i.elementId)).toEqual(["far"])
    expect(codes([cube("only", 0, 0, 0)])).not.toContain("FLOATING")
  })

  test("parts outside the stock or the plate are reported", () => {
    const stock = { minX: -20, maxX: 20, minY: -20, maxY: 20 }
    const issues = checkModel([cube("in", 0, 0, 0), cube("out", 40, 0, 0)], { stock, boundsOf })
    expect(issues.filter((i) => i.code === "OUTSIDE_STOCK").map((i) => i.elementId)).toEqual(["out"])
  })

  test("a coarse mesh is pointed out with the segments that would do", () => {
    const issue = checkModel([{ id: "c", type: "cylinder", x: 0, y: 0, z: 0, radius: 50, height: 10, segments: 32 }], { tolerance: 0.001, boundsOf }).find((i) => i.code === "COARSE_MESH")
    expect(issue?.message).toContain("497 would meet")
    expect(codes([{ id: "c", type: "cylinder", x: 0, y: 0, z: 0, radius: 50, height: 10, segments: 32, tolerance: 0.001 }], { tolerance: 0.001 })).not.toContain("COARSE_MESH")
  })
})
