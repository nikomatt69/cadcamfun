/**
 * Regression tests for the mesh-surfacing helpers, written against the bugs
 * they had rather than re-listing what `surface.test.ts` already covers.
 *
 * Three defects were fixed here:
 *
 *  1. Both end caps of `sweepMesh` were wound inside out, so a swept prism
 *     reported a third of its volume (1/3 for a unit cube).
 *  2. A perpendicular sweep transported its frames, which tilted the profile
 *     plane out of the path's plane and pushed the bounds past the path. The
 *     default is now a parallel orientation: the profile keeps its own plane
 *     and is translated, so the mesh is the profile swept along the path. The
 *     transported frame is still available as `orientation: "perpendicular"`.
 *  3. `offsetMeshInward` (behind `shellMesh`) averaged normals over duplicated
 *     vertices. `meshOf` repeats each corner once per face, so every vertex
 *     owned a single face normal and the offset slid each face inwards on its
 *     own: a 30 mm box shelled by 2 mm came out as six floating quads with a
 *     volume of 23 400 mm³ instead of the 21 232 mm³ of a correctly inset box.
 */
import { describe, expect, test } from "bun:test"
import { chamferCylinderTop, chamferCylinderBottom, shellMesh, sweepMesh, surfaceBounds, surfaceVolume } from "./surface.ts"
import { meshOf, type BoxSolid, type CylinderSolid, type Mesh } from "./solid.ts"

const box = (size: number, tolerance = 0.1): Mesh =>
  meshOf({ _tag: "Box", origin: { x: 0, y: 0, z: 0 }, size: { x: size, y: size, z: size } }, tolerance)

const closedEdgeBalance = (mesh: Mesh): number => {
  // Every edge must be walked once in each direction for a closed mesh; an
  // unbalanced set means a face points the wrong way.
  const counts = new Map<string, number>()
  const idx = mesh.indices
  for (let i = 0; i + 2 < idx.length; i += 3) {
    const tri = [idx[i]!, idx[i + 1]!, idx[i + 2]!]
    for (let e = 0; e < 3; e++) {
      const a = tri[e]!, b = tri[(e + 1) % 3]!
      const key = a < b ? `${a}:${b}` : `${b}:${a}`
      counts.set(key, (counts.get(key) ?? 0) + (a < b ? 1 : -1))
    }
  }
  let unbalanced = 0
  for (const v of counts.values()) if (v !== 0) unbalanced++
  return unbalanced
}

describe("sweepMesh cap winding", () => {
  test("a swept unit cube reports the volume of a cube, not a third of it", () => {
    const profile = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]
    const path = [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }]
    const mesh = sweepMesh(profile, path)
    expect(Math.abs(surfaceVolume(mesh))).toBeCloseTo(1, 5)
  })

  test("both caps face away from the sweep, so the mesh is closed and outward", () => {
    const profile = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }]
    const path = [{ x: 5, y: 5, z: 0 }, { x: 5, y: 5, z: 3 }, { x: 5, y: 5, z: 7 }]
    const mesh = sweepMesh(profile, path)
    expect(surfaceVolume(mesh)).toBeGreaterThan(0) // positive ⇒ outward winding
    expect(closedEdgeBalance(mesh)).toBe(0)
  })
})

describe("sweepMesh orientation", () => {
  const square = [{ x: 0, y: 0 }, { x: 0.5, y: 0 }, { x: 0.5, y: 0.5 }, { x: 0, y: 0.5 }]
  const arc = (steps: number): ReadonlyArray<{ x: number; y: number; z: number }> =>
    Array.from({ length: steps + 1 }, (_, i) => {
      const t = i / steps
      return { x: Math.cos(t * Math.PI) - 1, y: Math.sin(t * Math.PI) - 1, z: t }
    })

  test("the default parallel orientation stays in the profile's plane", () => {
    const b = surfaceBounds(sweepMesh(square, arc(16)))
    // The profile is translated along the path, never tilted, so the Z extent
    // is exactly the path's: this is what a transported frame broke.
    expect(b.minZ).toBeCloseTo(0, 6)
    expect(b.maxZ).toBeCloseTo(1, 6)
    expect(b.minX).toBeLessThanOrEqual(-2 + 1e-6)
    expect(b.maxX).toBeGreaterThanOrEqual(0 - 1e-6)
  })

  test("a perpendicular sweep turns the profile with the path", () => {
    const parallel = surfaceBounds(sweepMesh(square, arc(16)))
    const perpendicular = surfaceBounds(sweepMesh(square, arc(16), { orientation: "perpendicular" }))
    // The transported frames tilt the profile out of the Z plane, so the
    // perpendicular sweep is taller: it is the geometry, not an error.
    expect(perpendicular.maxZ).toBeGreaterThan(parallel.maxZ)
  })

  test("a perpendicular sweep of a square round a circle is a closed ring tube", () => {
    const path: { x: number; y: number; z: number }[] = []
    for (let i = 0; i <= 48; i++) {
      const t = (i / 48) * Math.PI * 2
      path.push({ x: 20 * Math.cos(t), y: 20 * Math.sin(t), z: 0 })
    }
    const tube = sweepMesh([{ x: -2, y: -2 }, { x: 2, y: -2 }, { x: 2, y: 2 }, { x: -2, y: 2 }], path, { orientation: "perpendicular" })
    // A square tube of side 4 bent round a 20 mm circle: area × centre-line.
    const centre = Math.hypot(2 * Math.PI * 20, 0)
    expect(Math.abs(surfaceVolume(tube))).toBeGreaterThan(0.9 * 16 * centre)
    expect(Math.abs(surfaceVolume(tube))).toBeLessThan(1.1 * 16 * centre)
  })
})

describe("shellMesh vertex welding", () => {
  test("a shelled box is the outer box minus the inset box, not six loose quads", () => {
    const solid = box(30)
    const shell = shellMesh(solid, 2)
    const outer = surfaceVolume(solid)
    // The offset moves each corner 2 mm along the diagonal of the three faces
    // that meet it, i.e. 2/√3 ≈ 1.155 mm per axis: an inner box of side
    // 30 − 2×1.155 = 27.69, volume 21 232.
    const inner = 27.6906 ** 3
    expect(Math.abs(surfaceVolume(shell))).toBeCloseTo(outer - inner, -1)
    // The broken version reported 23 400: six faces inset on their own, each
    // keeping the outer box's footprint.
    expect(surfaceVolume(shell)).toBeLessThan(8_000)
  })

  test("the inset is inside the outer solid and shares its footprint", () => {
    const solid = box(40)
    const shell = shellMesh(solid, 3)
    const b = surfaceBounds(shell)
    // A shell is the walls: it spans the whole outer footprint, but the volume
    // says the inside is hollow.
    expect(surfaceBounds(solid).minX).toBeCloseTo(b.minX, 6)
    expect(surfaceBounds(solid).maxX).toBeCloseTo(b.maxX, 6)
    const wall = 40 ** 3 - (40 - 2 * (3 / Math.sqrt(3))) ** 3
    expect(Math.abs(surfaceVolume(shell))).toBeGreaterThan(wall * 0.7)
    expect(Math.abs(surfaceVolume(shell))).toBeLessThan(wall * 1.3)
  })

  test("a shelled cylinder rings the wall instead of collapsing to its caps", () => {
    const cyl: CylinderSolid = { _tag: "Cylinder", origin: { x: 0, y: 0, z: 0 }, radius: 10, height: 20, segments: 64 }
    const shell = shellMesh(meshOf(cyl, 0.05), 1)
    const outer = surfaceVolume(meshOf(cyl, 0.05))
    // Inner radius on the wall: 10 − 1 = 9 (the wall normal is radial, so the
    // offset is the full 1 mm there). Annulus ≈ π(10² − 9²) × 20.
    const annulus = Math.PI * (100 - 81) * 20
    expect(Math.abs(surfaceVolume(shell))).toBeGreaterThan(annulus * 0.6)
    expect(Math.abs(surfaceVolume(shell))).toBeLessThan(annulus * 1.2)
    expect(surfaceVolume(shell)).toBeLessThan(outer)
  })
})

describe("tapered cylinders", () => {
  const cyl = (radius: number, height: number, segments = 64): CylinderSolid =>
    ({ _tag: "Cylinder", origin: { x: 0, y: 0, z: 0 }, radius, height, segments })

  test("chamferCylinderTop keeps the height and shrinks only the top radius", () => {
    const b = surfaceBounds(chamferCylinderTop(cyl(10, 20), 3))
    expect(b.minZ).toBeCloseTo(0, 6)
    expect(b.maxZ).toBeCloseTo(20, 6) // the height is untouched
    // The widest ring is still the base: the top is 3 mm smaller.
    expect(b.maxX).toBeCloseTo(10, 6)
  })

  test("chamferCylinderBottom keeps the height and shrinks only the bottom radius", () => {
    const mesh = chamferCylinderBottom(cyl(10, 20), 3)
    const b = surfaceBounds(mesh)
    expect(b.minZ).toBeCloseTo(0, 6)
    expect(b.maxZ).toBeCloseTo(20, 6)
    expect(b.maxX).toBeCloseTo(10, 6)
    // Same volume as its mirror image, and positive: outward winding.
    expect(Math.abs(surfaceVolume(mesh))).toBeCloseTo(Math.abs(surfaceVolume(chamferCylinderTop(cyl(10, 20), 3))), -2)
  })

  test("a taper of zero radius becomes a cone of the full height", () => {
    const mesh = chamferCylinderTop(cyl(5, 20, 48), 5)
    expect(Math.abs(surfaceVolume(mesh))).toBeCloseTo((1 / 3) * Math.PI * 25 * 20, -1)
  })

  test("a taper of zero radius at the bottom also closes into a cone", () => {
    const mesh = chamferCylinderBottom(cyl(5, 20, 48), 5)
    expect(Math.abs(surfaceVolume(mesh))).toBeCloseTo((1 / 3) * Math.PI * 25 * 20, -1)
  })
})

describe("chamferBox", () => {
  const make = (size: number, d: number): BoxSolid => ({ _tag: "Box", origin: { x: 0, y: 0, z: 0 }, size: { x: size, y: size, z: size } })

  test("the volume is the chamfered cube, not an arbitrary bound", () => {
    // L³ minus the twelve edge wedges, plus back the eight corner tetrahedra
    // that the wedges remove three times over:
    //   centre (L−2d)³ + 6 slabs d(L−2d)² + 12 half-wedges ½d²(L−2d) + 8×(d³/3)
    const L = 10, d = 1
    const analytic = (L - 2 * d) ** 3 + 6 * d * (L - 2 * d) ** 2 + 6 * d * d * (L - 2 * d) + (8 * d ** 3) / 3
    const mesh = (() => {
      // chamferBox lives in the same module; import it directly.
      return chamferBoxOf(make(L, d), d)
    })()
    expect(Math.abs(surfaceVolume(mesh) - analytic)).toBeLessThan(0.05)
  })

  test("44 triangles: 6 faces × 2 + 12 edges × 2 + 8 corners × 1", () => {
    const mesh = chamferBoxOf(make(10, 1), 1)
    expect(mesh.indices.length / 3).toBe(44)
    expect(closedEdgeBalance(mesh)).toBe(0)
  })
})

// Local alias so the import list above stays about what the test needs.
import { chamferBox as chamferBoxOf } from "./surface.ts"
