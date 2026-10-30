import { describe, expect, test } from "bun:test"
import { repairMesh } from "./repair.ts"
import { meshVolume, printSolidIssue } from "./slice.ts"

/** A box [0,w]x[0,d]x[0,h] with outward faces, eight shared vertices. */
const box = (w = 10, d = 10, h = 10, at: readonly [number, number, number] = [0, 0, 0]) => {
  const positions = Float64Array.from([0, 0, 0, w, 0, 0, w, d, 0, 0, d, 0, 0, 0, h, w, 0, h, w, d, h, 0, d, h].map((v, i) => v + at[i % 3]!))
  const indices = Uint32Array.from([
    0, 3, 2, 0, 2, 1, // bottom (-Z)
    4, 5, 6, 4, 6, 7, // top
    0, 1, 5, 0, 5, 4, // front (-Y)
    1, 2, 6, 1, 6, 5, // right (+X)
    2, 3, 7, 2, 7, 6, // back (+Y)
    3, 0, 4, 3, 4, 7 // left (-X)
  ])
  return { positions, indices }
}

/** The same box as triangle soup: every triangle owns its three vertices. */
const soup = (m: { positions: Float64Array; indices: Uint32Array }) => {
  const positions = new Float64Array(m.indices.length * 3)
  m.indices.forEach((v, i) => positions.set(m.positions.subarray(v * 3, v * 3 + 3), i * 3))
  return { positions, indices: Uint32Array.from({ length: m.indices.length }, (_, i) => i) }
}

const without = (m: { positions: Float64Array; indices: Uint32Array }, ...triangles: number[]) => ({
  positions: m.positions,
  indices: Uint32Array.from(Array.from(m.indices).filter((_, i) => !triangles.includes(Math.floor(i / 3))))
})

/** A UV sphere with outward triangles. */
const sphere = (nu: number, nv: number, r: number) => {
  const pos: number[] = [0, 0, -r]
  for (let j = 1; j < nv; j++) for (let i = 0; i < nu; i++) {
    const phi = (Math.PI * j) / nv, th = (2 * Math.PI * i) / nu
    pos.push(r * Math.sin(phi) * Math.cos(th), r * Math.sin(phi) * Math.sin(th), -r * Math.cos(phi))
  }
  pos.push(0, 0, r)
  const ring = (j: number, i: number) => 1 + (j - 1) * nu + (i % nu)
  const idx: number[] = []
  for (let i = 0; i < nu; i++) idx.push(0, ring(1, i + 1), ring(1, i))
  for (let j = 1; j < nv - 1; j++) for (let i = 0; i < nu; i++) {
    const a = ring(j, i), b = ring(j, i + 1), c = ring(j + 1, i), d = ring(j + 1, i + 1)
    idx.push(a, b, d, a, d, c)
  }
  const top = 1 + (nv - 1) * nu
  for (let i = 0; i < nu; i++) idx.push(top, ring(nv - 1, i), ring(nv - 1, i + 1))
  return { positions: Float64Array.from(pos), indices: Uint32Array.from(idx) }
}

describe("mesh repair", () => {
  test("a closed outward box is clean and unchanged", () => {
    const { mesh, report } = repairMesh(box())
    expect(report.status).toBe("clean")
    expect(report.closed).toBe(true)
    expect(report.volume).toBeCloseTo(1000, 9)
    expect(report.outputTriangles).toBe(12)
    expect(report.selfIntersections).toMatchObject({ pairs: 0, complete: true })
    expect(printSolidIssue(mesh)).toBeUndefined()
  })

  test("triangle soup is welded back into the closed box", () => {
    const { mesh, report } = repairMesh(soup(box()))
    expect(report.weldedVertices).toBe(36 - 8)
    expect(report.outputVertices).toBe(8)
    expect(report.closed).toBe(true)
    expect(report.status).toBe("repaired")
    expect(meshVolume(mesh)).toBeCloseTo(1000, 9)
  })

  test("an inside-out shell is turned outward and says so", () => {
    const m = box()
    const inverted = { positions: m.positions, indices: Uint32Array.from(Array.from(m.indices).map((_, i, a) => a[i % 3 === 0 ? i : i % 3 === 1 ? i + 1 : i - 1]!)) }
    expect(meshVolume(inverted)).toBeCloseTo(-1000, 9)
    const { mesh, report } = repairMesh(inverted)
    expect(report.invertedShells).toBe(1)
    expect(report.flippedTriangles).toBe(12)
    expect(meshVolume(mesh)).toBeCloseTo(1000, 9)
  })

  test("one triangle wound the wrong way is found and flipped back", () => {
    const m = box()
    const idx = Uint32Array.from(m.indices)
    const b = idx[7]!; idx[7] = idx[8]!; idx[8] = b // triangle 2 reversed
    const { mesh, report } = repairMesh({ positions: m.positions, indices: idx })
    expect(report.status).toBe("repaired")
    expect(report.flippedTriangles).toBeGreaterThanOrEqual(1)
    expect(meshVolume(mesh)).toBeCloseTo(1000, 9)
    expect(report.closed).toBe(true)
  })

  test("a missing quad (two triangles) is filled with the exact volume back", () => {
    const { mesh, report } = repairMesh(without(box(), 2, 3))
    expect(report.openEdges).toBe(0)
    expect(report.holesFilled).toBe(1)
    expect(report.holeTriangles).toBe(2)
    expect(report.closed).toBe(true)
    expect(report.volume).toBeCloseTo(1000, 9)
    expect(meshVolume(mesh)).toBeCloseTo(1000, 9)
    expect(printSolidIssue(mesh)).toBeUndefined()
  })

  test("a hole in a curved shell is closed and the volume is within the polygonal cap", () => {
    const s = sphere(24, 16, 10)
    const reference = meshVolume(s)
    // Remove the triangles around the north pole.
    const top = 1 + 15 * 24
    const keep: number[] = []
    for (let f = 0; f < s.indices.length / 3; f++) if (!s.indices.slice(f * 3, f * 3 + 3).includes(top)) keep.push(s.indices[f * 3]!, s.indices[f * 3 + 1]!, s.indices[f * 3 + 2]!)
    const { mesh, report } = repairMesh({ positions: s.positions, indices: Uint32Array.from(keep) })
    expect(report.holesFilled).toBe(1)
    expect(report.closed).toBe(true)
    // The flat cap replaces a shallow spherical cap: the volume moves by less than 1 %.
    expect(Math.abs(meshVolume(mesh) - reference) / reference).toBeLessThan(0.01)
  })

  test("degenerate slivers and duplicated faces are dropped, an internal wall is removed with its twin", () => {
    const m = box()
    const dup = { positions: Float64Array.from([...m.positions, 5, 5, 5, 5, 5, 5.0000001]), indices: Uint32Array.from([...m.indices, 0, 2, 1, 8, 9, 0]) }
    const { report, mesh } = repairMesh(dup)
    expect(report.duplicateRemoved).toBe(1)
    expect(report.degenerateRemoved).toBeGreaterThanOrEqual(1)
    expect(meshVolume(mesh)).toBeCloseTo(1000, 9)
    // A face paired with its reverse cancels.
    const wall = repairMesh({ positions: m.positions, indices: Uint32Array.from([...m.indices, 0, 2, 1, 0, 1, 2]) })
    expect(wall.report.internalRemoved).toBeGreaterThanOrEqual(2)
    expect(wall.report.closed).toBe(true)
  })

  test("three faces on one edge are non-manifold: reported and not repaired", () => {
    const m = box()
    const fin = { positions: Float64Array.from([...m.positions, 5, -10, 5]), indices: Uint32Array.from([...m.indices, 0, 1, 8]) }
    const { report } = repairMesh(fin)
    expect(report.nonManifoldEdges).toBeGreaterThanOrEqual(1)
    expect(report.status).toBe("unrepairable")
    expect(report.problems.join(" ")).toContain("three or more faces")
  })

  test("two boxes that pass through each other are reported as self-intersecting", () => {
    const a = box(), b = box(10, 10, 10, [5, 4, 3])
    const merged = { positions: Float64Array.from([...a.positions, ...b.positions]), indices: Uint32Array.from([...a.indices, ...Array.from(b.indices).map((i) => i + 8)]) }
    const { report } = repairMesh(merged)
    expect(report.shells).toBe(2)
    expect(report.selfIntersections!.pairs).toBeGreaterThan(0)
    expect(report.selfIntersections!.sample.length).toBeGreaterThan(0)
    expect(report.problems.join(" ")).toContain("cross each other")
    // Edges that pass exactly through the diagonals of the other box's faces are found as well.
    const centred = box(10, 10, 10, [5, 5, 5])
    const diagonal = { positions: Float64Array.from([...a.positions, ...centred.positions]), indices: Uint32Array.from([...a.indices, ...Array.from(centred.indices).map((i) => i + 8)]) }
    expect(repairMesh(diagonal).report.selfIntersections!.pairs).toBeGreaterThan(0)
    // Separate boxes do not intersect.
    const apart = box(10, 10, 10, [20, 0, 0])
    const two = { positions: Float64Array.from([...a.positions, ...apart.positions]), indices: Uint32Array.from([...a.indices, ...Array.from(apart.indices).map((i) => i + 8)]) }
    expect(repairMesh(two).report.selfIntersections!.pairs).toBe(0)
  })

  test("a self-intersection search that exceeds its budget says it is incomplete", () => {
    const a = box(), b = box(10, 10, 10, [5, 4, 3])
    const merged = { positions: Float64Array.from([...a.positions, ...b.positions]), indices: Uint32Array.from([...a.indices, ...Array.from(b.indices).map((i) => i + 8)]) }
    const { report } = repairMesh(merged, { selfIntersectionBudget: 3 })
    expect(report.selfIntersections!.complete).toBe(false)
    expect(report.problems.join(" ")).toContain("budget")
  })

  test("a boundary that is longer than the limit is left open and listed", () => {
    const s = sphere(24, 16, 10)
    const top = 1 + 15 * 24
    const keep: number[] = []
    for (let f = 0; f < s.indices.length / 3; f++) if (!s.indices.slice(f * 3, f * 3 + 3).includes(top)) keep.push(s.indices[f * 3]!, s.indices[f * 3 + 1]!, s.indices[f * 3 + 2]!)
    const { report } = repairMesh({ positions: s.positions, indices: Uint32Array.from(keep) }, { maxHoleEdges: 8 })
    expect(report.holesSkipped.length).toBe(1)
    expect(report.status).toBe("unrepairable")
    expect(repairMesh({ positions: s.positions, indices: Uint32Array.from(keep) }, { fillHoles: false }).report.holesFilled).toBe(0)
  })

  test("seeded fuzz: random winding, soup and a removed face are always recovered to the same volume", () => {
    let seed = 12345
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32 }
    for (let trial = 0; trial < 25; trial++) {
      const base = sphere(10 + Math.floor(rnd() * 8), 6 + Math.floor(rnd() * 6), 5 + rnd() * 5)
      const reference = meshVolume(base)
      const keepAll = base.indices.length / 3
      const dropped = Math.floor(rnd() * keepAll)
      const idx = Array.from(base.indices)
      const flipSome = rnd() < 0.5
      const triangles: number[][] = []
      for (let f = 0; f < keepAll; f++) {
        if (f === dropped) continue
        const t = [idx[f * 3]!, idx[f * 3 + 1]!, idx[f * 3 + 2]!]
        triangles.push(flipSome && rnd() < 0.3 ? [t[0]!, t[2]!, t[1]!] : t)
      }
      const m = { positions: base.positions, indices: Uint32Array.from(triangles.flat()) }
      const input = rnd() < 0.5 ? soup(m) : m
      const { mesh, report } = repairMesh(input)
      expect(report.closed, `trial ${trial}`).toBe(true)
      expect(Math.abs(meshVolume(mesh) - reference) / reference, `trial ${trial}`).toBeLessThan(0.08)
    }
  })

  test("bad input is refused, not repaired", () => {
    expect(() => repairMesh({ positions: [0, 0, NaN], indices: [0, 0, 0] })).toThrow()
    expect(() => repairMesh({ positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 5] })).toThrow()
  })

  test("a cancelled repair stops", () => {
    expect(() => repairMesh(sphere(20, 12, 5), { signal: { aborted: true } })).toThrow()
  })
})
