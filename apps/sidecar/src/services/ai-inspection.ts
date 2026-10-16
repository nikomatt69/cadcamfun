import { ELEMENT_SPECS, decodeHistory } from "@cadcamfun/ai"
import { usesOf, resolveParameters } from "@cadcamfun/core"

type Element = Record<string, unknown> & { id: string; type: string }
/**
 * Bound expensive property values, while providing an exact paging path for every omitted value. Raised with the
 * wire caps (limit 100, maxChars 50000): a page keeps up to 12 000 characters per element and 8 000 per property,
 * so one reading carries the parameters of ordinary parts instead of omitting them early.
 */
export const inspectProperties = (element: Element) => {
  let remaining = 12_000
  return Object.fromEntries(Object.entries(element).map(([key, value]) => {
  const json = JSON.stringify(value)
  const length = (json?.length ?? 0) + key.length
  if (length <= Math.min(8_000, remaining)) { remaining -= length; return [key, value] }
  return [key, { omitted: true, chars: json?.length, readWith: { action: "property", elementId: element.id, path: [key], offset: 0 } }]
  }))
}

export const readProperty = (element: Element, path: ReadonlyArray<string>, offset: number, maxChars: number) => {
  let value: unknown = element
  for (const key of path) {
    if (value === null || typeof value !== "object" || ["__proto__", "prototype", "constructor"].includes(key) || !Object.hasOwn(value, key)) return { ok: false, error: "Property path not found." }
    value = (value as Record<string, unknown>)[key]
  }
  const content = JSON.stringify(value)
  if (content === undefined || offset > content.length) return { ok: false, error: "Property offset is out of range." }
  return { ok: true, elementId: element.id, path, encoding: "json", content: content.slice(offset, offset + maxChars), totalChars: content.length, nextOffset: offset + maxChars < content.length ? offset + maxChars : null }
}

/** Real nominal relationships, with no guessed mating constraints or inferred shared parameter bindings. */
export const componentParameters = (element: Record<string, unknown>, prefix = "", depth = 0): unknown[] => {
  if (depth > 10) return [{ omitted: true, reason: "Maximum component nesting depth" }]
  const decoded = decodeHistory(element["history"])
  const own = decoded.success ? [{ path: prefix || String(element["id"] ?? "root"), parameters: decoded.data.parameters, resolved: resolveParameters(decoded.data.parameters).values, dependencies: Object.keys(decoded.data.parameters).map((name) => ({ name, ...usesOf(decoded.data, name) })) }] : []
  const children = Array.isArray(element["elements"]) ? element["elements"] : []
  return [...own, ...children.slice(0, 100).flatMap((child, index) => child !== null && typeof child === "object" ? componentParameters(child as Record<string, unknown>, `${prefix}/elements/${index}`, depth + 1) : [])]
}

// ---------------------------------------------------------------- origins (`cad.inspect_origins`)

/** A point in the drawing's own frame, millimetres. */
export interface OriginPoint { readonly x: number; readonly y: number; readonly z: number }
export interface OriginBox { readonly min: OriginPoint; readonly max: OriginPoint }

/**
 * The frame every origin is measured in: the one the canvas draws and the toolpath machines (Z-up), so a number in this
 * answer can be compared with a G-code coordinate without a conversion.
 */
export const ORIGIN_AXES = {
  x: "+X to the right",
  y: "+Y up in the 2D view (into the screen in a front view)",
  z: "+Z up out of the XY plane (the canvas' up axis)"
} as const

const finite = (value: unknown, fallback = 0): number => (typeof value === "number" && Number.isFinite(value) ? value : fallback)
const round = (value: number): number => Math.round(value * 1000) / 1000
const norm = (point: OriginPoint): number => round(Math.hypot(point.x, point.y, point.z))

/**
 * The point an element's placement is stored at: its x,y,z (the centre for solids and centred shapes), a line's start
 * point, or — for geometry that carries only its own fields — the gizmo translate. Everything below is read from here.
 */
export const placementOf = (element: Record<string, unknown>): OriginPoint => {
  if ("x" in element || "y" in element) return { x: finite(element["x"]), y: finite(element["y"]), z: finite(element["z"]) }
  if ("x1" in element) return { x: finite(element["x1"]), y: finite(element["y1"]), z: finite(element["z1"]) }
  return { x: finite(element["translateX"]), y: finite(element["translateY"]), z: finite(element["translateZ"]) }
}

/**
 * The gizmo transform an element carries, or undefined when it carries none. Rotation is degrees (XYZ order), scale
 * factors of 1 mean none; the transform turns and scales about the centre of the element's bounding box. Values are
 * cleaned to six decimals: the editor composes rotations through quaternions, so a 90° turn is stored as 89.999999….
 */
export const gizmoOf = (element: Record<string, unknown>): { readonly rotation: OriginPoint; readonly scale: OriginPoint; readonly translate: OriginPoint } | undefined => {
  const clean = (value: number): number => Math.round(value * 1e6) / 1e6
  const structure = (value: unknown): Record<string, unknown> => (typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {})
  const r = structure(element["rotation"]), s = structure(element["scale"])
  const rotation = { x: clean(finite(r["x"])), y: clean(finite(r["y"])), z: clean(finite(r["z"])) }
  const scale = { x: clean(finite(s["x"], 1)), y: clean(finite(s["y"], 1)), z: clean(finite(s["z"], 1)) }
  const translate = { x: clean(finite(element["translateX"])), y: clean(finite(element["translateY"])), z: clean(finite(element["translateZ"])) }
  const active = rotation.x !== 0 || rotation.y !== 0 || rotation.z !== 0
    || scale.x !== 1 || scale.y !== 1 || scale.z !== 1
    || translate.x !== 0 || translate.y !== 0 || translate.z !== 0
  return active ? { rotation, scale, translate } : undefined
}

/**
 * What the origin point *means* per type, where the catalogue's own line does not say it. The rest falls back to the
 * type's catalogue line plus the shared rule (`x,y,z` places the element; the centre for centred shapes).
 */
const ORIGIN_NOTES: Readonly<Record<string, string>> = {
  component: "x,y,z is the component's placement; every child is stored relative to it, so a child's world origin is this point plus the child's own",
  group: "x,y,z is the group's placement; every child is stored relative to it, so a child's world origin is this point plus the child's own",
  "boolean-union": "the geometry is its operands, each at its own origin; x,y,z is only a nominal anchor of the result",
  "boolean-subtract": "the geometry is its operands, each at its own origin; x,y,z is only a nominal anchor of the result",
  "boolean-intersect": "the geometry is its operands, each at its own origin; x,y,z is only a nominal anchor of the result",
  mesh: "x,y,z translates the vertex cloud; the vertices are drawing-millimetre coordinates themselves",
  parametric: "x,y,z places the built solid; the history's features are in the part's own frame, their sketch planes through this origin",
  extrusion: "the profile is centred on x,y and the solid grows from z to z + depth",
  revolution: "the profile turns about the vertical axis at x,y (axis y) or about X (axis x); profile y is the height above the origin",
  sweep: "the profile is swept along the path, which is relative to x,y,z",
  loft: "the profiles sit at the positions, which are relative to x,y,z",
  line: "the line starts at (x1,y1,z1) and ends at (x2,y2,z2): the origin is its start point",
  triangle: "the points are drawing coordinates; x,y do not move the triangle",
  spline: "the points are relative to x,y,z, which places the curve",
  bezier: "the points are relative to x,y,z, which places the curve",
  nurbs: "the points are relative to x,y,z, which places the curve",
  wall: "z is the wall's base (0 stands it on the XY plane); length runs along X, thickness along Y",
  floor: "the slab is centred on x,y,z (its faces at z ± thickness/2)",
  roof: "the roof's base sits at z (a flat roof is a slab centred there); width along X, depth along Y",
  stair: "the stair's bottom is at z; the steps rise along +Z and run toward -Y",
  door: "the door is centred on x,y,z; width along X, thickness along Y, height along Z",
  window: "the window is centred on x,y,z; width along X, thickness along Y, height along Z"
}

const catalogueLine = (type: string): string => (ELEMENT_SPECS as Record<string, { readonly doc: string } | undefined>)[type]?.doc ?? type

/** One sentence: what the origin point is for this type. */
export const conventionOf = (type: string): string =>
  ORIGIN_NOTES[type] ?? `${catalogueLine(type)} — x,y,z is the placement in drawing millimetres (the centre for solids and centred shapes)`

/** How deep the child walk goes; beyond it the entry says so instead of truncating silently. */
const MAX_ORIGIN_DEPTH = 4

/**
 * The children of a container, each with its own origin (relative to the container, where the editor stores it) and its
 * absolute position whenever the chain of containers carries no gizmo: a turned or scaled container moves its parts by
 * a transform this reading does not apply, so those children answer `absolute: null` rather than a wrong number.
 */
const childOrigins = (children: ReadonlyArray<unknown>, base: OriginPoint | null, depth: number): ReadonlyArray<unknown> => {
  if (depth >= MAX_ORIGIN_DEPTH) return [{ omitted: true, reason: "Maximum component nesting depth", count: children.length }]
  return children.map((child, index) => {
    const fields = (child !== null && typeof child === "object" ? child : {}) as Record<string, unknown>
    const origin = placementOf(fields)
    const gizmo = gizmoOf(fields)
    const absolute = base !== null
      ? { x: round(base.x + origin.x), y: round(base.y + origin.y), z: round(base.z + origin.z) }
      : null
    // Only a gizmo on a container displaces the positions below it: a turned leaf still stands at its own placement.
    const below = base !== null && gizmo === undefined ? absolute : null
    const nested = Array.isArray(fields["elements"]) ? fields["elements"] as ReadonlyArray<unknown> : []
    return {
      index,
      type: typeof fields["type"] === "string" ? fields["type"] : "unknown",
      name: typeof fields["name"] === "string" ? fields["name"] : null,
      origin,
      absolute,
      distanceFromZeroMm: absolute !== null ? norm(absolute) : null,
      ...(gizmo !== undefined ? { gizmo } : {}),
      ...(nested.length > 0 ? { children: childOrigins(nested, below, depth + 1) } : {})
    }
  })
}

/**
 * One element of `cad.inspect_origins`: where it sits, what its origin means, how far it is from the CAD zero, and —
 * for a parametric part — the named parameters its history carries (`componentParameters`).
 */
export const originEntry = (element: Element, boundsOf: (element: Record<string, unknown>) => OriginBox | undefined): Record<string, unknown> => {
  const origin = placementOf(element)
  const gizmo = gizmoOf(element)
  const children = Array.isArray(element["elements"]) ? childOrigins(element["elements"] as ReadonlyArray<unknown>, gizmo === undefined ? origin : null, 0) : []
  const operands = Array.isArray(element["operands"]) ? element["operands"].filter((id): id is string => typeof id === "string") : []
  const parametric = element["history"] !== undefined ? componentParameters(element) : []
  return {
    id: element.id,
    type: element.type,
    name: typeof element["name"] === "string" ? element["name"] : null,
    layerId: typeof element.layerId === "string" ? element.layerId : "",
    origin,
    convention: conventionOf(String(element.type)),
    bounds: boundsOf(element) ?? null,
    distanceFromZeroMm: norm(origin),
    ...(gizmo !== undefined ? { gizmo } : {}),
    ...(operands.length > 0 ? { operands } : {}),
    ...(parametric.length > 0 ? { parametric } : {}),
    ...(children.length > 0 ? { children } : {})
  }
}
