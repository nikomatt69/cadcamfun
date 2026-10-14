/**
 * Component automations on the exact model, one implementation for the canvas, the sidecar and the assistant: smart fasteners
 * from the holes the parts share, the exact interference check, the bill of materials and joints inferred from coaxial holes.
 * Every solid is the element's B-rep placed where the viewport draws it (`elementBrep`); an element without one is listed with
 * the reason, never approximated.
 *
 * Inserted fasteners are ordinary `brep` elements (the STEP-import path): they render, measure, export and machine like
 * any other exact solid, and carry `metadata.fastener` so a second run does not insert them twice and the interference
 * check knows a screw's thread belongs in its tapped hole.
 */
import { findMaterial } from "../cam/kernel/materials.ts"
import { assemblyInterference, billOfMaterials, jointsFromHoles, type AssemblyPart, type BomRow, type InferredJoint, type InterferenceReport } from "./assembly-analysis.ts"
import * as brep from "./brep/index.ts"
import { brepBox } from "./history-brep.ts"
import { elementBrep, gizmoTransform } from "./scene-step.ts"
import { fastenerSolids, planFasteners, type FastenerPlan, type UnfastenedStack } from "./smart-fasteners.ts"

type Element = Record<string, unknown> & { id?: string; type?: string; name?: string }

/** The elements a component or group holds (`elements`, or the library document's `data.elements` / `data.geometry.elements`). */
export const componentChildren = (element: Element): Element[] => {
  if (Array.isArray(element["elements"])) return element["elements"] as Element[]
  if (element.type === "component" || element.type === "group") {
    const data = element["data"] as { elements?: Element[]; geometry?: { elements?: Element[] } } | undefined
    return data?.elements ?? data?.geometry?.elements ?? []
  }
  return []
}

export interface FastenerMeta {
  readonly role: "screw" | "washer" | "nut"
  readonly designation: string
  readonly size: string
  readonly plan: string
  readonly seat: { readonly x: number; readonly y: number; readonly z: number }
  readonly direction: { readonly x: number; readonly y: number; readonly z: number }
  readonly bodies: ReadonlyArray<string>
  readonly tapped?: string
}

export interface ScenePart {
  readonly id: string
  readonly name: string
  readonly brep: brep.Brep
  readonly element: Element
  readonly fastener?: FastenerMeta
}

export interface SceneParts {
  readonly parts: ReadonlyArray<ScenePart>
  readonly skipped: ReadonlyArray<{ readonly id: string; readonly name: string; readonly reason: string }>
}

const SOLID_TYPES = new Set(["cube", "box", "sphere", "cylinder", "cone", "torus", "pyramid", "hemisphere", "prism", "extrusion", "revolution", "parametric", "brep", "boolean-union", "boolean-subtract", "boolean-intersect"])
const CONTAINERS = new Set(["component", "group", "assembly"])

const num = (v: unknown, fallback = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : fallback)
const nameOf = (e: Element): string => (typeof e.name === "string" && e.name !== "" ? e.name : String(e.type ?? "element"))
export const fastenerOf = (e: Element): FastenerMeta | undefined => {
  const m = e["metadata"]
  const f = m !== null && typeof m === "object" ? (m as Record<string, unknown>)["fastener"] : undefined
  return f !== null && typeof f === "object" ? (f as FastenerMeta) : undefined
}
const rotatedOrScaled = (e: Element): boolean => {
  const r = (e["rotation"] ?? {}) as Record<string, unknown>
  const s = (e["scale"] ?? {}) as Record<string, unknown>
  return num(r["x"]) !== 0 || num(r["y"]) !== 0 || num(r["z"]) !== 0 || num(s["x"], 1) !== 1 || num(s["y"], 1) !== 1 || num(s["z"], 1) !== 1
}

/**
 * The exact solids of the scene, in world coordinates: visible solids not consumed as Boolean operands, and the solids
 * inside components, placed, turned and uniformly scaled with them (a non-uniform scale is listed with the reason).
 */
export const sceneParts = (elements: ReadonlyArray<Element>): SceneParts => {
  const byId = new Map<string, Element>()
  for (const e of elements) if (typeof e.id === "string") byId.set(e.id, e)
  const consumed = new Set<string>()
  for (const e of elements) if (String(e.type).startsWith("boolean-") && Array.isArray(e["operands"])) for (const o of e["operands"] as unknown[]) consumed.add(String(o))
  const skipped: Array<{ id: string; name: string; reason: string }> = []
  // Parts of one element in its parent's frame: a container places its children at its own x / y / z, then turns, scales and
  // moves all of them together about the centre of their box, as the viewport turns the component's group.
  const visit = (e: Element): ScenePart[] => {
    const id = String(e.id ?? "")
    if (e["visible"] === false || consumed.has(id)) return []
    const type = String(e.type ?? "")
    if (CONTAINERS.has(type)) {
      const at = { x: num(e["x"]), y: num(e["y"]), z: num(e["z"]) }
      const moved = componentChildren(e).flatMap(visit).map((p) =>
        at.x === 0 && at.y === 0 && at.z === 0 ? p : { ...p, brep: brep.transformBrep(p.brep, brep.translation(at)) })
      if (moved.length === 0 || !rotatedOrScaled(e) && num(e["translateX"]) === 0 && num(e["translateY"]) === 0 && num(e["translateZ"]) === 0) return moved
      const boxes = moved.map((p) => brepBox(p.brep))
      const box = {
        lo: { x: Math.min(...boxes.map((b) => b.lo.x)), y: Math.min(...boxes.map((b) => b.lo.y)), z: Math.min(...boxes.map((b) => b.lo.z)) },
        hi: { x: Math.max(...boxes.map((b) => b.hi.x)), y: Math.max(...boxes.map((b) => b.hi.y)), z: Math.max(...boxes.map((b) => b.hi.z)) }
      }
      const tr = gizmoTransform(e, box)
      if (typeof tr === "string") { skipped.push({ id, name: nameOf(e), reason: tr }); return [] }
      return tr === undefined ? moved : moved.map((p) => ({ ...p, brep: brep.transformBrep(p.brep, tr) }))
    }
    if (!SOLID_TYPES.has(type)) return []
    let placed: ReturnType<typeof elementBrep>
    try {
      placed = elementBrep(e, byId)
    } catch (err) {
      skipped.push({ id, name: nameOf(e), reason: err instanceof Error ? err.message : String(err) }); return []
    }
    if (placed.brep === undefined) { skipped.push({ id, name: nameOf(e), reason: placed.reason }); return [] }
    const fastener = fastenerOf(e)
    return [{ id, name: nameOf(e), brep: placed.brep, element: e, ...(fastener !== undefined ? { fastener } : {}) }]
  }
  return { parts: elements.flatMap(visit), skipped }
}

const materialOf = (e: Element): string | undefined => {
  const m = e["metadata"]
  const fromMeta = m !== null && typeof m === "object" ? (m as Record<string, unknown>)["material"] : undefined
  const v = typeof fromMeta === "string" ? fromMeta : typeof e["material"] === "string" ? (e["material"] as string) : undefined
  return v === undefined || v === "" ? undefined : v
}

export interface FastenResult {
  /** New elements, ready for `addElements` (one undo step). */
  readonly elements: ReadonlyArray<Element>
  readonly plans: ReadonlyArray<FastenerPlan>
  readonly unfastened: ReadonlyArray<UnfastenedStack>
  /** Plans already fastened by earlier runs. */
  readonly existing: number
  readonly skipped: SceneParts["skipped"]
}

const STEEL_GREY = "#9aa3ad"

/**
 * The engagement class of a thread cut in a catalogue material (`threadEngagement`): 1.5 d in aluminium and the soft
 * copper alloys, 2 d in cast iron, plastics, wood and foam, 1 d in steels, stainless and titanium.
 */
export const threadMaterial = (material: string): "steel" | "aluminium" | "cast" | "plastic" => {
  const family = findMaterial(material)?.family ?? (/alumin/i.test(material) ? "aluminium-wrought" : undefined)
  if (family === undefined) return "steel"
  if (family.startsWith("aluminium") || family === "copper" || family === "brass" || family === "bronze") return "aluminium"
  if (family.startsWith("cast-iron")) return "cast"
  if (family.startsWith("thermo") || family.startsWith("wood") || family === "foam" || family.startsWith("composite")) return "plastic"
  return "steel"
}

/** The fastener plans the scene still needs (stacks of coaxial holes with no screw yet), the stacks no fastener fits, and how many were fastened already. */
export const planSceneFasteners = (scene: SceneParts, options: { readonly washers?: boolean } = {}): { readonly fresh: ReadonlyArray<FastenerPlan>; readonly unfastened: ReadonlyArray<UnfastenedStack>; readonly existing: number } => {
  const bodies = scene.parts.filter((p) => p.fastener === undefined)
  const placed = scene.parts.flatMap((p) => (p.fastener?.role === "screw" ? [p.fastener] : []))
  const analysis = planFasteners(bodies.map((p) => {
    const material = materialOf(p.element)
    const thread = material === undefined ? undefined : threadMaterial(material)
    return { id: p.id, brep: p.brep, ...(thread !== undefined ? { material: thread } : {}) }
  }), options.washers === undefined ? {} : { washers: options.washers })
  const fresh = analysis.plans.filter((plan) => !placed.some((f) =>
    Math.hypot(f.seat.x - plan.seat.x, f.seat.y - plan.seat.y, f.seat.z - plan.seat.z) < 1e-3 &&
    f.direction.x * plan.direction.x + f.direction.y * plan.direction.y + f.direction.z * plan.direction.z > 0.999999))
  return { fresh, unfastened: analysis.unfastened, existing: analysis.plans.length - fresh.length }
}

/** The screws, washers and nuts the scene's shared holes need, as exact `brep` elements. */
export const fastenScene = (elements: ReadonlyArray<Element>, options: { readonly washers?: boolean; readonly scene?: SceneParts } = {}): FastenResult => {
  const scene = options.scene ?? sceneParts(elements)
  const { fresh, unfastened, existing } = planSceneFasteners(scene, options.washers === undefined ? {} : { washers: options.washers })
  const out: Element[] = []
  for (const plan of fresh) {
    const group = crypto.randomUUID()
    for (const solid of fastenerSolids(plan)) {
      const fastener: FastenerMeta = {
        role: solid.role, designation: solid.designation, size: plan.size, plan: group,
        seat: plan.seat, direction: plan.direction, bodies: plan.bodies, ...(plan.tapped !== undefined ? { tapped: plan.tapped } : {})
      }
      out.push({
        type: "brep", name: solid.designation, brep: solid.brep, x: 0, y: 0, z: 0, color: STEEL_GREY,
        metadata: { fastener, material: "steel", automation: "smart-fasteners", ...(plan.warnings.length > 0 && solid.role === "screw" ? { warnings: plan.warnings } : {}) }
      })
    }
  }
  return { elements: out, plans: fresh, unfastened, existing, skipped: scene.skipped }
}

const density = (e: Element): number | undefined => {
  const material = materialOf(e)
  if (material === undefined) return undefined
  return findMaterial(material)?.density ?? (/steel/i.test(material) ? 7.85 : /alumin/i.test(material) ? 2.7 : undefined)
}

const assemblyParts = (scene: SceneParts): AssemblyPart[] => scene.parts.map((p) => {
  const material = materialOf(p.element)
  const rho = density(p.element)
  return {
    id: p.id, name: p.name, brep: p.brep,
    ...(p.fastener !== undefined ? { designation: p.fastener.designation } : {}),
    ...(material !== undefined ? { material } : {}),
    ...(rho !== undefined ? { density: rho } : {})
  }
})

export interface SceneInterference extends InterferenceReport {
  readonly names: ReadonlyMap<string, string>
  readonly skipped: SceneParts["skipped"]
}

/** Exact interference of every pair of solids; a screw's thread in the tapped hole it was planned for is expected. */
export const sceneInterference = (elements: ReadonlyArray<Element>, scene: SceneParts = sceneParts(elements)): SceneInterference => {
  const tapped = new Map<string, string>()
  for (const p of scene.parts) if (p.fastener?.role === "screw" && p.fastener.tapped !== undefined) tapped.set(p.id, p.fastener.tapped)
  const report = assemblyInterference(assemblyParts(scene), {
    expected: (a, b) => (tapped.get(a) === b || tapped.get(b) === a ? "thread engaged in the tapped hole" : undefined)
  })
  return { ...report, names: new Map(scene.parts.map((p) => [p.id, p.name])), skipped: scene.skipped }
}

/** The bill of materials of the scene's exact solids. */
export const sceneBom = (elements: ReadonlyArray<Element>, scene: SceneParts = sceneParts(elements)): { readonly rows: ReadonlyArray<BomRow>; readonly skipped: SceneParts["skipped"] } => {
  return { rows: billOfMaterials(assemblyParts(scene)), skipped: scene.skipped }
}

/** Joints inferred from the coaxial holes of the scene's parts (fasteners left out): revolute about one shared axis, fixed by two. */
export const sceneJoints = (elements: ReadonlyArray<Element>, scene: SceneParts = sceneParts(elements)): { readonly joints: ReadonlyArray<InferredJoint>; readonly names: ReadonlyMap<string, string>; readonly skipped: SceneParts["skipped"] } => {
  const bodies = scene.parts.filter((p) => p.fastener === undefined)
  return { joints: jointsFromHoles(bodies), names: new Map(bodies.map((p) => [p.id, p.name])), skipped: scene.skipped }
}

/** The BOM as CSV (RFC 4180), for a spreadsheet or an ERP import. */
export const bomCsv = (rows: ReadonlyArray<BomRow>): string => {
  const q = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
  const lines = ["Item,Name,Designation,Material,Quantity,Volume (mm3),Mass each (g),Mass total (g)"]
  for (const r of rows) {
    lines.push([String(r.item), q(r.name), q(r.designation ?? ""), q(r.material ?? ""), String(r.quantity), r.volume.toFixed(3),
      r.mass === undefined ? "" : r.mass.toFixed(3), r.mass === undefined ? "" : (r.mass * r.quantity).toFixed(3)].join(","))
  }
  return `${lines.join("\n")}\n`
}
