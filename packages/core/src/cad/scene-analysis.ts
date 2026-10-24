/**
 * What the exact kernel says about a drawing, as plain data for the sidecar and the assistant (the canvas panels compute the
 * same things in process): per solid its validity, exact mass properties, topology and recognised holes, whether and how the
 * CAM planner will machine it (`cam/brep-part.ts`), and for the whole scene the interference, bill of materials, joints and
 * smart-fastener plans of `scene-automation.ts`. Nothing here approximates: an element without an exact model is listed with
 * the reason.
 */
import { brepFeatures, type ExactFeatures } from "../cam/brep-part.ts"
import { planSetups, type SetupPlan, type SetupPlanOptions } from "../cam/setup-plan.ts"
import { healBrep, massProperties, minimumDistance, recognizeHoles, offsetBrep, shellBrep, validateBrep, type Brep } from "./brep/index.ts"
import { editHole, type HoleEdit } from "./brep/hole-edit.ts"
import { brepBox } from "./history-brep.ts"
import { planSceneFasteners, sceneBom, sceneClearance, sceneInterference, sceneJoints, sceneParts, type SceneParts } from "./scene-automation.ts"
import type { BomRow, InferredJoint } from "./assembly-analysis.ts"
import type { FastenerPlan, UnfastenedStack } from "./smart-fasteners.ts"
import { motionStudy, type KinematicModel } from "./kinematics.ts"
import type { Vec3 } from "./vec.ts"

type Element = Record<string, unknown> & { id?: string; type?: string; name?: string }

export interface SceneHole {
  readonly entry: Vec3
  readonly direction: Vec3
  readonly diameter: number
  readonly depth: number
  readonly form: "simple" | "counterbore" | "countersink"
  readonly bottom: "through" | "flat" | "drill-point"
  readonly headDiameter?: number
  readonly headDepth?: number
}

/** How the CAM planner treats the solid: a 2.5D part machined by its features, or a surface job and why. */
export type SceneMachining =
  | { readonly prismatic: true; readonly holes: number; readonly pockets: number; readonly outlines: number; readonly top: number; readonly bottom: number; readonly islands?: number }
  | { readonly prismatic: false; readonly reason: string }

export interface ScenePartAnalysis {
  readonly id: string
  readonly name: string
  readonly valid: boolean
  readonly issues: ReadonlyArray<string>
  readonly volume: number
  readonly area: number
  readonly centroid: Vec3
  readonly bounds: { readonly min: Vec3; readonly max: Vec3 }
  readonly faces: number
  readonly edges: number
  readonly vertices: number
  readonly surfaces: Readonly<Record<string, number>>
  /** Through holes of a closed manifold (genus). */
  readonly throughHoles?: number
  readonly holes: ReadonlyArray<SceneHole>
  readonly machining: SceneMachining
  /** Names of the faces (the first 40), the handles `cad.shell` takes for open faces. */
  readonly faceNames?: ReadonlyArray<string>
  /** For a solid that does not validate: what healing it would do and whether the healed solid is valid. */
  readonly repair?: { readonly verticesWelded: number; readonly edgesWelded: number; readonly collapsedUses: number; readonly validAfter: boolean; readonly issuesAfter: ReadonlyArray<string> }
}

export interface SceneAnalysis {
  readonly parts: ReadonlyArray<ScenePartAnalysis>
  readonly skipped: SceneParts["skipped"]
  readonly totals: { readonly parts: number; readonly volume: number; readonly area: number }
}

const machiningOf = (f: ExactFeatures): SceneMachining =>
  f.features === undefined
    ? { prismatic: false, reason: f.reason }
    : {
        prismatic: true, holes: f.features.holes.length, pockets: f.features.pockets.length, outlines: f.features.outlines.length,
        top: f.features.bounds?.max.z ?? 0, bottom: f.features.bounds?.min.z ?? 0,
        // Islands standing in the pockets, only when there are some: a part without them reports exactly what it always did.
        ...(f.features.pockets.some((p) => (p.islands ?? []).length > 0) ? { islands: f.features.pockets.reduce((n, p) => n + (p.islands ?? []).length, 0) } : {})
      }

/** Exact analysis of one solid. */
export const analyzeBrep = (id: string, name: string, b: Brep, options: { readonly machining?: boolean } = {}): ScenePartAnalysis => {
  const report = validateBrep(b)
  const mass = massProperties(b)
  const surfaces: Record<string, number> = {}
  for (const f of b.faces) surfaces[f.surface.kind] = (surfaces[f.surface.kind] ?? 0) + 1
  const box = brepBox(b)
  const holes = recognizeHoles(b).map((h): SceneHole => ({
    entry: h.entry, direction: h.direction, diameter: h.diameter, depth: h.depth, form: h.form, bottom: h.bottom,
    ...(h.headDiameter !== undefined ? { headDiameter: h.headDiameter } : {}), ...(h.headDepth !== undefined ? { headDepth: h.headDepth } : {})
  }))
  const names = [...new Set(b.faces.map((f) => f.name).filter((n): n is string => n !== undefined))]
  let repair: ScenePartAnalysis["repair"]
  if (!report.valid) {
    try {
      const h = healBrep(b)
      repair = { verticesWelded: h.report.verticesWelded, edgesWelded: h.report.edgesWelded, collapsedUses: h.report.degenerateUsesDropped, validAfter: h.report.after.valid, issuesAfter: h.report.after.issues.slice(0, 5).map((i) => i.message) }
    } catch { /* an unreadable body has nothing to heal */ }
  }
  return {
    ...(names.length > 0 ? { faceNames: names.slice(0, 40) } : {}),
    ...(repair !== undefined ? { repair } : {}),
    id, name, valid: report.valid, issues: report.issues.slice(0, 8).map((i) => i.message),
    volume: mass.volume, area: mass.area, centroid: mass.centroid, bounds: { min: box.lo, max: box.hi },
    faces: b.faces.length, edges: b.edges.length, vertices: b.vertices.length, surfaces,
    ...(report.genus !== undefined ? { throughHoles: report.genus } : {}),
    holes,
    machining: options.machining === false ? { prismatic: false, reason: "not evaluated" } : machiningOf(brepFeatures(b, name))
  }
}

/**
 * The elements named by `ids` with what they need: the operands of Boolean elements, recursively (a component or group carries
 * its children inside it). With no `ids` the whole scene.
 */
export const selectElements = <E extends Element>(elements: ReadonlyArray<E>, ids?: ReadonlyArray<string>): ReadonlyArray<E> => {
  if (ids === undefined) return elements
  const byId = new Map(elements.map((e) => [String(e.id ?? ""), e] as const))
  const take = new Set<string>()
  const visit = (id: string): void => {
    if (take.has(id)) return
    const e = byId.get(id)
    if (e === undefined) return
    take.add(id)
    if (Array.isArray(e["operands"])) for (const o of e["operands"] as unknown[]) visit(String(o))
  }
  for (const id of ids) visit(id)
  return elements.filter((e) => take.has(String(e.id ?? "")))
}

/** Exact analysis of every solid of the scene (components included), or only those named by `ids`. */
export const analyzeScene = (elements: ReadonlyArray<Element>, options: { readonly ids?: ReadonlyArray<string>; readonly machining?: boolean } = {}): SceneAnalysis => {
  const wanted = options.ids === undefined ? undefined : new Set(options.ids)
  // Only the named elements are rebuilt when they are all drawn at the top level; a solid inside a component needs the whole scene.
  const top = new Set(elements.map((e) => String(e.id ?? "")))
  const scene = sceneParts(options.ids !== undefined && options.ids.every((i) => top.has(i)) ? selectElements(elements, options.ids) : elements)
  const parts = scene.parts.filter((p) => wanted === undefined || wanted.has(p.id)).map((p) => analyzeBrep(p.id, p.name, p.brep, options.machining === undefined ? {} : { machining: options.machining }))
  const skipped = wanted === undefined ? scene.skipped : scene.skipped.filter((s) => wanted.has(s.id))
  return { parts, skipped, totals: { parts: parts.length, volume: parts.reduce((v, p) => v + p.volume, 0), area: parts.reduce((v, p) => v + p.area, 0) } }
}

export interface SceneSetups {
  readonly parts: ReadonlyArray<{ readonly id: string; readonly name: string; readonly plan: SetupPlan }>
  readonly skipped: SceneParts["skipped"]
}

/**
 * The manual setups every solid of the scene needs (`cam/setup-plan.ts`): which orientations, what each reaches, which faces no
 * three-axis setup reaches. Same selection rule as `analyzeScene`.
 */
export const setupsForScene = (
  elements: ReadonlyArray<Element>, options: { readonly ids?: ReadonlyArray<string> } & SetupPlanOptions = {}
): SceneSetups => {
  const { ids, ...plan } = options
  const wanted = ids === undefined ? undefined : new Set(ids)
  const top = new Set(elements.map((e) => String(e.id ?? "")))
  const scene = sceneParts(ids !== undefined && ids.every((i) => top.has(i)) ? selectElements(elements, ids) : elements)
  return {
    parts: scene.parts.filter((p) => wanted === undefined || wanted.has(p.id)).map((p) => ({ id: p.id, name: p.name, plan: planSetups(p.brep, plan) })),
    skipped: wanted === undefined ? scene.skipped : scene.skipped.filter((s) => wanted.has(s.id))
  }
}

export interface AssemblyReport {
  readonly parts: number
  readonly interference: {
    readonly clashes: ReadonlyArray<{ readonly a: string; readonly b: string; readonly aName: string; readonly bName: string; readonly volume: number; readonly centroid: Vec3 }>
    readonly expected: ReadonlyArray<{ readonly a: string; readonly b: string; readonly aName: string; readonly bName: string; readonly volume: number; readonly note: string }>
    readonly touching: ReadonlyArray<{ readonly a: string; readonly b: string }>
    readonly undetermined: ReadonlyArray<{ readonly a: string; readonly b: string; readonly reason: string }>
    readonly checked: number
  }
  /** The closest pairs of parts (gap below 5 mm, nearest first, at most 20). */
  readonly clearance: ReadonlyArray<{ readonly a: string; readonly b: string; readonly aName: string; readonly bName: string; readonly distance: number; readonly overlap: boolean }>
  readonly bom: ReadonlyArray<BomRow>
  readonly joints: ReadonlyArray<InferredJoint & { readonly parentName: string; readonly childName: string }>
  readonly fasteners: {
    readonly plans: ReadonlyArray<Omit<FastenerPlan, "thread"> & { readonly threadName: string }>
    readonly unfastened: ReadonlyArray<UnfastenedStack>
    /** Fasteners already in the drawing. */
    readonly existing: number
  }
  readonly skipped: SceneParts["skipped"]
}

/** Interference, bill of materials, joints and the fasteners still missing, on one exact rebuild of the scene. */
export const assemblyReport = (elements: ReadonlyArray<Element>, options: { readonly washers?: boolean } = {}): AssemblyReport => {
  const scene = sceneParts(elements)
  const fit = sceneInterference(elements, scene)
  const name = (id: string): string => fit.names.get(id) ?? id
  const joints = sceneJoints(elements, scene)
  const fasteners = planSceneFasteners(scene, options.washers === undefined ? {} : { washers: options.washers })
  return {
    parts: scene.parts.length,
    interference: {
      clashes: fit.interferences.filter((i) => i.kind === "clash").map((i) => ({ a: i.a, b: i.b, aName: name(i.a), bName: name(i.b), volume: i.volume, centroid: i.centroid })),
      expected: fit.interferences.filter((i) => i.kind === "expected").map((i) => ({ a: i.a, b: i.b, aName: name(i.a), bName: name(i.b), volume: i.volume, note: i.note ?? "declared overlap" })),
      touching: fit.touching, undetermined: fit.undetermined, checked: fit.checked
    },
    clearance: sceneClearance(elements, 5, scene).slice(0, 20).map((c) => ({ a: c.a, b: c.b, aName: c.aName, bName: c.bName, distance: c.distance, overlap: c.overlap })),
    bom: sceneBom(elements, scene).rows,
    joints: joints.joints.map((j) => ({ ...j, parentName: joints.names.get(j.parent) ?? j.parent, childName: joints.names.get(j.child) ?? j.child })),
    fasteners: {
      plans: fasteners.fresh.map(({ thread, ...plan }) => ({ ...plan, threadName: thread.name })),
      unfastened: fasteners.unfastened, existing: fasteners.existing
    },
    skipped: scene.skipped
  }
}


export type SceneShell =
  | { readonly ok: true; readonly id: string; readonly name: string; readonly wall: number; readonly open: ReadonlyArray<string>; readonly volume: number; readonly cavityVolume: number; readonly originalVolume: number; readonly faces: number; readonly shells: number; readonly pieces: number; readonly valid: boolean }
  | { readonly ok: false; readonly error: string }

/**
 * What hollowing a solid of the drawing would give (nothing is changed): its exact shell by dilation of the boundary, with the
 * named faces left open (`<feature>.top`, a face name from `cad.exact`), or the reason it cannot be made.
 */
export const sceneShell = (elements: ReadonlyArray<Element>, id: string, wall: number, openFaces: ReadonlyArray<string> = [], wallByFace: ReadonlyArray<{ readonly face: string; readonly thickness: number }> = []): SceneShell => {
  const built = sceneShellBody(elements, id, wall, openFaces, wallByFace)
  if (!built.ok) return built
  return built.report
}

/** The same checked construction used by the read preview and the governed write action. */
export const sceneShellBody = (elements: ReadonlyArray<Element>, id: string, wall: number, openFaces: ReadonlyArray<string> = [], wallByFace: ReadonlyArray<{ readonly face: string; readonly thickness: number }> = []): { readonly ok: true; readonly brep: Brep; readonly report: Extract<SceneShell, { ok: true }> } | { readonly ok: false; readonly error: string } => {
  const scene = sceneParts(elements)
  const part = scene.parts.find((p) => p.id === id)
  if (part === undefined) {
    const skipped = scene.skipped.find((s) => s.id === id)
    return { ok: false, error: skipped !== undefined ? `'${id}' has no exact model: ${skipped.reason}` : `no solid '${id}' in the drawing` }
  }
  const named = part.brep.faces.map((f, i) => ({ i, name: f.name }))
  const open: number[] = []
  for (const n of openFaces) {
    const hit = named.filter((f) => f.name === n)
    if (hit.length === 0) return { ok: false, error: `'${id}' has no face called '${n}'; its faces are ${[...new Set(named.map((f) => f.name).filter((x) => x !== undefined))].slice(0, 20).join(", ") || "unnamed"}` }
    for (const h of hit) open.push(h.i)
  }
  const overrides = new Map<number, number>()
  const seenNames = new Set<string>()
  for (const entry of wallByFace) {
    if (seenNames.has(entry.face)) return { ok: false, error: `duplicate wall face '${entry.face}'` }
    seenNames.add(entry.face)
    const hit = named.filter((f) => f.name === entry.face)
    if (hit.length === 0) return { ok: false, error: `unknown wall face '${entry.face}'` }
    for (const h of hit) overrides.set(h.i, entry.thickness)
  }
  const r = shellBrep(part.brep, wall, { open, wallByFace: overrides })
  if (typeof r === "string") return { ok: false, error: r }
  return { ok: true, brep: r.brep, report: {
    ok: true, id, name: part.name, wall, open: openFaces,
    volume: massProperties(r.brep).volume, cavityVolume: massProperties(r.cavity).volume, originalVolume: massProperties(part.brep).volume,
    faces: r.brep.faces.length, shells: r.brep.shells.length, pieces: r.pieces, valid: validateBrep(r.brep).valid
  } }
}

export type SceneHoleEdit =
  | {
    readonly ok: true; readonly id: string; readonly name: string; readonly hole: number; readonly holes: number
    readonly before: { readonly diameter: number; readonly depth: number; readonly form: "simple" | "counterbore" | "countersink" }
    readonly edit: HoleEdit; readonly volume: number; readonly originalVolume: number; readonly volumeChange: number; readonly faces: number; readonly valid: boolean
  }
  | { readonly ok: false; readonly error: string }

/**
 * Edits one recognised hole of a solid of the drawing (`brep/hole-edit.ts`): the hole is the `hole`-th of `recognizeHoles`, the
 * same order `analyzeScene` lists them in. The same checked construction serves the read preview and the governed write action.
 */
export const sceneHoleEditBody = (
  elements: ReadonlyArray<Element>, id: string, hole: number, edit: HoleEdit
): { readonly ok: true; readonly brep: Brep; readonly report: Extract<SceneHoleEdit, { ok: true }> } | { readonly ok: false; readonly error: string } => {
  const scene = sceneParts(elements)
  const part = scene.parts.find((p) => p.id === id)
  if (part === undefined) {
    const skipped = scene.skipped.find((s) => s.id === id)
    return { ok: false, error: skipped !== undefined ? `'${id}' has no exact model: ${skipped.reason}` : `no solid '${id}' in the drawing` }
  }
  const holes = recognizeHoles(part.brep)
  const target = holes[hole]
  if (target === undefined) return { ok: false, error: holes.length === 0 ? `'${id}' has no recognised hole` : `'${id}' has ${holes.length} recognised holes (0..${holes.length - 1}), not a hole ${hole}` }
  const r = editHole(part.brep, target, edit)
  if (typeof r === "string") return { ok: false, error: r }
  const originalVolume = massProperties(part.brep).volume
  return { ok: true, brep: r.brep, report: {
    ok: true, id, name: part.name, hole, holes: holes.length,
    before: { diameter: target.diameter, depth: target.depth, form: target.form }, edit,
    volume: originalVolume + r.volumeChange, originalVolume, volumeChange: r.volumeChange, faces: r.brep.faces.length, valid: validateBrep(r.brep).valid
  } }
}

export const sceneHoleEdit = (elements: ReadonlyArray<Element>, id: string, hole: number, edit: HoleEdit): SceneHoleEdit => {
  const built = sceneHoleEditBody(elements, id, hole, edit)
  return built.ok ? built.report : built
}

export type SceneDistance =
  | { readonly ok: true; readonly a: string; readonly b: string; readonly distance: number; readonly overlap: boolean; readonly pointA: Vec3; readonly pointB: Vec3; readonly faceA?: string; readonly faceB?: string }
  | { readonly ok: false; readonly error: string }

/** The smallest gap between two solids of the drawing, exact, with the closest points and the faces they are on. */
export const sceneDistance = (elements: ReadonlyArray<Element>, a: string, b: string): SceneDistance => {
  if (a === b) return { ok: false, error: "choose two different solids" }
  const scene = sceneParts(elements)
  const pa = scene.parts.find((p) => p.id === a), pb = scene.parts.find((p) => p.id === b)
  if (pa === undefined || pb === undefined) return { ok: false, error: `no exact solid '${pa === undefined ? a : b}' in the drawing` }
  const m = minimumDistance(pa.brep, pb.brep)
  return {
    ok: true, a, b, distance: m.distance, overlap: m.overlap, pointA: m.pointA, pointB: m.pointB,
    ...(m.faceA !== undefined && pa.brep.faces[m.faceA]?.name !== undefined ? { faceA: pa.brep.faces[m.faceA]!.name! } : {}),
    ...(m.faceB !== undefined && pb.brep.faces[m.faceB]?.name !== undefined ? { faceB: pb.brep.faces[m.faceB]!.name! } : {})
  }
}

/** Outward offset of a scene part, shared by the preview and the write adapter. */
export const sceneOffsetBody = (elements: ReadonlyArray<Element>, id: string, distance: number) => {
  const scene = sceneParts(elements)
  const part = scene.parts.find((p) => p.id === id)
  if (part === undefined) return { ok: false as const, error: `no exact solid '${id}' in the drawing` }
  const r = offsetBrep(part.brep, distance)
  if (typeof r === "string") return { ok: false as const, error: r }
  return { ok: true as const, brep: r.brep, report: { ok: true as const, id, name: part.name, distance, originalVolume: massProperties(part.brep).volume, volume: massProperties(r.brep).volume, faces: r.brep.faces.length, valid: validateBrep(r.brep).valid } }
}

export const sceneMotion = (elements: ReadonlyArray<Element>, model: KinematicModel, sweep: { readonly joint: string; readonly from: number; readonly to: number; readonly steps: number; readonly quantity?: keyof import("./kinematics.ts").JointState }) => {
  const scene = sceneParts(elements)
  const ids = new Set(scene.parts.map((p) => p.id))
  for (const id of new Set([model.ground, ...model.joints.flatMap((j) => [j.parent, j.child])])) {
    if (!ids.has(id)) return { ok: false as const, error: `motion part '${id}' has no exact solid in the drawing` }
  }
  const study = motionStudy(scene.parts, model, sweep)
  return { ok: true as const, frames: study.frames,
    ...(study.firstClash !== undefined ? { firstClash: study.firstClash } : {}),
    ...(study.firstViolation !== undefined ? { firstViolation: study.firstViolation } : {}),
    ...(study.firstContact !== undefined ? { firstContact: study.firstContact } : {}),
    ...(study.firstContactViolation !== undefined ? { firstContactViolation: study.firstContactViolation } : {}) }
}
