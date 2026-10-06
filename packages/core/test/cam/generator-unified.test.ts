/**
 * A `component` is machined as one unified geometry (legacy `unifiedGeometryCalculator`): every member is sliced at the
 * same Z levels and the slices are contoured together, nearest member first. Expected values are worked out by hand
 * from the legacy code; where the port deliberately differs the test says why.
 */
import { describe, expect, test } from "bun:test"
import {
  DEFAULT_GEOMETRY,
  DEFAULT_PRINTER_EXTRAS,
  DEFAULT_SETTINGS,
  generateToolpath,
  type GeometryInput,
  type ToolpathSettings
} from "../../src/cam/generator/index.ts"
import {
  calculate3DComponentDetails,
  calculateComponentDimensions,
  calculateElementDimensions,
  calculateElementZLevelIntersection,
  calculateMeshZIntersection,
  calculateZLevels,
  combineElementDimensions,
  convertToolpathToGcode,
  isUnifiedSolid,
  type Component3D
} from "../../src/cam/generator/unified-geometry.ts"

const settings = (patch: Partial<ToolpathSettings> = {}): ToolpathSettings => ({ ...DEFAULT_SETTINGS, offset: "center", depth: 2, ...patch })
const geometry = (patch: Partial<GeometryInput> = {}): GeometryInput => ({ ...DEFAULT_GEOMETRY, ...patch })

const component = (members: Array<Record<string, any>>, extra: Record<string, any> = {}): Record<string, any> =>
  ({ type: "component", id: "c", x: 0, y: 0, z: 0, ...extra, elements: members })

const mill = (members: Array<Record<string, any>>, patch: Partial<ToolpathSettings> = {}, extra: Record<string, any> = {}, geo: Partial<GeometryInput> = {}): string =>
  generateToolpath({
    settings: settings(patch),
    geometry: geometry({ geometryType: "selected", selectedElements: [component(members, extra)], ...geo }),
    printer: DEFAULT_PRINTER_EXTRAS
  }).response.gcode

const twoCylinders = [
  { type: "cylinder", x: -20, y: 0, z: -5, radius: 5, height: 10 },
  { type: "cylinder", x: 20, y: 0, z: -5, radius: 3, height: 10 }
]

describe("component as unified geometry", () => {
  test("members share the Z levels and are contoured nearest first, joined by lifts and rapids", () => {
    const text = mill(twoCylinders)
    // Group top Z0, depth 2 / stepdown 1 -> levels -1 and -2 (legacy cut a first pass at Z0, in the air).
    expect(text).toContain("; Component 1/1: 2 member(s) as one unified geometry\n; Unified mesh toolpath\n")
    // Box: x -25..23 (48), z -10..0 (height 10), y -5..5 (depth 10), centre (-1, 0, -5).
    expect(text).toContain("; Bounding box: width=48.000, height=10.000, depth=10.000\n; Center: (-1.000, 0.000, -5.000)\n")
    // First member: start angle 0 -> (cx + r, cy); rapid 5 mm above the level, plunge at the plunge rate, then the
    // full clockwise circle of a climb cut (I = centre - start = -r).
    expect(text).toContain(
      "; Z Level: -1.000\n" +
      "G0 X-15.000 Y0.000 Z4.000 ; Rapid move\n" +
      "G1 X-15.000 Y0.000 Z-1.000 F300 ; Plunge move\n" +
      "G2 X-15.000 Y0.000 Z-1.000 I-5.000 J0.000 F800 ; Clockwise circular move\n"
    )
    // Second member (index 1 -> start angle 45 deg): 37 mm away (> 1.5 x tool) -> lift to half the safe height,
    // rapid across, plunge; F only where the feed changes.
    expect(text).toContain(
      "G1 X-15.000 Y0.000 Z1.500 F300 ; Plunge move\n" +
      "G0 X22.121 Y2.121 Z1.500 ; Rapid move\n" +
      "G1 X22.121 Y2.121 Z-1.000 ; Plunge move\n" +
      "G2 X22.121 Y2.121 Z-1.000 I-2.121 J-2.121 F800 ; Clockwise circular move\n"
    )
    expect(text).toContain("; Z Level: -2.000\nG0 X-15.000 Y0.000 Z3.000 ; Rapid move\n")
    expect(text).not.toContain("; Z Level: 0.000")
    expect(text).not.toContain("; Z Level: -3.000")
  })

  test("the component's own position is applied once and the members' places follow it", () => {
    const text = mill(twoCylinders, {}, { x: 100, y: 50 })
    // Legacy added the component position twice (members at 100 + 100). Once: -20 + 100 = 80, radius 5 -> start X85.
    expect(text).toContain("G0 X85.000 Y50.000 Z4.000 ; Rapid move")
    expect(text).not.toContain("X185.000")
  })

  test("overlapping members are not merged: each keeps its own contour (the legacy boolean step is a no-op)", () => {
    const text = mill([
      { type: "cylinder", x: 0, y: 0, z: -5, radius: 5, height: 10 },
      { type: "cylinder", x: 4, y: 0, z: -5, radius: 5, height: 10 }
    ], { depth: 1 })
    expect(text.match(/^G2 /gm)).toHaveLength(2)
  })

  test("a rectangle is cut inside the tool offset: outside grows it, inside shrinks it (legacy grew it for both)", () => {
    const plate = [{ type: "cube", x: 0, y: 0, z: -2, width: 20, height: 10, depth: 4 }]
    // Tool Ø6: outside -> 26 x 16, start (-13, -8); inside -> 14 x 4, start (-7, -2). Corners run counter-clockwise from the start.
    const outside = mill(plate, { offset: "outside", depth: 1 })
    expect(outside).toContain(
      "G0 X-13.000 Y-8.000 Z4.000 ; Rapid move\n" +
      "G1 X-13.000 Y-8.000 Z-1.000 F300 ; Plunge move\n" +
      "G1 X13.000 Y-8.000 Z-1.000 F800 ; Linear move\n" +
      "G1 X13.000 Y8.000 Z-1.000 ; Linear move\n" +
      "G1 X-13.000 Y8.000 Z-1.000 ; Linear move\n" +
      "G1 X-13.000 Y-8.000 Z-1.000 ; Linear move\n"
    )
    const inside = mill(plate, { offset: "inside", depth: 1 })
    expect(inside).toContain("G0 X-7.000 Y-2.000 Z4.000 ; Rapid move")
    expect(inside).toContain("G1 X7.000 Y-2.000 Z-1.000 F800 ; Linear move")
    // Conventional milling runs the same outline the other way round.
    const conventional = mill(plate, { direction: "conventional", depth: 1 })
    expect(conventional).toContain("G0 X-10.000 Y-5.000 Z4.000 ; Rapid move\nG1 X-10.000 Y-5.000 Z-1.000 F300 ; Plunge move\nG1 X-10.000 Y5.000 Z-1.000 F800 ; Linear move\n")
  })

  test("a sphere is sliced at each level: r = sqrt(R^2 - dz^2)", () => {
    // R 10 centred at Z-10 (top at Z0); at Z-1, dz = 9 -> sqrt(19) = 4.359; at Z-2, dz = 8 -> sqrt(36) = 6.
    const text = mill([{ type: "sphere", x: 0, y: 0, z: -10, radius: 10 }])
    expect(text).toContain("; Z Level: -1.000\nG0 X4.359 Y0.000 Z4.000 ; Rapid move\nG1 X4.359 Y0.000 Z-1.000 F300 ; Plunge move\nG2 X4.359 Y0.000 Z-1.000 I-4.359 J0.000 F800 ; Clockwise circular move\n")
    expect(text).toContain("; Z Level: -2.000\nG0 X6.000 Y0.000 Z3.000 ; Rapid move\n")
  })

  test("flat members are extruded by the job depth from their own Z; members it cannot slice are machined on their own", () => {
    const text = mill([
      { type: "circle", x: 0, y: 0, z: 0, radius: 5 },
      { type: "line", x1: 10, y1: 0, x2: 20, y2: 0 }
    ])
    // Legacy: a circle is not a type it knows -> nothing was machined.
    expect(text).toContain("; Z Level: -1.000\nG0 X5.000 Y0.000 Z4.000 ; Rapid move\n")
    expect(text).toContain("G2 X5.000 Y0.000 Z-1.000 I-5.000 J0.000 F800 ; Clockwise circular move")
    // The line has no volume to slice: it keeps its own generator.
    expect(text).toContain("; Line: from (10, 0) to (20, 0)")
  })

  test("a prism and a mesh get a closed polygon contour (legacy: 'unsupported shape', nothing emitted)", () => {
    const hexagon = mill([{ type: "prism", x: 0, y: 0, z: -5, radius: 10, height: 10, sides: 6 }], { depth: 1 })
    // Vertices at 60 deg steps from (10, 0); six sides closed back to the first.
    expect(hexagon).toContain("G0 X10.000 Y0.000 Z4.000 ; Rapid move\nG1 X10.000 Y0.000 Z-1.000 F300 ; Plunge move\nG1 X5.000 Y8.660 Z-1.000 F800 ; Linear move\n")
    expect(hexagon.match(/; Linear move/g)).toHaveLength(6)

    const box = { type: "mesh", x: 0, y: 0, z: -5,
      vertices: [
        { x: -5, y: -5, z: -5 }, { x: 5, y: -5, z: -5 }, { x: 5, y: 5, z: -5 }, { x: -5, y: 5, z: -5 },
        { x: -5, y: -5, z: 5 }, { x: 5, y: -5, z: 5 }, { x: 5, y: 5, z: 5 }, { x: -5, y: 5, z: 5 }
      ],
      faces: [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]] }
    const meshText = mill([box], { depth: 1 })
    // The four vertical edges cross Z-1 (each shared by two faces, counted once), ordered around the element.
    expect(meshText).toContain("G0 X-5.000 Y-5.000 Z4.000 ; Rapid move\nG1 X-5.000 Y-5.000 Z-1.000 F300 ; Plunge move\nG1 X5.000 Y-5.000 Z-1.000 F800 ; Linear move\nG1 X5.000 Y5.000 Z-1.000 ; Linear move\nG1 X-5.000 Y5.000 Z-1.000 ; Linear move\nG1 X-5.000 Y-5.000 Z-1.000 ; Linear move\n")
  })

  test("the depth is limited to the stock under the group and the stock top is Z0", () => {
    const text = mill(twoCylinders, { depth: 8, stepdown: 2 }, {}, {
      stock: { width: 80, height: 40, depth: 4, radius: 0, x: 0, y: 0, topZ: 0, allowance: 1 }
    })
    expect(text).toContain("; Warning: Depth 8.000mm limited to the 4.000mm of stock")
    expect(text).toContain("; Z Level: -2.000")
    expect(text).toContain("; Z Level: -4.000")
    expect(text).not.toContain("; Z Level: -6.000")
  })

  test("pocket, drill and engrave keep working member by member", () => {
    const text = mill(twoCylinders, { operationType: "drill" })
    expect(text).not.toContain("Unified mesh toolpath")
    // Depth 2 with stepdown 1 -> the peck cycle, one hole per member.
    expect(text.match(/^G83 /gm)).toHaveLength(2)
  })
})

describe("unified geometry calculator", () => {
  const cube: Component3D = { type: "cube", x: 10, y: 20, z: 30, width: 4, height: 6, depth: 8 }

  test("element boxes follow the CAD axes: X width, Y height, Z depth", () => {
    const d = calculateElementDimensions(cube)
    expect([d.minX, d.maxX, d.minY, d.maxY, d.minZ, d.maxZ]).toEqual([8, 12, 17, 23, 26, 34])
    expect(d.center).toEqual({ x: 10, y: 20, z: 30 })
    const up = calculateElementDimensions({ type: "hemisphere", x: 0, y: 0, z: 1, radius: 4 })
    expect([up.minZ, up.maxZ, up.center.z]).toEqual([1, 5, 3])
    const down = calculateElementDimensions({ type: "hemisphere", x: 0, y: 0, z: 1, radius: 4, direction: "down" })
    expect([down.minZ, down.maxZ, down.center.z]).toEqual([-3, 1, -1])
    const capsule = calculateElementDimensions({ type: "capsule", x: 0, y: 0, z: 0, radius: 2, height: 10, orientation: "x" })
    expect([capsule.minX, capsule.maxX, capsule.minZ, capsule.maxZ]).toEqual([-7, 7, -2, 2])
  })

  test("a combined box is the union; width = X extent, height = Z extent, depth = Y extent", () => {
    const sphere: Component3D = { type: "sphere", x: 0, y: 0, z: 0, radius: 3 }
    const box = combineElementDimensions([calculateElementDimensions(cube), calculateElementDimensions(sphere)])
    expect([box.minX, box.maxX, box.minY, box.maxY, box.minZ, box.maxZ]).toEqual([-3, 12, -3, 23, -3, 34])
    expect([box.width, box.height, box.depth]).toEqual([15, 37, 26])
    expect(calculateComponentDimensions({ type: "component", x: 0, y: 0, z: 0, elements: [cube, sphere] })).toEqual(box)
    expect(() => combineElementDimensions([])).toThrow()
  })

  test("Z levels run from top - stepdown to exactly top - depth, limited to the height", () => {
    expect(calculateZLevels([cube], { depth: 5, stepdown: 2 })).toEqual([32, 30, 29])
    expect(calculateZLevels([cube], { depth: 100, stepdown: 4 })).toEqual([30, 26])
    expect(calculateZLevels([], { depth: 5, stepdown: 1 })).toEqual([])
    // No height: one cut, at the top.
    expect(calculateZLevels([{ type: "sphere", x: 0, y: 0, z: 0, radius: 0 }], { depth: 3, stepdown: 1 })).toEqual([0])
  })

  test("cross-sections of the legacy shapes", () => {
    const cone = calculateElementZLevelIntersection({ type: "cone", x: 0, y: 0, z: 0, radius: 10, height: 20 }, 0)
    // Half way up a cone: r = R (1 - (top - z) / h) = 10 x (1 - 10/20) = 5.
    expect(cone?.shape).toBe("circle")
    expect(cone?.parameters.radius).toBeCloseTo(5, 9)
    expect(calculateElementZLevelIntersection({ type: "cone", x: 0, y: 0, z: 0, radius: 10, height: 20 }, 11)).toBeNull()

    const pyramid = calculateElementZLevelIntersection({ type: "pyramid", x: 0, y: 0, z: 0, width: 10, depth: 20, height: 10 }, 0)
    // Mid height: both sides halve.
    expect(pyramid?.parameters).toEqual({ width: 5, height: 10 })
    // At the apex it degenerates to a 0.001 circle.
    expect(calculateElementZLevelIntersection({ type: "pyramid", x: 0, y: 0, z: 0, width: 10, height: 10 }, 5)?.parameters).toEqual({ radius: 0.001 })

    const ellipsoid = calculateElementZLevelIntersection({ type: "ellipsoid", x: 0, y: 0, z: 0, radiusX: 8, radiusY: 4, radiusZ: 6 }, 3)
    // z/rz = 0.5 -> scale sqrt(1 - 0.25).
    expect(ellipsoid?.parameters.radiusX).toBeCloseTo(8 * Math.sqrt(0.75), 9)
    expect(ellipsoid?.parameters.radiusY).toBeCloseTo(4 * Math.sqrt(0.75), 9)

    // A capsule along Z: the caps narrow like a sphere. R 3, cylinder part 10 -> cap starts at z = 5; at z = 6 the
    // cap is 1 below... distFromTop = 8 - 6 = 2 -> sqrt(9 - (3 - 2)^2) = sqrt(8).
    const cap = calculateElementZLevelIntersection({ type: "capsule", x: 0, y: 0, z: 0, radius: 3, height: 10 }, 6)
    expect(cap?.parameters.radius).toBeCloseTo(Math.sqrt(8), 9)
    // Along X the section is an ellipse of semi-axes h/2 + r and sqrt(r^2 - dz^2).
    const side = calculateElementZLevelIntersection({ type: "capsule", x: 0, y: 0, z: 0, radius: 3, height: 10, orientation: "x" }, 1)
    expect(side?.shape).toBe("ellipse")
    expect(side?.parameters.radiusX).toBe(8)
    expect(side?.parameters.radiusY).toBeCloseTo(Math.sqrt(8), 9)
  })

  test("a down hemisphere is widest at its flat face (legacy mirrored the profile)", () => {
    const flat = calculateElementZLevelIntersection({ type: "hemisphere", x: 0, y: 0, z: 0, radius: 4, direction: "down" }, 0)
    expect(flat?.parameters.radius).toBe(4)
    const tip = calculateElementZLevelIntersection({ type: "hemisphere", x: 0, y: 0, z: 0, radius: 4, direction: "down" }, -4)
    expect(tip?.parameters.radius).toBe(0)
    expect(calculateElementZLevelIntersection({ type: "hemisphere", x: 0, y: 0, z: 0, radius: 4, direction: "down" }, 1)).toBeNull()
  })

  test("mesh slices: edge crossings ordered around the element, duplicates removed", () => {
    const wedge: Component3D = { type: "mesh", x: 0, y: 0, z: 0,
      vertices: [{ x: -2, y: -2, z: 0 }, { x: 2, y: -2, z: 0 }, { x: 0, y: 2, z: 0 }, { x: 0, y: 0, z: 4 }],
      faces: [[0, 1, 3], [1, 2, 3], [2, 0, 3], [0, 2, 1]] }
    // At z = 2 the three slanted edges to the apex are crossed half way: (-1,-1), (1,-1), (0,1); sorted by angle
    // around the origin: (-1,-1) = -135 deg, (1,-1) = -45 deg, (0,1) = 90 deg.
    expect(calculateMeshZIntersection(wedge, 2)).toEqual([[-1, -1], [1, -1], [0, 1]])
    expect(calculateMeshZIntersection(wedge, 5)).toEqual([])
  })

  test("which members can be sliced", () => {
    expect(isUnifiedSolid({ type: "cube" })).toBe(true)
    expect(isUnifiedSolid({ type: "circle" })).toBe(true)
    expect(isUnifiedSolid({ type: "triangle", points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }] })).toBe(true)
    expect(isUnifiedSolid({ type: "triangle" })).toBe(false)
    expect(isUnifiedSolid({ type: "mesh" })).toBe(false)
    expect(isUnifiedSolid({ type: "line" })).toBe(false)
    expect(isUnifiedSolid({ type: "text" })).toBe(false)
  })

  test("G-code of a segment list: F only when it changes; plunges at the plunge rate; G3 for a counter-clockwise arc", () => {
    const p = (x: number, y: number, z: number) => ({ x, y, z })
    const gcode = convertToolpathToGcode([
      { type: "rapid", startPoint: p(0, 0, 5), endPoint: p(1, 2, 5) },
      { type: "linear", startPoint: p(1, 2, 5), endPoint: p(1, 2, 0) },
      { type: "linear", startPoint: p(1, 2, 0), endPoint: p(4, 2, 0) },
      { type: "circular", startPoint: p(4, 2, 0), endPoint: p(4, 2, 0), center: { x: 2, y: 2 }, radius: 2, clockwise: false, feedrate: 123 },
      { type: "linear", startPoint: p(4, 2, 0), endPoint: p(5, 2, 0) }
    ], { feedrate: 800, plungerate: 300 })
    expect(gcode).toBe(
      "G0 X1.000 Y2.000 Z5.000 ; Rapid move\n" +
      "G1 X1.000 Y2.000 Z0.000 F300 ; Plunge move\n" +
      "G1 X4.000 Y2.000 Z0.000 F800 ; Linear move\n" +
      "G3 X4.000 Y2.000 Z0.000 I-2.000 J0.000 F123 ; Counter-clockwise circular move\n" +
      "G1 X5.000 Y2.000 Z0.000 F800 ; Linear move\n"
    )
  })

  test("volume and surface: closed forms, mesh sums, box fallback", () => {
    const details = calculate3DComponentDetails([
      { type: "sphere", x: 0, y: 0, z: 0, radius: 2 },
      { type: "cube", x: 10, y: 0, z: 0, width: 2, height: 3, depth: 4 }
    ])
    expect(details.volume).toBeCloseTo((4 / 3) * Math.PI * 8 + 24, 9)
    expect(details.surfaceArea).toBeCloseTo(16 * Math.PI + 2 * (6 + 8 + 12), 9)
    expect(details.centerOfMass).toEqual(details.dimensions.center)
    const cone = calculate3DComponentDetails([{ type: "cone", x: 0, y: 0, z: 0, radius: 1, height: 2 }])
    // No closed form: the bounding box (2 x 2 x 2).
    expect(cone.volume).toBe(8)
  })
})
