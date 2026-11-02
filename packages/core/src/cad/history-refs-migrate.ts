/**
 * Migration of old selections to persistent references (spec 41 N4/N5). A history written before references stores a face by a name
 * (`name: "plate.top"`) or a point (`near`), edges by a geometric filter (`parallel`, `within`, `minLength`) and the open ends of a
 * shell by `open: "top"`. `migrateSelectionsToRefs` replays the history once and writes the matching reference NEXT to the old
 * selection (`ref`, `edges.refs`, `openFaces`, a face plane's `ref`); nothing is removed, so the old fields stay as the hint the
 * reference was made from and a reader that does not know references still works.
 *
 * Every conversion is checked: the feature is rebuilt with its new reference and the history must still build the same volume with
 * no new error; otherwise the old selection is kept alone and the reason is recorded in `kept`. The result lists every conversion.
 * The function is idempotent: a feature that already has its reference is left alone.
 */
import { brepLocator, blendCandidates, selectBlendEdges, type Brep } from "./brep/index.ts"
import { pickPlanarFace } from "./brep/draft.ts"
import { faceByName, uniqueFaceNames } from "./brep/naming.ts"
import { dimensionValue, type Dimension } from "./expr.ts"
import { historyVolume, rebuild, type Feature, type History } from "./history.ts"
import { rebuildExact } from "./history-brep.ts"
import { refOf } from "./history-refs.ts"

export interface RefConversion {
  readonly feature: string
  /** The field that received the reference. */
  readonly field: "ref" | "edges.refs" | "openFaces" | "from.ref"
  /** The old selection, as a short text. */
  readonly from: string
  readonly to: ReadonlyArray<string>
}
export interface RefMigration {
  readonly history: History
  readonly conversions: ReadonlyArray<RefConversion>
  /** Features whose old selection was kept alone, with the reason (not convertible, or the converted history built differently). */
  readonly kept: ReadonlyArray<{ readonly feature: string; readonly reason: string }>
}

type V3 = { readonly x: number; readonly y: number; readonly z: number }
type Candidate = { readonly field: RefConversion["field"]; readonly from: string; readonly to: ReadonlyArray<string>; readonly apply: (f: Feature) => Feature }

/** The body-and-face the face selection of a feature names, as a reference. */
const faceRefNear = (bodies: ReadonlyArray<{ readonly id: string; readonly brep: Brep }>, only: string | undefined, near: V3, normal: V3 | undefined): string | undefined => {
  let best: { readonly ref: string; readonly distance: number } | undefined
  for (const b of bodies) {
    if (only !== undefined && b.id !== only) continue
    const brep = uniqueFaceNames(b.brep)
    const pick = normal === undefined ? undefined : pickPlanarFace(brep, near, normal)
    const closest = brepLocator(brep).closest(near)
    const face = pick?.face ?? closest.face
    const distance = pick?.distance ?? closest.distance
    if (face === undefined) continue
    const ref = refOf(brep, b.id, "face", face)
    if (ref !== undefined && (best === undefined || distance < best.distance)) best = { ref, distance }
  }
  return best?.ref
}

export const migrateSelectionsToRefs = (history: History): RefMigration => {
  const base = rebuild(history)
  const exact = rebuildExact(history, base)
  const timeline = exact.timeline ?? []
  const values = base.parameters
  const num = (d: Dimension): number | undefined => { try { return dimensionValue(d, values) } catch { return undefined } }
  const vec = (v: ReadonlyArray<Dimension>): V3 | undefined => { const n = v.map(num); return n.some((x) => x === undefined) ? undefined : { x: n[0]!, y: n[1]!, z: n[2]! } }
  const errorsOf = (r: ReturnType<typeof rebuild>) => r.issues.filter((i) => i.severity === "error").length
  const reference = { volume: historyVolume(base), errors: errorsOf(base) }

  const conversions: RefConversion[] = []
  const kept: Array<{ feature: string; reason: string }> = []
  let current = history
  const candidateOf = (index: number, f: Feature): Candidate | string | undefined => {
    const bodies = timeline[index]?.bodies ?? []
    // Only the features that select something need a body to select on.
    const selects = (f.type === "pushpull" || f.type === "draft") ? f.ref === undefined
      : f.type === "plane" ? f.from.kind === "face" && f.from.ref === undefined
        : f.type === "fillet" ? f.edges?.refs === undefined
          : f.type === "shell" ? f.openFaces === undefined && f.open !== undefined && f.open !== "none"
            : false
    if (selects && bodies.length === 0) return "no exact body exists before this feature"
    switch (f.type) {
      case "pushpull": case "draft": {
        if (f.ref !== undefined) return undefined
        let ref: string | undefined
        if (f.name !== undefined) {
          const holder = bodies.find((b) => (f.body === undefined || b.id === f.body) && faceByName(uniqueFaceNames(b.brep), f.name!) !== undefined)
          ref = holder === undefined ? undefined : refOf(holder.brep, holder.id, "face", faceByName(uniqueFaceNames(holder.brep), f.name)!)
          if (ref === undefined) return `the face '${f.name}' does not exist (or has no stable key) before this feature`
        } else {
          const near = vec(f.near), normal = f.normal === undefined ? undefined : vec(f.normal)
          if (near === undefined) return "the point is not a number"
          ref = faceRefNear(bodies, f.body, near, normal)
          if (ref === undefined) return "no named face is near the point"
        }
        return { field: "ref", from: f.name !== undefined ? `name ${f.name}` : `near ${JSON.stringify(f.near)}`, to: [ref], apply: (g) => ({ ...g, ref } as Feature) }
      }
      case "plane": {
        if (f.from.kind !== "face" || f.from.ref !== undefined) return undefined
        const near = vec(f.from.near), normal = f.from.normal === undefined ? undefined : vec(f.from.normal)
        if (near === undefined) return "the point is not a number"
        const ref = faceRefNear(bodies, f.from.body, near, normal)
        if (ref === undefined) return "no named face is near the point"
        return { field: "from.ref", from: `near ${JSON.stringify(f.from.near)}`, to: [ref], apply: (g) => ({ ...g, from: { ...(g as typeof f).from, ref } } as Feature) }
      }
      case "fillet": {
        if (f.edges?.refs !== undefined) return undefined
        if (f.edges?.curved === true) return "a curved-rim selection stays geometric (the rims are not all blendable edges of the exact model)"
        const within = f.edges?.within === undefined ? undefined : { min: vec(f.edges.within.min), max: vec(f.edges.within.max) }
        if (within !== undefined && (within.min === undefined || within.max === undefined)) return "the selection box is not a number"
        const minLength = f.edges?.minLength === undefined ? undefined : num(f.edges.minLength)
        const selector = {
          ...(f.edges?.parallel !== undefined ? { parallel: f.edges.parallel } : {}), ...(f.edges?.kind !== undefined ? { kind: f.edges.kind } : {}),
          ...(minLength !== undefined ? { minLength } : {}),
          ...(within !== undefined ? { within: { min: [within.min!.x, within.min!.y, within.min!.z] as [number, number, number], max: [within.max!.x, within.max!.y, within.max!.z] as [number, number, number] } } : {})
        }
        const refs: string[] = []
        for (const b of bodies.filter((x) => f.targets === undefined || f.targets.includes(x.id))) {
          const brep = uniqueFaceNames(b.brep)
          for (const c of selectBlendEdges(blendCandidates(brep, 25), selector)) {
            const ref = refOf(brep, b.id, "edge", c.edge)
            if (ref === undefined) return "an edge of the selection has no stable key (it touches an unnamed face)"
            refs.push(ref)
          }
        }
        if (refs.length === 0) return "the selection matches no edge of the exact model"
        return { field: "edges.refs", from: `geometric selection (${Object.keys(selector).join(", ") || "all convex edges"})`, to: refs, apply: (g) => ({ ...g, edges: { ...(g as typeof f).edges, refs } } as Feature) }
      }
      case "shell": {
        if (f.openFaces !== undefined || f.open === undefined || f.open === "none") return undefined
        const faces: string[] = []
        for (const role of f.open === "both" ? ["top", "bottom"] : [f.open]) {
          const holder = bodies.find((b) => faceByName(uniqueFaceNames(b.brep), `${f.feature}.${role}`) !== undefined)
          const ref = holder === undefined ? undefined : refOf(holder.brep, holder.id, "face", faceByName(uniqueFaceNames(holder.brep), `${f.feature}.${role}`)!)
          if (ref === undefined) return `the face '${f.feature}.${role}' does not exist (or has no stable key) before the shell`
          faces.push(ref)
        }
        return { field: "openFaces", from: `open ${f.open}`, to: faces, apply: (g) => ({ ...g, openFaces: faces } as Feature) }
      }
      default:
        return undefined
    }
  }

  for (let index = 0; index < history.features.length; index++) {
    const f = current.features[index]!
    const made = candidateOf(index, f)
    if (made === undefined) continue
    if (typeof made === "string") { kept.push({ feature: f.id, reason: made }); continue }
    const trial: History = { ...current, features: current.features.map((g, i) => (i === index ? made.apply(g) : g)) }
    const after = rebuild(trial)
    const same = Math.abs(historyVolume(after) - reference.volume) <= 1e-6 * Math.max(1, Math.abs(reference.volume)) && errorsOf(after) <= reference.errors
    if (!same) { kept.push({ feature: f.id, reason: `the reference selects a different result (volume ${historyVolume(after).toFixed(3)} instead of ${reference.volume.toFixed(3)}, ${errorsOf(after)} errors instead of ${reference.errors}); the old selection is kept` }); continue }
    current = trial
    conversions.push({ feature: f.id, field: made.field, from: made.from, to: made.to })
  }
  // The record travels with the history: what was converted, from which old selection (nothing is lost, the old fields stay).
  const recorded: History = conversions.length === 0 ? history : { ...current, refMigration: [...(history.refMigration ?? []), ...conversions] }
  return { history: recorded, conversions, kept }
}
