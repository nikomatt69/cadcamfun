import { describe, expect, test } from "bun:test"
import type { Vec3 } from "../../cad/vec.ts"
import { boxWorld, cylinderWorld, meshWorld, planeWorld, plateWorld, pocketWorld, sphereWorld, surfaceWorld, unionWorld, type StylusBall } from "./world.ts"
import { boxSurface } from "./sphere-cast.ts"

const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z })
const ball = (radius = 2): StylusBall => ({ radius, centre: radius })

describe("worlds are placed on the machine", () => {
  test("a block shifted by a placement is touched where it really is", () => {
    const w = boxWorld(v(0, 0, -10), v(10, 10, 0), { translate: v(0.5, -0.25, 0.1) })
    const down = w.touch(v(5, 5, 20), v(5, 5, -5), ball())!
    expect(down.tip.z).toBeCloseTo(0.1, 9)
    expect(down.normal.z).toBeCloseTo(1, 12)
    // a side touch toward +X from the left: the ball centre stops one radius before the face at x = 0.5
    const side = w.touch(v(-20, 5, -5), v(20, 5, -5), ball())!
    expect(side.tip.x).toBeCloseTo(0.5 - 2, 9)
    expect(side.normal.x).toBeCloseTo(-1, 12)
  })

  test("a block rotated a quarter turn presents its sides turned, with normals turned back", () => {
    // rotated by 90 degrees about the origin: x' = -y, y' = x, so the block occupies x -10..0, y 0..10
    const w = boxWorld(v(0, 0, -10), v(10, 10, 0), { translate: v(0, 0, 0), rotate: Math.PI / 2 })
    const hit = w.touch(v(-40, 5, -5), v(40, 5, -5), ball())!
    expect(hit.tip.x).toBeCloseTo(-12, 9)
    expect(hit.normal.x).toBeCloseTo(-1, 9)
    expect(Math.abs(hit.normal.y)).toBeLessThan(1e-9)
    const top = w.touch(v(-5, 5, 20), v(-5, 5, -5), ball())!
    expect(top.tip.z).toBeCloseTo(0, 9)
  })

  test("a path that stops short is free and a tip reports its travel", () => {
    const w = boxWorld(v(0, 0, -10), v(10, 10, 0))
    expect(w.touch(v(5, 5, 20), v(5, 5, 3), ball())).toBeUndefined()
    const hit = w.touch(v(5, 5, 20), v(5, 5, -5), ball())!
    expect(hit.travelled).toBeCloseTo(20, 9)
  })

  test("a tilted tool axis moves the ball centre along the axis", () => {
    const w = planeWorld(v(0, 0, 0), v(0, 0, 1))
    // tool axis along +X: the ball centre is `centre` ahead of the tip in X, so it touches the plane at tip z = radius
    const hit = w.touch(v(0, 0, 10), v(0, 0, -10), { radius: 2, centre: 2, axis: v(1, 0, 0) })!
    expect(hit.tip.z).toBeCloseTo(2, 9)
  })

  test("the trigger radius, not the ball radius, sets where a side touch stops", () => {
    const w = boxWorld(v(0, 0, -10), v(10, 10, 0))
    const a = w.touch(v(-20, 5, -5), v(20, 5, -5), { radius: 1.98, centre: 2 })!
    expect(a.tip.x).toBeCloseTo(-1.98, 9)
  })
})

describe("analytic parts", () => {
  test("a bore is touched from inside and its floor is found", () => {
    const w = cylinderWorld({ centre: { x: 30, y: 30 }, radius: 10, z0: -8, z1: 0, inside: true })
    const wall = w.touch(v(30, 30, -4), v(60, 30, -4), ball())!
    expect(wall.tip.x).toBeCloseTo(30 + 10 - 2, 9)
    expect(wall.normal.x).toBeCloseTo(-1, 9)
    const floor = w.touch(v(30, 30, 5), v(30, 30, -20), ball())!
    expect(floor.tip.z).toBeCloseTo(-8, 9)
  })

  test("a boss is touched from outside and has a top", () => {
    const w = cylinderWorld({ centre: { x: 0, y: 0 }, radius: 8, z0: 0, z1: 10, inside: false })
    const wall = w.touch(v(-30, 0, 5), v(0, 0, 5), ball())!
    expect(wall.tip.x).toBeCloseTo(-8 - 2, 9)
    expect(w.touch(v(0, 0, 40), v(0, 0, 0), ball())!.tip.z).toBeCloseTo(10, 9)
  })

  test("a plate with a bore: the top face stops a descent beside the bore, the bore lets it through to the lower face", () => {
    const w = plateWorld({ min: v(0, 0, -20), max: v(100, 60, 0), bores: [{ centre: { x: 30, y: 30 }, radius: 10 }] })
    expect(w.touch(v(80, 30, 10), v(80, 30, -30), ball())!.tip.z).toBeCloseTo(0, 9)
    // through the middle of the bore: nothing for 20 mm, since the ball (r 2) fits
    expect(w.touch(v(30, 30, 10), v(30, 30, -30), ball())).toBeUndefined()
  })

  test("a pocket: floor depth and walls", () => {
    const w = pocketWorld(v(0, 0, -20), v(100, 60, 0), { min: { x: 30, y: 15 }, max: { x: 70, y: 45 }, depth: 10 })
    expect(w.touch(v(50, 30, 10), v(50, 30, -30), ball())!.tip.z).toBeCloseTo(-10, 9)
    expect(w.touch(v(50, 30, -5), v(100, 30, -5), ball())!.tip.x).toBeCloseTo(70 - 2, 9)
  })

  test("a sphere world gives the equator and the pole", () => {
    const w = sphereWorld(v(20, -30, 5), 12.5)
    expect(w.touch(v(20, -30, 40), v(20, -30, 0), ball())!.tip.z).toBeCloseTo(5 + 12.5, 9)
    // the ball centre rides one radius above the tip: the tip at z = 3 puts the ball on the equator (z = 5)
    expect(w.touch(v(-20, -30, 3), v(20, -30, 3), ball())!.tip.x).toBeCloseTo(20 - 12.5 - 2, 9)
  })

  test("a plane normal does not have to be a unit vector", () => {
    const w = planeWorld(v(0, 0, 3), v(0, 0, 7))
    expect(w.touch(v(1, 1, 30), v(1, 1, -30), ball())!.tip.z).toBeCloseTo(3, 9)
  })
})

describe("composition", () => {
  test("a union reports the nearest contact, not the first in the list", () => {
    const far = boxWorld(v(0, 0, -10), v(10, 10, -5))
    const near = boxWorld(v(0, 0, -10), v(10, 10, 2))
    const hit = unionWorld([far, near]).touch(v(5, 5, 20), v(5, 5, -30), ball())!
    expect(hit.tip.z).toBeCloseTo(2, 9)
    expect(unionWorld([]).touch(v(0, 0, 10), v(0, 0, -10), ball())).toBeUndefined()
  })

  test("a mesh world equals the surface world of the same box, placed", () => {
    const min = v(0, 0, -20), max = v(100, 60, 0)
    const c = [[min.x, min.y, min.z], [max.x, min.y, min.z], [max.x, max.y, min.z], [min.x, max.y, min.z], [min.x, min.y, max.z], [max.x, min.y, max.z], [max.x, max.y, max.z], [min.x, max.y, max.z]].flat()
    const f = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]
    const placement = { translate: v(0.7, -0.4, 0.15), rotate: 0.005 }
    const a = meshWorld([{ positions: c, indices: f }], placement)
    const b = surfaceWorld(boxSurface(min, max), placement)
    for (const [from, to] of [[v(50, 30, 30), v(50, 30, -30)], [v(-30, 20, -5), v(30, 20, -5)], [v(130, 40, -5), v(60, 40, -5)], [v(40, -30, -9), v(40, 30, -9)]] as const) {
      const ha = a.touch(from, to, ball())!
      const hb = b.touch(from, to, ball())!
      expect(ha.tip.x).toBeCloseTo(hb.tip.x, 9)
      expect(ha.tip.y).toBeCloseTo(hb.tip.y, 9)
      expect(ha.tip.z).toBeCloseTo(hb.tip.z, 9)
      expect(ha.normal.x).toBeCloseTo(hb.normal.x, 9)
    }
  })
})
