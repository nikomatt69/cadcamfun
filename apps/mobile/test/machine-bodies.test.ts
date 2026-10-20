import { describe, expect, test } from "bun:test"
import type { PreviewBody, PreviewCutter, PreviewMachine } from "@cadcamfun/api"
import {
  ASSUMED_BODY_ALPHA,
  BODY_COLOR,
  PREVIEW_MAX_SOLID_TRIANGLES,
  SOLID_VERTEX_FLOATS,
  bodyEdges,
  prepareCutterSolid,
  prepareMachineSolids,
  toolGlyphLines,
} from "../lib/machine-bodies"
import { MACHINE_GLYPH_MAX_VERTICES, PREVIEW_MESSAGE } from "../lib/preview-scene"

const machine = (overrides: Partial<PreviewMachine> = {}): PreviewMachine => ({
  kind: "mill",
  source: "kernel",
  axes: 3,
  turns: "the tool turns, the part is clamped",
  workholding: "vise",
  assumed: [],
  bodies: [],
  spin: [],
  collisions: [],
  tool: { family: "mill", diameter: 6, width: 0, noseRadius: 0, insert: "", internal: false },
  ...overrides,
})

const boxBody = (id: string, role: PreviewBody["role"], overrides: Partial<PreviewBody> = {}): PreviewBody => ({
  id,
  role,
  shape: { type: "box", min: { x: -10, y: -5, z: -6 }, max: { x: 10, y: 5, z: 0 } },
  spins: false,
  assumed: false,
  obstacle: true,
  ...overrides,
})

const cylinderBody = (id: string, role: PreviewBody["role"], radius = 10, inner = 0): PreviewBody => ({
  id,
  role,
  shape: { type: "cylinder-x", x0: 0, x1: 40, radius, inner },
  spins: true,
  assumed: false,
  obstacle: true,
})

/** Floats of one solid vertex: xyz, normal xyz, rgba. */
const vertexAt = (vertices: Float32Array, index: number): number[] =>
  Array.from(vertices.slice(index * SOLID_VERTEX_FLOATS, (index + 1) * SOLID_VERTEX_FLOATS)).map((value) => Math.round(value * 1e5) / 1e5)

describe("machine bodies as GPU buffers", () => {
  test("no machine is an empty payload, never a fault", () => {
    const solids = prepareMachineSolids(undefined)
    expect(solids.solids.indices.length).toBe(0)
    expect(solids.solids.vertices.length).toBe(0)
    expect(solids.spindle.indices.length).toBe(0)
    expect(solids.wire).toEqual([])
  })

  test("a box solid tessellates inside its bounds, with unit normals, valid indices and its role's colour", () => {
    const scene = machine({ bodies: [boxBody("table", "table")] })
    const { solids, wire } = prepareMachineSolids(scene)
    expect(solids.indices.length / 3).toBe(12)
    expect(solids.opaqueTriangles).toBe(12)
    const count = solids.vertices.length / SOLID_VERTEX_FLOATS
    expect(count).toBe(24)
    for (let vertex = 0; vertex < count; vertex++) {
      const [x, y, z, nx, ny, nz, ...rgba] = vertexAt(solids.vertices, vertex) as number[]
      expect(x!).toBeGreaterThanOrEqual(-10)
      expect(x!).toBeLessThanOrEqual(10)
      expect(y!).toBeGreaterThanOrEqual(-5)
      expect(y!).toBeLessThanOrEqual(5)
      expect(z!).toBeGreaterThanOrEqual(-6)
      expect(z!).toBeLessThanOrEqual(0)
      expect(Math.hypot(nx!, ny!, nz!)).toBeCloseTo(1, 5)
      expect(rgba).toEqual([...BODY_COLOR.table, 1])
    }
    for (const index of solids.indices) expect(index).toBeLessThan(count)
    expect(wire).toEqual([])
  })

  test("an assumed body is translucent and drawn after the opaque ones", () => {
    const scene = machine({ bodies: [boxBody("table", "table"), boxBody("vise-base", "vise-base", { assumed: true })], assumed: ["workholding"] })
    const { solids } = prepareMachineSolids(scene)
    expect(solids.indices.length / 3).toBe(24)
    expect(solids.opaqueTriangles).toBe(12)
    // The first translucent body's first vertex, after the table's 24.
    expect(vertexAt(solids.vertices, 24)[9]).toBeCloseTo(ASSUMED_BODY_ALPHA, 5)
    expect(solids.indices[0]).toBeLessThan(24)
    expect(solids.indices[36]).toBeGreaterThanOrEqual(24)
  })

  test("a body that spins goes into the spindle buffer, not the static one", () => {
    const scene = machine({ kind: "lathe", bodies: [cylinderBody("chuck", "chuck"), boxBody("tailstock", "tailstock", { obstacle: false })] })
    const { solids, spindle } = prepareMachineSolids(scene)
    expect(spindle.indices.length / 3).toBeGreaterThan(0)
    expect(spindle.opaqueTriangles).toBe(spindle.indices.length / 3)
    expect(solids.indices.length / 3).toBe(12)
    expect(spindle.vertices.length).toBeGreaterThan(0)
  })

  test("a wire body is outline only", () => {
    const scene = machine({ bodies: [boxBody("stock", "stock", { obstacle: false, wire: true })] })
    const { solids, wire } = prepareMachineSolids(scene)
    expect(solids.indices.length).toBe(0)
    expect(wire).toHaveLength(12)
    expect(wire[0]!.color).toEqual(BODY_COLOR.stock)
  })

  test("a body with a rotateX turns its outline too", () => {
    const body = boxBody("jaw-1", "jaw", {
      shape: { type: "box", min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } },
      rotateX: Math.PI / 2,
    })
    const edges = bodyEdges(body)
    expect(edges).toHaveLength(12)
    for (const edge of edges) {
      for (const point of [edge.from, edge.to]) {
        expect(point[1]!).toBeLessThanOrEqual(1e-9)
        expect(point[1]!).toBeGreaterThanOrEqual(-1 - 1e-9)
        expect(point[2]!).toBeGreaterThanOrEqual(-1e-9)
        expect(point[2]!).toBeLessThanOrEqual(1 + 1e-9)
      }
    }
  })

  test("an oversized machine scene is refused whole", () => {
    // A bore cylinder costs 480 triangles; 400 is a safe lower bound, so this scene is certainly past the cap.
    const count = Math.ceil(PREVIEW_MAX_SOLID_TRIANGLES / 400) + 1
    const scene = machine({ bodies: Array.from({ length: count }, (_, index) => cylinderBody(`chuck-${index}`, "chuck", 30, 10)) })
    expect(() => prepareMachineSolids(scene)).toThrow(PREVIEW_MESSAGE.machineTooLarge)
  })
})

describe("the cutter at the playhead (preview format 4)", () => {
  const cutter = (overrides: Partial<PreviewCutter> = {}): PreviewCutter => ({
    diameter: 6,
    fluteLength: 18,
    shankDiameter: 6,
    stickout: 34,
    noseRadius: 0,
    holder: { diameter: 32, length: 40, kind: "shrink", assumed: false },
    ...overrides,
  })

  test("the real tool stands on the tip: its flute, its shank and its holder", () => {
    const solid = prepareCutterSolid(cutter(), [10, 20, -5])
    const count = solid.vertices.length / SOLID_VERTEX_FLOATS
    expect(count).toBeGreaterThan(0)
    expect(solid.indices.length / 3).toBeGreaterThan(0)
    for (const index of solid.indices) expect(index).toBeLessThan(count)
    let minZ = Infinity
    let maxZ = -Infinity
    let maxRadius = 0
    for (let vertex = 0; vertex < count; vertex++) {
      const [x, y, z] = vertexAt(solid.vertices, vertex) as number[]
      minZ = Math.min(minZ, z!)
      maxZ = Math.max(maxZ, z!)
      maxRadius = Math.max(maxRadius, Math.hypot(x! - 10, y! - 20))
    }
    // The tip is the tip of the move, the top is the holder's face plus the holder.
    expect(minZ).toBeCloseTo(-5, 4)
    expect(maxZ).toBeCloseTo(-5 + 34 + 40, 4)
    // The widest part is the holder, not the cutter.
    expect(maxRadius).toBeCloseTo(16, 4)
  })

  test("a ball nose starts at a point and a flat cutter has a face", () => {
    const ball = prepareCutterSolid(cutter({ noseRadius: 2 }), [0, 0, 0])
    const flat = prepareCutterSolid(cutter(), [0, 0, 0])
    const count = (solid: typeof ball) => solid.vertices.length / SOLID_VERTEX_FLOATS
    // The nose replaces the first millimetres of the flute with a cone: fewer vertices, not more.
    expect(count(ball)).toBeGreaterThan(0)
    expect(count(flat)).toBeGreaterThan(0)
    const radiusAt = (solid: typeof ball, z: number): number => {
      let out = 0
      for (let vertex = 0; vertex < count(solid); vertex++) {
        const [x, y, zz] = vertexAt(solid.vertices, vertex) as number[]
        if (Math.abs(zz! - z) < 1e-4) out = Math.max(out, Math.hypot(x!, y!))
      }
      return out
    }
    expect(radiusAt(ball, 0)).toBeCloseTo(0, 5)
    expect(radiusAt(ball, 2)).toBeCloseTo(3, 5)
    expect(radiusAt(flat, 0)).toBeCloseTo(3, 5)
  })
})

describe("machine tool glyph", () => {
  const glyph = (family: "mill" | "lathe" | "nozzle", turret?: "rear" | "front") =>
    ({ family, diameter: family === "nozzle" ? 0.4 : 6, width: 3, noseRadius: 0.4, insert: "turning", internal: false, ...(turret ? { turret } : {}) })

  test("a mill keeps the wireframe marker: no extra glyph lines", () => {
    expect(toolGlyphLines([0, 0, 0], glyph("mill"), 5, [1, 1, 1])).toEqual([])
  })

  test("a lathe insert points at its turret side and stays within the active-line cap", () => {
    const rear = toolGlyphLines([10, 0, -1], glyph("lathe", "rear"), 5, [1, 1, 1])
    const front = toolGlyphLines([10, 0, -1], glyph("lathe", "front"), 5, [1, 1, 1])
    expect(rear).toHaveLength(9)
    expect(front).toHaveLength(9)
    for (const line of rear) {
      expect(line.from[2]).toBeGreaterThanOrEqual(-1 - 1e-9)
      expect(line.to[2]).toBeGreaterThanOrEqual(-1 - 1e-9)
      expect(line.to[2]).toBeLessThanOrEqual(3 + 1e-9)
    }
    for (const line of front) {
      expect(line.from[2]).toBeLessThanOrEqual(-1 + 1e-9)
      expect(line.to[2]).toBeLessThanOrEqual(-1 + 1e-9)
      expect(line.to[2]).toBeGreaterThanOrEqual(-5 - 1e-9)
    }
    for (const line of [...rear, ...front]) {
      for (const point of [line.from, line.to]) {
        expect(point[0]).toBeGreaterThanOrEqual(10 - 1.5 - 1e-9)
        expect(point[0]).toBeLessThanOrEqual(10 + 1.5 + 1e-9)
      }
      expect(line.color).toEqual([1, 1, 1])
    }
    expect(rear.length * 2).toBeLessThanOrEqual(MACHINE_GLYPH_MAX_VERTICES)
  })

  test("a printer nozzle is a ring at its diameter and the largest glyph the phone allows", () => {
    const lines = toolGlyphLines([0, 0, 10], glyph("nozzle"), 6, [1, 1, 1])
    expect(lines.length * 2).toBe(MACHINE_GLYPH_MAX_VERTICES)
    expect(MACHINE_GLYPH_MAX_VERTICES).toBe(42)
    const top = 10 + Math.max(6, 3)
    for (const line of lines) {
      expect(line.from[2]).toBeGreaterThanOrEqual(10 - 1e-9)
      expect(line.from[2]).toBeLessThanOrEqual(top + 0.5)
      expect(line.to[2]).toBeGreaterThanOrEqual(10 - 1e-9)
      expect(line.to[2]).toBeLessThanOrEqual(top + 0.5)
      if (line.from[2] === top && line.to[2] === top) expect(Math.hypot(line.from[0], line.from[1])).toBeCloseTo(0.5, 5)
    }
  })
})
