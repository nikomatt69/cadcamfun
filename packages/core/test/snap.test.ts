import { describe, expect, test } from "bun:test"
import { type Entity, baseEntity } from "../src/cad/entities.ts"
import { DEFAULT_SNAP_SETTINGS, type SnapSettings, type SnapType, findSnap } from "../src/cad/snap.ts"
import type { Vec2 } from "../src/cad/vec.ts"

const e = (extra: Record<string, unknown>): Entity => ({ ...baseEntity("x"), ...extra }) as Entity
const only = (type: SnapType, extra: Partial<SnapSettings> = {}): SnapSettings => ({ ...DEFAULT_SNAP_SETTINGS, types: [type], tolerance: 1, ...extra })
const near = (p: Vec2 | undefined, x: number, y: number): void => {
  expect(p).toBeDefined()
  expect(p!.x).toBeCloseTo(x, 6)
  expect(p!.y).toBeCloseTo(y, 6)
}

const quarter = e({ _tag: "Arc", id: "arc", center: { x: 0, y: 0 }, radius: 10, startAngle: 0, endAngle: Math.PI / 2, clockwise: false })
const circle = e({ _tag: "Circle", id: "circle", center: { x: 0, y: 0 }, radius: 10 })
const rect = e({ _tag: "Rectangle", id: "rect", corner1: { x: 0, y: 0 }, corner2: { x: 10, y: 6 } })
const line = e({ _tag: "Line", id: "line", start: { x: 0, y: 0 }, end: { x: 10, y: 0 } })

describe("findSnap types", () => {
  test("arc endpoints, midpoint and quadrants inside the sweep only", () => {
    near(findSnap([quarter], { x: 9.9, y: 0.2 }, only("endpoint"))?.point, 10, 0)
    near(findSnap([quarter], { x: 0.1, y: 9.9 }, only("endpoint"))?.point, 0, 10)
    near(findSnap([quarter], { x: 7, y: 7.3 }, only("midpoint"))?.point, 10 * Math.SQRT1_2, 10 * Math.SQRT1_2)
    near(findSnap([quarter], { x: 9.9, y: 0.1 }, only("quadrant"))?.point, 10, 0)
    // The 180 degree quadrant is outside a quarter arc.
    expect(findSnap([quarter], { x: -9.9, y: 0.1 }, only("quadrant"))).toBeUndefined()
  })

  test("circles offer quadrants and a centre, not endpoints or midpoints", () => {
    near(findSnap([circle], { x: 0.1, y: -9.9 }, only("quadrant"))?.point, 0, -10)
    near(findSnap([circle], { x: 0.3, y: 0.1 }, only("center"))?.point, 0, 0)
    expect(findSnap([circle], { x: 10, y: 0 }, only("endpoint"))).toBeUndefined()
    expect(findSnap([circle], { x: 10, y: 0 }, only("midpoint"))).toBeUndefined()
  })

  test("rectangles offer their corners, edge midpoints and centre", () => {
    near(findSnap([rect], { x: 10.2, y: 6.1 }, only("endpoint"))?.point, 10, 6)
    near(findSnap([rect], { x: 5.2, y: 0.1 }, only("midpoint"))?.point, 5, 0)
    near(findSnap([rect], { x: 5.2, y: 3.1 }, only("center"))?.point, 5, 3)
  })

  test("perpendicular needs the reference point and lands on the segment", () => {
    const settings = only("perpendicular", { referencePoint: { x: 4, y: 7 }, tolerance: 1 })
    near(findSnap([line], { x: 4.2, y: 0.3 }, settings)?.point, 4, 0)
    expect(findSnap([line], { x: 4.2, y: 0.3 }, only("perpendicular"))).toBeUndefined()
    // A reference point beyond the segment end has no foot on it.
    expect(findSnap([line], { x: 10, y: 0 }, only("perpendicular", { referencePoint: { x: 20, y: 5 } }))).toBeUndefined()
  })

  test("perpendicular to a circle runs through the centre", () => {
    const s = findSnap([circle], { x: 7, y: 7.2 }, only("perpendicular", { referencePoint: { x: 20, y: 20 } }))
    near(s?.point, 10 * Math.SQRT1_2, 10 * Math.SQRT1_2)
  })

  test("tangent points from an outside reference point touch the circle at a right angle", () => {
    const ref = { x: 20, y: 0 }
    const s = findSnap([circle], { x: 5, y: 8.7 }, only("tangent", { referencePoint: ref, tolerance: 2 }))
    expect(s?.type).toBe("tangent")
    const p = s!.point
    expect(Math.hypot(p.x, p.y)).toBeCloseTo(10, 9)
    // Radius to the tangent point is perpendicular to the line from the reference point.
    expect((p.x - 0) * (p.x - ref.x) + (p.y - 0) * (p.y - ref.y)).toBeCloseTo(0, 6)
    expect(findSnap([circle], { x: 0, y: 0 }, only("tangent", { referencePoint: { x: 1, y: 1 } }))).toBeUndefined()
  })

  test("nearest works on lines, circles, arcs and rectangles", () => {
    near(findSnap([line], { x: 3, y: 0.4 }, only("nearest"))?.point, 3, 0)
    near(findSnap([circle], { x: 10.4, y: 0 }, only("nearest"))?.point, 10, 0)
    near(findSnap([quarter], { x: 7.5, y: 7.5 }, only("nearest"))?.point, 10 * Math.SQRT1_2, 10 * Math.SQRT1_2)
    near(findSnap([rect], { x: 3, y: 6.4 }, only("nearest"))?.point, 3, 6)
  })

  test("a bulged polyline segment offers its arc midpoint", () => {
    const p = e({ _tag: "Polyline", id: "p", points: [{ x: 0, y: 0 }, { x: 10, y: 0 }], closed: false, bulge: [1, 0] })
    near(findSnap([p], { x: 5.1, y: -4.8 }, only("midpoint"))?.point, 5, -5)
  })
})

describe("findSnap behaviour", () => {
  test("locked entities snap, invisible ones do not", () => {
    expect(findSnap([{ ...line, locked: true }], { x: 0.1, y: 0.1 }, only("endpoint"))?.point).toEqual({ x: 0, y: 0 })
    expect(findSnap([{ ...line, visible: false }], { x: 0.1, y: 0.1 }, only("endpoint"))).toBeUndefined()
  })

  test("types outside settings.types never win; the listed order is the priority", () => {
    const entities = [line]
    const settings: SnapSettings = { ...DEFAULT_SNAP_SETTINGS, types: ["midpoint", "endpoint"], tolerance: 6 }
    expect(findSnap(entities, { x: 2, y: 0 }, settings)?.type).toBe("midpoint")
    expect(findSnap(entities, { x: 2, y: 0 }, { ...settings, types: ["endpoint", "midpoint"] })?.type).toBe("endpoint")
    expect(findSnap(entities, { x: 2, y: 0 }, { ...settings, types: ["center"] })).toBeUndefined()
  })

  test("intersections of an arc and a line are found only on the arc", () => {
    const s = findSnap([quarter, e({ _tag: "Line", id: "l2", start: { x: -20, y: 5 }, end: { x: 20, y: 5 } })], { x: 8.7, y: 5.1 }, only("intersection"))
    near(s?.point, Math.sqrt(75), 5)
    expect(findSnap([quarter, e({ _tag: "Line", id: "l3", start: { x: -20, y: -5 }, end: { x: 20, y: -5 } })], { x: 8.7, y: -5 }, only("intersection"))).toBeUndefined()
  })

  test("the closest candidate of the winning type is chosen", () => {
    const l2 = e({ _tag: "Line", id: "l2", start: { x: 1, y: 0 }, end: { x: 11, y: 0 } })
    const s = findSnap([line, l2], { x: 0.9, y: 0 }, only("endpoint", { tolerance: 3 }))
    expect(s?.point).toEqual({ x: 1, y: 0 })
    expect(s?.entityId).toBe("l2")
  })
})
