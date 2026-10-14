/**
 * Component automations of the CAD canvas on the exact model (`@cadcamfun/core`): smart fasteners from the holes the
 * parts share, the exact interference check and the bill of materials. Every solid is the element's B-rep placed where
 * the viewport draws it (`elementBrep`); an element without one is listed with the reason, never approximated.
 *
 * Inserted fasteners are ordinary `brep` elements (the STEP-import path): they render, measure, export and machine like
 * any other exact solid, and carry `metadata.fastener` so a second run does not insert them twice and the interference
 * check knows a screw's thread belongs in its tapped hole.
 */
import {
  assemblyInterference,
  billOfMaterials,
  brep,
  cam,
  elementBrep,
  fastenerSolids,
  planFasteners,
  type AssemblyPart,
  type BomRow,
  type FastenerPlan,
  type InterferenceReport,
  type UnfastenedStack
} from "@cadcamfun/core"
import { componentChildren } from "./component-assembly.ts"

type Element = Record<string, unknown> & { id?: string; type?: string; name?: string }

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
 * inside components (a component moved without rotation or scale; a rotated one is listed with the reason).
 */
export const sceneParts = (elements: ReadonlyArray<Element>): SceneParts => {
  const byId = new Map<string, Element>()
  for (const e of elements) if (typeof e.id === "string") byId.set(e.id, e)
  const consumed = new Set<string>()
  for (const e of elements) if (String(e.type).startsWith("boolean-") && Array.isArray(e["operands"])) for (const o of e["operands"] as unknown[]) consumed.add(String(o))
  const parts: ScenePart[] = []
  const skipped: Array<{ id: string; name: string; reason: string }> = []
  const visit = (e: Element, offset: { x: number; y: number; z: number }) => {
    const id = String(e.id ?? "")
    if (e["visible"] === false || consumed.has(id)) return
    const type = String(e.type ?? "")
    if (CONTAINERS.has(type)) {
      if (rotatedOrScaled(e)) { skipped.push({ id, name: nameOf(e), reason: "a rotated or scaled component is not placed exactly yet" }); return }
      const at = { x: offset.x + num(e["x"]), y: offset.y + num(e["y"]), z: offset.z + num(e["z"]) }
      for (const child of componentChildren(e as never) as unknown as Element[]) visit(child, at)
      return
    }
    if (!SOLID_TYPES.has(type)) return
    let placed: ReturnType<typeof elementBrep>
    try {
      placed = elementBrep(e as never, byId as never)
    } catch (err) {
      skipped.push({ id, name: nameOf(e), reason: err instanceof Error ? err.message : String(err) }); return
    }
    if (placed.brep === undefined) { skipped.push({ id, name: nameOf(e), reason: placed.reason }); return }
    const b = offset.x === 0 && offset.y === 0 && offset.z === 0 ? placed.brep : brep.transformBrep(placed.brep, brep.translation(offset))
    const fastener = fastenerOf(e)
    parts.push({ id, name: nameOf(e), brep: b, element: e, ...(fastener !== undefined ? { fastener } : {}) })
  }
  for (const e of elements) visit(e, { x: 0, y: 0, z: 0 })
  return { parts, skipped }
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
  const family = cam.kernel.findMaterial(material)?.family ?? (/alumin/i.test(material) ? "aluminium-wrought" : undefined)
  if (family === undefined) return "steel"
  if (family.startsWith("aluminium") || family === "copper" || family === "brass" || family === "bronze") return "aluminium"
  if (family.startsWith("cast-iron")) return "cast"
  if (family.startsWith("thermo") || family.startsWith("wood") || family === "foam" || family.startsWith("composite")) return "plastic"
  return "steel"
}

/** The screws, washers and nuts the scene's shared holes need, as exact `brep` elements. */
export const fastenScene = (elements: ReadonlyArray<Element>, options: { readonly washers?: boolean } = {}): FastenResult => {
  const scene = sceneParts(elements)
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
  return { elements: out, plans: fresh, unfastened: analysis.unfastened, existing: analysis.plans.length - fresh.length, skipped: scene.skipped }
}

const density = (e: Element): number | undefined => {
  const material = materialOf(e)
  if (material === undefined) return undefined
  return cam.kernel.findMaterial(material)?.density ?? (/steel/i.test(material) ? 7.85 : /alumin/i.test(material) ? 2.7 : undefined)
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
export const sceneInterference = (elements: ReadonlyArray<Element>): SceneInterference => {
  const scene = sceneParts(elements)
  const tapped = new Map<string, string>()
  for (const p of scene.parts) if (p.fastener?.role === "screw" && p.fastener.tapped !== undefined) tapped.set(p.id, p.fastener.tapped)
  const report = assemblyInterference(assemblyParts(scene), {
    expected: (a, b) => (tapped.get(a) === b || tapped.get(b) === a ? "thread engaged in the tapped hole" : undefined)
  })
  return { ...report, names: new Map(scene.parts.map((p) => [p.id, p.name])), skipped: scene.skipped }
}

/** The bill of materials of the scene's exact solids. */
export const sceneBom = (elements: ReadonlyArray<Element>): { readonly rows: ReadonlyArray<BomRow>; readonly skipped: SceneParts["skipped"] } => {
  const scene = sceneParts(elements)
  return { rows: billOfMaterials(assemblyParts(scene)), skipped: scene.skipped }
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
