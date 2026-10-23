/**
 * What the generator is asked to machine, read from the stores the CAD editor writes.
 *
 * The CAD editor owns the elements, the selection and the workpiece (`cad/store/*`); the CAM side only
 * reads them, as the legacy app did through `useElementsStore` / `useCADStore`. These are pure functions
 * over store *snapshots*, so the rules (which element is the stock, what counts as selected) are testable
 * without a DOM and without the stores' reactivity.
 */
import { cam } from "@cadcamfun/core"
import { toJsonSafeRecord } from "../../../shared/state/json-safe.ts"
import { CamKernelRequest } from "@cadcamfun/api"
import { Schema } from "effect"

const g = cam.generator

export type CadElement = cam.generator.CadElement
export type Stock = cam.generator.Stock

export interface CadWorkpiece {
  readonly configured?: boolean
  readonly x?: number
  readonly y?: number
  readonly topZ?: number
  readonly allowance?: number
  readonly width: number
  readonly height: number
  readonly depth: number
  readonly radius?: number
  readonly material?: string
  readonly elementId?: string | undefined
}

export interface JobSources {
  /** `useElementsStore().elements`. */
  readonly elements: ReadonlyArray<CadElement>
  /** `useElementsStore().selectedElement` — the one the properties panel shows. */
  readonly selectedElement: CadElement | null
  /** `useSelectionStore().selectedElementIds` — the multi-selection. */
  readonly selectedIds: ReadonlyArray<string>
  /** `useCADStore().workpiece`. */
  readonly workpiece: CadWorkpiece
  /** `useCamStore().selectedWorkpieceElementId`. */
  readonly workpieceElementId: string | null
  /** `useCamStore().stockAllowance`. */
  readonly stockAllowance: number
}

/** Types the CAD editor uses for the raw piece itself; they are never machined as parts. */
const STOCK_TYPES = new Set(["workpiece"])

/** Selection order: the multi-selection (ids in click order), else the single selected element. */
export const selectedElements = (sources: Pick<JobSources, "elements" | "selectedElement" | "selectedIds">): CadElement[] => {
  const byId = new Map(sources.elements.map(element => [String(element["id"]), element] as const))
  const multi = sources.selectedIds.flatMap(id => {
    const found = byId.get(id)
    return found !== undefined && !STOCK_TYPES.has(String(found["type"])) ? [found] : []
  })
  if (multi.length > 0) return multi
  const single = sources.selectedElement
  return single !== null && !STOCK_TYPES.has(String(single["type"])) ? [single] : []
}

/**
 * The raw piece the toolpath starts from, in the order the legacy CAM store resolved it:
 *  1. an element linked as the workpiece (`syncWorkpieceFromCAD`: CAD `workpiece.elementId` or the CAM store's
 *     `selectedWorkpieceElementId`) — stock = that element's size, centred on it;
 *  2. a `workpiece` element drawn in the CAD scene (the workpiece setup panel creates one) — its size and position;
 *  3. the CAD store's workpiece size, centred on the origin.
 */
export const stockOf = (sources: JobSources): Stock => {
  if (sources.workpiece.configured) return {
    width: sources.workpiece.width, height: sources.workpiece.height, depth: sources.workpiece.depth,
    radius: sources.workpiece.radius ?? 0, x: sources.workpiece.x ?? 0, y: sources.workpiece.y ?? 0,
    topZ: sources.workpiece.topZ ?? 0, allowance: sources.workpiece.allowance ?? sources.stockAllowance,
    ...(sources.workpiece.material ? { material: sources.workpiece.material } : {}),
    ...(sources.workpiece.elementId ? { elementId: sources.workpiece.elementId } : {})
  }
  const linked = sources.elements.find(element => element["id"] === (sources.workpiece.elementId ?? sources.workpieceElementId))
  if (linked !== undefined) return g.stockFromElement(linked, sources.stockAllowance, sources.workpiece.material)
  const drawn = sources.elements.find(element => STOCK_TYPES.has(String(element["type"])))
  const x = drawn !== undefined ? Number(drawn["x"] ?? 0) : (sources.workpiece.x ?? 0)
  const y = drawn !== undefined ? Number(drawn["y"] ?? 0) : (sources.workpiece.y ?? 0)
  const width = Number(drawn?.["width"] ?? sources.workpiece.width)
  const height = Number(drawn?.["height"] ?? sources.workpiece.height)
  const depth = Number(drawn?.["depth"] ?? sources.workpiece.depth)
  return {
    width: width > 0 ? width : 100,
    height: height > 0 ? height : 100,
    depth: depth > 0 ? depth : 20,
    radius: Number(sources.workpiece.radius ?? 0),
    x,
    y,
    topZ: sources.workpiece.topZ ?? (drawn !== undefined ? Number(drawn["z"] ?? 0) + depth / 2 : 0),
    allowance: sources.workpiece.allowance ?? sources.stockAllowance,
    ...(sources.workpiece.material ? { material: sources.workpiece.material } : {})
  }
}

export interface GeometryForm {
  readonly geometryType: cam.generator.GeometryType
  readonly rectangleWidth: number
  readonly rectangleHeight: number
  readonly circleRadius: number
  readonly polygonSides: number
  readonly polygonRadius: number
  readonly customPath: string
}

/** The `geometry` part of a generate / suggest request. */
export const geometryOf = (form: GeometryForm, sources: JobSources): cam.generator.GeometryInput => ({
  geometryType: form.geometryType,
  rectangleWidth: form.rectangleWidth,
  rectangleHeight: form.rectangleHeight,
  circleRadius: form.circleRadius,
  polygonSides: form.polygonSides,
  polygonRadius: form.polygonRadius,
  customPath: form.customPath,
  // Elements may hold what JSON cannot (undefined, NaN, typed arrays, cycles): send the plain-JSON form.
  selectedElements: selectedElements(sources).map((element) => toJsonSafeRecord(element)),
  stock: toJsonSafeRecord(stockOf(sources))
})

/** Snapshot the selected parts and their Boolean operands, or the whole drawing when nothing is selected. */
export const kernelRequestOf = (sources: JobSources, options: Pick<CamKernelRequest, "setupOrientation" | "material" | "machine" | "machineConfig" | "origin" | "finishAllowance" | "scallop" | "tolerance" | "workOffset" | "resolution" | "subprograms">): CamKernelRequest => {
  const selected = selectedElements(sources)
  const roots = selected.length > 0 ? selected : sources.elements.filter((element) => !STOCK_TYPES.has(String(element["type"])))
  const byId = new Map(sources.elements.map((element) => [String(element["id"]), element]))
  const included = new Set<CadElement>()
  const include = (element: CadElement): void => {
    if (included.has(element)) return
    included.add(element)
    if (Array.isArray(element["operands"])) for (const id of element["operands"]) {
      const operand = byId.get(String(id))
      if (operand !== undefined) include(operand)
    }
  }
  roots.forEach(include)
  const hasStock = sources.workpiece.configured || sources.workpiece.elementId || sources.workpieceElementId || sources.elements.some((element) => STOCK_TYPES.has(String(element["type"])))
  // The request schema takes absent keys, never undefined values: a key without a value is left out.
  const given = Object.fromEntries(Object.entries(options).filter(([, value]) => value !== undefined))
  const snapshot = {
    schemaVersion: 1 as const, name: "CAD manufacturing job", ...given,
    elements: [...included].map(toJsonSafeRecord), ...(hasStock ? { stock: stockOf(sources) } : {})
  }
  return Schema.decodeUnknownSync(CamKernelRequest)({ ...snapshot, id: cam.kernel.digestOf("desktop-cam-job", snapshot) })
}

/** The resolved kernel stock in the same work coordinates as its program; the CAD workpiece stays unchanged. */
export const kernelStockOf = (artifact: cam.kernel.CamArtifact): Stock => {
  const { min, max } = artifact.stockBounds
  return {
    width: max.x - min.x, height: max.y - min.y, depth: max.z - min.z, radius: 0, allowance: 0,
    x: (min.x + max.x) / 2 - artifact.origin.x, y: (min.y + max.y) / 2 - artifact.origin.y,
    topZ: max.z - artifact.origin.z, material: artifact.material.id
  }
}

/** Short label of an element for lists ("cube: Base" / "circle: 4f3a2b1c"). */
export const elementLabel = (element: CadElement): string =>
  `${String(element["type"])}: ${String(element["name"] || String(element["id"]).substring(0, 8))}`

/** Dimension rows the panel shows for the selected element (legacy "Element Dimensions" block). */
export const dimensionRows = (e: CadElement, depth: number): Array<readonly [string, string]> => {
  const mm = (value: unknown): string => `${String(value)} mm`
  const rows: Array<readonly [string, string]> = []
  const radius = Number(e["radius"])
  switch (e["type"]) {
    case "rectangle":
      rows.push(["Width:", mm(e["width"])], ["Height:", mm(e["height"])], ["Position X:", mm(e["x"])], ["Position Y:", mm(e["y"])])
      if (e["z"] !== undefined) rows.push(["Position Z:", mm(e["z"])])
      break
    case "circle":
      rows.push(["Radius:", mm(e["radius"])], ["Diameter:", mm(radius * 2)], ["Center X:", mm(e["x"])], ["Center Y:", mm(e["y"])])
      if (e["z"] !== undefined) rows.push(["Center Z:", mm(e["z"])])
      break
    case "line": {
      const length = Math.sqrt(Math.pow(Number(e["x2"]) - Number(e["x1"]), 2) + Math.pow(Number(e["y2"]) - Number(e["y1"]), 2))
      rows.push(["Point 1 X:", mm(e["x1"])], ["Point 1 Y:", mm(e["y1"])], ["Point 2 X:", mm(e["x2"])], ["Point 2 Y:", mm(e["y2"])], ["Length:", `${length.toFixed(2)} mm`])
      break
    }
    case "polygon":
      rows.push(["Sides:", String(e["sides"] || "N/A")], ["Radius:", `${String(e["radius"] || "N/A")} mm`], ["Center X:", mm(e["x"])], ["Center Y:", mm(e["y"])])
      break
    case "cube":
      rows.push(["Width:", mm(e["width"])], ["Height:", mm(e["height"])], ["Depth:", mm(e["depth"])], ["Center X:", mm(e["x"])], ["Center Y:", mm(e["y"])], ["Center Z:", mm(e["z"])])
      break
    case "sphere":
      rows.push(["Radius:", mm(e["radius"])], ["Diameter:", mm(radius * 2)], ["Center X:", mm(e["x"])], ["Center Y:", mm(e["y"])], ["Center Z:", mm(e["z"])])
      break
    case "cylinder":
      rows.push(["Radius:", mm(e["radius"])], ["Diameter:", mm(radius * 2)], ["Height:", mm(e["height"])], ["Center X:", mm(e["x"])], ["Center Y:", mm(e["y"])], ["Center Z:", mm(e["z"])])
      break
    case "cone":
      rows.push(["Base Radius:", mm(e["radius"])], ["Height:", mm(e["height"])], ["Center X:", mm(e["x"])], ["Center Y:", mm(e["y"])], ["Center Z:", mm(e["z"])])
      break
    default:
      return []
  }
  rows.push(["Machining Depth:", `${depth} mm`])
  return rows
}

/** One-line summary under "Selected Element" in the 3D-printer geometry source (legacy copy). */
export const elementSummary = (e: CadElement): string | undefined => {
  const radius = Number(e["radius"])
  switch (e["type"]) {
    case "cube": return `Cube: ${String(e["width"])}mm × ${String(e["height"])}mm × ${String(e["depth"])}mm`
    case "sphere": return `Sphere: ${radius * 2}mm diameter`
    case "cylinder": return `Cylinder: ${radius * 2}mm diameter × ${String(e["height"])}mm height`
    case "cone": return `Cone: ${radius * 2}mm base diameter × ${String(e["height"])}mm height`
    case "rectangle": return `Rectangle: ${String(e["width"])}mm × ${String(e["height"])}mm`
    case "circle": return `Circle: ${radius * 2}mm diameter`
    case "polygon": return `Polygon: ${String(e["sides"])} sides, ${radius * 2}mm diameter`
    default: return undefined
  }
}

/** Depth the legacy "geometry type" select applied when switching to "From Selected Element". */
export const depthForSelection = (e: CadElement, current: number): number => {
  const n = (value: unknown): number => Number(value) || 0
  switch (e["type"]) {
    case "cube": return n(e["depth"]) || current
    case "cylinder": case "cone": case "extrude": case "pyramid": case "prism": case "capsule": return n(e["height"]) || current
    case "sphere": return n(e["radius"]) * 2 || current
    case "hemisphere": return n(e["radius"]) || current
    case "ellipsoid": return n(e["radiusZ"]) * 2 || n(e["depth"]) || current
    default: {
      // Solids without a formula here (parametric, revolve, mesh, ...) are as deep as their bounds; 2D shapes keep the depth.
      const size = g.elementBounds(e).dimensions.depth
      return Number.isFinite(size) && size > 0 ? Math.round(size * 1000) / 1000 : current
    }
  }
}

const fixed = (value: number): string => `${Math.round(value * 1000) / 1000} mm`

/** Overall size and position of the selected element (its bounding box), whatever its type. */
export const boundsRows = (e: CadElement): Array<readonly [string, string]> => {
  const b = g.elementBounds(e)
  if (![b.dimensions.width, b.dimensions.height, b.dimensions.depth].every(Number.isFinite)) return []
  return [
    ["Size X:", fixed(b.dimensions.width)], ["Size Y:", fixed(b.dimensions.height)], ["Size Z:", fixed(b.dimensions.depth)],
    ["Centre X:", fixed(b.center.x)], ["Centre Y:", fixed(b.center.y)], ["Top Z:", fixed(b.max.z)], ["Bottom Z:", fixed(b.min.z)]
  ]
}

/** Size of the raw piece, and how much of it the machining depth takes. */
export const stockRows = (stock: Stock, depth: number): Array<readonly [string, string]> => [
  ["Stock X:", fixed(stock.width)], ["Stock Y:", fixed(stock.height)], ["Stock Z:", fixed(stock.depth)],
  ["Stock top Z:", fixed(stock.topZ ?? 0)], ["Allowance:", fixed(stock.allowance ?? 0)],
  ["Stock left after cut:", fixed(stock.depth - depth)]
]

/**
 * Raw piece for a selection: the union of the bounding boxes of every selected element, centred on it, top at the
 * highest face. Flat selections (no height) keep the depth of the current stock.
 */
export const stockForSelection = (selection: ReadonlyArray<CadElement>, current: Stock, allowance: number): Stock | undefined => {
  const boxes = selection.map(g.elementBounds).filter((b) => [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z].every(Number.isFinite))
  if (boxes.length === 0) return undefined
  const lo = (axis: "x" | "y" | "z"): number => Math.min(...boxes.map((b) => b.min[axis]))
  const hi = (axis: "x" | "y" | "z"): number => Math.max(...boxes.map((b) => b.max[axis]))
  const round = (value: number): number => Math.round(value * 1000) / 1000
  const width = hi("x") - lo("x"), height = hi("y") - lo("y"), depth = hi("z") - lo("z")
  if (!(width > 0) || !(height > 0)) return undefined
  const first = selection[0]
  return {
    width: round(width), height: round(height), depth: round(depth > 0 ? depth : current.depth),
    radius: selection.length === 1 ? Number(first?.["radius"]) || 0 : 0,
    x: round((lo("x") + hi("x")) / 2), y: round((lo("y") + hi("y")) / 2), topZ: round(hi("z")), allowance,
    ...(current.material ? { material: current.material } : {})
  }
}
