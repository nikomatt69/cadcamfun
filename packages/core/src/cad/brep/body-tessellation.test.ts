import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { booleanBrep } from "./boolean.ts"
import { brepToObj, brepToStl } from "./export-mesh.ts"
import { frame } from "./math.ts"
import { massProperties } from "./mass.ts"
import { makeBox, makeCone, makeCylinder, makeSphere } from "./primitives.ts"
import { bodyTessellation, derivedStats, tessellateBrep } from "./tessellate.ts"
import type { Brep } from "./topology.ts"

setDefaultTimeout(100_000)
const Z = { x: 0, y: 0, z: 1 }

/** Volume of the welded triangle mesh by the divergence theorem (signed tetrahedra against the origin). */
const meshVolume = (t: { positions: Float64Array; indices: Uint32Array }): number => {
  let v = 0
  for (let i = 0; i < t.indices.length; i += 3) {
    const a = t.indices[i]! * 3, b = t.indices[i + 1]! * 3, c = t.indices[i + 2]! * 3
    const p = t.positions
    v += (p[a]! * (p[b + 1]! * p[c + 2]! - p[b + 2]! * p[c + 1]!) - p[a + 1]! * (p[b]! * p[c + 2]! - p[b + 2]! * p[c]!) + p[a + 2]! * (p[b]! * p[c + 1]! - p[b + 1]! * p[c]!)) / 6
  }
  return v
}

const FIXTURES: ReadonlyArray<readonly [string, () => Brep]> = [
  ["box", () => makeBox(40, 30, 20)],
  ["box with a through hole", () => booleanBrep(makeBox(40, 30, 20), makeCylinder(5, 24, frame({ x: 20, y: 15, z: -2 }, Z)), "subtract").brep],
  ["pin on a plate", () => booleanBrep(makeBox(40, 30, 10), makeCylinder(6, 14, frame({ x: 20, y: 15, z: 10 }, Z)), "union").brep],
  ["cone frustum", () => makeCone(10, 4, 25)],
  ["sphere", () => makeSphere(12)]
]

describe("the derived tessellation of a body", () => {
  test("one tessellation per body and options: the same object comes back, a different tolerance is another entry", () => {
    const b = makeBox(40, 30, 20)
    const hits = derivedStats.hits, misses = derivedStats.misses
    const a = bodyTessellation(b, { chordTol: 0.05 })
    expect(bodyTessellation(b, { chordTol: 0.05 })).toBe(a)
    expect(bodyTessellation(b, { chordTol: 0.05 })).toBe(a)
    expect(bodyTessellation(b, { chordTol: 0.01 })).not.toBe(a)
    expect(derivedStats.misses - misses).toBe(2)
    expect(derivedStats.hits - hits).toBe(2)
  })

  test("another body is another entry, and a partial or reused tessellation is never derived", () => {
    const b = makeBox(40, 30, 20), c = makeBox(40, 30, 20)
    expect(bodyTessellation(b)).not.toBe(bodyTessellation(c))
    const partial = bodyTessellation(b, { faces: new Set([0]) })
    expect(partial).not.toBe(bodyTessellation(b, { faces: new Set([0]) }))
    expect(partial.faces).toHaveLength(1)
  })

  test("it is the tessellation the kernel makes, nothing else", () => {
    const b = makeCylinder(5, 12)
    const direct = tessellateBrep(b, { chordTol: 0.02 }), derived = bodyTessellation(b, { chordTol: 0.02 })
    expect(Array.from(derived.positions)).toEqual(Array.from(direct.positions))
    expect(Array.from(derived.indices)).toEqual(Array.from(direct.indices))
  })

  for (const [name, make] of FIXTURES) {
    test(`${name}: the mesh volume agrees with the exact volume within the chord bound`, () => {
      const b = make()
      const exact = massProperties(b).volume
      const chord = 0.01
      const t = bodyTessellation(b, { chordTol: chord })
      const area = massProperties(b).area
      // The inscribed mesh is inside the surface by at most `chord` everywhere: |dV| <= chord x area.
      expect(Math.abs(meshVolume(t) - exact)).toBeLessThanOrEqual(chord * area)
      expect(meshVolume(t)).toBeGreaterThan(0)
    })
  }

  test("the exports read the derived tessellation (the second export, in another format, does not tessellate again)", () => {
    const b = booleanBrep(makeBox(40, 30, 10), makeCylinder(6, 14, frame({ x: 20, y: 15, z: 10 }, Z)), "union").brep
    const stl = brepToStl(b, { chordTol: 0.05 })
    const misses = derivedStats.misses
    const obj = brepToObj(b, { chordTol: 0.05 })
    expect(derivedStats.misses).toBe(misses)
    expect(stl.data.length).toBeGreaterThan(0)
    expect(obj.data.length).toBeGreaterThan(0)
  })
})
