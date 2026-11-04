import { describe, expect, test } from "bun:test"
import type { Vec3 } from "../../cad/vec.ts"
import { boxSurface, meshSurface, nearestOnSegment, nearestOnTriangle, planeSurface, rectangleSurface, sphereSurface, sweepSphere, unionSurface } from "./sphere-cast.ts"

const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z })
const dist = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)

/** Deterministic pseudo random numbers in [0, 1) (mulberry32). */
const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

describe("sweepSphere", () => {
  test("a ball coming down on a plane stops one radius above it, to 1e-9", () => {
    const hit = sweepSphere(planeSurface(v(0, 0, 0), v(0, 0, 1)), v(3, 4, 10), v(3, 4, -5), 2)!
    expect(hit.t).toBeCloseTo(8, 9)
    expect(hit.centre.z).toBeCloseTo(2, 9)
    expect(hit.normal).toEqual({ x: 0, y: 0, z: 1 })
    expect(hit.point.z).toBeCloseTo(0, 9)
  })

  test("a path that stops short of the surface is free", () => {
    expect(sweepSphere(planeSurface(v(0, 0, 0), v(0, 0, 1)), v(0, 0, 10), v(0, 0, 2.5), 2)).toBeUndefined()
  })

  test("a thin wall is not skipped by a long step", () => {
    const wall = boxSurface(v(-50, -50, 0), v(50, 50, 0.001))
    const hit = sweepSphere(wall, v(0, 0, 500), v(0, 0, -500), 1)!
    expect(hit.centre.z).toBeCloseTo(1.001, 9)
    expect(hit.normal.z).toBeCloseTo(1, 12)
  })

  test("a ball meets a box corner at one radius from the corner point", () => {
    const box = boxSurface(v(0, 0, -10), v(10, 10, 0))
    // along the diagonal toward the vertical edge at (10, 10): contact when the centre is one radius from that edge
    const hit = sweepSphere(box, v(30, 30, -5), v(0, 0, -5), 2)!
    expect(dist(hit.centre, v(10, 10, -5))).toBeCloseTo(2, 9)
    expect(hit.normal.x).toBeCloseTo(Math.SQRT1_2, 9)
    expect(hit.normal.y).toBeCloseTo(Math.SQRT1_2, 9)
  })

  test("a ball that starts in contact reports t = 0; moving away from the surface is not a contact", () => {
    const plane = planeSurface(v(0, 0, 0), v(0, 0, 1))
    expect(sweepSphere(plane, v(0, 0, 2), v(0, 0, -5), 2)!.t).toBe(0)
    expect(sweepSphere(plane, v(0, 0, 2), v(0, 0, 20), 2)).toBeUndefined()
  })

  test("a path that does not move is free unless it already touches", () => {
    const s = sphereSurface(v(0, 0, 0), 5)
    expect(sweepSphere(s, v(0, 0, 20), v(0, 0, 20), 1)).toBeUndefined()
    expect(sweepSphere(s, v(0, 0, 6), v(0, 0, 6), 1)).toBeDefined()
  })

  test("a ball and a sphere touch when the centres are the radii apart, from any direction", () => {
    const next = rng(11)
    const s = sphereSurface(v(1, -2, 3), 12.5)
    for (let i = 0; i < 50; i++) {
      const d = v(next() - 0.5, next() - 0.5, next() - 0.5)
      const l = Math.hypot(d.x, d.y, d.z)
      const from = v(1 + (d.x / l) * 60, -2 + (d.y / l) * 60, 3 + (d.z / l) * 60)
      const hit = sweepSphere(s, from, v(1, -2, 3), 2)!
      expect(dist(hit.centre, v(1, -2, 3))).toBeCloseTo(14.5, 9)
      expect(dist(hit.point, v(1, -2, 3))).toBeCloseTo(12.5, 9)
    }
  })
})

describe("nearest points", () => {
  test("a segment clamps to its ends", () => {
    expect(nearestOnSegment(v(5, 3, 0), v(0, 0, 0), v(10, 0, 0))).toEqual(v(5, 0, 0))
    expect(nearestOnSegment(v(-5, 3, 0), v(0, 0, 0), v(10, 0, 0))).toEqual(v(0, 0, 0))
    expect(nearestOnSegment(v(1, 1, 1), v(2, 2, 2), v(2, 2, 2))).toEqual(v(2, 2, 2))
  })

  test("a triangle: interior, edge and vertex regions", () => {
    const a = v(0, 0, 0), b = v(4, 0, 0), c = v(0, 4, 0)
    expect(nearestOnTriangle(v(1, 1, 3), a, b, c)).toEqual(v(1, 1, 0))
    const edge = nearestOnTriangle(v(5, 5, 1), a, b, c)
    expect(edge.x).toBeCloseTo(2, 12)
    expect(edge.y).toBeCloseTo(2, 12)
    expect(nearestOnTriangle(v(-3, -3, 2), a, b, c)).toEqual(a)
    expect(nearestOnTriangle(v(9, -1, 0), a, b, c)).toEqual(b)
    expect(nearestOnTriangle(v(-1, 9, 0), a, b, c)).toEqual(c)
  })

  test("a box answers inside points with the nearest face", () => {
    const box = boxSurface(v(0, 0, 0), v(10, 10, 10))
    const q = box.nearest(v(2, 5, 5))
    expect(q.distance).toBeCloseTo(2, 12)
    expect(q.point).toEqual(v(0, 5, 5))
  })

  test("a rectangle needs perpendicular edges", () => {
    expect(() => rectangleSurface(v(0, 0, 0), v(1, 0, 0), v(1, 1, 0))).toThrow(RangeError)
    expect(() => rectangleSurface(v(0, 0, 0), v(0, 0, 0), v(0, 1, 0))).toThrow(RangeError)
    const r = rectangleSurface(v(0, 0, 0), v(10, 0, 0), v(0, 10, 0))
    expect(r.nearest(v(20, 5, 3)).point).toEqual(v(10, 5, 0))
  })
})

describe("composite surfaces", () => {
  test("a union is the nearest of its parts, whatever the order", () => {
    const next = rng(5)
    const parts = [boxSurface(v(0, 0, 0), v(5, 5, 5)), sphereSurface(v(20, 0, 0), 3), planeSurface(v(0, 0, -40), v(0, 0, 1))]
    const u = unionSurface(parts)
    const r = unionSurface([...parts].reverse())
    for (let i = 0; i < 100; i++) {
      const p = v(next() * 60 - 20, next() * 60 - 30, next() * 60 - 30)
      const want = Math.min(...parts.map((s) => s.nearest(p).distance))
      expect(u.nearest(p).distance).toBeCloseTo(want, 12)
      expect(r.nearest(p).distance).toBeCloseTo(want, 12)
    }
  })

  test("a triangle mesh with a BVH answers like the box it was built from", () => {
    const min = v(-3, 2, -1), max = v(9, 8, 4)
    const corners = [[min.x, min.y, min.z], [max.x, min.y, min.z], [max.x, max.y, min.z], [min.x, max.y, min.z], [min.x, min.y, max.z], [max.x, min.y, max.z], [max.x, max.y, max.z], [min.x, max.y, max.z]].flat()
    const faces = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]
    const mesh = meshSurface([{ positions: corners, indices: faces }])
    const box = boxSurface(min, max)
    const next = rng(23)
    for (let i = 0; i < 200; i++) {
      // outside points only: the mesh is a shell, the box also answers from inside
      const p = v(next() * 40 - 15, next() * 40 - 15, next() * 40 - 15)
      if (p.x >= min.x && p.x <= max.x && p.y >= min.y && p.y <= max.y && p.z >= min.z && p.z <= max.z) continue
      expect(mesh.nearest(p).distance).toBeCloseTo(box.nearest(p).distance, 9)
    }
  })

  test("a mesh with a deep tree (many triangles) still finds the nearest triangle", () => {
    // a fan of 200 thin triangles on the z = 0 plane, plus a probe point above one of them
    const positions: number[] = [0, 0, 0]
    const indices: number[] = []
    for (let i = 0; i <= 200; i++) positions.push(Math.cos((i / 200) * Math.PI) * 50, Math.sin((i / 200) * Math.PI) * 50, 0)
    for (let i = 1; i <= 200; i++) indices.push(0, i, i + 1 > 201 ? 201 : i + 1)
    const m = meshSurface([{ positions, indices }])
    const q = m.nearest(v(0, 20, 7))
    expect(q.distance).toBeCloseTo(7, 9)
    expect(q.point.z).toBeCloseTo(0, 12)
    expect(meshSurface([]).nearest(v(0, 0, 0)).distance).toBe(Infinity)
  })
})
