/**
 * The drawing as exact solids: every element of the CAD scene that has an exact model (the analytic catalogue solids,
 * parametric parts, and the Boolean elements computed on their operands with the exact kernel), placed exactly where the
 * viewport and the CAM put its mesh (`placeElementMesh`: the element's position, then its gizmo rotation, scale and
 * translation about the centre of its bounding box). `sceneToStep` writes them as one STEP AP214 file; a solid that only
 * has a mesh is written as a faceted solid and said so, a 2D or text element is skipped with the reason.
 */
import { elementMesh, type Element } from "../cam/model/element-mesh.ts"
import { LONG_BUDGET_MS, withBudget } from "./brep/budget.ts"
import { catalogueBrep, rebuildExact, brepBox } from "./history-brep.ts"
import type { History } from "./history.ts"
import {
  booleanBrep,
  healBrep,
  polyhedron,
  readStepBreps,
  transformBrep,
  translation,
  validateBrep,
  writeStepBreps,
  type Brep,
  type StepWriteOptions,
  type Transform,
  type Vec3
} from "./brep/index.ts"

const num = (v: unknown, fallback = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : fallback)

export type ElementBrep = { readonly brep: Brep; readonly reason?: undefined } | { readonly brep?: undefined; readonly reason: string }

/** Gizmo transform of an element about the centre of its solid's box, as `placeElementMesh` applies it. */
const gizmo = (e: Element, b: Brep): ElementBrep => {
  const tr = gizmoTransform(e, brepBox(b))
  if (typeof tr === "string") return { reason: tr }
  return { brep: tr === undefined ? b : transformBrep(b, tr) }
}

/**
 * The gizmo fields of an element (rotation in degrees, scale, translateX/Y/Z) as a rigid or uniformly scaled transform about
 * the centre of `box`, the pivot the viewport uses (the centre of the element's bounding box); undefined when the fields
 * leave it where it is, the reason when the scale is not uniform. Components use it with the box of all their parts.
 */
export const gizmoTransform = (e: Element, box: { readonly lo: Vec3; readonly hi: Vec3 }): Transform | string | undefined => {
  const r = typeof e["rotation"] === "object" && e["rotation"] !== null ? (e["rotation"] as Record<string, unknown>) : {}
  const s = typeof e["scale"] === "object" && e["scale"] !== null ? (e["scale"] as Record<string, unknown>) : {}
  const rx = num(r["x"]), ry = num(r["y"]), rz = num(r["z"])
  const sx = num(s["x"], 1), sy = num(s["y"], 1), sz = num(s["z"], 1)
  const tx = num(e["translateX"]), ty = num(e["translateY"]), tz = num(e["translateZ"])
  if (rx === 0 && ry === 0 && rz === 0 && sx === 1 && sy === 1 && sz === 1 && tx === 0 && ty === 0 && tz === 0) return undefined
  if (!(Math.abs(Math.abs(sx) - Math.abs(sy)) < 1e-12 && Math.abs(Math.abs(sx) - Math.abs(sz)) < 1e-12) || sx === 0)
    return "a non-uniform scale has no exact model (it turns circles into ellipses)"
  const c: Vec3 = { x: (box.lo.x + box.hi.x) / 2, y: (box.lo.y + box.hi.y) / 2, z: (box.lo.z + box.hi.z) / 2 }
  const a = (rx * Math.PI) / 180, bb = (ry * Math.PI) / 180, cc = (rz * Math.PI) / 180
  const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(bb), sb = Math.sin(bb), ck = Math.cos(cc), sk = Math.sin(cc)
  const R = [cb * ck, -cb * sk, sb, ca * sk + sa * sb * ck, ca * ck - sa * sb * sk, -sa * cb, sa * sk - ca * sb * ck, sa * ck + ca * sb * sk, ca * cb]
  // M = R · diag(sx, sy, sz)
  const m = [R[0]! * sx, R[1]! * sy, R[2]! * sz, R[3]! * sx, R[4]! * sy, R[5]! * sz, R[6]! * sx, R[7]! * sy, R[8]! * sz] as const
  const Mc = { x: m[0] * c.x + m[1] * c.y + m[2] * c.z, y: m[3] * c.x + m[4] * c.y + m[5] * c.z, z: m[6] * c.x + m[7] * c.y + m[8] * c.z }
  return { m, t: { x: c.x + tx - Mc.x, y: c.y + ty - Mc.y, z: c.z + tz - Mc.z } }
}

/**
 * The exact solid of one element, or why it has none. `byId` resolves the operands of Boolean elements (their own
 * placement included); cycles are refused.
 */
export const elementBrep = (e: Element, byId: ReadonlyMap<string, Element> = new Map(), seen: ReadonlySet<string> = new Set()): ElementBrep => {
  const type = String(e["type"] ?? "")
  const at: Vec3 = { x: num(e["x"]), y: num(e["y"]), z: num(e["z"]) }
  if (type === "parametric") {
    const history = e["history"] as History | undefined
    if (history === undefined || typeof history !== "object") return { reason: "the parametric element has no history" }
    const ex = rebuildExact(history)
    const missing = ex.bodies.find((b) => b.brep === undefined)
    if (ex.bodies.length === 0) return { reason: "the history builds no body" }
    if (missing !== undefined) return { reason: `body '${missing.id}': ${missing.reason}` }
    let united = ex.bodies[0]!.brep!
    for (const b of ex.bodies.slice(1)) united = booleanBrep(united, b.brep!, "union").brep
    return gizmo(e, transformBrep(united, translation(at)))
  }
  if (type === "brep") {
    const stored = e["brep"] as Brep | undefined
    if (stored === undefined || typeof stored !== "object" || !Array.isArray(stored.faces)) return { reason: "the element carries no B-rep" }
    return gizmo(e, at.x === 0 && at.y === 0 && at.z === 0 ? stored : transformBrep(stored, translation(at)))
  }
  if (type === "boolean-union" || type === "boolean-subtract" || type === "boolean-intersect") {
    const ids = Array.isArray(e["operands"]) ? (e["operands"] as unknown[]).map(String) : []
    if (ids.length < 2) return { reason: "a Boolean element needs two operands" }
    const id = String(e["id"] ?? "")
    if (seen.has(id)) return { reason: "the Boolean elements refer to each other in a cycle" }
    const next = new Set([...seen, id])
    const parts: Brep[] = []
    for (const oid of ids) {
      const o = byId.get(oid)
      if (o === undefined) return { reason: `operand '${oid}' is not in the drawing` }
      const ob = elementBrep(o, byId, next)
      if (ob.brep === undefined) return { reason: `operand '${oid}': ${ob.reason}` }
      parts.push(ob.brep)
    }
    const op = type === "boolean-union" ? "union" : type === "boolean-subtract" ? "subtract" : "intersect"
    let acc = parts[0]!
    try {
      for (const p of parts.slice(1)) acc = booleanBrep(acc, p, op).brep
    } catch (err) {
      return { reason: `exact ${op} failed: ${err instanceof Error ? err.message : String(err)}` }
    }
    return { brep: acc }
  }
  const params: Record<string, number> = {}
  for (const [k, v] of Object.entries(e)) if (typeof v === "number") params[k] = v
  const options: Record<string, string> = {}
  for (const [k, v] of Object.entries(e)) if (typeof v === "string") options[k] = v
  const profile = Array.isArray(e["profile"])
    ? (e["profile"] as unknown[]).flatMap((q) => {
        const r = q as Record<string, unknown> | null
        return r !== null && typeof r === "object" && Number.isFinite(r["x"] as number) && Number.isFinite(r["y"] as number) ? [{ x: r["x"] as number, y: r["y"] as number }] : []
      })
    : undefined
  const built = catalogueBrep(type, params, options, at, profile)
  if (typeof built === "string") return { reason: built }
  return gizmo(e, built.brep)
}

export interface StepImport {
  /** One `brep` element per solid (assembly instances included), in millimetres, at the origin of the file. */
  readonly elements: ReadonlyArray<{ readonly type: "brep"; readonly name: string; readonly brep: Brep; readonly x: 0; readonly y: 0; readonly z: 0 }>
  readonly report: ReadonlyArray<{ readonly name: string; readonly faces: number; readonly valid: boolean; readonly volume: number; readonly issues: ReadonlyArray<string>; readonly healed?: { readonly verticesWelded: number; readonly edgesWelded: number } }>
  readonly warnings: ReadonlyArray<string>
  readonly lengthScale: number
}

/**
 * A STEP file as drawing elements: each solid read exactly (faces, edges, surfaces, assembly placement, units) and
 * checked, so what is imported can be measured, machined and written back without loss.
 */
export const stepToElements = (text: string): StepImport => {
  const read = readStepBreps(text)
  // A solid that does not validate is healed (vertices and edges the exporter wrote per face are stitched); the healed body
  // replaces it only when it validates, otherwise the original and its issues are reported.
  const parts = read.parts.map((p) => {
    const rep = validateBrep(p.brep)
    if (rep.valid) return { name: p.name, brep: p.brep, rep }
    const h = healBrep(p.brep)
    return h.report.after.valid
      ? { name: p.name, brep: h.brep, rep: h.report.after, healed: { verticesWelded: h.report.verticesWelded, edgesWelded: h.report.edgesWelded } }
      : { name: p.name, brep: p.brep, rep }
  })
  const warnings = [...read.warnings, ...parts.flatMap((p) => ("healed" in p && p.healed !== undefined ? [`${p.name}: healed on import (${p.healed.verticesWelded} vertices and ${p.healed.edgesWelded} edges welded)`] : []))]
  return {
    elements: parts.map((p) => ({ type: "brep" as const, name: p.name, brep: p.brep, x: 0 as const, y: 0 as const, z: 0 as const })),
    report: parts.map((p) => ({ name: p.name, faces: p.brep.faces.length, valid: p.rep.valid, volume: p.rep.volume ?? 0, issues: p.rep.issues.slice(0, 5).map((i) => i.message), ...("healed" in p && p.healed !== undefined ? { healed: p.healed } : {}) })),
    warnings,
    lengthScale: read.lengthScale
  }
}

/** A closed triangle mesh as a faceted solid (one planar face per triangle), with coincident vertices welded. */
const facetedBrep = (positions: ArrayLike<number>, indices: ArrayLike<number>): Brep => {
  const key = (i: number) => `${Math.round(positions[i * 3]! * 1e6)},${Math.round(positions[i * 3 + 1]! * 1e6)},${Math.round(positions[i * 3 + 2]! * 1e6)}`
  const weld = new Map<string, number>()
  const points: Vec3[] = []
  const map: number[] = []
  for (let i = 0; i < positions.length / 3; i++) {
    const k = key(i)
    let w = weld.get(k)
    if (w === undefined) { w = points.length; points.push({ x: positions[i * 3]!, y: positions[i * 3 + 1]!, z: positions[i * 3 + 2]! }); weld.set(k, w) }
    map.push(w)
  }
  const faces: number[][] = []
  for (let t = 0; t + 2 < indices.length; t += 3) {
    const a = map[indices[t]!]!, b = map[indices[t + 1]!]!, c = map[indices[t + 2]!]!
    if (a !== b && b !== c && c !== a) faces.push([a, b, c])
  }
  return polyhedron(points, faces)
}

export interface SceneStepPart {
  readonly id: string
  readonly name: string
  /** False for a faceted copy of a mesh-only solid. */
  readonly exact: boolean
  readonly faces: number
  readonly valid: boolean
  readonly note?: string
}

export interface SceneStep {
  readonly step?: string
  readonly parts: ReadonlyArray<SceneStepPart>
  readonly skipped: ReadonlyArray<{ readonly id: string; readonly name: string; readonly reason: string }>
}

export interface SceneStepOptions extends StepWriteOptions {
  /** Write mesh-only solids as faceted solids (default true). */
  readonly faceted?: boolean
  /** Largest mesh written as facets (default 200 000 triangles). */
  readonly maxFacets?: number
}

/**
 * The drawing as a STEP file: visible solids that are not consumed as operands of a Boolean element, exact where the
 * kernel has a model, faceted otherwise.
 */
export const sceneToStep = (elements: ReadonlyArray<Element>, options: SceneStepOptions = {}): SceneStep => {
  const byId = new Map<string, Element>()
  for (const e of elements) if (typeof e["id"] === "string") byId.set(e["id"] as string, e)
  const consumed = new Set<string>()
  for (const e of elements) if (String(e["type"]).startsWith("boolean-") && Array.isArray(e["operands"])) for (const o of e["operands"] as unknown[]) consumed.add(String(o))
  const parts: SceneStepPart[] = []
  const skipped: Array<{ id: string; name: string; reason: string }> = []
  const breps: Array<{ name: string; brep: Brep }> = []
  for (const e of elements) {
    const id = String(e["id"] ?? `${breps.length}`)
    const name = typeof e["name"] === "string" && e["name"] !== "" ? (e["name"] as string) : String(e["type"] ?? "element")
    if (e["visible"] === false || consumed.has(id)) continue
    if (e["type"] === "workpiece" || e["type"] === "stock") { skipped.push({ id, name, reason: "the stock is not a part of the model" }); continue }
    const exact = withBudget(LONG_BUDGET_MS, () => elementBrep(e, byId))
    if (exact.brep !== undefined) {
      const rep = validateBrep(exact.brep, { skipVolume: true })
      breps.push({ name, brep: exact.brep })
      parts.push({ id, name, exact: true, faces: exact.brep.faces.length, valid: rep.valid })
      continue
    }
    if (options.faceted === false) { skipped.push({ id, name, reason: exact.reason }); continue }
    const mesh = elementMesh(e)
    if (mesh === undefined) { skipped.push({ id, name, reason: `no exact model (${exact.reason}) and no mesh: not a solid, or an operand is missing` }); continue }
    if (mesh.indices.length / 3 > (options.maxFacets ?? 200_000)) { skipped.push({ id, name, reason: `the mesh has more than ${options.maxFacets ?? 200_000} triangles` }); continue }
    const b = facetedBrep(mesh.positions, mesh.indices)
    const rep = validateBrep(b, { skipVolume: true })
    breps.push({ name, brep: b })
    parts.push({ id, name, exact: false, faces: b.faces.length, valid: rep.valid, note: `faceted: ${exact.reason}` })
  }
  return breps.length === 0 ? { parts, skipped } : { step: writeStepBreps(breps, options), parts, skipped }
}
