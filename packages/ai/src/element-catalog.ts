/**
 * Every element type the CAD editor renders, with the fields the assistant may set and their defaults
 * (the same values as the editor's own tool panel). `cad_add_elements` accepts these in the editor's own
 * shape, so the assistant can build what the editor can show: solids, revolved and extruded profiles,
 * lofts, sweeps, booleans, curves, mechanical parts and architecture, not only 2D sketches.
 *
 * Lengths are millimetres, angles radians. `x`, `y`, `z` place the element (its centre for solids).
 * The tool schema, the sidecar handler and the tests all read this one table; the tolerance maths is core's.
 */
import { MAX_CURVE_SEGMENTS, chordError, segmentsFor } from "@cadcamfun/core"

type Fields = Readonly<Record<string, unknown>>

interface Spec {
  /** Fields with their default values; a caller's value of the same JSON type replaces the default. */
  readonly defaults: Fields
  /** Fields the caller must give itself, because a default would be meaningless. */
  readonly required?: ReadonlyArray<string>
  /** One line for the tool description. */
  readonly doc: string
}

const at = { x: 0, y: 0, z: 0 }
const pts2 = [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 25, y: 30 }, { x: 10, y: 50 }]

export const ELEMENT_SPECS = {
  // ---- 3D primitives
  cube: { defaults: { ...at, width: 100, height: 100, depth: 100 }, doc: "box: width (X), height (Y), depth (Z)" },
  sphere: { defaults: { ...at, radius: 50 }, doc: "sphere: radius" },
  cylinder: { defaults: { ...at, radius: 30, height: 100 }, doc: "cylinder along Z: radius, height" },
  cone: { defaults: { ...at, radius: 30, height: 100 }, doc: "cone along Z: radius, height" },
  torus: { defaults: { ...at, radius: 50, tubeRadius: 12 }, doc: "torus: radius, tubeRadius" },
  pyramid: { defaults: { ...at, baseWidth: 100, baseDepth: 100, height: 150 }, doc: "pyramid: baseWidth, baseDepth, height" },
  prism: { defaults: { ...at, radius: 50, height: 100, sides: 6 }, doc: "regular prism: radius, height, sides" },
  hemisphere: { defaults: { ...at, radius: 50, segments: 32, direction: "up" }, doc: "hemisphere: radius, direction up|down" },
  ellipsoid: { defaults: { ...at, radiusX: 50, radiusY: 35, radiusZ: 25, segments: 32 }, doc: "ellipsoid: radiusX, radiusY, radiusZ" },
  capsule: { defaults: { ...at, radius: 25, height: 100, direction: "y" }, doc: "capsule: radius, height, direction x|y|z" },
  // ---- profiles to solids
  extrusion: {
    defaults: { ...at, shape: "rect", width: 50, height: 30, radius: 25, depth: 10, bevel: false },
    doc: "extruded profile: shape rect (width,height) | circle (radius) | or profile [{x,y}>=3 points], depth"
  },
  revolution: {
    defaults: { ...at, profile: pts2, segments: 32, angle: 6.283185307179586, axis: "y" },
    required: ["profile"],
    doc: "lathe / revolved solid: profile [{x: radius, y: height}] >=2 points, axis x|y, angle (rad, default full turn)"
  },
  sweep: {
    defaults: { ...at, profile: [{ x: -10, y: -10 }, { x: 10, y: -10 }, { x: 10, y: 10 }, { x: -10, y: 10 }], path: [{ x: 0, y: 0, z: 0 }, { x: 50, y: 50, z: 50 }, { x: 100, y: 0, z: 0 }], radius: 10, segments: 64 },
    required: ["path"],
    doc: "profile swept along path [{x,y,z}] (>=2 points); a round tube of `radius` when profile has < 3 points"
  },
  loft: {
    defaults: { ...at, profiles: [{ radius: 20 }, { radius: 40 }, { radius: 10 }], positions: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 50 }, { x: 0, y: 0, z: 100 }], closed: false },
    required: ["profiles", "positions"],
    doc: "loft through circular profiles [{radius}] placed at positions [{x,y,z}] (same count, >=2)"
  },
  "boolean-union": { defaults: { ...at, operands: [] }, required: ["operands"], doc: "union of >=2 operands (ids, or indexes of earlier elements of the same call)" },
  "boolean-subtract": { defaults: { ...at, operands: [] }, required: ["operands"], doc: "first operand minus the others" },
  "boolean-intersect": { defaults: { ...at, operands: [] }, required: ["operands"], doc: "intersection of >=2 operands" },
  // ---- 2D and curves
  circle: { defaults: { ...at, radius: 50, linewidth: 1 }, doc: "circle: radius" },
  rectangle: { defaults: { ...at, width: 100, height: 100, linewidth: 1 }, doc: "rectangle centred on x,y: width, height" },
  triangle: { defaults: { ...at, points: [{ x: 0, y: 50 }, { x: -50, y: -25 }, { x: 50, y: -25 }], linewidth: 1 }, doc: "triangle: points [{x,y}] x3" },
  polygon: { defaults: { ...at, sides: 6, radius: 50, linewidth: 1 }, doc: "regular polygon: sides, radius" },
  ellipse: { defaults: { ...at, radiusX: 50, radiusY: 25, segments: 32, linewidth: 1 }, doc: "ellipse: radiusX, radiusY" },
  arc: { defaults: { ...at, radius: 50, startAngle: 0, endAngle: 3.141592653589793 }, doc: "arc: radius, startAngle, endAngle" },
  line: { defaults: { x1: -50, y1: 0, z1: 0, x2: 50, y2: 0, z2: 0, linewidth: 2 }, doc: "line: x1,y1,z1 -> x2,y2,z2" },
  spline: { defaults: { points: [{ x: 0, y: 0, z: 0 }, { x: 30, y: 50, z: 0 }, { x: 70, y: -20, z: 0 }, { x: 100, y: 0, z: 0 }], divisions: 50, linewidth: 1 }, required: ["points"], doc: "spline through points [{x,y,z}] (>=2)" },
  bezier: { defaults: { points: [{ x: 0, y: 0, z: 0 }, { x: 30, y: 100, z: 0 }, { x: 70, y: 100, z: 0 }, { x: 100, y: 0, z: 0 }], divisions: 50, linewidth: 1 }, required: ["points"], doc: "bezier with control points [{x,y,z}] (>=4)" },
  nurbs: { defaults: { points: [{ x: 0, y: 0, z: 0 }, { x: 30, y: 50, z: 0 }, { x: 60, y: -20, z: 0 }, { x: 100, y: 0, z: 0 }], degree: 3, divisions: 100, linewidth: 1 }, required: ["points"], doc: "NURBS with control points [{x,y,z}] (>=4)" },
  text3d: { defaults: { ...at, text: "Text", height: 10, depth: 2, font: "Arial" }, doc: "3D text: text, height, depth" },
  // ---- mechanical parts
  gear: { defaults: { ...at, moduleValue: 2, teeth: 20, thickness: 10, pressureAngle: 20, holeDiameter: 10 }, doc: "spur gear: moduleValue, teeth, thickness, holeDiameter" },
  spring: { defaults: { ...at, radius: 30, wireRadius: 5, turns: 5, height: 100 }, doc: "coil spring: radius, wireRadius, turns, height" },
  bolt: { defaults: { ...at, size: "M8", length: 50, thread: "M8x1.25", grade: "8.8" }, doc: "bolt: size (M8), length" },
  screw: { defaults: { ...at, size: "M8", length: 40, thread: "M8x1.25", grade: "8.8" }, doc: "screw: size (M8), length" },
  nut: { defaults: { ...at, size: "M8", thread: "M8x1.25", style: "hex" }, doc: "nut: size (M8)" },
  washer: { defaults: { ...at, size: "M8", outerDiameter: 16, thickness: 1.5 }, doc: "washer: size, outerDiameter, thickness" },
  // ---- architecture
  wall: { defaults: { ...at, length: 300, height: 100, thickness: 20, openings: [] }, doc: "wall: length, height, thickness" },
  column: { defaults: { ...at, radius: 20, height: 200, style: "simple" }, doc: "column: radius, height" },
  stair: { defaults: { ...at, width: 100, height: 150, depth: 200, steps: 10 }, doc: "stair: width, height, depth, steps" },
  door: { defaults: { ...at, width: 36, height: 80, thickness: 2, style: "simple" }, doc: "door: width, height" },
  window: { defaults: { ...at, width: 50, height: 80, thickness: 5, style: "simple" }, doc: "window: width, height" },
  floor: { defaults: { ...at, width: 300, depth: 300, thickness: 10 }, doc: "floor slab: width, depth, thickness" },
  roof: { defaults: { ...at, width: 300, depth: 300, height: 80 }, doc: "roof: width, depth, height" }
} as const satisfies Record<string, Spec>

export type ElementType = keyof typeof ELEMENT_SPECS
export const ELEMENT_TYPES = Object.keys(ELEMENT_SPECS) as ReadonlyArray<ElementType>

/** Fields every element may carry besides its own. */
const COMMON = ["name", "color", "wireframe", "layer", "layerId", "rotation", "scale", "opacity", "linewidth"] as const

/** How finely the editor draws round shapes; `tolerance` sets them from the allowed deviation instead. */
const TESSELLATION = ["segments", "radialSegments", "tubularSegments", "capSegments"] as const
/** A round section never needs more than this to stay a mesh the editor can draw (sphere meshes grow with its square). */
const MAX_SPHERE_SEGMENTS = 512
export { chordError, segmentsFor }

const num = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : 0)
const maxX = (profile: unknown): number => (Array.isArray(profile) ? Math.max(0, ...profile.map((p) => num((p as { x?: unknown }).x))) : 0)

/** Sets the tessellation fields of a round element from `tolerance`; returns a warning when the mesh cap limits it. */
const tessellate = (element: Record<string, unknown>, tolerance: number): string | undefined => {
  const type = String(element["type"])
  const r = num(element["radius"])
  const grid = (radius: number, cap: number): { n: number; warning?: string } => {
    const n = segmentsFor(radius, tolerance, cap)
    const err = chordError(radius, n)
    return err > tolerance * (1 + 1e-9) ? { n, warning: `${type}: ${n} segments is the finest mesh the editor draws; the deviation is ${err.toFixed(4)} mm, not ${tolerance} mm` } : { n }
  }
  switch (type) {
    case "circle": case "cylinder": case "cone": case "hemisphere": { const g = grid(r, MAX_CURVE_SEGMENTS); element["segments"] = g.n; return g.warning }
    case "sphere": { const g = grid(r, MAX_SPHERE_SEGMENTS); element["segments"] = g.n; return g.warning }
    case "ellipse": case "ellipsoid": { const g = grid(Math.max(num(element["radiusX"]), num(element["radiusY"]), num(element["radiusZ"])), MAX_CURVE_SEGMENTS); element["segments"] = g.n; return g.warning }
    case "revolution": { const g = grid(maxX(element["profile"]), MAX_CURVE_SEGMENTS); element["segments"] = g.n; return g.warning }
    case "capsule": { const g = grid(r, MAX_CURVE_SEGMENTS); element["radialSegments"] = g.n; element["capSegments"] = Math.max(8, Math.ceil(g.n / 4)); return g.warning }
    case "torus": {
      const tube = num(element["tubeRadius"])
      const major = grid(r + tube, MAX_CURVE_SEGMENTS)
      const minor = grid(tube, MAX_CURVE_SEGMENTS)
      element["tubularSegments"] = major.n
      element["radialSegments"] = minor.n
      return major.warning ?? minor.warning
    }
    default: return undefined
  }
}

const typeOf = (value: unknown): string => (Array.isArray(value) ? "array" : value === null ? "null" : typeof value)

const MIN_POINTS: Readonly<Record<string, { readonly key: string; readonly min: number }>> = {
  revolution: { key: "profile", min: 2 }, sweep: { key: "path", min: 2 }, loft: { key: "profiles", min: 2 },
  spline: { key: "points", min: 2 }, bezier: { key: "points", min: 4 }, nurbs: { key: "points", min: 4 },
  "boolean-union": { key: "operands", min: 2 }, "boolean-subtract": { key: "operands", min: 2 }, "boolean-intersect": { key: "operands", min: 2 }
}

export type Normalized = { readonly ok: true; readonly element: Record<string, unknown>; readonly warning?: string } | { readonly ok: false; readonly error: string }

/**
 * Fills defaults, drops unknown fields and checks types and minimum counts. `operands` may hold numbers:
 * indexes of earlier elements in the same batch, resolved to ids by the caller.
 */
export const normalizeElement = (input: Record<string, unknown>): Normalized => {
  const type = input["type"]
  if (typeof type !== "string" || !Object.hasOwn(ELEMENT_SPECS, type)) {
    return { ok: false, error: `Unknown element type "${String(type)}". Known: ${ELEMENT_TYPES.join(", ")}` }
  }
  const spec = ELEMENT_SPECS[type as ElementType] as Spec
  for (const key of spec.required ?? []) {
    if (!(key in input)) return { ok: false, error: `${type} needs "${key}"` }
  }
  const element: Record<string, unknown> = { type }
  for (const [key, fallback] of Object.entries(spec.defaults)) {
    const given = input[key]
    if (given === undefined) { element[key] = fallback; continue }
    if (typeOf(given) !== typeOf(fallback)) return { ok: false, error: `${type}.${key} must be ${typeOf(fallback)}, got ${typeOf(given)}` }
    if (typeof given === "number" && !Number.isFinite(given)) return { ok: false, error: `${type}.${key} must be a finite number` }
    element[key] = given
  }
  for (const key of COMMON) if (input[key] !== undefined) element[key] = input[key]
  for (const key of TESSELLATION) {
    const given = input[key]
    if (given === undefined) continue
    if (typeof given !== "number" || !Number.isInteger(given) || given < 3 || given > MAX_CURVE_SEGMENTS) return { ok: false, error: `${type}.${key} must be an integer from 3 to ${MAX_CURVE_SEGMENTS}` }
    element[key] = given
  }
  let warning: string | undefined
  if (input["tolerance"] !== undefined) {
    const tolerance = input["tolerance"]
    if (typeof tolerance !== "number" || !Number.isFinite(tolerance) || tolerance <= 0) return { ok: false, error: `${type}.tolerance must be a positive number of millimetres (0.001 = 1 micron)` }
    element["tolerance"] = tolerance
  }
  const need = MIN_POINTS[type]
  if (need && (element[need.key] as ReadonlyArray<unknown>).length < need.min) return { ok: false, error: `${type}.${need.key} needs at least ${need.min} entries` }
  if (type === "loft" && (element["profiles"] as ReadonlyArray<unknown>).length !== (element["positions"] as ReadonlyArray<unknown>).length) {
    return { ok: false, error: "loft needs as many positions as profiles" }
  }
  if (type === "extrusion" && element["shape"] === "profile" && !Array.isArray(input["profile"])) return { ok: false, error: 'extrusion with shape "profile" needs profile points' }
  if (Array.isArray(input["profile"]) && type === "extrusion") { element["profile"] = input["profile"]; if (element["shape"] === "rect") element["shape"] = "profile" }
  for (const key of ["width", "height", "depth", "radius", "length", "thickness"]) {
    const v = element[key]
    if (typeof v === "number" && v <= 0 && type !== "arc") return { ok: false, error: `${type}.${key} must be positive` }
  }
  if (typeof element["tolerance"] === "number") warning = tessellate(element, element["tolerance"])
  return warning === undefined ? { ok: true, element } : { ok: true, element, warning }
}

/** One line per type for the tool prompt: `- type: what it takes`. */
export const elementCatalogueLines = (): string => ELEMENT_TYPES.map((type) => `- ${type}: ${ELEMENT_SPECS[type].doc}`).join("\n")

/** The catalogue as one line, for places with no room for a list. */
export const elementCatalogueText = (): string => ELEMENT_TYPES.map((type) => `${type} (${ELEMENT_SPECS[type].doc})`).join("; ")

/** Element types drawn as meshes of chords, the ones a tolerance applies to. */
const ROUND_TYPES = new Set(["circle", "cylinder", "cone", "hemisphere", "sphere", "ellipse", "ellipsoid", "revolution", "capsule", "torus"])

/**
 * Gives a round element the drawing's tolerance when it has neither its own `tolerance` nor `segments`.
 * Used by the sidecar, which knows the drawing's settings; the tool itself only sees the model's input.
 */
export const withDefaultTolerance = (element: Record<string, unknown>, tolerance: number): { readonly element: Record<string, unknown>; readonly warning?: string } => {
  if (!ROUND_TYPES.has(String(element["type"])) || element["tolerance"] !== undefined || element["segments"] !== undefined || !(tolerance > 0)) return { element }
  const next = { ...element, tolerance }
  const warning = tessellate(next, tolerance)
  return warning === undefined ? { element: next } : { element: next, warning }
}
