import { describe, expect, test } from "bun:test"
import { nearestNeighbourOrder, optimizedOrder } from "../../src/cam/geometry.ts"
import type { Vec2 } from "../../src/cad/vec.ts"

const length = (points: ReadonlyArray<Vec2>, from: Vec2 = { x: 0, y: 0 }): number => {
  let total = 0, current = from
  for (const p of points) { total += Math.hypot(p.x - current.x, p.y - current.y); current = p }
  return total
}

const key = (p: Vec2) => `${p.x},${p.y}`

describe("toolpath linking order (M7)", () => {
  const points: Vec2[] = [
    { x: 2, y: 1 }, { x: 4, y: 9 }, { x: 16, y: 24 }, { x: 13, y: 9 }, { x: 11, y: 15 },
    { x: 12, y: 1 }, { x: 23, y: 10 }, { x: 25, y: 4 }, { x: 20, y: 13 }
  ]

  test("the optimized order visits every point once and never lengthens the rapids", () => {
    const nn = nearestNeighbourOrder(points)
    const opt = optimizedOrder(points)
    expect(opt.map(key).sort()).toEqual(points.map(key).sort())
    expect(length(opt)).toBeLessThanOrEqual(length(nn) + 1e-9)
  })

  test("2-opt untangles the crossings nearest neighbour leaves behind", () => {
    const nn = nearestNeighbourOrder(points)
    const opt = optimizedOrder(points)
    expect(length(opt)).toBeLessThan(length(nn) - 1)
  })

  test("the order is deterministic and respects the start point", () => {
    const a = optimizedOrder(points, { x: 30, y: 0 })
    const b = optimizedOrder(points, { x: 30, y: 0 })
    expect(a).toEqual(b)
    expect(length(a, { x: 30, y: 0 })).toBeLessThanOrEqual(length(nearestNeighbourOrder(points, { x: 30, y: 0 }), { x: 30, y: 0 }) + 1e-9)
  })

  test("empty and single-point inputs are returned as they are", () => {
    expect(optimizedOrder([])).toEqual([])
    expect(optimizedOrder([{ x: 3, y: 4 }])).toEqual([{ x: 3, y: 4 }])
  })
})
