import { describe, expect, test } from "bun:test"
import { MeshDropCutter, meshDropCutter, type DropMesh } from "./mesh-drop-cutter.ts"
import { toolModel } from "../verify/tool-model.ts"
import { verifyTool } from "../kernel/cutters.ts"

const ballTool = (d: number) => ({ kind: "ballnose" as const, diameter: d })
const flatTool = (d: number) => ({ kind: "endmill" as const, diameter: d })
const bullTool = (d: number, r: number) => ({ kind: "endmill" as const, diameter: d, tipRadius: r })

/** Upper cap of a sphere of radius `Rs` centred at the origin, `seg` segments around, `rings` from the pole to the equator. */
const sphereCap = (Rs: number, seg: number, rings: number): DropMesh => {
  const pos: number[] = [0, 0, Rs]
  for (let i = 1; i <= rings; i++) {
    const phi = (Math.PI / 2) * (i / rings)
    for (let j = 0; j < seg; j++) pos.push(Rs * Math.sin(phi) * Math.cos((2 * Math.PI * j) / seg), Rs * Math.sin(phi) * Math.sin((2 * Math.PI * j) / seg), Rs * Math.cos(phi))
  }
  const idx: number[] = []
  for (let j = 0; j < seg; j++) idx.push(0, 1 + j, 1 + ((j + 1) % seg))
  for (let i = 1; i < rings; i++) for (let j = 0; j < seg; j++) {
    const a = 1 + (i - 1) * seg + j, b = 1 + (i - 1) * seg + ((j + 1) % seg), c = 1 + i * seg + j, d = 1 + i * seg + ((j + 1) % seg)
    idx.push(a, c, b, b, c, d)
  }
  return { positions: pos, indices: idx }
}

/** Cone with its apex up at (0, 0, H), 45 degree flanks down to radius H at z = 0. */
const cone = (H: number, seg: number): DropMesh => {
  const pos: number[] = [0, 0, H]
  for (let j = 0; j < seg; j++) pos.push(H * Math.cos((2 * Math.PI * j) / seg), H * Math.sin((2 * Math.PI * j) / seg), 0)
  const idx: number[] = []
  for (let j = 0; j < seg; j++) idx.push(0, 1 + j, 1 + ((j + 1) % seg))
  return { positions: pos, indices: idx }
}

/** A bumpy height-field mesh z = f(x, y) on an n x n lattice with step s. */
const bumps = (n: number, s: number): DropMesh => {
  const pos: number[] = []
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) pos.push(i * s, j * s, 2 * Math.sin(i * s * 0.7) * Math.cos(j * s * 0.5) + 0.3 * Math.sin(i * 1.3 + j))
  const idx: number[] = []
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const a = j * (n + 1) + i; idx.push(a, a + 1, a + n + 1, a + 1, a + n + 2, a + n + 1) }
  return { positions: pos, indices: idx }
}

describe("mesh drop-cutter (spec 69 F1)", () => {
  test("ball cutter on a sphere: the tip follows the offset sphere within the mesh chord error", () => {
    const Rs = 10, r = 3
    const mesh = sphereCap(Rs, 256, 128)
    const dc = meshDropCutter(mesh, ballTool(2 * r))
    // Inscribed mesh: facets lie at most R (1 - cos(half step)) under the sphere. Declared bound of the fixture.
    const chord = Rs * (1 - Math.cos(Math.PI / 256)) + Rs * (1 - Math.cos(Math.PI / 2 / 128 / 2)) + 1e-9
    for (const rho of [0, 1, 3, 5, 7, 8.5]) {
      const analytic = Math.sqrt((Rs + r) ** 2 - rho * rho) - r
      const got = dc.drop(rho, 0.3)
      const rho2 = Math.hypot(rho, 0.3)
      const exact = Math.sqrt((Rs + r) ** 2 - rho2 * rho2) - r
      void analytic
      expect(Math.abs(got - exact)).toBeLessThan(chord * 2)
      expect(got).toBeLessThanOrEqual(exact + 1e-9)
    }
  })

  test("flat cutter on a cone touches the nearest rim point: z = H - (rho - R)", () => {
    const H = 10, R = 2
    const dc = meshDropCutter(cone(H, 720), flatTool(2 * R))
    for (const rho of [3, 5, 7.5]) expect(Math.abs(dc.drop(rho, 0) - (H - (rho - R)))).toBeLessThan(2e-3)
    // Over the apex the flat tool rests on the point.
    expect(dc.drop(0, 0)).toBeCloseTo(H, 9)
  })

  test("ball cutter on an inclined plane sits r (sqrt 2 - 1) above the surface", () => {
    const plane: DropMesh = { positions: [-50, -50, -50, 50, -50, 50, 50, 50, 50, -50, 50, -50], indices: [0, 1, 2, 0, 2, 3] }
    const dc = meshDropCutter(plane, ballTool(8))
    for (const x of [-10, 0, 7]) expect(dc.drop(x, 3)).toBeCloseTo(x + 4 * (Math.SQRT2 - 1), 8)
    // A flat cutter on the same plane rests on its uphill rim: x + R.
    expect(meshDropCutter(plane, flatTool(8)).drop(0, 0)).toBeCloseTo(4, 8)
  })

  test("bull, ball and flat cutters equal a brute-force search over dense surface samples on a bumpy mesh", () => {
    const mesh = bumps(20, 1)
    const pos = mesh.positions, idx = mesh.indices
    for (const tool of [ballTool(3), flatTool(3), bullTool(4, 1), verifyTool({ id: "t", name: "t", kind: "tapered", diameter: 4, tipDiameter: 1, angle: 20, flutes: 2, material: "carbide", coating: "none", fluteLength: 20, shankDiameter: 6, stickout: 30 })]) {
      const m = toolModel(tool)
      const dc = meshDropCutter(mesh, tool)
      let worstUnder = 0
      for (const [x, y] of [[5.2, 5.1], [9.7, 3.3], [14.1, 12.6], [2.5, 16.4], [10, 10]] as const) {
        let brute = -Infinity
        for (let t = 0; t < idx.length / 3; t++) {
          const v = [0, 1, 2].map((c) => idx[t * 3 + c]! * 3)
          if (Math.min(...v.map((k) => Math.hypot(pos[k]! - x, pos[k + 1]! - y))) > m.radius + 2) continue
          const N = 48
          for (let a = 0; a <= N; a++) for (let b = 0; a + b <= N; b++) {
            const wa = a / N, wb = b / N, wc = 1 - wa - wb
            const px = wa * pos[v[0]!]! + wb * pos[v[1]!]! + wc * pos[v[2]!]!, py = wa * pos[v[0]! + 1]! + wb * pos[v[1]! + 1]! + wc * pos[v[2]! + 1]!, pz = wa * pos[v[0]! + 2]! + wb * pos[v[1]! + 2]! + wc * pos[v[2]! + 2]!
            const d = Math.hypot(px - x, py - y)
            if (d <= m.radius) brute = Math.max(brute, pz - (m.flat ? 0 : m.profile(d)))
          }
        }
        const got = dc.drop(x, y)
        // Exact contact is never lower than any sampled contact, and sampling (1/48 of a unit triangle) is within 2e-2 of it.
        expect(got).toBeGreaterThanOrEqual(brute - 1e-9)
        worstUnder = Math.max(worstUnder, got - brute)
      }
      expect(worstUnder).toBeLessThan(2e-2)
    }
  })

  test("a flat cutter drops onto a vertical wall's top edge, and nothing in reach gives -Infinity", () => {
    // A box top at z = 5 over x in [0, 10]; the flat tool centred 1.5 mm outside the wall with R = 2 still rests on it.
    const box: DropMesh = { positions: [0, 0, 5, 10, 0, 5, 10, 10, 5, 0, 10, 5], indices: [0, 1, 2, 0, 2, 3] }
    const dc = meshDropCutter(box, flatTool(4))
    expect(dc.drop(-1.5, 5)).toBeCloseTo(5, 9)
    expect(dc.drop(-2.5, 5)).toBe(-Infinity)
  })

  test("the BVH tests a small fraction of the triangles per query", () => {
    const mesh = bumps(80, 0.5)
    const dc = meshDropCutter(mesh, ballTool(2))
    for (let i = 0; i < 100; i++) dc.drop(2 + (i % 10) * 3.1, 2 + Math.floor(i / 10) * 3.1)
    expect(dc.triangles).toBe(80 * 80 * 2)
    expect(dc.tested / dc.queries).toBeLessThan(dc.triangles / 20)
  })

  test("the grid helper agrees with single drops and an empty mesh is safe", () => {
    const mesh = bumps(10, 1)
    const dc = meshDropCutter(mesh, ballTool(2))
    const g = dc.grid(1, 1, 4, 3, 2, 2)
    expect(g[1 * 4 + 2]).toBe(dc.drop(5, 3))
    expect(new MeshDropCutter({ positions: [], indices: [] }, { radius: 1, profile: () => 0 }).drop(0, 0)).toBe(-Infinity)
  })
})
