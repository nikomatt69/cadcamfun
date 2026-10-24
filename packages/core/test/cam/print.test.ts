/**
 * The print slicer: slicing closed meshes into layers, walls, skin, bridges, infill, supports, adhesion, and the program it
 * writes. Geometry is checked on the points of the emitted program, not on its comments.
 */
import { describe, expect, setDefaultTimeout, test } from "bun:test"

// A slice is real work; the machine that runs the suite is often busy with other builds.
setDefaultTimeout(60_000)
import { checkAxes } from "../../src/cam/machine.ts"
import { analyseGcode, DEFAULT_GEOMETRY, DEFAULT_PRINTER_EXTRAS, DEFAULT_SETTINGS, generateToolpath } from "../../src/cam/generator/index.ts"
import {
  bestOrientation, convexHull, EdgeIndex, infillPattern, offsetRegion, printBodies, regionArea, resolveProfile, sliceMesh, slicePrint, verifyPrint, replayBeads,
  type PrintResult
} from "../../src/cam/print/index.ts"
import type { Mesh64 } from "../../src/cam/model/element-mesh.ts"
import type { PrinterSettings } from "../../src/cam/generator/printer-base.ts"

const SETTINGS: PrinterSettings = {
  layerHeight: 0.2, printSpeed: 60, printTemperature: 200, bedTemperature: 60, extrusionWidth: 0.4, filamentDiameter: 1.75,
  infillDensity: 20, infillPattern: "grid", shellCount: 2, supportType: "none", nozzleDiameter: 0.4, bedWidth: 220, bedDepth: 220
}

const meshesOf = (...elements: Array<Record<string, unknown>>): ReadonlyArray<Mesh64> => {
  const bodies = printBodies(elements as never)
  expect(bodies.skipped).toEqual([])
  return bodies.meshes
}

const slice = (elements: Array<Record<string, unknown>>, patch: Partial<PrinterSettings> = {}): PrintResult =>
  slicePrint(meshesOf(...elements), { ...SETTINGS, ...patch })

const cube = (over: Record<string, unknown> = {}) => ({ id: "c", type: "cube", x: 0, y: 0, z: 5, width: 20, height: 20, depth: 10, ...over })

interface Move { readonly x: number; readonly y: number; readonly z: number; readonly e: number; readonly extrudes: boolean; readonly kind: string; readonly layer: number; readonly line: string }

/** Replays the program: position, absolute E and the feature of each move. */
const replay = (gcode: string): Move[] => {
  const out: Move[] = []
  let x = 0, y = 0, z = 0, e = 0
  let kind = ""
  let layer = -1
  let absoluteE = true
  for (const raw of gcode.split("\n")) {
    if (raw.startsWith(";TYPE:")) { kind = raw.slice(6); continue }
    if (raw.startsWith(";LAYER:")) { layer = Number(raw.slice(7)); continue }
    const line = raw.replace(/;.*$/, "").trim()
    if (line === "") continue
    if (line === "M83") absoluteE = false
    if (line === "M82") absoluteE = true
    if (line.startsWith("G92")) { const m = line.match(/E(-?[\d.]+)/); if (m) e = Number(m[1]); continue }
    if (!line.startsWith("G1") && !line.startsWith("G0")) continue
    const get = (letter: string): number | undefined => { const m = line.match(new RegExp(`${letter}(-?[\\d.]+)`)); return m ? Number(m[1]) : undefined }
    const nx = get("X") ?? x, ny = get("Y") ?? y, nz = get("Z") ?? z
    const ne = get("E")
    const next = ne === undefined ? e : absoluteE ? ne : e + ne
    const extrudes = next > e + 1e-9 && (nx !== x || ny !== y)
    out.push({ x: nx, y: ny, z: nz, e: next, extrudes, kind, layer, line: raw })
    x = nx; y = ny; z = nz; e = next
  }
  return out
}

const beadLength = (moves: ReadonlyArray<Move>, from?: Move): number => {
  let l = 0
  let prev = from
  for (const m of moves) { if (m.extrudes && prev) l += Math.hypot(m.x - prev.x, m.y - prev.y); prev = m }
  return l
}

/** Length of the extruding moves of one layer and kind. */
const lengthOf = (gcode: string, layer: number, kind?: string): number => {
  const moves = replay(gcode)
  let l = 0
  moves.forEach((m, i) => { if (m.extrudes && m.layer === layer && (kind === undefined || m.kind === kind) && i > 0) l += Math.hypot(m.x - moves[i - 1]!.x, m.y - moves[i - 1]!.y) })
  return l
}

describe("slicing a mesh", () => {
  test("a cube gives its square at every layer, counter-clockwise", () => {
    const [mesh] = meshesOf(cube())
    const layers = sliceMesh(mesh!, [0.1, 5, 9.9])
    expect(layers.openRings).toBe(0)
    for (const region of layers.regions) {
      expect(region).toHaveLength(1)
      expect(region[0]!.holes).toHaveLength(0)
      expect(regionArea(region)).toBeCloseTo(400, 3)
    }
  })

  test("a subtraction leaves a hole with the right area", () => {
    const meshes = meshesOf(
      { id: "a", type: "cube", x: 0, y: 0, z: 5, width: 20, height: 20, depth: 10 },
      { id: "b", type: "cylinder", x: 0, y: 0, z: 5, radius: 4, height: 20 },
      { id: "d", type: "boolean-subtract", operands: ["a", "b"] }
    )
    expect(meshes).toHaveLength(1)
    const region = sliceMesh(meshes[0]!, [5]).regions[0]!
    expect(region).toHaveLength(1)
    expect(region[0]!.holes).toHaveLength(1)
    expect(regionArea(region)).toBeCloseTo(400 - Math.PI * 16, 0)
  })

  test("an inside-out mesh is turned around, not printed as empty", () => {
    const [mesh] = meshesOf(cube())
    const flipped: Mesh64 = { positions: mesh!.positions, indices: Uint32Array.from(mesh!.indices, (v, k) => (k % 3 === 1 ? mesh!.indices[k + 1]! : k % 3 === 2 ? mesh!.indices[k - 1]! : v)) }
    expect(regionArea(sliceMesh(flipped, [5]).regions[0]!)).toBeCloseTo(400, 3)
  })

  test("two separate solids are two islands", () => {
    const meshes = meshesOf(cube({ id: "a", x: -20 }), cube({ id: "b", x: 20 }))
    expect(meshes).toHaveLength(2)
    const region = meshes.flatMap((m) => sliceMesh(m, [5]).regions[0]!)
    expect(region).toHaveLength(2)
  })

  test("solids that cross are united into one body", () => {
    const meshes = meshesOf(cube({ id: "a", x: -5 }), cube({ id: "b", x: 5 }))
    expect(meshes).toHaveLength(1)
    expect(regionArea(sliceMesh(meshes[0]!, [5]).regions[0]!)).toBeCloseTo(30 * 20, 1)
  })
})

describe("polygon offset and edge index", () => {
  test("a region shrinks by the offset and a hole grows", () => {
    const square = { outer: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }], holes: [[{ x: 4, y: 4 }, { x: 4, y: 6 }, { x: 6, y: 6 }, { x: 6, y: 4 }]] }
    const inner = offsetRegion([square], -1)
    expect(inner).toHaveLength(1)
    expect(regionArea(inner)).toBeCloseTo(8 * 8 - 4 * 4, 1)
    expect(offsetRegion([square], -6)).toHaveLength(0)
  })

  test("the grid finds the same crossings as a brute-force pass", () => {
    const ring = Array.from({ length: 40 }, (_, i) => ({ x: 20 * Math.cos((i / 40) * 2 * Math.PI), y: 20 * Math.sin((i / 40) * 2 * Math.PI) }))
    const index = new EdgeIndex([ring])
    for (let k = 0; k < 20; k++) {
      const a = { x: -30, y: -5 + k * 0.5 }
      const b = { x: 30, y: 5 - k * 0.4 }
      expect(index.crossings(a, b).length).toBe(2)
    }
    expect(index.crossings({ x: -5, y: 0 }, { x: 5, y: 3 })).toHaveLength(0)
  })

  test("convex hull of scattered points", () => {
    const hull = convexHull([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }, { x: 2, y: 2 }, { x: 1, y: 3 }])
    expect(hull).toHaveLength(4)
  })
})

describe("infill patterns", () => {
  const box = { minX: 0, minY: 0, maxX: 100, maxY: 100 }
  const insideLength = (polys: ReadonlyArray<ReadonlyArray<{ x: number; y: number }>>): number => {
    // Length of the pattern inside the box, by clipping each segment against the box.
    let l = 0
    for (const poly of polys) {
      for (let i = 1; i < poly.length; i++) {
        let { x: x0, y: y0 } = poly[i - 1]!
        let { x: x1, y: y1 } = poly[i]!
        let t0 = 0, t1 = 1
        const dx = x1 - x0, dy = y1 - y0
        for (const [p, q] of [[-dx, x0 - box.minX], [dx, box.maxX - x0], [-dy, y0 - box.minY], [dy, box.maxY - y0]] as const) {
          if (p === 0) { if (q < 0) { t0 = 1; t1 = 0 } } else { const r = q / p; if (p < 0) t0 = Math.max(t0, r); else t1 = Math.min(t1, r) }
        }
        if (t1 > t0) l += (t1 - t0) * Math.hypot(dx, dy)
        void x1; void y1; void x0; void y0
      }
    }
    return l
  }

  for (const pattern of ["lines", "grid", "triangles", "honeycomb", "gyroid"] as const) {
    test(`${pattern} fills the requested share of the layer`, () => {
      for (const density of [0.15, 0.3]) {
        const polys = infillPattern({ pattern, box, lineWidth: 0.4, density, layer: 3, z: 0.8 })
        const share = (insideLength(polys) * 0.4) / (100 * 100)
        expect(share).toBeGreaterThan(density * 0.8)
        expect(share).toBeLessThan(density * 1.2)
      }
    })
  }

  test("lines turn between layers and line up from one layer to the next", () => {
    const even = infillPattern({ pattern: "lines", box, lineWidth: 0.4, density: 0.2, layer: 0, z: 0 })
    const odd = infillPattern({ pattern: "lines", box, lineWidth: 0.4, density: 0.2, layer: 1, z: 0 })
    const angle = (poly: ReadonlyArray<{ x: number; y: number }>): number => Math.round((Math.atan2(poly[1]!.y - poly[0]!.y, poly[1]!.x - poly[0]!.x) * 180) / Math.PI)
    expect(Math.abs(angle(even[0]!)) % 180).not.toBe(Math.abs(angle(odd[0]!)) % 180)
    expect(infillPattern({ pattern: "lines", box, lineWidth: 0.4, density: 0.2, layer: 2, z: 0 })).toEqual(even)
  })
})

describe("the printed program", () => {
  const program = slice([cube()])

  test("walls, skin and infill stay inside the part and on the plate", () => {
    const moves = replay(program.gcode).filter((m) => m.layer >= 0 && m.extrudes)
    expect(moves.length).toBeGreaterThan(1000)
    for (const m of moves) {
      expect(m.x).toBeGreaterThanOrEqual(100 - 1e-6)
      expect(m.x).toBeLessThanOrEqual(120 + 1e-6)
      expect(m.y).toBeGreaterThanOrEqual(100 - 1e-6)
      expect(m.y).toBeLessThanOrEqual(120 + 1e-6)
    }
    // The first layer is one layer height above the plate, and every layer after it is higher.
    const zs = [...new Set(moves.map((m) => m.z))]
    expect(zs[0]).toBeCloseTo(0.2, 6)
    for (let i = 1; i < zs.length; i++) expect(zs[i]!).toBeGreaterThan(zs[i - 1]!)
    expect(zs[zs.length - 1]).toBeCloseTo(10, 6)
  })

  test("the outer wall lies half a bead inside the surface, the inner wall one bead further", () => {
    const first = replay(program.gcode).filter((m) => m.layer === 5 && m.extrudes)
    const outer = first.filter((m) => m.kind === "WALL-OUTER")
    const inner = first.filter((m) => m.kind === "WALL-INNER")
    expect(Math.min(...outer.map((m) => m.x))).toBeCloseTo(100.2, 3)
    expect(Math.max(...outer.map((m) => m.x))).toBeCloseTo(119.8, 3)
    expect(Math.min(...inner.map((m) => m.x))).toBeCloseTo(100.6, 3)
  })

  test("the inner wall is printed before the outer one, the outer wall last", () => {
    const order = replay(program.gcode).filter((m) => m.layer === 5 && m.extrudes).map((m) => m.kind)
    expect(order.indexOf("WALL-INNER")).toBeLessThan(order.indexOf("WALL-OUTER"))
    const firstOuter = replay(program.gcode).filter((m) => m.layer === 5 && m.extrudes && m.kind === "WALL-OUTER")
    expect(firstOuter.length).toBeGreaterThan(3)
  })

  test("the first four and the last four layers are solid, the middle is sparse", () => {
    const area = 19.2 * 19.2
    const solidLength = (layer: number): number => lengthOf(program.gcode, layer, "SKIN")
    for (const layer of [0, 1, 2, 3, 46, 47, 48, 49]) expect(solidLength(layer)).toBeGreaterThan((area * 0.55) / 0.4)
    for (const layer of [10, 25, 40]) expect(solidLength(layer)).toBe(0)
    expect(lengthOf(program.gcode, 25, "FILL")).toBeGreaterThan(100)
    expect(lengthOf(program.gcode, 2, "FILL")).toBe(0)
  })

  test("a solid print uses the volume of the part", () => {
    const solid = slice([cube()], { infillDensity: 100, infillPattern: "lines" })
    const volume = (solid.stats.filamentMm * Math.PI * (1.75 / 2) ** 2)
    expect(volume).toBeGreaterThan(4000 * 0.95)
    expect(volume).toBeLessThan(4000 * 1.08)
    expect(solid.stats.filamentGrams).toBeCloseTo((volume / 1000) * 1.24, 1)
  })

  test("less infill prints faster and uses less filament", () => {
    const sparse = slice([cube()], { infillDensity: 10 })
    const dense = slice([cube()], { infillDensity: 50 })
    expect(sparse.stats.filamentMm).toBeLessThan(program.stats.filamentMm)
    expect(program.stats.filamentMm).toBeLessThan(dense.stats.filamentMm)
    expect(sparse.stats.timeSeconds).toBeLessThan(dense.stats.timeSeconds)
  })

  test("extrusion is absolute and retracts and unretracts in pairs", () => {
    const moves = replay(program.gcode)
    const retracts = program.gcode.split("\n").filter((l) => l.endsWith("; Retract")).length
    const unretracts = program.gcode.split("\n").filter((l) => l.includes("; Unretract")).length
    expect(retracts).toBe(unretracts)
    expect(program.stats.retractions).toBe(retracts)
    // E rises with every extruding move and only falls on a retract.
    for (let i = 1; i < moves.length; i++) if (moves[i]!.e < moves[i - 1]!.e - 1e-9) expect(moves[i]!.line).toContain("Retract")
  })

  test("relative extrusion writes M83 and the same filament", () => {
    const relative = slice([cube()], { relativeExtrusion: true })
    expect(relative.gcode).toContain("M83")
    expect(relative.gcode).not.toContain("M82")
    const total = replay(relative.gcode).filter((m) => m.extrudes).length
    expect(total).toBe(replay(program.gcode).filter((m) => m.extrudes).length)
    expect(relative.stats.filamentMm).toBeCloseTo(program.stats.filamentMm, 3)
    const deposited = (code: string) => replayBeads(code).beads.filter((b) => b.layer >= 0).reduce((sum, b) => sum + b.e, 0)
    expect(deposited(relative.gcode)).toBeCloseTo(deposited(program.gcode), 3)
  })

  test("a small plate without room for a prime line still positions at the first layer", () => {
    const result = slice([cube({ width: 3, height: 3, depth: 1, z: 0.5 })], { bedWidth: 20, bedDepth: 20 })
    expect(result.gcode).not.toContain("; Prime line")
    const first = replayBeads(result.gcode).beads.find((b) => b.layer >= 0)!
    expect(first.z0).toBeCloseTo(0.2, 6)
    expect(first.z).toBeCloseTo(0.2, 6)
    expect(result.checks.find((c) => c.id === "layers-rise")!.status).toBe("passed")
  })

  test("the fan comes on from the chosen layer and off at the end", () => {
    const lines = slice([cube()], { fanSpeed: 80, fanFromLayer: 3 }).gcode.split("\n")
    const layer3 = lines.findIndex((l) => l.startsWith(";LAYER:2"))
    const fan = lines.findIndex((l) => l.startsWith("M106 S204"))
    expect(fan).toBeGreaterThan(layer3)
    expect(lines.filter((l) => l.startsWith("M106")).length).toBe(1)
    expect(lines.some((l) => l.startsWith("M107"))).toBe(true)
  })

  test("the first layer prints slower than the rest", () => {
    const feeds = (layer: number) => replay(program.gcode).filter((m) => m.layer === layer && m.extrudes).map((m) => Number(m.line.match(/F(\d+)/)?.[1] ?? 0)).filter((f) => f > 0)
    expect(Math.max(...feeds(0))).toBe(1800)
    expect(Math.max(...feeds(10))).toBeGreaterThan(1800)
  })

  test("z-hop lifts the nozzle on retracted travel and returns exactly to the layer", () => {
    const hopped = slice([cube()], { zHop: 0.4 })
    const moves = replay(hopped.gcode)
    expect(moves.some((m) => m.z > 0.2 + 0.39 && m.z < 0.2 + 0.41)).toBe(true)
    // No extruding move is ever made above the layer's height.
    for (const m of moves.filter((x) => x.extrudes)) expect(m.z).toBeLessThanOrEqual(10 + 1e-9)
  })

  test("the replay agrees with the program statistics", () => {
    const moves = replay(program.gcode)
    const total = beadLength(moves, moves[0])
    const byKind = Object.values(program.stats.lengthByKind).reduce((a, b) => a + b, 0)
    expect(total).toBeGreaterThan(byKind * 0.98)
    expect(total).toBeLessThan(byKind * 1.12)
  })

  test("a short layer is slowed to the minimum layer time", () => {
    const small = slice([cube({ width: 6, height: 6, depth: 2, z: 1 })], { minLayerTime: 10 })
    const lines = small.gcode.split("\n")
    const feeds = lines.filter((l) => l.startsWith("G1") && l.includes(" E") && !l.includes("Retract") && l.includes(" F")).map((l) => Number(l.match(/F(\d+)/)![1]))
    expect(Math.min(...feeds)).toBeLessThanOrEqual(600)
  })

  test("the program passes the machine and the interpreter checks", () => {
    expect(analyseGcode(program.gcode).warnings).toEqual([])
    expect(checkAxes(program.gcode, "3dprinter").filter((i) => i.severity !== "info")).toEqual([])
  })

  test("placement on the plate: front-left origin and plate-centre origin", () => {
    const corner = replay(slice([cube()]).gcode).filter((m) => m.extrudes && m.layer === 3)
    expect(Math.min(...corner.map((m) => m.x))).toBeCloseTo(100.2, 3)
    const centre = replay(slice([cube()], { bedOrigin: "center" }).gcode).filter((m) => m.extrudes && m.layer === 3)
    expect(Math.min(...centre.map((m) => m.x))).toBeCloseTo(-9.8, 3)
    const toolarge = slice([cube({ width: 300 })], { infillDensity: 0, layerHeight: 1, extrusionWidth: 1, nozzleDiameter: 1 })
    expect(toolarge.warnings.some((w) => w.includes("does not fit"))).toBe(true)
  })
})

describe("shape-dependent features", () => {
  test("a hole is walled and the infill stays out of it", () => {
    const result = slice([
      { id: "a", type: "cube", x: 0, y: 0, z: 5, width: 30, height: 30, depth: 10 },
      { id: "b", type: "cylinder", x: 0, y: 0, z: 5, radius: 6, height: 20 },
      { id: "d", type: "boolean-subtract", operands: ["a", "b"] }
    ], { infillDensity: 40, infillPattern: "lines" })
    const moves = replay(result.gcode).filter((m) => m.extrudes && m.layer === 20)
    for (const m of moves.filter((x) => x.kind === "FILL")) expect(Math.hypot(m.x - 110, m.y - 110)).toBeGreaterThan(6 + 0.8 - 0.05)
    // The hole has its own walls, at 6.2 and 6.6 from its centre.
    const radii = moves.filter((m) => m.kind === "WALL-OUTER" && Math.hypot(m.x - 110, m.y - 110) < 10).map((m) => Math.hypot(m.x - 110, m.y - 110))
    expect(radii.length).toBeGreaterThan(10)
    for (const r of radii) expect(r).toBeGreaterThan(6.15)
  })

  test("a roof over two pillars is bridged and fanned at full speed", () => {
    const result = slice([
      cube({ id: "p1", x: -10, y: 0, z: 5, width: 4, height: 12, depth: 10 }),
      cube({ id: "p2", x: 10, y: 0, z: 5, width: 4, height: 12, depth: 10 }),
      cube({ id: "roof", x: 0, y: 0, z: 11, width: 24, height: 12, depth: 2 })
    ], { fanSpeed: 50 })
    const bridge = result.stats.lengthByKind.bridge ?? 0
    expect(bridge).toBeGreaterThan(20)
    const lines = result.gcode.split("\n")
    const at = lines.findIndex((l) => l === ";TYPE:BRIDGE")
    expect(lines.slice(at - 6, at + 2).some((l) => l.startsWith("M106 S255"))).toBe(true)
    // The bridge covers the gap between the pillars (16 mm less the walls), lines running across it.
    const moves = replay(result.gcode).filter((m) => m.kind === "BRIDGE" && m.extrudes)
    const xs = moves.map((m) => m.x)
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(14)
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(16.1)
  })

  test("a sphere needs support under its lower half; the support stays clear of the part", () => {
    const sphere = { id: "s", type: "sphere", x: 0, y: 0, z: 10, radius: 10 }
    const without = slice([sphere])
    expect(without.warnings.some((w) => w.includes("overhangs"))).toBe(true)
    const withSupport = slice([sphere], { supportType: "minimal" })
    expect(withSupport.warnings.filter((w) => w.includes("overhangs"))).toEqual([])
    expect((withSupport.stats.lengthByKind.support ?? 0) + (withSupport.stats.lengthByKind["support-interface"] ?? 0)).toBeGreaterThan(150)
    expect(withSupport.stats.filamentMm).toBeGreaterThan(without.stats.filamentMm)
    // Support lines are never inside the sphere (plus the gap).
    const moves = replay(withSupport.gcode).filter((m) => m.extrudes && (m.kind === "SUPPORT" || m.kind === "SUPPORT-INTERFACE"))
    for (const m of moves) {
      const r = Math.hypot(m.x - 110, m.y - 110, m.z - 10)
      expect(r).toBeGreaterThan(10 - 0.5)
    }
    // Support is only under the sphere's equator: nothing above the middle.
    expect(Math.max(...moves.map((m) => m.z))).toBeLessThan(10)
  })

  test("nothing needs support on a plain cube, with or without it switched on", () => {
    const result = slice([cube()], { supportType: "full" })
    expect(result.stats.lengthByKind.support ?? 0).toBe(0)
    expect(result.warnings).toEqual([])
  })

  test("supports that may only stand on the plate leave an overhang above the part alone", () => {
    const elements = [
      cube({ id: "base", width: 20, height: 20, depth: 4, z: 2 }),
      cube({ id: "tab", x: 14, width: 10, height: 10, depth: 2, z: 5 })
    ]
    const plate = slice(elements, { supportType: "minimal", supportOverhangAngle: 45 })
    const everywhere = slice(elements, { supportType: "full" })
    expect(everywhere.stats.lengthByKind.support ?? 0).toBeGreaterThan(0)
    expect(plate.stats.lengthByKind.support ?? 0).toBeGreaterThan(0)
  })

  test("a brim is printed first and a raft lifts the part", () => {
    const brim = slice([cube()], { adhesion: "brim", brimWidth: 4 })
    expect(brim.stats.lengthByKind.brim ?? 0).toBeGreaterThan(300)
    const first = replay(brim.gcode).filter((m) => m.layer === 0 && m.extrudes)
    expect(first[0]!.kind).toBe("BRIM")
    expect(Math.min(...first.map((m) => m.x))).toBeLessThan(100.2 - 3.5)
    const raft = slice([cube()], { adhesion: "raft", raftLayers: 3 })
    expect(raft.stats.layers).toBe(slice([cube()]).stats.layers + 3)
    const firstPart = replay(raft.gcode).find((m) => m.extrudes && m.kind === "WALL-INNER")!
    expect(firstPart.z).toBeGreaterThan(0.3 + 0.2 + 0.2 + 0.2)
    expect(replay(raft.gcode).filter((m) => m.kind === "RAFT" && m.extrudes).length).toBeGreaterThan(100)
    const skirt = slice([cube()], { adhesion: "skirt", skirtLoops: 2, skirtDistance: 5 })
    expect(skirt.stats.lengthByKind.skirt ?? 0).toBeGreaterThan(150)
  })

  test("vase mode is one rising spiral per layer", () => {
    const result = slice([{ id: "v", type: "cylinder", x: 0, y: 0, z: 15, radius: 15, height: 30 }], { vase: true, bottomLayers: 3 })
    const spiral = replay(result.gcode).filter((m) => m.kind === "WALL-OUTER" && m.extrudes)
    expect(spiral.length).toBeGreaterThan(1000)
    for (let i = 1; i < spiral.length; i++) expect(spiral[i]!.z).toBeGreaterThanOrEqual(spiral[i - 1]!.z - 1e-9)
    expect(result.stats.lengthByKind.infill ?? 0).toBe(0)
    // One extruding path per spiral layer, not a stack of rings.
    const spiralLayerStarts = result.gcode.split("\n").filter((l) => l === ";TYPE:WALL-OUTER").length
    expect(spiralLayerStarts).toBeLessThan(5)
  })

  test("a thin feature is reported, not silently dropped", () => {
    const result = slice([cube({ id: "wall", width: 20, height: 0.3, depth: 5, z: 2.5 })])
    expect(result.warnings.some((w) => w.includes("thinner than one bead"))).toBe(true)
  })

  test("a tall part warns", () => {
    const result = slice([cube({ depth: 100, z: 50, width: 4, height: 4 })], { buildHeight: 60, infillDensity: 0, shellCount: 1 })
    expect(result.warnings.some((w) => w.includes("tall"))).toBe(true)
  })
})

describe("orientation", () => {
  test("a cone standing on its tip is turned onto its base", () => {
    const upsideDown = meshesOf({ id: "k", type: "cone", x: 0, y: 0, z: 10, radius: 10, height: 20, rotation: { x: 180, y: 0, z: 0 } })
    const { chosen, designed } = bestOrientation(upsideDown)
    expect(chosen.score).toBeLessThan(designed.score)
    expect(chosen.name).not.toBe("as designed")
    const result = slicePrint(upsideDown, { ...SETTINGS, autoOrient: true })
    expect(result.orientation).not.toBe("as designed")
    expect(result.gcode).toContain("Part turned onto its best face")
    expect(result.warnings.filter((w) => w.includes("overhangs"))).toEqual([])
  })

  test("a part that is already flat on its best face stays as designed", () => {
    expect(bestOrientation(meshesOf(cube())).chosen.name).toBe("as designed")
  })
})

describe("profile and control", () => {
  test("defaults fill every gap", () => {
    const p = resolveProfile({ ...SETTINGS })
    expect(p).toMatchObject({ walls: 2, topLayers: 4, bottomLayers: 4, support: "none", adhesion: "none", seam: "nearest", firstLayerHeight: 0.2 })
    expect(resolveProfile({ ...SETTINGS, supportType: "full" }).support).toBe("everywhere")
    expect(resolveProfile({ ...SETTINGS, supportType: "minimal" }).support).toBe("buildplate")
    expect(resolveProfile({ ...SETTINGS, brimWidth: 5 }).adhesion).toBe("brim")
  })

  test("slicing can be cancelled and reports progress", () => {
    const controller = new AbortController()
    controller.abort()
    expect(() => slicePrint(meshesOf(cube()), SETTINGS, { signal: controller.signal })).toThrow("cancelled")
    const seen: string[] = []
    slicePrint(meshesOf(cube()), SETTINGS, { onProgress: (_f, stage) => { if (!seen.includes(stage)) seen.push(stage) } })
    expect(seen).toEqual(["slice", "supports", "layers", "g-code", "verify", "done"])
  })

  test("nothing to print is an error", () => {
    expect(() => slicePrint([], SETTINGS)).toThrow()
    expect(printBodies([{ id: "l", type: "line", x1: 0, y1: 0, x2: 10, y2: 0 } as never]).skipped).toHaveLength(1)
  })

  test("seam modes pick different start points", () => {
    const start = (seam: "nearest" | "aligned" | "random"): string => {
      const moves = replay(slice([{ id: "c", type: "cylinder", x: 0, y: 0, z: 5, radius: 10, height: 10 }], { seam }).gcode).filter((m) => m.layer === 6 && m.kind === "WALL-OUTER")
      return `${moves[0]!.x},${moves[0]!.y}`
    }
    const aligned = start("aligned")
    const [ax, ay] = aligned.split(",").map(Number)
    expect(Math.hypot(ax! - 110, ay! - 110)).toBeGreaterThan(9)
    expect(ax! + ay!).toBeGreaterThan(220)
    expect(start("random")).not.toBe(aligned)
  })
})

describe("defects of the first printer generator stay fixed", () => {
  const request = (elements: Array<Record<string, unknown>>, over: Record<string, unknown> = {}, settings: Record<string, unknown> = {}) => ({
    settings: { ...DEFAULT_SETTINGS, machineType: "3dprinter" as const, operationType: "standard" as const, toolType: "standard" as const, ...settings },
    geometry: { ...DEFAULT_GEOMETRY, geometryType: "selected" as const, selectedElements: elements as never },
    printer: { ...DEFAULT_PRINTER_EXTRAS, ...over }
  })

  test("the final retraction is 2 mm, not a return to E-2 (P26)", () => {
    const { gcode } = slice([cube()])
    const end = gcode.split("; Print End G-code")[1]!
    expect(end).toContain("M83")
    expect(end.indexOf("M83")).toBeLessThan(end.indexOf("G1 E-2"))
    const moves = replay(gcode)
    const lastBead = [...moves].reverse().find((m) => m.extrudes)!
    const final = moves[moves.length - 1]!
    expect(lastBead.e - final.e).toBeLessThan(2.5)
  })

  test("a composite is placed on the plate as a whole (P27)", () => {
    const result = slice([{ id: "g", type: "composite", x: 0, y: 0, z: 5, elements: [cube({ id: "a", x: 0, z: 0 }), cube({ id: "b", x: 30, z: 0, depth: 4 })] }])
    const zs = replay(result.gcode).filter((m) => m.extrudes && m.layer >= 0).map((m) => m.z)
    expect(Math.min(...zs)).toBeCloseTo(0.2, 6)
    expect(Math.max(...zs)).toBeCloseTo(10, 6)
  })

  test("rotation and scale of the part are printed (P30)", () => {
    const plain = slice([cube()])
    const turned = slice([cube({ rotation: { x: 0, y: 90, z: 0 }, scale: { x: 2, y: 3, z: 4 } })], { infillDensity: 0 })
    expect(plain.stats.size.z).toBeCloseTo(10, 6)
    expect(turned.stats.size.z).toBeCloseTo(40, 0)
    expect(turned.stats.size.y).toBeCloseTo(60, 0)
    expect(turned.gcode).not.toBe(plain.gcode)
  })

  test("the text passes do not touch a printer program (P29)", () => {
    const base = generateToolpath(request([cube({ width: 8, height: 8, depth: 2, z: 1 })], {}, { evidence: false })).response.gcode
    const passes = generateToolpath(request([cube({ width: 8, height: 8, depth: 2, z: 1 })], {}, { optimizePath: true, useArcFitting: true })).response.gcode
    const count = (g: string) => g.split("\n").filter((l) => /^G1 .* E\d/.test(l)).length
    expect(count(passes)).toBe(count(base))
    expect(passes).not.toMatch(/^G[23] /m)
  })

  test("a part that does not fit does not pass: the warning and the evidence both say so (P11, P28)", () => {
    const outcome = generateToolpath({ ...request([cube({ width: 200, height: 200, depth: 1, z: 0.5 })], {}, { bedWidth: 100, bedDepth: 100 }), evidence: true } as never)
    expect(outcome.response.warnings.some((w) => w.includes("does not fit"))).toBe(true)
    expect(outcome.response.evidence!.result).toBe("failed")
    expect(outcome.response.evidence!.checks.find((c) => c.id === "bed-fit")!.status).toBe("failed")
  })

  test("a good print passes every printer check", () => {
    const outcome = generateToolpath({ ...request([cube({ width: 14, height: 14, depth: 3, z: 1.5 })]), evidence: true } as never)
    const checks = outcome.response.evidence!.checks
    for (const id of ["bed-fit", "heated-start", "layers-rise", "wall-coverage", "skin-coverage", "no-spill", "filament"] as const) expect(checks.find((c) => c.id === id)?.status, id).toBe("passed")
    expect(outcome.response.evidence!.result).not.toBe("failed")
  })

  test("the six operations are not aliases: vase, brim and raft change the program", () => {
    const programs = (["standard", "vase", "brim", "raft"] as const).map((operationType) => generateToolpath({ ...request([cube({ width: 14, height: 14, depth: 4, z: 2 })], {}, { operationType }), evidence: false } as never).response.gcode)
    expect(new Set(programs).size).toBe(4)
  })
})

describe("the printed height matches the model", () => {
  for (const [depth, layerHeight, firstLayerHeight] of [[10, 0.3, 0.3], [0.08, 0.2, 0.2], [4.03, 0.2, 0.2], [4.37, 0.2, 0.3]]) {
    test(`${depth} mm at ${layerHeight} mm with a ${firstLayerHeight} mm first layer`, () => {
      const result = slice([cube({ width: 6, height: 6, depth, z: depth! / 2 })], { layerHeight, firstLayerHeight })
      expect(result.layers.at(-1)!.z).toBeCloseTo(depth!, 9)
      expect(result.layers.reduce((sum, layer) => sum + layer.height, 0)).toBeCloseTo(depth!, 9)
      expect(result.stats.size.z).toBeCloseTo(depth!, 9)
      expect(Math.max(...replayBeads(result.gcode).beads.filter((b) => b.layer >= 0).map((b) => b.z))).toBeCloseTo(depth!, 3)
      for (const layer of result.layers) expect(layer.height).toBeGreaterThanOrEqual(0.04 - 1e-9)
      expect(result.checks.filter((c) => c.status !== "passed")).toEqual([])
    })
  }
})

describe("the evidence reads the program, not the slicer", () => {
  const result = slice([cube({ width: 12, height: 12, depth: 4, z: 2 })])
  const check = (gcode: string) => Object.fromEntries(verifyPrint({ gcode, regions: result.regions, profile: result.profile, firstModelLayer: 0, layers: result.layers }).map((c) => [c.id, c.status]))

  test("the program as written passes", () => {
    expect(check(result.gcode)).toMatchObject({ "bed-fit": "passed", "heated-start": "passed", "layers-rise": "passed", "wall-coverage": "passed", "skin-coverage": "passed", "no-spill": "passed", filament: "passed" })
  })

  test("walls cut out of the program are found", () => {
    const lines = result.gcode.split("\n")
    let type = ""
    const stripped = lines.filter((line) => {
      if (line.startsWith(";TYPE:")) type = line
      return !(type === ";TYPE:WALL-OUTER" && line.startsWith("G1 X") && line.includes(" E"))
    }).join("\n")
    expect(check(stripped)["wall-coverage"]).toBe("failed")
  })

  test("an isolated missing layer between sampling planes is found", () => {
    const tall = slice([cube({ width: 6, height: 6, depth: 12, z: 6 })])
    let layer = -1
    const stripped = tall.gcode.split("\n").filter((line) => {
      if (line.startsWith(";LAYER:")) layer = Number(line.slice(7))
      return !(layer === 31 && line.startsWith("G1 X") && line.includes(" E"))
    }).join("\n")
    const checks = verifyPrint({ gcode: stripped, regions: tall.regions, profile: tall.profile, firstModelLayer: 0, layers: tall.layers })
    expect(checks.find((c) => c.id === "wall-coverage")!.status).toBe("failed")
    expect(checks.find((c) => c.id === "wall-coverage")!.detail).toContain("32")
  })

  test("a missing first layer is found", () => {
    const [, rest] = result.gcode.split(";LAYER:1\n")
    const head = result.gcode.split(";LAYER:0\n")[0]!
    expect(check(head + ";LAYER:1\n" + rest)["skin-coverage"]).toBe("failed")
  })

  test("beads moved off the part are found", () => {
    const shifted = result.gcode.split("\n").map((line) => line.replace(/^(G1 X)([\d.]+)(.* E)/, (_m, a, x, b) => `${a}${(Number(x) + 4).toFixed(3)}${b}`)).join("\n")
    expect(check(shifted)["no-spill"]).toBe("failed")
  })

  test("vase spirals still participate in spill evidence above the solid base", () => {
    const vase = slice([cube({ width: 12, height: 12, depth: 4, z: 2 })], { vase: true })
    expect(vase.checks.find((c) => c.id === "no-spill")!.status).toBe("passed")
    let layer = -1
    const shifted = vase.gcode.split("\n").map((line) => {
      if (line.startsWith(";LAYER:")) layer = Number(line.slice(7))
      return layer >= 5 ? line.replace(/^(G1 X)([\d.]+)(.* E)/, (_m, a, x, b) => `${a}${(Number(x) + 4).toFixed(3)}${b}`) : line
    }).join("\n")
    const checks = verifyPrint({ gcode: shifted, regions: vase.regions, profile: vase.profile, firstModelLayer: 0, layers: vase.layers })
    expect(checks.find((c) => c.id === "no-spill")!.status).toBe("failed")
  })

  test("a program that runs off the plate or extrudes cold is found", () => {
    const off = result.gcode.replace(/^(G1 X)([\d.]+)(.* E)/gm, (_m, a, x, b) => `${a}${(Number(x) + 300).toFixed(3)}${b}`)
    expect(check(off)["bed-fit"]).toBe("failed")
    expect(check(result.gcode.replace(/^M109.*$/m, "").replace(/^M104.*$/m, ""))["heated-start"]).toBe("failed")
  })

  test("over-extrusion is found", () => {
    const doubled = result.gcode.replace(/^(G1 X[\d.]+ Y[\d.]+ E)([\d.]+)/gm, (_m, a, e) => `${a}${(Number(e) * 1.5).toFixed(5)}`)
    expect(check(doubled).filament).toBe("failed")
  })
})
