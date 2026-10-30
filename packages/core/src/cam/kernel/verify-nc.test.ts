import { describe, expect, setDefaultTimeout, test } from "bun:test"
import type { Mesh64 } from "../model/element-mesh.ts"
import type { Cutter } from "./cutters.ts"
import { verifyNc, type VerifyNcRequest } from "./verify-nc.ts"

setDefaultTimeout(60_000)

const flat = (d: number): Cutter => ({ id: `f${d}`, name: `flat ${d}`, kind: "flat", diameter: d, flutes: 3, material: "carbide", coating: "none", fluteLength: 20, shankDiameter: d, stickout: 30 })
const boxMesh = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Mesh64 => {
  const p = [x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0, x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1]
  const i = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]
  return { positions: Float64Array.from(p), indices: Uint32Array.from(i) }
}

// A 20 x 20 x 10 block on a stock 3 mm proud on every side. A hand-written program clears the ring with a 6 mm flat at offset `o`
// from the wall: o = 3 touches the wall, o = 2.9 cuts 0.1 mm into it.
const ring = (o: number): string => [
  "G21 G90 G54",
  "T1 M6",
  "S10000 M3",
  "G0 Z15",
  `G0 X${-o} Y${-o}`,
  "G1 Z-1 F300",
  `G1 X${20 + o} F800`,
  `G1 Y${20 + o}`,
  `G1 X${-o}`,
  `G1 Y${-o}`,
  "G0 Z15",
  "M30"
].join("\n")

const request = (nc: string, over: Partial<VerifyNcRequest> = {}): VerifyNcRequest => ({
  nc, part: [boxMesh(0, 0, 0, 20, 20, 10)], stock: { min: { x: -3, y: -3, z: 0 }, max: { x: 23, y: 23, z: 10 } },
  tools: [{ number: 1, cutter: flat(6) }], tolerance: 0.005, cell: 0.05, ...over
})

describe("verifyNc: NC the kernel did not write, replayed against the part and the stock", () => {
  test("a clean hand-written program verifies: nothing cut below the part, nothing left", () => {
    const r = verifyNc(request(ring(3)))
    expect(r.reasons).toEqual([])
    expect(r.complete).toBe(true)
    expect(r.findings).toEqual([])
    expect(r.gouge.depth).toBe(0)
    expect(r.left.depth).toBe(0)
    expect(r.detached).toBe(0)
    expect(r.feedMoves).toBe(5)
  })

  test("an overcut of 0.1 mm is reported with the NC line of the move that made it", () => {
    const r = verifyNc(request(ring(2.9)))
    // The declared threshold is under the seeded depth, so the finding is a verdict and not a guess.
    expect(r.threshold).toBeLessThan(0.1)
    expect(r.gouge.depth).toBeGreaterThan(0.08)
    expect(r.gouge.depth).toBeLessThan(0.14)
    const f = r.findings.find((x) => x.kind === "gouge")!
    expect(f).toBeDefined()
    // Line 7 is the first leg along the wall (the plunge at the corner does not reach the block): the first move that took part material.
    expect(f.line).toBe(7)
    expect(f.depth).toBeCloseTo(r.gouge.depth, 6)
  })

  test("a rapid through the block is a finding with its line and how far into the stock it goes", () => {
    const nc = ["G21 G90 G54", "T1 M6", "S8000 M3", "G0 Z15", "G0 X10 Y10", "G0 Z5", "G0 Z15", "M30"].join("\n")
    const r = verifyNc(request(nc))
    const f = r.findings.find((x) => x.kind === "rapid-in-stock")!
    expect(f).toBeDefined()
    expect(f.line).toBe(6)
  })

  test("a move outside the machine travel is a finding", () => {
    const r = verifyNc(request(ring(3), { machine: { travel: { minX: -10, maxX: 21, minY: -10, maxY: 40, minZ: -5, maxZ: 50 } } }))
    expect(r.findings.some((x) => x.kind === "travel" && x.line === 7)).toBe(true)
  })

  test("a tool number the caller did not describe makes the verdict incomplete, never a pass", () => {
    const r = verifyNc(request(ring(3).replace("T1 M6", "T7 M6")))
    expect(r.complete).toBe(false)
    expect(r.findings.some((x) => x.kind === "unknown-tool")).toBe(true)
  })

  test("the same bytes give the same findings", () => {
    expect(verifyNc(request(ring(2.9)))).toEqual(verifyNc(request(ring(2.9))))
  })
})
