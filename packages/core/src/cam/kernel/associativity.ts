/**
 * CAD to CAM associativity (spec 59 A1, A2): did the model a stored kernel program was made from change, and how.
 *
 * `partFingerprint` digests what changes the machined shape: every element's geometry-bearing fields and its placement, the
 * parameters and active features of a parametric part. Names, layers, colours, visibility, selection, metadata and the display fields
 * of a feature (`name`, `group`, `appearance`) are left out, so renaming or recolouring never makes a program look out of date, and a
 * field this module does not know counts as geometry: it can only make a program look stale, never wrongly current.
 *
 * `programStatus` compares the elements a stored program embeds (`kernelRequest.elements`) with the drawing's elements now and says
 * `current`, `stale` (with the class and the element ids) or `unknown` (with the reason, never `current`). The settings the program
 * was made with (stock, machine, tools, post...) are compared separately and reported as their own reasons, so "the machine
 * changed" is not shown as "the model changed". Pure: no stored program is changed and nothing is regenerated here.
 */
import { canonicalJson, sha256 } from "./identity.ts"

export const PART_FINGERPRINT_SCHEMA = "cam-kernel/part-geometry@1"

type Fields = Readonly<Record<string, unknown>>

/** Fields of an element that never change the machined shape. */
const DISPLAY_FIELDS: ReadonlySet<string> = new Set([
  "name", "label", "description", "layer", "color", "colour", "visible", "hidden", "locked", "selected", "opacity", "metadata", "tags", "comment", "notes",
  "createdAt", "updatedAt", "appearance", "expanded", "groupName", "lineWidth", "lineType", "wireframe"
])
/** Fields of a feature of a parametric part that are display (spec 58 §3.1: only `suppressed` changes the model). */
const FEATURE_DISPLAY_FIELDS: ReadonlySet<string> = new Set(["name", "group", "appearance"])
/** The fields that place an element; the rest of it is its shape. */
const PLACEMENT_FIELDS: ReadonlySet<string> = new Set(["x", "y", "z", "x1", "y1", "z1", "x2", "y2", "z2", "translateX", "translateY", "translateZ"])

const isRecord = (value: unknown): value is Fields => typeof value === "object" && value !== null && !Array.isArray(value)
const round = (n: number): number => Math.round(n * 1e9) / 1e9

/** The value with every number rounded to a nanometre, so float noise from an expression or a round trip is not a change. */
const rounded = (value: unknown): unknown => {
  if (typeof value === "number") return Number.isFinite(value) ? round(value) : String(value)
  if (Array.isArray(value)) return value.map(rounded)
  if (isRecord(value)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, rounded(v)]))
  return value
}

const historyOf = (history: unknown): unknown => {
  if (!isRecord(history)) return history
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(history)) {
    if (key === "appearance") continue
    if (key === "features" && Array.isArray(value)) {
      out[key] = value.map((f) => (isRecord(f) ? Object.fromEntries(Object.entries(f).filter(([k]) => !FEATURE_DISPLAY_FIELDS.has(k))) : f))
      continue
    }
    out[key] = value
  }
  return out
}

/** The element without its display fields (and with a parametric part's display fields removed from the history). */
const geometryOf = (element: Fields): Fields => {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(element)) {
    if (DISPLAY_FIELDS.has(key)) continue
    out[key] = key === "history" ? historyOf(value) : value
  }
  return out
}

const digest = (value: unknown): string => sha256(canonicalJson(rounded(value)))

export interface PartFingerprint {
  readonly schema: typeof PART_FINGERPRINT_SCHEMA
  /** One digest of the whole part. */
  readonly digest: string
  /** Digest of each element's shape and placement, by element id (`#<index>` for an element without one). */
  readonly elements: Readonly<Record<string, string>>
  /** Digest of each element's shape alone (placement left out), the test for a rigid move. */
  readonly shapes: Readonly<Record<string, string>>
}

const keyOf = (element: Fields, index: number): string => (typeof element["id"] === "string" && element["id"].length > 0 ? element["id"] : `#${index}`)

export const partFingerprint = (elements: ReadonlyArray<Fields>): PartFingerprint => {
  const byId: Record<string, string> = {}
  const shapes: Record<string, string> = {}
  elements.forEach((element, index) => {
    const key = keyOf(element, index)
    const geometry = geometryOf(element)
    byId[key] = digest(geometry)
    shapes[key] = digest(Object.fromEntries(Object.entries(geometry).filter(([k]) => !PLACEMENT_FIELDS.has(k))))
  })
  const ordered = Object.keys(byId).sort()
  return { schema: PART_FINGERPRINT_SCHEMA, digest: sha256(canonicalJson(ordered.map((k) => [k, byId[k]]))), elements: byId, shapes }
}

/** The settings of a program that are inputs of it besides the model; a difference is reported as its own reason. */
export const PROGRAM_INPUT_FIELDS = [
  "material", "machine", "machineConfig", "setupOrientation", "origin", "workOffset", "stock", "operations", "tools", "finishAllowance", "scallop",
  "tolerance", "resolution", "deburr", "tabs", "breadth", "subprograms", "smoothing", "nativeCycles", "tcp", "postDefinition", "print"
] as const
export type ProgramInput = (typeof PROGRAM_INPUT_FIELDS)[number]

export type StaleClass =
  /** Elements were added or removed. */
  | "topology"
  /** An element's shape changed. */
  | "geometry"
  /** Every element moved by the same translation: the program is right for the part but not for the machine's zero. */
  | "rigid"
  /** The model is the same; a setting the program was made with differs. */
  | "inputs"

export interface Vec { readonly x: number; readonly y: number; readonly z: number }

export type ProgramStatus =
  | { readonly status: "current"; /** Elements that changed only in what the machined shape does not depend on (name, layer, colour...). */ readonly displayOnly: ReadonlyArray<string> }
  | {
    readonly status: "stale"
    readonly class: StaleClass
    readonly added: ReadonlyArray<string>
    readonly removed: ReadonlyArray<string>
    readonly changed: ReadonlyArray<string>
    /** The translation of a `rigid` change. */
    readonly move?: Vec
    /** The settings that differ from the ones the program was made with (empty when the current settings were not given). */
    readonly inputs: ReadonlyArray<ProgramInput>
    readonly reasons: ReadonlyArray<string>
  }
  | { readonly status: "unknown"; readonly reason: string }

export interface CurrentPart {
  readonly elements: ReadonlyArray<Fields>
  /** The settings the program would be made with now; absent: only the model is compared. */
  readonly settings?: Fields
}

const placementOf = (e: Fields): Vec | undefined => {
  const n = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0)
  if ("x" in e && "y" in e) return { x: n(e["x"]), y: n(e["y"]), z: n(e["z"]) }
  if ("x1" in e && "x2" in e) return { x: n(e["x1"]), y: n(e["y1"]), z: n(e["z1"]) }
  if ("translateX" in e || "translateY" in e || "translateZ" in e) return { x: n(e["translateX"]), y: n(e["translateY"]), z: n(e["translateZ"]) }
  return undefined
}

/** The end of a line element moves with its start; a segment whose two ends moved differently is not a rigid move. */
const endOf = (e: Fields): Vec | undefined => {
  if (!("x1" in e && "x2" in e)) return undefined
  const n = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0)
  return { x: n(e["x2"]), y: n(e["y2"]), z: n(e["z2"]) }
}

const sameVec = (a: Vec, b: Vec): boolean => Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6 && Math.abs(a.z - b.z) < 1e-6
const delta = (from: Vec, to: Vec): Vec => ({ x: to.x - from.x, y: to.y - from.y, z: to.z - from.z })

export const programStatus = (stored: { readonly request?: unknown }, current: CurrentPart): ProgramStatus => {
  const request = stored.request
  if (!isRecord(request)) return { status: "unknown", reason: "the program has no stored request: only a program the CAM kernel generated from the drawing can be compared with it" }
  const keptAll = request["elements"]
  if (!Array.isArray(keptAll) || keptAll.length === 0 || !keptAll.every(isRecord)) {
    return { status: "unknown", reason: "the stored request does not embed the elements it was made from, so there is nothing to compare the drawing with" }
  }
  if (!Array.isArray(current.elements) || !current.elements.every(isRecord)) return { status: "unknown", reason: "the drawing's elements could not be read" }
  // The stock block is not the part: moving or resizing it is a stock change (a setting), never a model change.
  const isPart = (e: Fields): boolean => e["type"] !== "workpiece"
  const kept = (keptAll as ReadonlyArray<Fields>).filter(isPart)
  const currentElements = current.elements.filter(isPart)
  if (kept.length === 0) return { status: "unknown", reason: "the stored request holds no part element, only stock" }
  let before: PartFingerprint, after: PartFingerprint
  try {
    before = partFingerprint(kept)
    after = partFingerprint(currentElements)
  } catch (cause) {
    return { status: "unknown", reason: `the elements cannot be fingerprinted: ${cause instanceof Error ? cause.message : String(cause)}` }
  }

  const added = Object.keys(after.elements).filter((id) => !(id in before.elements)).sort()
  const removed = Object.keys(before.elements).filter((id) => !(id in after.elements)).sort()
  const changed = Object.keys(after.elements).filter((id) => id in before.elements && before.elements[id] !== after.elements[id]).sort()

  const inputs: ProgramInput[] = []
  if (current.settings !== undefined) {
    for (const field of PROGRAM_INPUT_FIELDS) {
      if (!(field in request) && !(field in current.settings)) continue
      if (digest(request[field] ?? null) !== digest(current.settings[field] ?? null)) inputs.push(field)
    }
  }

  const reasons: string[] = []
  let cls: StaleClass | undefined
  let move: Vec | undefined
  if (added.length > 0 || removed.length > 0) {
    cls = "topology"
    if (added.length > 0) reasons.push(`${added.length} element${added.length === 1 ? "" : "s"} in the drawing that the program was not made from (a program made from a selection does not use them)`)
    if (removed.length > 0) reasons.push(`${removed.length} element${removed.length === 1 ? "" : "s"} removed from the drawing`)
    if (changed.length > 0) reasons.push(`${changed.length} element${changed.length === 1 ? "" : "s"} changed`)
  } else if (changed.length > 0) {
    // Rigid: every element moved, none changed shape, and all by one translation.
    const byKey = (list: ReadonlyArray<Fields>): Map<string, Fields> => new Map(list.map((e, i) => [keyOf(e, i), e] as const))
    const oldBy = byKey(kept), newBy = byKey(currentElements)
    let shift: Vec | undefined
    let rigid = changed.length === Object.keys(after.elements).length
    for (const id of changed) {
      if (!rigid) break
      const a = oldBy.get(id)!, b = newBy.get(id)!
      const pa = placementOf(a), pb = placementOf(b)
      if (before.shapes[id] !== after.shapes[id] || pa === undefined || pb === undefined) { rigid = false; break }
      const d = delta(pa, pb)
      const ea = endOf(a), eb = endOf(b)
      if (ea !== undefined && eb !== undefined && !sameVec(delta(ea, eb), d)) { rigid = false; break }
      if (shift !== undefined && !sameVec(shift, d)) { rigid = false; break }
      shift = d
    }
    if (rigid && shift !== undefined) {
      cls = "rigid"
      move = shift
      reasons.push(`the whole part moved by (${round(shift.x)}, ${round(shift.y)}, ${round(shift.z)}): the program is right for the part, not for the machine's zero`)
    } else {
      cls = "geometry"
      reasons.push(`the shape or placement of ${changed.length} element${changed.length === 1 ? "" : "s"} changed`)
    }
  } else if (inputs.length > 0) {
    cls = "inputs"
  }
  if (inputs.length > 0) reasons.push(`the settings the program was made with changed: ${inputs.join(", ")}`)

  if (cls === undefined) {
    // The fingerprint is the same: list what changed only in display fields.
    const raw = (list: ReadonlyArray<Fields>): Map<string, string> => new Map(list.map((e, i) => [keyOf(e, i), digest(e)] as const))
    const rawBefore = raw(kept), rawAfter = raw(currentElements)
    const displayOnly = [...rawAfter].filter(([id, d]) => rawBefore.get(id) !== undefined && rawBefore.get(id) !== d).map(([id]) => id).sort()
    return { status: "current", displayOnly }
  }
  return { status: "stale", class: cls, added, removed, changed, ...(move !== undefined ? { move } : {}), inputs, reasons }
}
