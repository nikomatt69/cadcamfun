import { describe, expect, setDefaultTimeout, test } from "bun:test"
import type { Vec3 } from "../../cad/vec.ts"
import type { Mesh64 } from "../model/element-mesh.ts"
import type { Cutter } from "./cutters.ts"
import { TriReplay, triCellFor } from "./tri-replay.ts"

setDefaultTimeout(60_000)

const flat = (d: number): Cutter => ({ id: `f${d}`, name: `flat ${d}`, kind: "flat", diameter: d, flutes: 3, material: "carbide", coating: "none", fluteLength: 20, shankDiameter: d, stickout: 30 })

const boxMesh = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Mesh64 => {
  const p = [x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0, x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1]
  const i = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]
  return { positions: Float64Array.from(p), indices: Uint32Array.from(i) }
}

// A 20 x 20 x 10 block on a stock that stands 3 mm proud on every side: the program clears that ring.
const part = boxMesh(0, 0, 0, 20, 20, 10)
const replay = (): TriReplay => new TriReplay({ min: { x: -3, y: -3, z: 0 }, max: { x: 23, y: 23, z: 10 }, cell: 0.1, budget: 5e9 })
const ring = (offset: number, z = -1): Vec3[] => [
  { x: -offset, y: -offset, z }, { x: 20 + offset, y: -offset, z }, { x: 20 + offset, y: 20 + offset, z }, { x: -offset, y: 20 + offset, z }, { x: -offset, y: -offset, z }
]

describe("tri-dexel replay of a program: gouge and left verdicts", () => {
  test("a ring pass at the wall clears the stock without touching the part", () => {
    const r = replay()
    r.cut(flat(6), ring(3))
    const v = r.verdict([part], 0.01, 0.05)
    expect(v.complete).toBe(true)
    expect(v.gouge.depth).toBe(0)
    expect(v.left.depth).toBe(0)
    expect(v.detached).toBe(0)
  })

  test("the same pass 0.2 mm too close cuts the wall: a gouge deeper than the declared bound, with where", () => {
    const r = replay()
    r.cut(flat(6), ring(2.8))
    const v = r.verdict([part], 0.01, 0.05)
    expect(v.gouge.depth).toBeGreaterThan(0.15)
    expect(v.gouge.depth).toBeLessThan(0.3)
    expect(v.gouge.at).toBeDefined()
    expect(v.errorBound).toBeLessThan(0.2)
  })

  test("a tilted tool that leans into the wall is found; the lean is not a special case", () => {
    const r = replay()
    const axes = ring(3).map(() => ({ x: 0.26, y: 0, z: 0.97 }))
    // Axis leaning +X: along the -X wall the flutes sweep out away from it, along the +X wall they lean into the part.
    r.cut(flat(6), ring(3), axes)
    const v = r.verdict([part], 0.01, 0.05)
    expect(v.gouge.depth).toBeGreaterThan(0.5)
  })

  test("a program that clears nothing leaves the ring, and it is measured, not guessed", () => {
    const v = replay().verdict([part], 0.01, 0.05)
    expect(v.complete).toBe(true)
    expect(v.gouge.depth).toBe(0)
    // The ring is uncut stock beside the part: it faces no part surface along Z, and the X and Y rays see it as left.
    expect(v.detached).toBeGreaterThan(1000)
    expect(v.left.depth).toBeGreaterThan(2.5)
  })

  test("a work budget that is exceeded stops the replay and the verdict says it is incomplete", () => {
    const r = new TriReplay({ min: { x: -3, y: -3, z: 0 }, max: { x: 23, y: 23, z: 10 }, cell: 0.1, budget: 1e3 })
    r.cut(flat(6), ring(3))
    const v = r.verdict([part], 0.01, 0.05)
    expect(v.complete).toBe(false)
    expect(v.reasons.join(" ")).toContain("work budget")
  })

  test("a move the replay could not place makes it incomplete", () => {
    const r = replay()
    r.cut(flat(6), ring(3))
    r.unchecked("an arc written with the table turned is not interpreted in the part's frame")
    expect(r.verdict([part], 0.01, 0.05).complete).toBe(false)
  })

  test("the cell grows to keep the lattice inside its ray budget", () => {
    expect(triCellFor({ x: 10, y: 10, z: 10 }, 0.1)).toBe(0.1)
    expect(triCellFor({ x: 2000, y: 2000, z: 100 }, 0.1)).toBeGreaterThan(2)
  })
})
