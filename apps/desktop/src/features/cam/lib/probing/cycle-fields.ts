/**
 * The fields of each probe cycle as the editor shows them (spec 73 §4). A cycle is edited in its wire shape (mm, degrees for angles);
 * the core's `ProbeCycleSchema` turns it into the core record (radians), so the conversion happens in one place and the editor's
 * refusals are the core's. Field lists are stable per kind: the order never changes while a value is typed.
 */
import { Schema } from "effect"
import { probing, type ProbeCycle, type ProbeCycleKind } from "./contract.ts"

export type FieldKind = "length" | "angle" | "int" | "sense" | "boolean" | "choice" | "numbers" | "points"

export interface CycleField {
  /** Dotted path into the wire spec (`centre.x`, `sphere.diameter`). */
  readonly path: string
  readonly kind: FieldKind
  readonly optional?: boolean
  readonly choices?: ReadonlyArray<string | number>
}

const L = (path: string, optional = false): CycleField => ({ path, kind: "length", ...(optional ? { optional } : {}) })
const xy = (base: string): ReadonlyArray<CycleField> => [L(`${base}.x`), L(`${base}.y`)]
const side = [L("depth"), L("top", true)]

const FIELDS: Readonly<Record<ProbeCycleKind, ReadonlyArray<CycleField>>> = {
  "z-surface": [...xy("at"), L("expectedZ")],
  edge: [...xy("at"), L("at.z"), { path: "normalAngle", kind: "angle" }],
  corner: [...xy("corner"), { path: "inside", kind: "boolean" }, { path: "xSense", kind: "sense" }, { path: "ySense", kind: "sense" }, ...side, L("inset", true), { path: "touchesPerEdge", kind: "choice", choices: [1, 2], optional: true }],
  web: [...xy("centre"), L("width"), { path: "angle", kind: "angle" }, ...side],
  pocket: [...xy("centre"), L("width"), { path: "angle", kind: "angle" }, ...side],
  rectangle: [...xy("centre"), { path: "inside", kind: "boolean" }, L("size.x"), L("size.y"), ...side],
  bore: [...xy("centre"), L("diameter"), ...side],
  boss: [...xy("centre"), L("diameter"), ...side],
  "edge-angle": [...xy("start"), { path: "alongAngle", kind: "angle" }, L("pitch"), { path: "normalAngle", kind: "angle" }, ...side],
  plane: [L("expectedZ"), { path: "points", kind: "points" }],
  sphere: [...xy("centre"), L("centre.z"), L("diameter"), { path: "touches", kind: "choice", choices: [5, 9], optional: true }],
  "tool-length": [{ path: "tool", kind: "int" }, L("nominalLength", true)],
  "tool-radius": [{ path: "tool", kind: "int" }, L("nominalRadius", true)],
  "broken-tool": [{ path: "tool", kind: "int" }, L("nominalLength", true)],
  "stylus-calibrate": [{ path: "artefact.kind", kind: "choice", choices: ["ring", "sphere", "height"] }, ...xy("artefact.centre"), L("artefact.diameter"), L("artefact.depth", true), { path: "directions", kind: "choice", choices: [4, 8, 16], optional: true }],
  "rotary-axis": [{ path: "axis", kind: "choice", choices: ["A", "B", "C"] }, ...xy("sphere.centre"), L("sphere.centre.z"), L("sphere.diameter"), { path: "angles", kind: "numbers" }]
}

/** The stable field list of a cycle kind. */
export const fieldsOf = (kind: ProbeCycleKind): ReadonlyArray<CycleField> => FIELDS[kind]

/** A cycle in the editor: wire units, flat where the wire has a unit vector (the editor types its angle, degrees from +X). */
export type CycleSpec = { readonly kind: ProbeCycleKind } & Readonly<Record<string, unknown>>

export const getPath = (spec: Readonly<Record<string, unknown>>, path: string): unknown =>
  path.split(".").reduce<unknown>((value, key) => (value !== null && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined), spec)

/** `spec` with `path` set (undefined removes it); nested objects are copied, never mutated. */
export const setPath = <S extends Readonly<Record<string, unknown>>>(spec: S, path: string, value: unknown): S => {
  const [head, ...rest] = path.split(".")
  const out: Record<string, unknown> = { ...spec }
  if (rest.length === 0) {
    if (value === undefined) delete out[head!]
    else out[head!] = value
    return out as S
  }
  const child = out[head!] !== null && typeof out[head!] === "object" ? out[head!] as Record<string, unknown> : {}
  out[head!] = setPath(child, rest.join("."), value)
  return out as S
}

/** A new cycle of `kind`, sized for a first touch (the editor and the target picker fill the real figures). */
export const defaultSpecOf = (kind: ProbeCycleKind, at: { readonly x: number; readonly y: number } = { x: 0, y: 0 }): CycleSpec => {
  const centre = { x: at.x, y: at.y }
  switch (kind) {
    case "z-surface": return { kind, at: centre, expectedZ: 0 }
    case "edge": return { kind, at: { ...centre, z: -3 }, normalAngle: 0 }
    case "corner": return { kind, corner: centre, inside: false, xSense: 1, ySense: 1, depth: 3 }
    case "web": case "pocket": return { kind, centre, width: 10, angle: 0, depth: 3 }
    case "rectangle": return { kind, centre, inside: false, size: { x: 50, y: 30 }, depth: 3 }
    case "bore": case "boss": return { kind, centre, diameter: 20, depth: 5 }
    case "edge-angle": return { kind, start: centre, alongAngle: 0, pitch: 20, normalAngle: -90, depth: 3 }
    case "plane": return { kind, points: [{ x: at.x, y: at.y }, { x: at.x + 20, y: at.y }, { x: at.x, y: at.y + 20 }], expectedZ: 0 }
    case "sphere": return { kind, centre: { ...centre, z: 0 }, diameter: 25 }
    case "tool-length": case "broken-tool": return { kind, tool: 1 }
    case "tool-radius": return { kind, tool: 1 }
    case "stylus-calibrate": return { kind, artefact: { kind: "ring", centre, diameter: 25, depth: 5 } }
    case "rotary-axis": return { kind, axis: "A", sphere: { centre: { ...centre, z: 50 }, diameter: 25 }, angles: [0, 30, 60, 90] }
  }
}

const DEG = Math.PI / 180
const unit = (deg: unknown) => (typeof deg === "number" ? { x: Number(Math.cos(deg * DEG).toFixed(12)), y: Number(Math.sin(deg * DEG).toFixed(12)) } : undefined)

/** The wire record of an editor spec: angles of unit vectors become the vectors; everything else is already the wire shape. */
export const wireOf = (spec: CycleSpec): Record<string, unknown> => {
  const { normalAngle, alongAngle, ...rest } = spec as Record<string, unknown>
  const out: Record<string, unknown> = { ...rest }
  if (spec.kind === "edge" || spec.kind === "edge-angle") out.normal = unit(normalAngle)
  if (spec.kind === "edge-angle") out.along = unit(alongAngle)
  if (spec.kind === "stylus-calibrate") {
    const artefact = { ...(out.artefact as Record<string, unknown>) }
    if (artefact.kind === "sphere") { delete artefact.depth; artefact.centre = { ...(artefact.centre as object), z: 0 } }
    if (artefact.kind === "height") { const c = artefact.centre as { x: number; y: number }; artefact.at = c; artefact.z = 0; delete artefact.centre; delete artefact.diameter; delete artefact.depth }
    out.artefact = artefact
  }
  return out
}

/** The editor spec of a core cycle (radians back to degrees through the same schema). */
export const specOf = (cycle: ProbeCycle): CycleSpec => {
  const wire = Schema.encodeSync(probing.ProbeCycleSchema)(cycle) as Record<string, unknown>
  const angle = (v: unknown) => { const u = v as { x: number; y: number }; return Number((Math.atan2(u.y, u.x) / DEG).toFixed(9)) }
  const { normal, along, ...rest } = wire
  return {
    ...(rest as CycleSpec),
    ...(normal !== undefined ? { normalAngle: angle(normal) } : {}),
    ...(along !== undefined ? { alongAngle: angle(along) } : {})
  }
}

/** The core cycle of a spec, or the reasons the core refuses it. */
export const cycleOfSpec = (spec: CycleSpec): { readonly ok: true; readonly cycle: ProbeCycle } | { readonly ok: false; readonly issues: ReadonlyArray<string> } => {
  const decoded = Schema.decodeUnknownExit(probing.ProbeCycleSchema)(wireOf(spec))
  if (decoded._tag === "Success") return { ok: true, cycle: decoded.value as ProbeCycle }
  return { ok: false, issues: [String(decoded.cause).split("\n").find((line) => line.trim() !== "")?.trim() ?? "invalid cycle"] }
}
