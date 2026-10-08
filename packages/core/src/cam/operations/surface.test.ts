import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { Schema } from "effect"
import { makeProgram } from "../ir.ts"
import { buildPartModel } from "../model/model.ts"
import type { Stock, Tool } from "../tool.ts"
import { verifyToolpath } from "../verify/index.ts"
import { SurfaceParams, generateSurface, scallopSpacing } from "./surface.ts"
import { Surface, contour, cutterOf, nest, sampleNodes, simplify } from "./surface-field.ts"

// Finishing a surface samples tens of thousands of drop-cutter positions; a loaded machine needs room.
setDefaultTimeout(60000)

const ball = (d: number): Tool => ({ id: "b", name: "ball", kind: "ballnose", diameter: d, flutes: 2, maxRpm: 20000 })
const flat = (d: number): Tool => ({ id: "f", name: "flat", kind: "endmill", diameter: d, flutes: 2, maxRpm: 20000 })
const params = (extra: Record<string, unknown>) => Schema.decodeUnknownSync(SurfaceParams)({ totalDepth: 12, stepdown: 3, ...extra })
const stockAt = (x0: number, y0: number, x: number, y: number, z: number, top = 0): Stock => ({ x, y, z, origin: { x: x0, y: y0, z: top }, material: "aluminum" })
const moves = (r: ReturnType<typeof generateSurface>) => r.toolpath.moves.flatMap((m) => (m._tag === "Linear" || m._tag === "Rapid" ? [{ tag: m._tag, ...m.to }] : []))

/** A sphere of radius 10 whose top is at z = 0 (centre at -10): the textbook surface for a ball cutter. */
const sphere = () => buildPartModel([{ id: "s", type: "sphere", radius: 10, x: 0, y: 0, z: -10 }], { cell: 0.1, tolerance: 0.002 })!

describe("the drop-cutter", () => {
  test("a ball on a sphere sits exactly where geometry says", () => {
    const part = sphere()
    const surface = new Surface(part.grid, part.dexels.top(-Infinity))
    const cutter = cutterOf(ball(4))
    // Ball centre at distance R + r from the sphere's centre: tip = sqrt((R+r)^2 - rho^2) - r  (above the sphere's centre).
    const expected = (rho: number) => Math.sqrt(12 ** 2 - rho ** 2) - 2 - 10
    for (const rho of [0, 3, 6, 8]) {
      const tip = surface.tip(cutter, rho, 0)
      // The mesh is inscribed in the true sphere by at most its chord tolerance (0.002); the cell adds slope x half a cell above.
      expect(tip).toBeGreaterThanOrEqual(expected(rho) - 0.004)
      expect(tip - expected(rho)).toBeLessThan(0.08)
    }
    expect(surface.tip(cutter, 20, 0)).toBe(-Infinity)
  })

  test("a flat cutter touches the highest point under its face; a roughing allowance lifts and widens it", () => {
    const part = buildPartModel([{ type: "cube", width: 20, height: 20, depth: 10, z: -5 }], { cell: 0.1 })!
    const surface = new Surface(part.grid, part.dexels.top(-Infinity))
    const cutter = cutterOf(flat(6))
    expect(surface.tip(cutter, 0, 0)).toBeCloseTo(0, 6)
    // Just outside the edge, but with the cutter face still over it: the top of the box again.
    expect(surface.tip(cutter, 12, 0)).toBeCloseTo(0, 6)
    expect(surface.tip(cutter, 14, 0)).toBe(-Infinity)
    const fat = cutterOf(flat(6), 1)
    expect(surface.tip(fat, 0, 0)).toBeCloseTo(1, 6)
    // Grown by 1 mm all round with a rounded rim: 2 mm past the edge the face is still over the box (full lift), 3.5 mm out only
    // the rim is, and it is lifted less: 1 - (1 - sqrt(1 - 0.5^2)) = 0.866.
    expect(surface.tip(fat, 12, 0)).toBeCloseTo(1, 6)
    expect(Math.abs(surface.tip(fat, 13.5, 0) - 0.866)).toBeLessThan(0.03)
  })
})

describe("contour lines and their nesting", () => {
  test("a disc of radius 5 gives one loop of radius 5 with the forbidden side on its left", () => {
    const loops = contour((x, y) => (Math.hypot(x, y) < 5 ? 1 : 0), 0.5, { x0: -9, y0: -9, x1: 9, y1: 9 }, 0.5, false)
    expect(loops).toHaveLength(1)
    for (const p of loops[0]!) expect(Math.hypot(p.x, p.y)).toBeCloseTo(5, 2)
    // Forbidden (the disc) on the left means counter-clockwise.
    let area = 0
    const l = loops[0]!
    for (let i = 0; i < l.length; i++) { const p = l[i]!, q = l[(i + 1) % l.length]!; area += p.x * q.y - q.x * p.y }
    expect(area).toBeGreaterThan(0)
  })

  test("a ring-shaped feasible region nests an island inside its boundary", () => {
    const feasible = (x: number, y: number) => (Math.hypot(x, y) > 3 ? 0 : 1) // forbidden inside r = 3
    const nodes = sampleNodes(feasible, { x0: -10, y0: -10, x1: 10, y1: 10 }, 0.5)
    const loops = contour(feasible, 0.5, { x0: -10, y0: -10, x1: 10, y1: 10 }, 0.5, true, nodes)
    const groups = nest(loops)
    expect(groups).toHaveLength(1)
    expect(groups[0]!.islands).toHaveLength(1)
    expect(simplify(groups[0]!.islands[0]!, 0.01, true).length).toBeLessThan(groups[0]!.islands[0]!.length)
  })
})

describe("parallel finishing", () => {
  test("follows the sphere: never below the true drop-cutter surface, never far above it", () => {
    const part = sphere()
    const r = generateSurface(params({ strategy: "parallel", totalDepth: 11, stepdown: 11, scallop: 0.02, tolerance: 0.01 }), part, ball(4), stockAt(-12, -12, 24, 24, 12))
    const pts = moves(r).filter((m) => m.tag === "Linear" || m.z < 0)
    expect(r.stats.lines).toBeGreaterThan(20)
    let checked = 0
    for (const p of pts) {
      const rho = Math.hypot(p.x, p.y)
      if (rho > 8.5) continue
      const truth = Math.sqrt(12 ** 2 - rho ** 2) - 2 - 10
      expect(p.z).toBeGreaterThanOrEqual(truth - 0.015)
      expect(p.z).toBeLessThan(truth + 0.08)
      checked++
    }
    expect(checked).toBeGreaterThan(200)
    // Line spacing from the cusp height: 2 sqrt(2 R h - h^2) for R = 2, h = 0.02.
    expect(scallopSpacing(2, 0.02)).toBeCloseTo(2 * Math.sqrt(0.08 - 0.0004), 9)
  })

  test("the verifier finds no gouge against the sphere it was cut from", () => {
    const part = sphere()
    const r = generateSurface(params({ strategy: "parallel", totalDepth: 11, stepdown: 11, scallop: 0.05, tolerance: 0.01 }), part, ball(4), stockAt(-12, -12, 24, 24, 12))
    const report = verifyToolpath({
      program: makeProgram("sphere", [r.toolpath]),
      stock: { minX: -12, maxX: 12, minY: -12, maxY: 12, minZ: -12, maxZ: 0 },
      tool: { kind: "ballnose", diameter: 4 },
      target: { solids: [{ _tag: "Sphere", center: { x: 0, y: 0, z: -10 }, radius: 10, rings: 64 }] },
      tolerance: 0.1, resolution: 0.25, fixtures: []
    })
    expect(report.issues.filter((i) => i.code === "Gouge")).toEqual([])
    expect(report.issues.filter((i) => i.code === "ShankCollision" || i.code === "BelowStock")).toEqual([])
  })

  test("a rotated raster and one-way lines still follow the surface", () => {
    const part = sphere()
    const r = generateSurface(params({ strategy: "parallel", angle: 45, oneWay: true, totalDepth: 11, stepdown: 11, stepover: 20 }), part, ball(4), stockAt(-12, -12, 24, 24, 12))
    for (const p of moves(r).filter((m) => m.tag === "Linear")) {
      const rho = Math.hypot(p.x, p.y)
      if (rho > 9.5) continue
      expect(p.z).toBeGreaterThanOrEqual(Math.sqrt(12 ** 2 - rho ** 2) - 12 - 0.02)
    }
  })
})

describe("waterline finishing", () => {
  test("each level is a circle where the ball touches the sphere, run with the part on the left (climb)", () => {
    const part = sphere()
    const r = generateSurface(params({ strategy: "waterline", totalDepth: 9, stepdown: 3, tolerance: 0.005 }), part, ball(4), stockAt(-12, -12, 24, 24, 12))
    expect(r.stats.levels).toBe(3)
    for (const z of [-3, -6, -9]) {
      // Tip at z touches the sphere: ball centre at z + 2, distance 12 from the sphere's centre (0, 0, -10).
      const rho = Math.sqrt(12 ** 2 - (z + 2 + 10) ** 2)
      const onLevel = moves(r).filter((m) => m.tag === "Linear" && Math.abs(m.z - z) < 1e-9 && Math.hypot(m.x, m.y) > 0.5)
      expect(onLevel.length).toBeGreaterThan(8)
      // Never inside the sphere's reach (no gouge); at most half a cell of slope outside it.
      for (const p of onLevel) { expect(Math.hypot(p.x, p.y)).toBeGreaterThanOrEqual(rho - 0.01); expect(Math.hypot(p.x, p.y)).toBeLessThan(rho + 0.12) }
    }
    const ccw = (pts: Array<{ x: number; y: number }>) => { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i]!, q = pts[(i + 1) % pts.length]!; a += p.x * q.y - q.x * p.y } return a > 0 }
    expect(ccw(moves(r).filter((m) => m.tag === "Linear" && Math.abs(m.z + 3) < 1e-9))).toBe(true)
    const conventional = generateSurface(params({ strategy: "waterline", totalDepth: 3, stepdown: 3, climb: false }), part, ball(4), stockAt(-12, -12, 24, 24, 12))
    expect(ccw(moves(conventional).filter((m) => m.tag === "Linear" && Math.abs(m.z + 3) < 1e-9))).toBe(false)
  })
})

describe("roughing", () => {
  test("clears down around a boss without ever touching it, level by level", () => {
    // Boss: z from -8 to 0 at radius 8 on a base whose top is -8 ... modelled as a cylinder with its centre at -4.
    const part = buildPartModel([{ id: "boss", type: "cylinder", radius: 8, height: 8, x: 0, y: 0, z: -4 }], { cell: 0.25 })!
    const stock = stockAt(-25, -25, 50, 50, 12)
    const r = generateSurface(params({ strategy: "roughing", totalDepth: 8, stepdown: 2, stepover: 50 }), part, flat(6), stock)
    expect(r.stats.levels).toBe(4)
    const cuts = moves(r).filter((m) => m.tag === "Linear" && m.z < -0.5)
    expect(cuts.length).toBeGreaterThan(100)
    // The tool centre stays at least boss radius + tool radius from the axis while it is below the boss's top.
    for (const p of cuts) expect(Math.hypot(p.x, p.y)).toBeGreaterThanOrEqual(8 + 3 - 0.05)
    expect(Math.min(...cuts.map((p) => p.z))).toBeCloseTo(-8, 6)
  })

  test("leaves stock to leave on the walls and on a floor, and the verifier finds no gouge", () => {
    // A boss on a slab whose top is at z = -6.
    const part = buildPartModel([
      { id: "slab", type: "cube", width: 50, height: 50, depth: 6, x: 0, y: 0, z: -9 },
      { id: "boss", type: "cylinder", radius: 8, height: 8, x: 0, y: 0, z: -4 }
    ], { cell: 0.25 })!
    const stock = stockAt(-25, -25, 50, 50, 12)
    const r = generateSurface(params({ strategy: "roughing", totalDepth: 12, stepdown: 2, stepover: 50, allowance: 0.5 }), part, flat(6), stock)
    const cuts = moves(r).filter((m) => m.tag === "Linear" && m.z < -0.5)
    // Walls: the tool centre stays boss radius + tool radius + allowance from the axis once it is below the boss's top.
    for (const p of cuts.filter((c) => Math.hypot(c.x, c.y) < 20)) expect(Math.hypot(p.x, p.y)).toBeGreaterThanOrEqual(8 + 3 + 0.5 - 0.06)
    // Floor: the slab's top is at -6 (z -12 .. -6 is the slab), so a tool centre over the slab never goes below 0.5 above it.
    // (Beside the slab there is no part under the tool, and the stock there is cut to the bottom.)
    const overSlab = cuts.filter((c) => Math.abs(c.x) < 25 && Math.abs(c.y) < 25)
    expect(overSlab.length).toBeGreaterThan(50)
    expect(Math.min(...overSlab.map((p) => p.z))).toBeGreaterThan(-6 + 0.45)
    const report = verifyToolpath({
      program: makeProgram("rough", [r.toolpath]),
      stock: { minX: -25, maxX: 25, minY: -25, maxY: 25, minZ: -12, maxZ: 0 },
      tool: { kind: "endmill", diameter: 6 },
      target: { solids: [{ _tag: "Box", origin: { x: -25, y: -25, z: -12 }, size: { x: 50, y: 50, z: 6 } }, { _tag: "Cylinder", origin: { x: 0, y: 0, z: -8 }, radius: 8, height: 8, segments: 128 }] },
      tolerance: 0.1, resolution: 0.25, fixtures: []
    })
    expect(report.issues.filter((i) => i.code === "Gouge")).toEqual([])
  })

  test("an empty or unsupported model says so instead of emitting nothing silently", () => {
    const part = sphere()
    const r = generateSurface(params({ strategy: "parallel", totalDepth: 3, stepdown: 3 }), part, { ...ball(4), kind: "drill" }, stockAt(-12, -12, 24, 24, 12))
    expect(r.warnings.join(" ")).toContain("drill cannot machine a surface")
  })
})
