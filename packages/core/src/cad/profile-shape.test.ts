import { describe, expect, test } from "bun:test"
import { edgeLevels, edgedHoleTool, edgedPrism, loftRings, moveRing, treatCorners } from "./profile-shape.ts"
import { meshBounds, meshVolume } from "./solid.ts"
import type { Vec2 } from "./vec.ts"

const area = (ring: ReadonlyArray<Vec2>): number => {
  let a = 0
  for (let i = 0; i < ring.length; i++) { const p = ring[i]!, q = ring[(i + 1) % ring.length]!; a += p.x * q.y - q.x * p.y }
  return a / 2
}
const square = (a: number, x0 = 0, y0 = 0): Vec2[] => [{ x: x0, y: y0 }, { x: x0 + a, y: y0 }, { x: x0 + a, y: y0 + a }, { x: x0, y: y0 + a }]
const circle = (r: number, n: number): Vec2[] => Array.from({ length: n }, (_, k) => ({ x: r * Math.cos((2 * Math.PI * k) / n), y: r * Math.sin((2 * Math.PI * k) / n) }))

describe("treatCorners", () => {
  test("a corner fillet of radius r takes (4 - pi) r^2 off a square (chord tolerance 0.01 mm)", () => {
    const rounded = treatCorners(square(20), "fillet", 3)
    expect(rounded.length).toBeGreaterThan(4 * 5)
    // The arcs are inscribed polygons: each loses about 2/3 x sagitta (0.01) x arc length, 2 pi r in all = 0.126 mm^2 here.
    const exact = 400 - (4 - Math.PI) * 9
    expect(area(rounded)).toBeLessThan(exact + 1e-9)
    expect(exact - area(rounded)).toBeLessThan((2 / 3) * 0.01 * 2 * Math.PI * 3 * 1.2)
    // every new vertex lies on a circle of radius 3 about one of the four centres
    const centres = [{ x: 3, y: 3 }, { x: 17, y: 3 }, { x: 17, y: 17 }, { x: 3, y: 17 }]
    for (const p of rounded) {
      const nearest = Math.min(...centres.map((c) => Math.abs(Math.hypot(p.x - c.x, p.y - c.y) - 3)))
      const onSide = p.x < 1e-9 || p.y < 1e-9 || p.x > 20 - 1e-9 || p.y > 20 - 1e-9
      expect(nearest < 1e-6 || onSide).toBe(true)
    }
  })

  test("a corner chamfer of c cuts off four triangles of c^2 / 2: exactly 400 - 2 c^2", () => {
    const cut = treatCorners(square(20), "chamfer", 3)
    expect(cut).toHaveLength(8)
    expect(area(cut)).toBeCloseTo(400 - 2 * 9, 9)
  })

  test("the tangent points sit one setback along each edge (fillet r on a 90 degree corner: r)", () => {
    const rounded = treatCorners(square(20), "fillet", 5)
    const near = (x: number, y: number) => rounded.some((p) => Math.abs(p.x - x) < 1e-9 && Math.abs(p.y - y) < 1e-9)
    expect(near(5, 0)).toBe(true)
    expect(near(0, 5)).toBe(true)
    expect(near(15, 0)).toBe(true)
    expect(near(20, 15)).toBe(true)
  })

  test("a curve (a tessellated circle turns 5 degrees per vertex) is left alone", () => {
    const c = circle(10, 72)
    expect(treatCorners(c, "fillet", 2)).toEqual(c)
    expect(treatCorners(c, "chamfer", 2)).toEqual(c)
  })

  test("a corner treatment works on a clockwise ring too", () => {
    const rounded = treatCorners(square(20).reverse(), "chamfer", 2)
    expect(Math.abs(area(rounded))).toBeCloseTo(400 - 2 * 4, 9)
  })

  test("an edge that has to give more than it has is refused, and one that gives exactly its length is allowed", () => {
    expect(() => treatCorners(square(5), "fillet", 3)).toThrow(/does not fit/)
    expect(() => treatCorners(square(5), "chamfer", 3)).toThrow(RangeError)
    expect(() => treatCorners(square(6), "fillet", 3)).not.toThrow()
  })

  test("corners that take a whole edge leave no duplicate vertices: a slot end (R = b / 2 on a b-wide rectangle) stays a simple ring", () => {
    const slot: Vec2[] = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 8 }, { x: 0, y: 8 }]
    const rounded = treatCorners(slot, "fillet", 4)
    rounded.forEach((p, i) => {
      const q = rounded[(i + 1) % rounded.length]!
      expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeGreaterThan(1e-6) // BUG CHECK: coincident neighbours make the ring untriangulable
    })
    expect(area(rounded)).toBeCloseTo(40 * 8 - (4 - Math.PI) * 16, 0)
    expect(meshVolume(loftRings([rounded, rounded], [0, 2]))).toBeCloseTo(area(rounded) * 2, 3)
    const chamfered = treatCorners(slot, "chamfer", 4)
    chamfered.forEach((p, i) => {
      const q = chamfered[(i + 1) % chamfered.length]!
      expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeGreaterThan(1e-6)
    })
  })

  test("a non-positive size is refused", () => {
    expect(() => treatCorners(square(10), "fillet", 0)).toThrow(RangeError)
    expect(() => treatCorners(square(10), "chamfer", -1)).toThrow(RangeError)
  })

  test("a sharp 60 degree corner needs a longer setback than a 90 degree one (r / tan(30 degrees))", () => {
    const triangle: Vec2[] = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 20, y: 20 * Math.sqrt(3) }]
    const rounded = treatCorners(triangle, "fillet", 2)
    const setback = 2 / Math.tan(Math.PI / 6)
    expect(rounded.some((p) => Math.abs(p.x - setback) < 1e-9 && Math.abs(p.y) < 1e-9)).toBe(true)
  })
})

describe("moveRing", () => {
  test("moving a square inwards by d leaves (a - 2d)^2, outwards (a + 2d)^2", () => {
    expect(area(moveRing(square(20), 2))).toBeCloseTo(256, 9)
    expect(area(moveRing(square(20), -2))).toBeCloseTo(576, 9)
    expect(area(moveRing(square(20), 0))).toBeCloseTo(400, 9)
  })

  test("the vertex count and order are kept, and a clockwise ring is returned counter-clockwise", () => {
    const moved = moveRing(square(20).reverse(), 1)
    expect(moved).toHaveLength(4)
    expect(area(moved)).toBeGreaterThan(0)
    const xs = moved.map((p) => p.x), ys = moved.map((p) => p.y)
    expect(Math.min(...xs)).toBeCloseTo(1, 9)
    expect(Math.max(...ys)).toBeCloseTo(19, 9)
  })

  test("an inward move of a regular polygon shrinks the apothem by d", () => {
    const hex = circle(10, 6)
    const inset = moveRing(hex, 1)
    const apothem = (ring: Vec2[]) => { const a = ring[0]!, b = ring[1]!; return Math.abs(a.x * b.y - a.y * b.x) / Math.hypot(b.x - a.x, b.y - a.y) }
    expect(apothem(inset)).toBeCloseTo(apothem(hex) - 1, 9)
  })

  test("a ring that collapses to a point is refused", () => {
    expect(() => moveRing(square(20), 10)).toThrow(/too big/)
  })

  test("a ring moved past its own centre is refused (it would be turned inside out)", () => {
    // BUG CHECK: at 11 mm the four mitred vertices have passed through each other; the result is a 2 x 2 square with the same winding.
    expect(() => moveRing(square(20), 11)).toThrow(RangeError)
    expect(() => moveRing(square(20), 30)).toThrow(RangeError)
  })

  test("a ring that crosses itself when grown or shrunk is refused (a thin rectangle)", () => {
    const thin: Vec2[] = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 2 }, { x: 0, y: 2 }]
    expect(() => moveRing(thin, 1.5)).toThrow(RangeError)
    expect(area(moveRing(thin, 0.5))).toBeCloseTo(39 * 1, 9)
  })
})

describe("edgeLevels", () => {
  test("a chamfer on both ends is four levels from the bottom face to the top face", () => {
    expect(edgeLevels("chamfer", 2, "both", 0, 10)).toEqual([{ inset: 2, z: 0 }, { inset: 0, z: 2 }, { inset: 0, z: 8 }, { inset: 2, z: 10 }])
  })

  test("a chamfer on one end is three levels, the plain profile at the other face", () => {
    expect(edgeLevels("chamfer", 2, "top", 0, 10)).toEqual([{ inset: 0, z: 0 }, { inset: 0, z: 8 }, { inset: 2, z: 10 }])
    expect(edgeLevels("chamfer", 2, "bottom", 0, 10)).toEqual([{ inset: 2, z: 0 }, { inset: 0, z: 2 }, { inset: 0, z: 10 }])
  })

  test("a fillet is a quarter circle of radius r ending tangent to the wall and to the face", () => {
    const levels = edgeLevels("fillet", 3, "top", 0, 20)
    const arc = levels.slice(1)
    expect(arc.length).toBeGreaterThanOrEqual(5)
    expect(arc[0]).toEqual({ inset: 0, z: 17 })
    expect(arc[arc.length - 1]!.inset).toBeCloseTo(3, 9)
    expect(arc[arc.length - 1]!.z).toBeCloseTo(20, 9)
    for (const l of arc) expect(Math.hypot(l.inset - 3, l.z - 17)).toBeCloseTo(3, 9) // on the circle about (inset 3, z 17)
    levels.forEach((l, i) => { if (i > 0) { expect(l.z).toBeGreaterThanOrEqual(levels[i - 1]!.z); expect(l.inset).toBeGreaterThanOrEqual(levels[i - 1]!.inset) } })
  })

  test("both ends of a fillet are symmetric about the middle of the extrusion", () => {
    const levels = edgeLevels("fillet", 2, "both", 0, 10)
    expect(levels).toHaveLength(2 * (levels.length / 2))
    levels.forEach((l, i) => {
      const mirror = levels[levels.length - 1 - i]!
      expect(mirror.inset).toBeCloseTo(l.inset, 9)
      expect(mirror.z).toBeCloseTo(10 - l.z, 9)
    })
  })

  test("the size has to leave material: size x ends must be below the depth", () => {
    expect(() => edgeLevels("chamfer", 5, "both", 0, 10)).toThrow(/smaller than the depth/)
    expect(() => edgeLevels("fillet", 6, "both", 0, 10)).toThrow(RangeError)
    expect(() => edgeLevels("chamfer", 10, "top", 0, 10)).toThrow(RangeError)
    expect(() => edgeLevels("chamfer", 4.99, "both", 0, 10)).not.toThrow()
    expect(() => edgeLevels("chamfer", 0, "both", 0, 10)).toThrow(RangeError)
  })

  test("the extrusion can start anywhere along the normal", () => {
    const levels = edgeLevels("chamfer", 1, "both", -5, 5)
    expect(levels[0]).toEqual({ inset: 1, z: -5 })
    expect(levels[levels.length - 1]).toEqual({ inset: 1, z: 5 })
  })
})

describe("loftRings", () => {
  test("a stack of equal squares is the prism: volume a^2 h, outward faces (positive volume), exact bounds", () => {
    const mesh = loftRings([square(20), square(20), square(20)], [0, 2, 5])
    expect(meshVolume(mesh)).toBeCloseTo(2000, 6)
    const b = meshBounds(mesh)
    expect([b.minX, b.maxX, b.minY, b.maxY, b.minZ, b.maxZ]).toEqual([0, 20, 0, 20, 0, 5])
  })

  test("a loft between a large and a small square is the frustum: h/3 (A + sqrt(AB) + B)", () => {
    const mesh = loftRings([square(20), square(10, 5, 5)], [0, 6])
    expect(meshVolume(mesh)).toBeCloseTo((6 / 3) * (400 + 200 + 100), 6)
  })

  test("a concave ring (L shape) is capped correctly", () => {
    const l: Vec2[] = [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 30 }, { x: 0, y: 30 }]
    expect(meshVolume(loftRings([l, l], [0, 4]))).toBeCloseTo(500 * 4, 6)
  })

  test("a closed mesh: every edge is shared by exactly two triangles, once in each direction", () => {
    const mesh = loftRings([square(20), square(16, 2, 2), square(16, 2, 2), square(20)], [0, 2, 8, 10])
    const directed = new Map<string, number>()
    for (let t = 0; t < mesh.indices.length; t += 3) {
      for (let k = 0; k < 3; k++) {
        const a = mesh.indices[t + k]!, b = mesh.indices[t + ((k + 1) % 3)]!
        directed.set(`${a}>${b}`, (directed.get(`${a}>${b}`) ?? 0) + 1)
      }
    }
    for (const [edge, count] of directed) {
      expect(count).toBe(1)
      const [from, to] = edge.split(">")
      expect(directed.get(`${to}>${from}`)).toBe(1) // the neighbour across the edge runs the other way: the surface is closed and consistently wound
    }
    expect(meshVolume(mesh)).toBeGreaterThan(0)
  })
})

describe("edgedPrism", () => {
  const a = 20, h = 10

  test("a mitred chamfer c on both ends removes 2 x (2 a c^2 - 4 c^3 / 3) from a square prism (exact frustum integral)", () => {
    const c = 2
    const removed = 2 * (2 * a * c * c - (4 * c ** 3) / 3)
    const mesh = edgedPrism(square(a), 0, h, { style: "chamfer", size: c, ends: "both" })
    expect(meshVolume(mesh)).toBeCloseTo(a * a * h - removed, 6) // piecewise linear in z, so the loft is exact
    const b = meshBounds(mesh)
    expect([b.minX, b.maxX, b.minY, b.maxY, b.minZ, b.maxZ]).toEqual([0, 20, 0, 20, 0, 10])
  })

  test("a chamfer at the top only removes one end's wedge", () => {
    const c = 3
    const removed = 2 * a * c * c - (4 * c ** 3) / 3
    expect(meshVolume(edgedPrism(square(a), 0, h, { style: "chamfer", size: c, ends: "top" }))).toBeCloseTo(a * a * h - removed, 6)
    expect(meshVolume(edgedPrism(square(a), 0, h, { style: "chamfer", size: c, ends: "bottom" }))).toBeCloseTo(a * a * h - removed, 6)
  })

  test("a fillet of radius r removes per end 4 a r^2 (1 - pi/4) - 4 r^3 (5/3 - pi/2) (integral of the inset square over the quarter circle)", () => {
    const r = 2
    const perEnd = 4 * a * r * r * (1 - Math.PI / 4) - 4 * r ** 3 * (5 / 3 - Math.PI / 2)
    const expected = a * a * h - 2 * perEnd
    const got = meshVolume(edgedPrism(square(a), 0, h, { style: "fillet", size: r, ends: "both" }))
    // The loft is a polyline through points of the quarter circle (chords lie inside the material), so it removes a little more than
    // the true fillet: the error is the chord sagitta (<= 0.01 mm) over the fillet surface, well below 0.2 % of the part.
    expect(Math.abs(got - expected) / expected).toBeLessThan(0.002)
    expect(got).toBeLessThan(expected + 1e-9)
    expect(Math.abs((a * a * h - got) - 2 * perEnd) / (2 * perEnd)).toBeLessThan(0.03)
  })

  test("a fillet removes less than the chamfer of the same size (a quarter circle is outside the 45 degree line)", () => {
    const fillet = meshVolume(edgedPrism(square(a), 0, h, { style: "fillet", size: 3, ends: "both" }))
    const chamfer = meshVolume(edgedPrism(square(a), 0, h, { style: "chamfer", size: 3, ends: "both" }))
    expect(fillet).toBeGreaterThan(chamfer)
  })

  test("a circular profile with a chamfer is two frustums and a cylinder", () => {
    const r = 10, c = 1.5, height = 12, n = 180
    const ring = circle(r, n)
    const polyArea = (rad: number) => (n / 2) * rad * rad * Math.sin((2 * Math.PI) / n)
    // inset by c on a regular polygon shrinks its apothem by c, which scales its radius by (apothem - c) / apothem
    const apothem = r * Math.cos(Math.PI / n)
    const rin = r * (apothem - c) / apothem
    const frustum = (c / 3) * (polyArea(r) + Math.sqrt(polyArea(r) * polyArea(rin)) + polyArea(rin))
    const expected = 2 * frustum + polyArea(r) * (height - 2 * c)
    expect(meshVolume(edgedPrism(ring, 0, height, { style: "chamfer", size: c, ends: "both" }))).toBeCloseTo(expected, 4)
  })

  test("a chamfer wider than the depth is refused with the reason", () => {
    expect(() => edgedPrism(square(a), 0, h, { style: "chamfer", size: 6, ends: "both" })).toThrow(/smaller than the depth/)
  })

  test("a chamfer wider than the profile allows is refused (the boundary would collapse)", () => {
    expect(() => edgedPrism(square(4), 0, 20, { style: "chamfer", size: 2, ends: "both" })).toThrow(RangeError)
  })
})

describe("edgedHoleTool", () => {
  test("flares the hole at both faces: more volume than the plain cylinder, carried 1 mm past each face", () => {
    const hole = circle(3, 90)
    const tool = edgedHoleTool(hole, 0, 10, { style: "chamfer", size: 1, ends: "both" })
    const b = meshBounds(tool)
    expect(b.minZ).toBeCloseTo(-1, 9)
    expect(b.maxZ).toBeCloseTo(11, 9)
    const polygonArea = 45 * 9 * Math.sin((2 * Math.PI) / 90)
    expect(meshVolume(tool)).toBeGreaterThan(polygonArea * 12) // more than the straight cylinder it flares from
  })

  test("the flared radius at the face is the hole radius plus the chamfer", () => {
    const hole = circle(3, 90)
    const tool = edgedHoleTool(hole, 0, 10, { style: "chamfer", size: 1, ends: "top" })
    let widest = 0
    for (let i = 0; i < tool.positions.length; i += 3) if (Math.abs(tool.positions[i + 2]! - 10) < 1e-4) widest = Math.max(widest, Math.hypot(tool.positions[i]!, tool.positions[i + 1]!))
    expect(widest).toBeCloseTo(3 + 1, 1)
  })
})
