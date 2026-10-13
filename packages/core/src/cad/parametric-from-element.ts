/**
 * Makes an element parametric: the history that rebuilds the very same solid from named parameters.
 *
 * Every catalogue solid becomes a `primitive` feature whose measures are parameters named after the element's own fields (`width`,
 * `radius`, `teeth`, ...), so changing one parameter resizes it and nothing else; a flat shape (rectangle, circle, polygon, ellipse,
 * triangle) becomes a sketch shape extruded by a `depth` parameter; a component or a group becomes one feature per part, its
 * parameters prefixed by the part (`c0_width`). The solid comes from the same builder that draws and machines the element, so the
 * volume of the history is the volume of the element (the tests hold every convertible type to that).
 *
 * The element's own placement (`x`, `y`, `z`) and its gizmo transform (`rotation`, `scale`, `translateX/Y/Z`) are not parameters of
 * the history: they stay on the element that carries it, as for any other parametric part, and are returned in `carry` for the caller
 * to copy over. A part inside a container keeps its place as the parameters `<prefix>x`, `<prefix>y`, `<prefix>z`.
 */
import type { Dimension } from "./expr.ts"
import type { Feature, History, PrimitiveElement } from "./history.ts"
import type { SketchShape } from "./sketch-shapes.ts"

type Fields = Readonly<Record<string, unknown>>

export interface Conversion {
  readonly history: History
  /** Where the element stands, to give to the parametric element that replaces it. */
  readonly placement: { readonly x: number; readonly y: number; readonly z: number }
  /** Fields of the original to copy onto the parametric element: its name, colour, layer and gizmo transform. */
  readonly carry: Readonly<Record<string, unknown>>
  /** What could not be carried over, and what to do about it. */
  readonly notes: ReadonlyArray<string>
}

/** The numeric fields that become parameters, and the choices that stay options, of each catalogue solid. */
const SOLIDS: Readonly<Record<PrimitiveElement, { readonly numbers: ReadonlyArray<string>; readonly options?: ReadonlyArray<string>; readonly arrays?: ReadonlyArray<"profile" | "path" | "positions" | "profiles"> }>> = {
  cube: { numbers: ["width", "height", "depth"] },
  sphere: { numbers: ["radius", "segments"] },
  ellipsoid: { numbers: ["radiusX", "radiusY", "radiusZ", "segments"] },
  cylinder: { numbers: ["radius", "height", "segments"] },
  cone: { numbers: ["radius", "height", "segments"] },
  prism: { numbers: ["radius", "height", "sides"] },
  pyramid: { numbers: ["baseWidth", "baseDepth", "height"] },
  hemisphere: { numbers: ["radius", "segments"], options: ["direction"] },
  capsule: { numbers: ["radius", "height", "segments"], options: ["direction"] },
  torus: { numbers: ["radius", "tubeRadius"] },
  gear: { numbers: ["moduleValue", "teeth", "thickness", "pressureAngle", "holeDiameter"] },
  extrusion: { numbers: ["depth", "width", "height", "radius"], options: ["shape"], arrays: ["profile"] },
  revolution: { numbers: ["angle", "segments"], options: ["axis"], arrays: ["profile"] },
  sweep: { numbers: ["radius", "segments"], arrays: ["profile", "path"] },
  loft: { numbers: [], arrays: ["profiles", "positions"] },
  spring: { numbers: ["radius", "wireRadius", "turns", "height"] },
  bolt: { numbers: ["length"], options: ["size"] },
  screw: { numbers: ["length"], options: ["size"] },
  nut: { numbers: [], options: ["size"] },
  washer: { numbers: ["outerDiameter", "thickness"], options: ["size"] },
  wall: { numbers: ["length", "thickness", "height"] },
  floor: { numbers: ["width", "depth", "thickness"] },
  window: { numbers: ["width", "height", "thickness"] },
  door: { numbers: ["width", "height", "thickness"], options: ["style"] },
  column: { numbers: ["radius", "height"], options: ["style"] },
  roof: { numbers: ["width", "depth", "height"], options: ["style"] },
  stair: { numbers: ["width", "height", "depth", "steps"] }
}

const CARRIED = ["name", "color", "wireframe", "opacity", "layer", "layerId", "rotation", "scale", "translateX", "translateY", "translateZ", "linewidth"] as const
const FLAT = ["rectangle", "circle", "polygon", "ellipse", "triangle"] as const
const CONTAINERS = new Set(["component", "group"])
const num = (v: unknown, fallback = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : fallback)
const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v)
const record = (v: unknown): Fields | undefined => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Fields) : undefined)
const list = (v: unknown): ReadonlyArray<unknown> => (Array.isArray(v) ? v : [])

/** Every type this module can make parametric. */
export const CONVERTIBLE_TYPES: ReadonlyArray<string> = [...Object.keys(SOLIDS), ...FLAT, ...CONTAINERS]

interface Context {
  readonly parameters: Record<string, Dimension>
  readonly notes: string[]
  /** Depth given to a flat shape. */
  readonly depth: number
}

const pointsOf = (value: unknown): Array<readonly [number, number]> =>
  list(value).flatMap((p) => { const r = record(p); return r !== undefined && isNumber(r["x"]) && isNumber(r["y"]) ? [[r["x"], r["y"]] as const] : [] })
const triplesOf = (value: unknown): Array<readonly [number, number, number]> =>
  list(value).flatMap((p) => { const r = record(p); return r !== undefined && isNumber(r["x"]) && isNumber(r["y"]) ? [[r["x"], r["y"], num(r["z"])] as const] : [] })

/** Records `value` as the parameter `name` and returns the name, to be used as a dimension. */
const param = (ctx: Context, name: string, value: number): string => { ctx.parameters[name] = value; return name }

const convertSolid = (type: PrimitiveElement, e: Fields, prefix: string, ctx: Context, nested: boolean): Feature[] => {
  const table = SOLIDS[type]
  const params: Record<string, Dimension> = {}
  for (const key of table.numbers) if (isNumber(e[key])) params[key] = param(ctx, `${prefix}${key}`, e[key])
  // A tolerance stands in for the segment count of a round shape; it is a measure too.
  if (isNumber(e["tolerance"]) && e["tolerance"] > 0 && params["segments"] === undefined) params["tolerance"] = param(ctx, `${prefix}tolerance`, e["tolerance"])
  const options: Record<string, string> = {}
  for (const key of table.options ?? []) if (typeof e[key] === "string" && e[key] !== "") options[key] = e[key] as string
  const feature: { -readonly [K in keyof Extract<Feature, { type: "primitive" }>]: Extract<Feature, { type: "primitive" }>[K] } = {
    id: `${prefix}${type}`, type: "primitive", element: type, operation: "new"
  }
  if (Object.keys(params).length > 0) feature.params = params
  if (Object.keys(options).length > 0) feature.options = options
  const arrays = table.arrays ?? []
  if (arrays.includes("profile")) {
    const profile = pointsOf(e["profile"])
    if (profile.length > 0) feature.profile = profile
  }
  if (arrays.includes("path")) { const path = triplesOf(e["path"]); if (path.length > 0) feature.path = path }
  if (arrays.includes("positions")) { const positions = triplesOf(e["positions"]); if (positions.length > 0) feature.positions = positions }
  if (arrays.includes("profiles")) {
    const radii = list(e["profiles"]).map((p) => num(record(p)?.["radius"], NaN)).filter((r) => Number.isFinite(r))
    if (radii.length > 0) feature.radii = radii
  }
  if (nested) {
    feature.at = [param(ctx, `${prefix}x`, num(e["x"])), param(ctx, `${prefix}y`, num(e["y"])), param(ctx, `${prefix}z`, num(e["z"]))]
    const turn = record(e["rotation"])
    if (turn !== undefined) feature.rotation = [num(turn["x"]), num(turn["y"]), num(turn["z"])]
  }
  return [feature]
}

const convertFlat = (type: (typeof FLAT)[number], e: Fields, prefix: string, ctx: Context, nested: boolean): Feature[] => {
  const at: readonly [Dimension, Dimension] = nested ? [param(ctx, `${prefix}x`, num(e["x"])), param(ctx, `${prefix}y`, num(e["y"]))] : [0, 0]
  const id = `${prefix}shape`
  let shape: SketchShape
  switch (type) {
    case "rectangle": shape = { id, kind: "rectangle", at, width: param(ctx, `${prefix}width`, num(e["width"], 100)), height: param(ctx, `${prefix}height`, num(e["height"], 100)), centered: true }; break
    case "circle": shape = { id, kind: "circle", at, diameter: `2 * ${param(ctx, `${prefix}radius`, num(e["radius"], 50))}` }; break
    case "polygon": shape = { id, kind: "polygon", at, sides: Math.max(3, Math.floor(num(e["sides"], 6))), radius: param(ctx, `${prefix}radius`, num(e["radius"], 50)) }; break
    case "ellipse": shape = { id, kind: "ellipse", at, radiusX: param(ctx, `${prefix}radiusX`, num(e["radiusX"], 50)), radiusY: param(ctx, `${prefix}radiusY`, num(e["radiusY"], 25)) }; break
    case "triangle": {
      const points = pointsOf(e["points"])
      if (points.length < 3) { ctx.notes.push(`${prefix}triangle has fewer than three points and was left out`); return [] }
      shape = { id, kind: "polyline", points: points.slice(0, 3) }
      break
    }
  }
  const sketch: Feature = { id: `${prefix}profile`, type: "sketch", plane: "XY", ...(nested && num(e["z"]) !== 0 ? { offset: param(ctx, `${prefix}z`, num(e["z"])) } : {}), sketch: { entities: [], constraints: [], shapes: [shape] } }
  const body: Feature = { id: `${prefix}body`, type: "extrude", sketch: sketch.id, depth: param(ctx, `${prefix}depth`, ctx.depth), operation: "new" }
  return [sketch, body]
}

const convertAny = (e: Fields, prefix: string, ctx: Context, nested: boolean): Feature[] => {
  const type = String(e["type"])
  if (Object.hasOwn(SOLIDS, type)) return convertSolid(type as PrimitiveElement, e, prefix, ctx, nested)
  if ((FLAT as ReadonlyArray<string>).includes(type)) return convertFlat(type as (typeof FLAT)[number], e, prefix, ctx, nested)
  if (CONTAINERS.has(type)) {
    const features: Feature[] = []
    list(e["elements"]).forEach((child, index) => {
      const part = record(child)
      if (part === undefined) return
      features.push(...convertAny(part, `${prefix}c${index}_`, ctx, true))
    })
    return features
  }
  if (type.startsWith("boolean-")) ctx.notes.push(`${prefix}${type} combines other elements by id: convert its operands, then join, cut or intersect them with a combine feature`)
  else if (type === "parametric") ctx.notes.push(`${prefix}${type} is already parametric`)
  else if (type === "mesh") ctx.notes.push(`${prefix}mesh is imported geometry with no recoverable history, so it has no measures to turn into parameters`)
  else ctx.notes.push(`${prefix}${type} has no solid to make parametric (${CONVERTIBLE_TYPES.join(", ")} can be)`)
  return []
}

/**
 * The parametric history of an element, or an error saying why it cannot be made one. `depth` is the extrusion of a flat shape
 * (default 10 mm), which has none of its own.
 */
export const parametricFromElement = (element: Fields, options: { readonly depth?: number } = {}): Conversion | { readonly error: string } => {
  const depth = options.depth ?? 10
  if (!(depth > 0)) return { error: `The depth of a flat shape must be positive (it is ${depth})` }
  const ctx: Context = { parameters: {}, notes: [], depth }
  const type = String(element["type"])
  const features = convertAny(element, "", ctx, false)
  if (features.length === 0) return { error: ctx.notes.length > 0 ? ctx.notes.join("; ") : `A ${type} cannot be made parametric` }
  const carry: Record<string, unknown> = {}
  for (const key of CARRIED) if (element[key] !== undefined) carry[key] = element[key]
  return {
    history: { parameters: ctx.parameters, features },
    placement: { x: num(element["x"]), y: num(element["y"]), z: num(element["z"]) },
    carry,
    notes: ctx.notes
  }
}
