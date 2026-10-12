/**
 * Parametric part recipes: engineering generators that turn a handful of design inputs (a bolt size, an outside diameter, a load
 * case) into a complete, fully constrained feature history. The history is ordinary (`history.ts`): it can be rebuilt, edited,
 * patterned, checked with `dfm.ts` and sent to CAM. What a recipe adds is the design rules applied while it is generated:
 *
 *   - holes are sized from the fastener tables (ISO 273 clearance, ISO 4762 / DIN 974 counterbore, tap drill), never guessed;
 *   - hole positions keep the edge distance and spacing the rules ask for, or the recipe refuses and says which input to change;
 *   - keyways follow DIN 6885 for the shaft they are cut in;
 *   - every sketch is fully constrained and every key dimension is a named parameter, so one edit drives the part.
 *
 * `buildRecipe(name, input)` validates the input and throws a `RangeError` whose message names the rule that was broken.
 */
import type { Dimension } from "./expr.ts"
import { clearanceHole, keywayFor, METRIC_THREADS, metricThread, minEdgeDistance, minHoleSpacing, requireThread, tapDrill, tappedHoleDepth, threadEngagement, type ClearanceFit } from "./fasteners.ts"
import type { DimConstraint, Feature, History, PlaneName, SketchFeature } from "./history.ts"
import type { SketchEntity } from "./sketch.ts"

export interface RecipeParam {
  readonly name: string
  readonly type: "number" | "integer" | "string" | "boolean" | "array"
  readonly description: string
  readonly default?: number | string | boolean
  readonly min?: number
  readonly max?: number
  readonly options?: ReadonlyArray<string>
}

export interface RecipeResult {
  readonly recipe: string
  readonly history: History
  /** One line: what was built. */
  readonly summary: string
  /** The numbers the rules produced (hole sizes, positions, depths) so the assistant can quote them. */
  readonly derived: Readonly<Record<string, number | string>>
  /** The design rules that shaped the result. */
  readonly rules: ReadonlyArray<string>
}

export interface RecipeSpec {
  readonly name: string
  readonly title: string
  readonly description: string
  readonly params: ReadonlyArray<RecipeParam>
  readonly build: (input: Readonly<Record<string, unknown>>) => RecipeResult
}

// ---------------------------------------------------------------- input

class Input {
  constructor(private readonly recipe: string, private readonly raw: Readonly<Record<string, unknown>>, private readonly params: ReadonlyArray<RecipeParam>) {}
  private spec(name: string): RecipeParam {
    const p = this.params.find((x) => x.name === name)
    if (p === undefined) throw new Error(`recipe ${this.recipe}: undeclared parameter ${name}`)
    return p
  }
  number(name: string): number {
    const p = this.spec(name)
    const v = this.raw[name] ?? p.default
    const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v
    if (typeof n !== "number" || !Number.isFinite(n)) throw new RangeError(`${this.recipe}: '${name}' must be a number (${p.description})`)
    if (p.type === "integer" && !Number.isInteger(n)) throw new RangeError(`${this.recipe}: '${name}' must be a whole number (it is ${n})`)
    if (p.min !== undefined && n < p.min) throw new RangeError(`${this.recipe}: '${name}' must be at least ${p.min} (it is ${n})`)
    if (p.max !== undefined && n > p.max) throw new RangeError(`${this.recipe}: '${name}' must be at most ${p.max} (it is ${n})`)
    return n
  }
  optionalNumber(name: string): number | undefined { return this.raw[name] === undefined && this.spec(name).default === undefined ? undefined : this.number(name) }
  string(name: string): string {
    const p = this.spec(name)
    const v = this.raw[name] ?? p.default
    if (typeof v !== "string" || v.trim() === "") throw new RangeError(`${this.recipe}: '${name}' must be text (${p.description})`)
    if (p.options !== undefined && !p.options.includes(v)) throw new RangeError(`${this.recipe}: '${name}' must be one of ${p.options.join(", ")} (it is ${v})`)
    return v
  }
  boolean(name: string): boolean {
    const v = this.raw[name] ?? this.spec(name).default
    return v === true || v === "true"
  }
  array<T>(name: string, read: (item: unknown, index: number) => T): T[] {
    const v = this.raw[name]
    if (!Array.isArray(v) || v.length === 0) throw new RangeError(`${this.recipe}: '${name}' must be a non-empty array (${this.spec(name).description})`)
    return v.map(read)
  }
}

const round = (v: number, decimals = 3): number => Number(v.toFixed(decimals))

// ---------------------------------------------------------------- sketch builders

const point = (id: string, x: number, y: number): SketchEntity => ({ id, kind: "point", x, y })

interface Vertex {
  /** Where the vertex is, for the solver's first guess (mm). */
  readonly x: number
  readonly y: number
  /** Its offset from the previous vertex as dimensions (numbers or parameter expressions). */
  readonly dx: Dimension
  readonly dy: Dimension
}

/**
 * A closed polygon sketch whose every vertex is placed by two dimensions from the one before it, so the sketch is fully constrained
 * and each edge length is a parameter expression. The first vertex is fixed at `start`, or at `anchor` (dimensions from the origin)
 * when the polygon has to move with the parameters. The closing edge has no constraint: the offsets have to return to the start.
 */
const polygon = (id: string, plane: PlaneName, offset: Dimension | undefined, start: { x: number; y: number }, vertices: ReadonlyArray<Vertex>, anchor?: { dx: Dimension; dy: Dimension }): SketchFeature => {
  const entities: SketchEntity[] = []
  const constraints: DimConstraint[] = []
  if (anchor !== undefined) {
    entities.push(point("o", 0, 0))
    constraints.push({ type: "fixed", point: "o", x: 0, y: 0 }, { type: "distanceX", a: "o", b: "p0", value: anchor.dx }, { type: "distanceY", a: "o", b: "p0", value: anchor.dy })
  } else constraints.push({ type: "fixed", point: "p0", x: start.x, y: start.y })
  entities.push(point("p0", start.x, start.y))
  vertices.forEach((v, i) => {
    entities.push(point(`p${i + 1}`, v.x, v.y))
    constraints.push({ type: "distanceX", a: `p${i}`, b: `p${i + 1}`, value: v.dx }, { type: "distanceY", a: `p${i}`, b: `p${i + 1}`, value: v.dy })
  })
  const n = vertices.length + 1
  for (let i = 0; i < n; i++) entities.push({ id: `l${i}`, kind: "line", p1: `p${i}`, p2: `p${(i + 1) % n}` })
  return { id, type: "sketch", plane, ...(offset !== undefined ? { offset } : {}), sketch: { entities, constraints } }
}

/** A rectangle `w` by `h` from `(x, y)` (dimensions, with their numeric values for the first guess). */
const rectangleSketch = (id: string, plane: PlaneName, offset: Dimension | undefined, at: { x: number; y: number; dx?: Dimension; dy?: Dimension }, w: { value: number; dim: Dimension }, h: { value: number; dim: Dimension }): SketchFeature =>
  polygon(id, plane, offset, at, [
    { x: at.x + w.value, y: at.y, dx: w.dim, dy: 0 },
    { x: at.x + w.value, y: at.y + h.value, dx: 0, dy: h.dim },
    { x: at.x, y: at.y + h.value, dx: typeof w.dim === "number" ? -w.dim : `-(${w.dim})`, dy: 0 }
  ], at.dx !== undefined && at.dy !== undefined ? { dx: at.dx, dy: at.dy } : undefined)

/** Concentric circles about a fixed centre, each with a diameter dimension. */
const circleSketch = (id: string, plane: PlaneName, offset: Dimension | undefined, circles: ReadonlyArray<{ readonly value: number; readonly dim: Dimension }>, centre: { x: number; y: number; dx?: Dimension; dy?: Dimension } = { x: 0, y: 0 }): SketchFeature => {
  const entities: SketchEntity[] = [point("c", centre.x, centre.y)]
  const constraints: DimConstraint[] = []
  if (centre.dx !== undefined && centre.dy !== undefined) {
    entities.push(point("o", 0, 0))
    constraints.push({ type: "fixed", point: "o", x: 0, y: 0 }, { type: "distanceX", a: "o", b: "c", value: centre.dx }, { type: "distanceY", a: "o", b: "c", value: centre.dy })
  } else constraints.push({ type: "fixed", point: "c", x: centre.x, y: centre.y })
  circles.forEach((c, i) => {
    entities.push({ id: `k${i}`, kind: "circle", center: "c", radius: c.value / 2 })
    constraints.push({ type: "diameter", circle: `k${i}`, value: c.dim })
  })
  return { id, type: "sketch", plane, ...(offset !== undefined ? { offset } : {}), sketch: { entities, constraints } }
}

const FIT: ReadonlyArray<ClearanceFit> = ["fine", "medium", "coarse"]

// ---------------------------------------------------------------- recipes

const MOUNTING_PLATE_PARAMS: ReadonlyArray<RecipeParam> = [
  { name: "width", type: "number", description: "plate size along X, mm", default: 100, min: 10, max: 2000 },
  { name: "depth", type: "number", description: "plate size along Y, mm", default: 60, min: 10, max: 2000 },
  { name: "thickness", type: "number", description: "plate thickness, mm", default: 10, min: 1, max: 200 },
  { name: "fastener", type: "string", description: "metric screw the four corner holes are for, e.g. M8", default: "M8" },
  { name: "fit", type: "string", description: "ISO 273 clearance series", default: "medium", options: FIT },
  { name: "counterbore", type: "boolean", description: "recess the socket heads (ISO 4762 / DIN 974)", default: false },
  { name: "cornerRadius", type: "number", description: "radius of the four plate corners, mm (0 = sharp)", default: 0, min: 0, max: 200 },
  { name: "edgeChamfer", type: "number", description: "chamfer of the outline edges on both faces, mm (0 = none)", default: 0, min: 0, max: 50 },
  { name: "edgeDistance", type: "number", description: "hole centre to edge, mm; default 2 x the hole diameter (the rule needs at least 1.5 x)", min: 0 }
]

const mountingPlate = (raw: Readonly<Record<string, unknown>>): RecipeResult => {
  const i = new Input("mounting_plate", raw, MOUNTING_PLATE_PARAMS)
  const width = i.number("width"), depth = i.number("depth"), thick = i.number("thickness")
  const thread = requireThread(i.string("fastener")), fit = i.string("fit") as ClearanceFit
  const hole = clearanceHole(thread.name, fit)
  const corner = i.number("cornerRadius"), chamfer = i.number("edgeChamfer")
  const edge = i.optionalNumber("edgeDistance") ?? round(2 * hole, 2)
  const counterbore = i.boolean("counterbore")
  if (edge < minEdgeDistance(hole) - 1e-9) throw new RangeError(`mounting_plate: the edge distance ${edge} mm is below 1.5 x the hole diameter (${round(minEdgeDistance(hole), 2)} mm): the web would break out`)
  if (width - 2 * edge < minHoleSpacing(hole) || depth - 2 * edge < minHoleSpacing(hole)) {
    throw new RangeError(`mounting_plate: the holes would be closer than 2.5 x their diameter (${round(minHoleSpacing(hole), 2)} mm): make the plate at least ${round(2 * edge + minHoleSpacing(hole), 1)} mm in both directions`)
  }
  if (counterbore && thick < thread.counterboreDepth + 1) throw new RangeError(`mounting_plate: a ${thread.name} counterbore is ${thread.counterboreDepth} mm deep; the plate must be at least ${thread.counterboreDepth + 1} mm thick`)
  if (corner > 0 && corner > Math.min(width, depth) / 2 - 1e-9) throw new RangeError("mounting_plate: the corner radius cannot exceed half the plate")
  if (chamfer > 0 && 2 * chamfer >= thick) throw new RangeError("mounting_plate: the edge chamfer on both faces must be smaller than half the thickness")
  const parameters: Record<string, number | string> = { width, depth, thick, hole, inset: edge }
  if (corner > 0) parameters["corner"] = corner
  if (chamfer > 0) parameters["chamfer"] = chamfer
  if (counterbore) { parameters["headDiameter"] = thread.counterboreDiameter; parameters["headDepth"] = thread.counterboreDepth }
  const holeAt = (id: string, u: Dimension, v: Dimension): Feature => ({
    id, type: "hole", plane: "XY", offset: "thick", at: [u, v], diameter: "hole", depth: "thick",
    ...(counterbore ? { kind: "counterbore" as const, headDiameter: "headDiameter", headDepth: "headDepth" } : {})
  })
  const features: Feature[] = [
    rectangleSketch("outline", "XY", undefined, { x: 0, y: 0 }, { value: width, dim: "width" }, { value: depth, dim: "depth" }),
    { id: "plate", type: "extrude", sketch: "outline", depth: "thick", operation: "new", ...(corner > 0 ? { corner: { style: "fillet" as const, size: "corner" } } : {}), ...(chamfer > 0 ? { edge: { style: "chamfer" as const, size: "chamfer", ends: "both" as const } } : {}) },
    holeAt("hole_sw", "inset", "inset"), holeAt("hole_se", "width - inset", "inset"), holeAt("hole_ne", "width - inset", "depth - inset"), holeAt("hole_nw", "inset", "depth - inset")
  ]
  return {
    recipe: "mounting_plate", history: { parameters, features },
    summary: `${width} x ${depth} x ${thick} mm plate with four ${counterbore ? "counterbored " : ""}holes for ${thread.name} screws (Ø${hole} mm, ${fit} fit)`,
    derived: { holeDiameter: hole, edgeDistance: edge, holeSpacingX: round(width - 2 * edge, 2), holeSpacingY: round(depth - 2 * edge, 2), ...(counterbore ? { counterboreDiameter: thread.counterboreDiameter, counterboreDepth: thread.counterboreDepth } : {}) },
    rules: ["hole diameter from ISO 273", "centre to edge >= 1.5 x hole diameter", "centre to centre >= 2.5 x hole diameter", ...(counterbore ? ["counterbore from ISO 4762 / DIN 974-1"] : [])]
  }
}

const FLANGE_PARAMS: ReadonlyArray<RecipeParam> = [
  { name: "outerDiameter", type: "number", description: "flange outside diameter, mm", default: 120, min: 10, max: 2000 },
  { name: "boreDiameter", type: "number", description: "centre bore, mm", default: 40, min: 0, max: 1900 },
  { name: "thickness", type: "number", description: "flange thickness, mm", default: 14, min: 1, max: 200 },
  { name: "boltCount", type: "integer", description: "number of bolts on the circle", default: 6, min: 3, max: 64 },
  { name: "fastener", type: "string", description: "metric bolt size, e.g. M10", default: "M10" },
  { name: "fit", type: "string", description: "ISO 273 clearance series", default: "medium", options: FIT },
  { name: "boltCircleDiameter", type: "number", description: "bolt circle, mm; default midway between bore and outside", min: 1 },
  { name: "hubDiameter", type: "number", description: "outside diameter of a hub on one face, mm (0 = no hub)", default: 0, min: 0 },
  { name: "hubHeight", type: "number", description: "hub height above the flange, mm", default: 0, min: 0, max: 500 },
  { name: "edgeChamfer", type: "number", description: "chamfer of the outer rim on both faces, mm (0 = none)", default: 0, min: 0, max: 50 }
]

const flange = (raw: Readonly<Record<string, unknown>>): RecipeResult => {
  const i = new Input("flange", raw, FLANGE_PARAMS)
  const outer = i.number("outerDiameter"), bore = i.number("boreDiameter"), thick = i.number("thickness")
  const count = i.number("boltCount")
  const thread = requireThread(i.string("fastener")), fit = i.string("fit") as ClearanceFit
  const hole = clearanceHole(thread.name, fit)
  const bcd = i.optionalNumber("boltCircleDiameter") ?? round((outer + bore) / 2, 2)
  const hub = i.number("hubDiameter"), hubHeight = i.number("hubHeight"), chamfer = i.number("edgeChamfer")
  if (bore >= outer) throw new RangeError("flange: the bore must be smaller than the outside diameter")
  const toBore = (bcd - bore) / 2 - hole / 2
  const toRim = (outer - bcd) / 2
  if (toRim < minEdgeDistance(hole) - 1e-9) throw new RangeError(`flange: bolt centres are ${round(toRim, 2)} mm from the rim; the rule needs ${round(minEdgeDistance(hole), 2)} mm (1.5 x the hole). Enlarge the flange or move the bolt circle in`)
  if (toBore < hole / 2 - 1e-9) throw new RangeError(`flange: only ${round(toBore, 2)} mm of material is left between the bolt holes and the bore; it needs at least half a hole diameter (${round(hole / 2, 2)} mm)`)
  const chord = bcd * Math.sin(Math.PI / count)
  if (chord < minHoleSpacing(hole) - 1e-9) throw new RangeError(`flange: neighbouring bolts are ${round(chord, 2)} mm apart; they need ${round(minHoleSpacing(hole), 2)} mm (2.5 x the hole). Use fewer bolts or a larger bolt circle`)
  if (hubHeight > 0 && !(hub > bore)) throw new RangeError("flange: a hub needs hubDiameter larger than the bore")
  if (hubHeight > 0 && hub > bcd - hole - 2) throw new RangeError("flange: the hub would cover the bolt holes; make hubDiameter smaller than the bolt circle minus a hole")
  if (chamfer > 0 && 2 * chamfer >= thick) throw new RangeError("flange: the rim chamfer on both faces must be smaller than half the thickness")
  const parameters: Record<string, number | string> = { outer, bore, thick, bcd, hole, bolts: count }
  if (chamfer > 0) parameters["chamfer"] = chamfer
  if (hubHeight > 0) { parameters["hub"] = hub; parameters["hubHeight"] = hubHeight }
  const features: Feature[] = [
    circleSketch("disc", "XY", undefined, [{ value: outer, dim: "outer" }, ...(bore > 0 ? [{ value: bore, dim: "bore" as Dimension }] : [])]),
    { id: "flange", type: "extrude", sketch: "disc", depth: "thick", operation: "new", ...(chamfer > 0 ? { edge: { style: "chamfer" as const, size: "chamfer", ends: "both" as const } } : {}) }
  ]
  if (hubHeight > 0) {
    features.push(
      circleSketch("hub_ring", "XY", "thick", [{ value: hub, dim: "hub" }, ...(bore > 0 ? [{ value: bore, dim: "bore" as Dimension }] : [])]),
      { id: "hub", type: "extrude", sketch: "hub_ring", depth: "hubHeight", operation: "union" }
    )
  }
  features.push(
    { id: "bolt", type: "hole", plane: "XY", offset: "thick", at: ["bcd / 2", 0], diameter: "hole", depth: "thick" },
    { id: "bolts", type: "pattern", feature: "bolt", kind: "circular", count: "bolts", centre: [0, 0] }
  )
  return {
    recipe: "flange", history: { parameters, features },
    summary: `Flange Ø${outer} x ${thick} mm with a Ø${bore} bore${hubHeight > 0 ? ` and a Ø${hub} hub` : ""}, ${count} x ${thread.name} bolts (Ø${hole} mm) on a Ø${round(bcd, 2)} circle`,
    derived: { holeDiameter: hole, boltCircleDiameter: round(bcd, 2), boltSpacing: round(chord, 2), rimDistance: round(toRim, 2), boreWeb: round(toBore, 2) },
    rules: ["hole diameter from ISO 273", "bolt centre to rim >= 1.5 x hole diameter", "bolt spacing >= 2.5 x hole diameter", "material between bolt holes and bore >= half a hole"]
  }
}

const L_BRACKET_PARAMS: ReadonlyArray<RecipeParam> = [
  { name: "baseLength", type: "number", description: "length of the base leg (outside), mm", default: 60, min: 5, max: 1000 },
  { name: "legHeight", type: "number", description: "height of the upright leg (outside), mm", default: 50, min: 5, max: 1000 },
  { name: "thickness", type: "number", description: "material thickness, mm", default: 5, min: 1, max: 50 },
  { name: "width", type: "number", description: "bracket width, mm", default: 40, min: 5, max: 1000 },
  { name: "fastener", type: "string", description: "metric screw for the mounting holes", default: "M6" },
  { name: "fit", type: "string", description: "ISO 273 clearance series", default: "medium", options: FIT },
  { name: "holesPerLeg", type: "integer", description: "mounting holes in each leg (1 or 2)", default: 1, min: 1, max: 2 },
  { name: "cornerRadius", type: "number", description: "radius of every sharp profile corner, mm (0 = sharp)", default: 0, min: 0, max: 50 }
]

const lBracket = (raw: Readonly<Record<string, unknown>>): RecipeResult => {
  const i = new Input("l_bracket", raw, L_BRACKET_PARAMS)
  const base = i.number("baseLength"), leg = i.number("legHeight"), t = i.number("thickness"), width = i.number("width")
  const thread = requireThread(i.string("fastener")), fit = i.string("fit") as ClearanceFit
  const hole = clearanceHole(thread.name, fit)
  const perLeg = i.number("holesPerLeg"), corner = i.number("cornerRadius")
  if (base <= 2 * t || leg <= 2 * t) throw new RangeError("l_bracket: each leg must be longer than twice the thickness")
  // The free part of each leg, from the inside face of the other leg to its end, has to hold the hole with its edge distances.
  const free = (length: number): number => length - t
  const needSpan = 2 * minEdgeDistance(hole)
  if (free(base) < needSpan || free(leg) < needSpan) throw new RangeError(`l_bracket: the free length of a leg (${round(Math.min(free(base), free(leg)), 1)} mm) is below 3 x the hole diameter (${round(needSpan, 1)} mm): lengthen the legs or use a smaller screw`)
  if (perLeg === 1 && width < 2 * minEdgeDistance(hole)) throw new RangeError(`l_bracket: the width ${width} mm leaves less than 1.5 x the hole diameter to each side (${round(2 * minEdgeDistance(hole), 1)} mm needed)`)
  const pitch = width / 2
  if (perLeg === 2 && (width / 4 < minEdgeDistance(hole) - 1e-9 || pitch < minHoleSpacing(hole) - 1e-9)) throw new RangeError(`l_bracket: two holes need the width to be at least ${round(Math.max(4 * minEdgeDistance(hole), 2 * minHoleSpacing(hole)), 1)} mm`)
  if (corner > 0 && corner > t / 2 - 1e-9) throw new RangeError("l_bracket: the corner radius cannot exceed half the thickness (the tips of the legs are only that wide)")
  const parameters: Record<string, number | string> = { base, leg, t, width, hole, pitch }
  if (corner > 0) parameters["corner"] = corner
  const profile = polygon("profile", "XY", undefined, { x: 0, y: 0 }, [
    { x: base, y: 0, dx: "base", dy: 0 }, { x: base, y: t, dx: 0, dy: "t" }, { x: t, y: t, dx: "t - base", dy: 0 },
    { x: t, y: leg, dx: 0, dy: "leg - t" }, { x: 0, y: leg, dx: "-t", dy: 0 }
  ])
  const offsetFirst: Dimension = perLeg === 2 ? "(width - pitch) / 2" : "width / 2"
  const features: Feature[] = [
    profile,
    { id: "bracket", type: "extrude", sketch: "profile", depth: "width", operation: "new", ...(corner > 0 ? { corner: { style: "fillet" as const, size: "corner" } } : {}) },
    // The base is drilled through its thickness along Y, the upright through its thickness along X.
    { id: "base_hole", type: "hole", plane: "ZX", offset: "t", at: [offsetFirst, "(base + t) / 2"], diameter: "hole", depth: "t" },
    { id: "leg_hole", type: "hole", plane: "YZ", offset: "t", at: ["(leg + t) / 2", offsetFirst], diameter: "hole", depth: "t" }
  ]
  if (perLeg === 2) {
    features.push(
      { id: "base_holes", type: "pattern", feature: "base_hole", kind: "linear", count: 2, step: [0, 0, "pitch"] },
      { id: "leg_holes", type: "pattern", feature: "leg_hole", kind: "linear", count: 2, step: [0, 0, "pitch"] }
    )
  }
  return {
    recipe: "l_bracket", history: { parameters, features },
    summary: `L bracket ${base} x ${leg} x ${width} mm, ${t} mm thick, with ${perLeg} Ø${hole} mm hole(s) per leg for ${thread.name}`,
    derived: { holeDiameter: hole, baseHoleFromBend: round((base + t) / 2, 2), legHoleFromBend: round((leg + t) / 2, 2), ...(perLeg === 2 ? { holePitch: pitch } : {}) },
    rules: ["hole diameter from ISO 273", "hole centred on the free length of the leg", "edge distance >= 1.5 x hole diameter on every side"]
  }
}

const SHAFT_PARAMS: ReadonlyArray<RecipeParam> = [
  { name: "sections", type: "array", description: "[{diameter, length}, ...] from one end to the other, mm" },
  { name: "chamfer", type: "number", description: "chamfer of the two end faces, mm", default: 1, min: 0, max: 20 },
  { name: "keywaySection", type: "integer", description: "0-based index of the section that gets a DIN 6885 keyway (-1 = none)", default: -1, min: -1, max: 40 },
  { name: "keyLength", type: "number", description: "keyway length, mm; default 80 % of the section", min: 1 }
]

interface Section { readonly diameter: number; readonly length: number }

const steppedShaft = (raw: Readonly<Record<string, unknown>>): RecipeResult => {
  const i = new Input("stepped_shaft", raw, SHAFT_PARAMS)
  const sections = i.array<Section>("sections", (item, index) => {
    const s = item as Partial<Section>
    if (typeof s?.diameter !== "number" || typeof s?.length !== "number" || !(s.diameter > 0) || !(s.length > 0)) throw new RangeError(`stepped_shaft: sections[${index}] needs a positive diameter and length`)
    return { diameter: s.diameter, length: s.length }
  })
  if (sections.length > 20) throw new RangeError("stepped_shaft: at most 20 sections")
  const c = i.number("chamfer")
  const first = sections[0]!, last = sections[sections.length - 1]!
  if (c > 0 && (c >= first.diameter / 2 || c >= last.diameter / 2)) throw new RangeError("stepped_shaft: the end chamfer must be smaller than the end radius")
  if (c > 0 && (sections.length === 1 ? 2 * c >= first.length : c >= first.length || c >= last.length)) throw new RangeError("stepped_shaft: the end chamfer must be shorter than the end section")
  const keySection = i.number("keywaySection")
  const parameters: Record<string, number | string> = { chamfer: c }
  sections.forEach((s, k) => { parameters[`d${k + 1}`] = s.diameter; parameters[`l${k + 1}`] = s.length })
  const r = (k: number): string => `d${k + 1} / 2`
  // Profile: the axis at the bottom, the outline on top, chamfers at both ends.
  const v: Vertex[] = []
  let x = 0
  if (c > 0) {
    v.push({ x: 0, y: first.diameter / 2 - c, dx: 0, dy: `${r(0)} - chamfer` }, { x: c, y: first.diameter / 2, dx: "chamfer", dy: "chamfer" })
    x = c
  } else v.push({ x: 0, y: first.diameter / 2, dx: 0, dy: r(0) })
  let y = first.diameter / 2
  sections.forEach((s, k) => {
    const startCut = k === 0 ? c : 0, endCut = k === sections.length - 1 ? c : 0
    const run = s.length - startCut - endCut
    const dxExpr = `l${k + 1}${startCut > 0 ? " - chamfer" : ""}${endCut > 0 ? " - chamfer" : ""}`
    x += run
    v.push({ x, y, dx: run === s.length ? `l${k + 1}` : dxExpr, dy: 0 })
    if (k < sections.length - 1) {
      const next = sections[k + 1]!.diameter / 2
      v.push({ x, y: next, dx: 0, dy: `(d${k + 2} - d${k + 1}) / 2` })
      y = next
    }
  })
  if (c > 0) { v.push({ x: x + c, y: y - c, dx: "chamfer", dy: "-chamfer" }); x += c; y -= c }
  v.push({ x, y: 0, dx: 0, dy: `-(${c > 0 ? `${r(sections.length - 1)} - chamfer` : r(sections.length - 1)})` })
  const features: Feature[] = [
    polygon("profile", "XY", undefined, { x: 0, y: 0 }, v),
    { id: "shaft", type: "revolve", sketch: "profile", axis: "x", angle: 360, operation: "new" }
  ]
  const derived: Record<string, number | string> = { totalLength: round(sections.reduce((sum, s) => sum + s.length, 0), 3) }
  const rules = ["chamfered ends", "one revolved, fully constrained profile"]
  if (keySection >= 0) {
    const s = sections[keySection]
    if (s === undefined) throw new RangeError(`stepped_shaft: keywaySection ${keySection} is not a section (there are ${sections.length})`)
    const key = keywayFor(s.diameter)
    if (key === undefined) throw new RangeError(`stepped_shaft: DIN 6885 has no key for a Ø${s.diameter} mm shaft (it covers 6 to 75 mm)`)
    const keyLength = i.optionalNumber("keyLength") ?? Math.max(key.b * 2, Math.floor(s.length * 0.8))
    if (keyLength > s.length - 2) throw new RangeError(`stepped_shaft: the keyway (${keyLength} mm) does not fit the ${s.length} mm section`)
    const before = sections.slice(0, keySection).reduce((sum, q) => sum + q.length, 0)
    parameters["keyWidth"] = key.b; parameters["keyDepth"] = key.t1; parameters["keyLength"] = keyLength
    const start = `${before === 0 ? "" : `${sections.slice(0, keySection).map((_, k) => `l${k + 1}`).join(" + ")} + `}(l${keySection + 1} - keyLength) / 2`
    features.push(
      rectangleSketch("keyway_outline", "XY", `d${keySection + 1} / 2 - keyDepth`, { x: before + (s.length - keyLength) / 2, y: -key.b / 2, dx: start, dy: "-keyWidth / 2" }, { value: keyLength, dim: "keyLength" }, { value: key.b, dim: "keyWidth" }),
      // The slot is cut from the plane through the bottom of the keyway up and out of the shaft; its ends are the cutter's radius.
      { id: "keyway", type: "extrude", sketch: "keyway_outline", depth: "keyDepth + 1", operation: "subtract", corner: { style: "fillet", size: "keyWidth / 2" } }
    )
    Object.assign(derived, { keyWidth: key.b, keyHeight: key.h, shaftKeywayDepth: key.t1, hubKeywayDepth: key.t2, keyLength })
    rules.push("keyway width and depth from DIN 6885 form A", "slot ends rounded to the cutter radius")
  }
  return {
    recipe: "stepped_shaft", history: { parameters, features },
    summary: `Stepped shaft of ${sections.length} section(s), ${derived["totalLength"]} mm long, Ø${Math.min(...sections.map((s) => s.diameter))} to Ø${Math.max(...sections.map((s) => s.diameter))} mm${keySection >= 0 ? `, DIN 6885 keyway on section ${keySection + 1}` : ""}`,
    derived, rules
  }
}

const ENCLOSURE_PARAMS: ReadonlyArray<RecipeParam> = [
  { name: "length", type: "number", description: "outside length (X), mm", default: 120, min: 20, max: 1000 },
  { name: "width", type: "number", description: "outside width (Y), mm", default: 80, min: 20, max: 1000 },
  { name: "height", type: "number", description: "outside height (Z) of the open box, mm", default: 40, min: 10, max: 500 },
  { name: "wall", type: "number", description: "wall thickness, mm", default: 3, min: 0.8, max: 20 },
  { name: "floor", type: "number", description: "floor thickness, mm (default: the wall)", min: 0.8 },
  { name: "cornerRadius", type: "number", description: "outside corner radius, mm (must exceed the wall)", default: 6, min: 0, max: 100 },
  { name: "fastener", type: "string", description: "lid screw, e.g. M3 (0 or empty = no screw bosses)", default: "M3" },
  { name: "bosses", type: "boolean", description: "add four screw bosses with pilot holes in the corners", default: true }
]

const enclosure = (raw: Readonly<Record<string, unknown>>): RecipeResult => {
  const i = new Input("enclosure", raw, ENCLOSURE_PARAMS)
  const length = i.number("length"), width = i.number("width"), height = i.number("height"), wall = i.number("wall")
  const floor = i.optionalNumber("floor") ?? wall
  const corner = i.number("cornerRadius")
  const bosses = i.boolean("bosses")
  if (corner > 0 && corner <= wall) throw new RangeError("enclosure: the outside corner radius must exceed the wall so the inside corner keeps a radius")
  if (corner > Math.min(length, width) / 2 - 1e-9) throw new RangeError("enclosure: the corner radius cannot exceed half the box")
  if (2 * wall >= Math.min(length, width) || floor >= height) throw new RangeError("enclosure: the walls and floor leave no cavity")
  const parameters: Record<string, number | string> = { length, width, height, wall, floor }
  if (corner > 0) { parameters["corner"] = corner; parameters["innerCorner"] = "corner - wall" }
  const features: Feature[] = [
    rectangleSketch("outer", "XY", undefined, { x: 0, y: 0 }, { value: length, dim: "length" }, { value: width, dim: "width" }),
    { id: "shell", type: "extrude", sketch: "outer", depth: "height", operation: "new", ...(corner > 0 ? { corner: { style: "fillet" as const, size: "corner" } } : {}) },
    rectangleSketch("cavity_outline", "XY", "floor", { x: wall, y: wall, dx: "wall", dy: "wall" }, { value: length - 2 * wall, dim: "length - 2 * wall" }, { value: width - 2 * wall, dim: "width - 2 * wall" }),
    { id: "cavity", type: "extrude", sketch: "cavity_outline", depth: "height", operation: "subtract", ...(corner > 0 ? { corner: { style: "fillet" as const, size: "innerCorner" } } : {}) }
  ]
  const derived: Record<string, number | string> = { cavityLength: round(length - 2 * wall, 3), cavityWidth: round(width - 2 * wall, 3), cavityDepth: round(height - floor, 3) }
  const rules = ["inside corner radius = outside radius - wall", "uniform wall"]
  if (bosses) {
    const thread = requireThread(i.string("fastener"))
    const pilot = tapDrill(thread.name)
    const bossD = round(thread.d * 2.4, 2)
    const inset = round(wall + bossD / 2 + 0.5, 2)
    const bossHeight = round(height - floor - 2, 2)
    if (bossHeight < 2 * thread.d) throw new RangeError(`enclosure: the boss would be ${bossHeight} mm tall; ${thread.name} needs at least ${2 * thread.d} mm of thread engagement, so make the box taller`)
    if (length < 2 * inset + bossD || width < 2 * inset + bossD) throw new RangeError("enclosure: the box is too small for four screw bosses")
    // The thread of a screw in plastic or aluminium wants 2 diameters of engagement, plus the drill point and chip room.
    const pilotDepth = round(Math.min(bossHeight, tappedHoleDepth(thread.name, threadEngagement(thread.name, "plastic"))), 2)
    Object.assign(parameters, { bossDiameter: bossD, pilot, bossInset: inset, bossHeight, pilotDepth })
    const centres: Array<[string, Dimension, Dimension, number, number]> = [["bsw", "bossInset", "bossInset", inset, inset], ["bse", "length - bossInset", "bossInset", length - inset, inset], ["bne", "length - bossInset", "width - bossInset", length - inset, width - inset], ["bnw", "bossInset", "width - bossInset", inset, width - inset]]
    centres.forEach(([id, dx, dy, x, y]) => {
      features.push(circleSketch(`${id}_sketch`, "XY", "floor", [{ value: bossD, dim: "bossDiameter" }], { x, y, dx, dy }), { id, type: "extrude", sketch: `${id}_sketch`, depth: "bossHeight", operation: "union" })
    })
    centres.forEach(([id, dx, dy]) => features.push({ id: `${id}_pilot`, type: "hole", plane: "XY", offset: "floor + bossHeight", at: [dx, dy], diameter: "pilot", depth: "pilotDepth" }))
    Object.assign(derived, { bossDiameter: bossD, pilotDiameter: pilot, pilotDepth, bossHeight, bossInset: inset })
    rules.push(`boss outside diameter 2.4 x ${thread.name}`, "pilot hole = tap drill", "bosses stop 2 mm below the rim")
  }
  return {
    recipe: "enclosure", history: { parameters, features },
    summary: `Open enclosure ${length} x ${width} x ${height} mm, ${wall} mm walls${bosses ? ", four screw bosses" : ""}`,
    derived, rules
  }
}

const PIPE_BEND_PARAMS: ReadonlyArray<RecipeParam> = [
  { name: "outerDiameter", type: "number", description: "pipe outside diameter, mm", default: 30, min: 2, max: 500 },
  { name: "wall", type: "number", description: "wall thickness, mm", default: 3, min: 0.3, max: 100 },
  { name: "legA", type: "number", description: "length of the first straight run, mm", default: 100, min: 1, max: 5000 },
  { name: "legB", type: "number", description: "length of the second straight run, mm", default: 100, min: 1, max: 5000 },
  { name: "bendAngle", type: "number", description: "direction change at the elbow, degrees (90 = a right angle)", default: 90, min: 10, max: 170 },
  { name: "bendRadius", type: "number", description: "centre-line radius of the bend, mm; default 1.5 x the outside diameter (a long-radius elbow); 0 = a mitred elbow", min: 0 }
]

const pipeBend = (raw: Readonly<Record<string, unknown>>): RecipeResult => {
  const i = new Input("pipe_bend", raw, PIPE_BEND_PARAMS)
  const od = i.number("outerDiameter"), wall = i.number("wall"), legA = i.number("legA"), legB = i.number("legB"), bend = i.number("bendAngle")
  if (2 * wall >= od) throw new RangeError("pipe_bend: the wall must be less than the outside radius")
  if (legA < od || legB < od) throw new RangeError(`pipe_bend: each straight run must be at least one pipe diameter (${od} mm) so the mitred elbow does not collide with itself`)
  const turn = (bend * Math.PI) / 180
  const radius = i.optionalNumber("bendRadius") ?? round(1.5 * od, 2)
  const setback = radius * Math.tan(turn / 2)
  if (radius > 0 && radius < od / 2 + 1e-9) throw new RangeError(`pipe_bend: the bend radius ${radius} mm must exceed the pipe radius (${od / 2} mm) or the inside of the bend folds over itself`)
  if (radius > 0 && setback > Math.min(legA, legB) + 1e-9) throw new RangeError(`pipe_bend: a ${radius} mm bend of ${bend} degrees needs ${round(setback, 2)} mm of each straight run; the shorter run is ${Math.min(legA, legB)} mm`)
  const parameters: Record<string, number | string> = { od, wall, id: "od - 2 * wall", legA, legB, bend, ...(radius > 0 ? { bendRadius: radius } : {}) }
  const features: Feature[] = [
    circleSketch("section", "YZ", undefined, [{ value: od, dim: "od" }, { value: od - 2 * wall, dim: "id" }]),
    polygon("route", "XY", undefined, { x: 0, y: 0 }, [
      { x: legA, y: 0, dx: "legA", dy: 0 },
      { x: legA + legB * Math.cos(turn), y: legB * Math.sin(turn), dx: "legB * cos(rad(bend))", dy: "legB * sin(rad(bend))" }
    ]),
    { id: "pipe", type: "sweep", profile: "section", path: "route", operation: "new", ...(radius > 0 ? { bendRadius: "bendRadius" } : {}) }
  ]
  // The route is drawn as an open chain: drop the closing edge the polygon helper adds.
  const route = features[1] as SketchFeature
  features[1] = { ...route, sketch: { ...route.sketch, entities: route.sketch.entities.filter((e) => !(e.kind === "line" && e.id === `l${2}`)) } }
  return {
    recipe: "pipe_bend", history: { parameters, features },
    summary: `${radius > 0 ? `${bend} degree pipe bend R${radius}` : `Mitred ${bend} degree pipe elbow`} Ø${od} x ${wall} mm wall, runs of ${legA} and ${legB} mm`,
    derived: { innerDiameter: round(od - 2 * wall, 3), centrelineLength: round(radius > 0 ? legA + legB - 2 * setback + radius * turn : legA + legB, 3), flowArea: round((Math.PI / 4) * (od - 2 * wall) ** 2, 2), ...(radius > 0 ? { bendRadius: radius, straightSetback: round(setback, 3) } : {}) },
    rules: ["profile carried by parallel-transport frames", radius > 0 ? "bend radius >= pipe radius, default 1.5 x diameter (long-radius elbow)" : "mitre stretch keeps the wall thickness through the elbow", "run length >= the bend's tangent length"]
  }
}

const DUCT_PARAMS: ReadonlyArray<RecipeParam> = [
  { name: "shape", type: "string", description: "section shape at both ends", default: "rect", options: ["rect", "round"] },
  { name: "width1", type: "number", description: "start width (rect) or diameter (round), mm", default: 80, min: 2, max: 2000 },
  { name: "height1", type: "number", description: "start height (rect only), mm", default: 50, min: 2, max: 2000 },
  { name: "width2", type: "number", description: "end width (rect) or diameter (round), mm", default: 40, min: 2, max: 2000 },
  { name: "height2", type: "number", description: "end height (rect only), mm", default: 40, min: 2, max: 2000 },
  { name: "length", type: "number", description: "length of the transition, mm", default: 120, min: 5, max: 5000 },
  { name: "wall", type: "number", description: "wall thickness, mm", default: 2, min: 0.3, max: 100 }
]

const ductTransition = (raw: Readonly<Record<string, unknown>>): RecipeResult => {
  const i = new Input("duct_transition", raw, DUCT_PARAMS)
  const round2 = i.string("shape") === "round"
  const w1 = i.number("width1"), h1 = round2 ? w1 : i.number("height1"), w2 = i.number("width2"), h2 = round2 ? w2 : i.number("height2")
  const len = i.number("length"), wall = i.number("wall")
  if (2 * wall >= Math.min(w1, h1, w2, h2)) throw new RangeError("duct_transition: the wall must be less than half the smallest section")
  const parameters: Record<string, number | string> = { w1, w2, L: len, wall }
  if (!round2) { parameters["h1"] = h1; parameters["h2"] = h2 }
  const zText = (z: Dimension): string => (typeof z === "number" ? `(${z})` : `(${z})`)
  const at = (a: string, b: string, z: Dimension): string => `${a} + (${b} - ${a}) * ${zText(z)} / L`
  const num = (a: number, b: number, z: number): number => a + ((b - a) * z) / len
  const rectAt = (id: string, z: Dimension, zNum: number, inner: boolean): Feature => {
    const w = inner ? `(${at("w1", "w2", z)}) - 2 * wall` : at("w1", "w2", z), h = inner ? `(${at("h1", "h2", z)}) - 2 * wall` : at("h1", "h2", z)
    const wv = num(w1, w2, zNum) - (inner ? 2 * wall : 0), hv = num(h1, h2, zNum) - (inner ? 2 * wall : 0)
    return rectangleSketch(id, "XY", z, { x: -wv / 2, y: -hv / 2, dx: `-(${w}) / 2`, dy: `-(${h}) / 2` }, { value: wv, dim: w }, { value: hv, dim: h })
  }
  const roundAt = (id: string, z: Dimension, zNum: number, inner: boolean): Feature => {
    const d = inner ? `(${at("w1", "w2", z)}) - 2 * wall` : at("w1", "w2", z)
    return circleSketch(id, "XY", z, [{ value: num(w1, w2, zNum) - (inner ? 2 * wall : 0), dim: d }])
  }
  const section = round2 ? roundAt : rectAt
  const features: Feature[] = [
    section("outer_start", 0, 0, false), section("outer_end", "L", len, false),
    { id: "duct", type: "loft", sections: ["outer_start", "outer_end"], operation: "new" },
    // The bore runs a millimetre past each end, on the same taper, so the cut is clean.
    section("bore_start", -1, -1, true), section("bore_end", "L + 1", len + 1, true),
    { id: "bore", type: "loft", sections: ["bore_start", "bore_end"], operation: "subtract" }
  ]
  return {
    recipe: "duct_transition", history: { parameters, features },
    summary: `${round2 ? "Round" : "Rectangular"} duct transition ${round2 ? `Ø${w1} to Ø${w2}` : `${w1} x ${h1} to ${w2} x ${h2}`} mm over ${len} mm, ${wall} mm wall`,
    derived: { endArea1: round2 ? round((Math.PI / 4) * (w1 - 2 * wall) ** 2, 2) : round((w1 - 2 * wall) * (h1 - 2 * wall), 2), endArea2: round2 ? round((Math.PI / 4) * (w2 - 2 * wall) ** 2, 2) : round((w2 - 2 * wall) * (h2 - 2 * wall), 2) },
    rules: ["sections lofted with matching start points", "bore taper continues past the ends so the cut is clean", "uniform wall"]
  }
}

export const RECIPES: ReadonlyArray<RecipeSpec> = [
  { name: "mounting_plate", title: "Mounting plate", description: "Rectangular plate with four corner holes sized for a metric screw (optional counterbores, corner radius, edge chamfer); the edge distance and spacing rules are enforced.", params: MOUNTING_PLATE_PARAMS, build: mountingPlate },
  { name: "flange", title: "Bolted flange", description: "Round flange with a centre bore, a bolt circle of clearance holes (circular pattern), an optional hub and rim chamfer.", params: FLANGE_PARAMS, build: flange },
  { name: "l_bracket", title: "L bracket", description: "Right-angle bracket from an L profile extruded to width, with one or two clearance holes per leg centred on the free length.", params: L_BRACKET_PARAMS, build: lBracket },
  { name: "stepped_shaft", title: "Stepped shaft", description: "Turned shaft from a list of diameters and lengths with chamfered ends and an optional DIN 6885 keyway.", params: SHAFT_PARAMS, build: steppedShaft },
  { name: "pipe_bend", title: "Pipe elbow", description: "Hollow pipe with a mitred elbow, swept along a two-run route (sweep feature).", params: PIPE_BEND_PARAMS, build: pipeBend },
  { name: "duct_transition", title: "Duct transition", description: "Hollow duct that changes size over its length, rectangular or round (loft features, bore taper continued past the ends).", params: DUCT_PARAMS, build: ductTransition },
  { name: "enclosure", title: "Enclosure", description: "Open box with uniform walls, matching inside corner radius and four screw bosses with tap-drill pilot holes.", params: ENCLOSURE_PARAMS, build: enclosure }
]

export const recipeNames = (): ReadonlyArray<string> => RECIPES.map((r) => r.name)

/** Generates a recipe's history, or throws a `RangeError` naming the rule or input that failed. */
export const buildRecipe = (name: string, input: Readonly<Record<string, unknown>> = {}): RecipeResult => {
  const recipe = RECIPES.find((r) => r.name === name)
  if (recipe === undefined) throw new RangeError(`Unknown recipe '${name}'. Known: ${recipeNames().join(", ")}`)
  return recipe.build(input)
}

/** The sizes the fastener tables know, for the assistant to quote. */
export const fastenerSizes = (): ReadonlyArray<string> => METRIC_THREADS.map((m) => m.name)
export { metricThread }
