import { describe, expect, test } from "bun:test"
import { meshTopology } from "../mesh-topology.ts"
import type { MeshData } from "./mesh-repair.ts"
import { closeByTJunctions, splitTJunctions } from "./mesh-tjunction.ts"

/** A 10 x 10 x 10 box whose top face has an extra vertex in the middle of its +X edge, as the neighbouring side face does not. */
const boxWithCrack = (): MeshData => {
  const positions = Float64Array.from([
    0, 0, 0, 10, 0, 0, 10, 10, 0, 0, 10, 0, // bottom 0..3
    0, 0, 10, 10, 0, 10, 10, 10, 10, 0, 10, 10, // top 4..7
    10, 5, 10 // 8: on the top edge 5-6, not on the side face's edge
  ])
  const tris = [
    // bottom (down), the three sides without the crack, the +X side with one straight edge 1-2 at the top (5-6)
    0, 2, 1, 0, 3, 2,
    0, 1, 5, 0, 5, 4, // -Y
    2, 3, 7, 2, 7, 6, // +Y
    3, 0, 4, 3, 4, 7, // -X
    1, 2, 6, 1, 6, 5, // +X: the edge 5-6 is whole here
    // top (up): the edge 5-6 is split at 8
    4, 5, 8, 4, 8, 7, 8, 6, 7
  ]
  return { positions, indices: Uint32Array.from(tris) }
}

describe("T-junctions", () => {
  test("a vertex in the middle of one face's edge opens the mesh; splitting the other face closes it with the same volume", () => {
    const cracked = boxWithCrack()
    const before = meshTopology(cracked)
    expect(before.solid).toBe(false)
    expect(before.boundaryEdges).toBeGreaterThan(0)
    const fixed = splitTJunctions(cracked)
    expect(fixed.splitEdges).toBe(1)
    expect(fixed.addedTriangles).toBe(1)
    const after = meshTopology(fixed.mesh)
    expect(after.solid).toBe(true)
    expect(after.volume).toBeCloseTo(1000, 9)
    expect(after.area).toBeCloseTo(600, 9)
    expect(after.misorientedEdges).toBe(0)
  })

  test("a closed mesh comes back as it was, and the input is never modified", () => {
    const cracked = boxWithCrack()
    const copy = Uint32Array.from(cracked.indices)
    splitTJunctions(cracked)
    expect(Array.from(cracked.indices)).toEqual(Array.from(copy))
    const closed = splitTJunctions(splitTJunctions(cracked).mesh)
    expect(closed.splitEdges).toBe(0)
    expect(closed.addedTriangles).toBe(0)
  })

  test("a vertex that is off the edge is not a T-junction: the mesh stays open", () => {
    const off = boxWithCrack()
    const moved = Float64Array.from(off.positions)
    moved[8 * 3 + 2] = 10.5 // lifted off the top face
    const result = closeByTJunctions({ positions: moved, indices: off.indices })
    expect(result.splitEdges).toBe(0)
    expect(result.closed).toBe(false)
  })

  test("several vertices on one edge are all used, in order", () => {
    const positions = Float64Array.from([
      0, 0, 0, 10, 0, 0, 10, 10, 0, 0, 10, 0, 0, 0, 10, 10, 0, 10, 10, 10, 10, 0, 10, 10,
      10, 2.5, 10, 10, 5, 10, 10, 7.5, 10
    ])
    const tris = [
      0, 2, 1, 0, 3, 2, 0, 1, 5, 0, 5, 4, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7, 1, 2, 6, 1, 6, 5,
      // top with the +X edge 5-6 cut at three points
      4, 5, 8, 4, 8, 9, 4, 9, 10, 4, 10, 6, 4, 6, 7
    ]
    const result = closeByTJunctions({ positions, indices: Uint32Array.from(tris) })
    expect(result).toMatchObject({ closed: true, splitEdges: 1, addedTriangles: 3 })
    expect(meshTopology(result.mesh).volume).toBeCloseTo(1000, 9)
  })

  test("a filler triangle with its corners on one line is dropped and the cracks it hid are split", () => {
    const base = boxWithCrack()
    // The +X side gets a zero-area triangle (5, 8, 6) between its whole edge and the top's two halves: closed, but not a solid.
    const withFiller: MeshData = { positions: base.positions, indices: Uint32Array.from([...base.indices, 5, 8, 6]) }
    const before = meshTopology(withFiller)
    expect(before.degenerateTriangles).toBe(1)
    expect(before.solid).toBe(false)
    const result = closeByTJunctions(withFiller)
    expect(result.closed).toBe(true)
    const after = meshTopology(result.mesh)
    expect(after).toMatchObject({ degenerateTriangles: 0, boundaryEdges: 0, solid: true })
    expect(after.volume).toBeCloseTo(1000, 9)
  })
})

