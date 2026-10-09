/**
 * What the assistant's CAD tools read and write: the editor's own `elements` (the shape the CAD page
 * renders, saves in `drawing.data.elements` and the toolpath generator machines), not a second entity
 * model. Pure functions, so the mapping is testable without a database.
 *
 * Conventions (millimetres, radians): a `rectangle` input gives its corner, the stored element its centre
 * (the editor draws it centred); 3D shapes are placed by their centre; a polyline becomes line segments,
 * because the editor has no polyline element.
 */
export type Element = Record<string, unknown> & { readonly id: string; readonly type: string; readonly layerId: string }

interface P { readonly x: number; readonly y: number; readonly z?: number | undefined }
type Input = Record<string, unknown> & { readonly type: string }

const z = (p: P): number => p.z ?? 0
const at = (p: P) => ({ x: p.x, y: p.y, z: z(p) })

const look = (input: Input): Record<string, unknown> => ({
  ...(typeof input["name"] === "string" ? { name: input["name"] } : {}),
  ...(typeof input["color"] === "string" ? { color: input["color"] } : {})
})

const line = (a: P, b: P, extra: Record<string, unknown>) => ({
  type: "line", x1: a.x, y1: a.y, z1: z(a), x2: b.x, y2: b.y, z2: z(b), linewidth: 2, color: "#1e88e5", ...extra
})

/** Fields of the element(s) one tool input creates, before ids and the layer are assigned. */
export const elementFields = (input: Input): ReadonlyArray<Record<string, unknown>> => {
  const p = (key: string) => input[key] as P
  const n = (key: string) => input[key] as number
  const extra = look(input)
  switch (input.type) {
    case "line": return [line(p("start"), p("end"), extra)]
    case "circle": return [{ type: "circle", ...at(p("center")), radius: n("radius"), linewidth: 1, color: "#1e88e5", ...extra }]
    case "arc": return [{ type: "arc", ...at(p("center")), radius: n("radius"), startAngle: n("startAngle"), endAngle: n("endAngle"), color: "#1e88e5", ...extra }]
    case "rectangle": {
      const o = p("origin")
      return [{ type: "rectangle", x: o.x + n("width") / 2, y: o.y + n("height") / 2, z: z(o), width: n("width"), height: n("height"), linewidth: 1, color: "#1e88e5", ...extra }]
    }
    case "polyline": {
      const points = input["points"] as ReadonlyArray<P>
      const closed = input["closed"] === true
      const pairs = points.slice(1).map((point, index) => [points[index]!, point] as const)
      if (closed && points.length > 2) pairs.push([points[points.length - 1]!, points[0]!])
      return pairs.map(([a, b]) => line(a, b, extra))
    }
    case "cube": return [{ type: "cube", ...at(p("center")), width: n("width"), height: n("height"), depth: n("depth"), color: "#1e88e5", wireframe: true, ...extra }]
    case "sphere": return [{ type: "sphere", ...at(p("center")), radius: n("radius"), color: "#1e88e5", wireframe: true, ...extra }]
    case "cylinder": return [{ type: "cylinder", ...at(p("center")), radius: n("radius"), height: n("height"), color: "#1e88e5", wireframe: true, ...extra }]
    case "cone": return [{ type: "cone", ...at(p("center")), radius: n("radius"), height: n("height"), color: "#1e88e5", wireframe: true, ...extra }]
    case "torus": return [{ type: "torus", ...at(p("center")), radius: n("radius"), tubeRadius: n("tube"), color: "#1e88e5", wireframe: true, ...extra }]
    default: return []
  }
}

/** New elements for a tool call; `layerFor` maps a requested layer name or id to a real layer id. */
export const newElements = (inputs: ReadonlyArray<Input>, defaultLayer: string, newId: () => string): Element[] =>
  inputs.flatMap((input) => {
    const layerId = typeof input["layer"] === "string" ? input["layer"] : defaultLayer
    return elementFields(input).map((fields) => ({ ...fields, id: newId(), layerId }) as Element)
  })

/**
 * Applies a change set to an element, translating the tool's field names to the element's own
 * (`center` -> x/y/z, `start`/`end` -> x1..z2, `origin` + size -> centre, `tube` -> tubeRadius, `layer` -> layerId); every
 * other field (x, y, z, rotation, scale, history, ...) is set as given, and `parameters` merges into a parametric part's history.
 */
export const applyChanges = (element: Element, changes: Record<string, unknown>): Element => {
  const next: Record<string, unknown> = { ...element }
  const point = (key: string): P | undefined => changes[key] as P | undefined
  for (const [key, value] of Object.entries(changes)) {
    if (["center", "start", "end", "origin", "layer", "tube", "points", "closed", "id", "type", "parameters"].includes(key)) continue
    next[key] = value
  }
  // A parametric part: `parameters` sets named dimensions inside its history (the rest of the history stays), so one
  // dimension changes without sending the whole feature list again. A whole `history` in the same change wins as the base.
  const named = changes["parameters"]
  if (element.type === "parametric" && named !== null && typeof named === "object" && !Array.isArray(named)) {
    const history = (next["history"] ?? {}) as { readonly parameters?: Record<string, unknown> } & Record<string, unknown>
    next["history"] = { ...history, parameters: { ...(history.parameters ?? {}), ...(named as Record<string, unknown>) } }
  }
  const center = point("center")
  if (center) Object.assign(next, at(center))
  const start = point("start")
  if (start) Object.assign(next, { x1: start.x, y1: start.y, z1: z(start) })
  const end = point("end")
  if (end) Object.assign(next, { x2: end.x, y2: end.y, z2: z(end) })
  const origin = point("origin")
  if (origin && element.type === "rectangle") {
    Object.assign(next, { x: origin.x + (Number(next["width"]) || 0) / 2, y: origin.y + (Number(next["height"]) || 0) / 2, z: z(origin) })
  }
  if (typeof changes["tube"] === "number") next["tubeRadius"] = changes["tube"]
  if (typeof changes["layer"] === "string") next["layerId"] = changes["layer"]
  return next as Element
}

const num = (value: unknown): number | undefined => (typeof value === "number" && Number.isFinite(value) ? value : undefined)

/** The bounding box of one element, or undefined when it has none (the generator's `elementBounds`, passed in by the caller). */
export type BoundsOf = (element: Record<string, unknown>) => { readonly min: P3; readonly max: P3 } | undefined
interface P3 { readonly x: number; readonly y: number; readonly z: number }

/**
 * Bounds and extent of what is drawn, for the model's overview. With `boundsOf` every element counts by its real bounds (an
 * extrusion, a revolution, a wall or a parametric part has no radius to read them from); without it the fields are read by type.
 */
export const describeElements = (elements: ReadonlyArray<Element>, limit = 200, boundsOf?: BoundsOf) => {
  const counts: Record<string, number> = {}
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
  const growBox = (lo: P3, hi: P3) => {
    minX = Math.min(minX, lo.x); maxX = Math.max(maxX, hi.x)
    minY = Math.min(minY, lo.y); maxY = Math.max(maxY, hi.y)
    minZ = Math.min(minZ, lo.z); maxZ = Math.max(maxZ, hi.z)
  }
  const grow = (x: number | undefined, y: number | undefined, zed: number | undefined, rx = 0, ry = 0, rz = 0) => {
    if (x === undefined || y === undefined) return
    growBox({ x: x - rx, y: y - ry, z: (zed ?? 0) - rz }, { x: x + rx, y: y + ry, z: (zed ?? 0) + rz })
  }
  const sizes = new Map<string, readonly [number, number, number]>()
  for (const e of elements) {
    counts[e.type] = (counts[e.type] ?? 0) + 1
    const box = boundsOf?.(e)
    if (box !== undefined && [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z].every(Number.isFinite)) {
      growBox(box.min, box.max)
      const round = (v: number) => Math.round(v * 1000) / 1000
      sizes.set(e.id, [round(box.max.x - box.min.x), round(box.max.y - box.min.y), round(box.max.z - box.min.z)])
      continue
    }
    if (e.type === "line") { grow(num(e["x1"]), num(e["y1"]), num(e["z1"])); grow(num(e["x2"]), num(e["y2"]), num(e["z2"])) }
    else if (e.type === "rectangle") grow(num(e["x"]), num(e["y"]), num(e["z"]), (num(e["width"]) ?? 0) / 2, (num(e["height"]) ?? 0) / 2)
    else if (e.type === "cube") grow(num(e["x"]), num(e["y"]), num(e["z"]), (num(e["width"]) ?? 0) / 2, (num(e["height"]) ?? 0) / 2, (num(e["depth"]) ?? 0) / 2)
    else if (e.type === "cylinder" || e.type === "cone") grow(num(e["x"]), num(e["y"]), num(e["z"]), num(e["radius"]) ?? 0, num(e["radius"]) ?? 0, (num(e["height"]) ?? 0) / 2)
    else grow(num(e["x"]), num(e["y"]), num(e["z"]), num(e["radius"]) ?? 0, num(e["radius"]) ?? 0, e.type === "sphere" ? num(e["radius"]) ?? 0 : 0)
  }
  const empty = !Number.isFinite(minX)
  return {
    total: elements.length,
    counts,
    bounds: empty ? null : { min: { x: minX, y: minY, z: minZ }, max: { x: maxX, y: maxY, z: maxZ } },
    elements: elements.slice(0, limit).map((e) => ({
      id: e.id, type: e.type, name: typeof e["name"] === "string" ? e["name"] : undefined, layerId: e.layerId,
      ...(num(e["x"]) !== undefined ? { x: e["x"], y: e["y"], z: e["z"] ?? 0 } : {}),
      ...(sizes.has(e.id) ? { size: sizes.get(e.id) } : {})
    }))
  }
}

/** The elements of a stored drawing, whatever else its `data` holds. */
export const elementsOf = (data: unknown): Element[] => {
  const list = data !== null && typeof data === "object" ? (data as { elements?: unknown }).elements : undefined
  return Array.isArray(list) ? (list.filter((item) => item !== null && typeof item === "object" && typeof (item as Element).id === "string") as Element[]) : []
}
