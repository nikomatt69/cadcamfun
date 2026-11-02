/**
 * What the assistant reads after every parametric write or check: a short verdict of the part it just built, and for a
 * failure the root cause with the move that usually fixes it. The full rebuild report stays available beside it
 * (exact bodies, solids, sketches); this digest is the part a person reads first, the way a CAD engineer glances at the
 * volume, the bounding box, the warnings and the feature tree before going on to the next feature.
 *
 * Nothing here models geometry. It reads the report of the kernel and the history, and re-runs the kernel's own rebuild
 * only to locate the feature that removed the last solid.
 */
import { dimensionsOf, meshVolume, rebuild, type History } from "@cadcamfun/core"
import type { parametricReport } from "./parametric.ts"

type Report = ReturnType<typeof parametricReport>

const round = (x: number, digits = 3): number => Math.round(x * 10 ** digits) / 10 ** digits

/** A dimension path that names a size (not a coordinate or a tolerance): the ones worth binding to a parameter. */
const SIZE_PATH = /(width|height|diameter|radius|radiusX|radiusY|depth|thickness|length|size|distance)$/

export interface Verification {
  /** `valid`: built and nothing to review; `review`: built, but read `attention` before going on; `failed`: no usable solid. */
  readonly verdict: "valid" | "review" | "failed"
  readonly bodies: number
  /** Exact volume when every body has an exact model, else the mesh volume (faceting error below about 0.05 %). */
  readonly volumeMm3: number | null
  readonly volumeSource: "exact" | "mesh"
  /** Bounding box extents x, y, z in mm (from the mesh: a round part reads up to 0.02 mm short). */
  readonly sizeMm: { readonly x: number; readonly y: number; readonly z: number } | null
  readonly closedSolid: boolean
  readonly throughHoles: number | null
  readonly exactBodies: number
  readonly sketchesFullyConstrained: boolean
  /** Exact-model notes (a curve the exact kernel could not refine further): the volume above already includes their effect; not a failure. */
  readonly exactWarnings?: ReadonlyArray<string>
  /** Set when the exact model did not finish inside the interactive budget: ask `parametric_exact` before quoting an exact volume or exporting STEP. */
  readonly exactPending?: string
  /** Things to look at before going on: warnings, bodies that did not merge, mesh-only bodies, literal sizes. */
  readonly attention: ReadonlyArray<string>
}

/** The verdict of one rebuild report for the stored or proposed history. */
export const verificationOf = (history: History, report: Report): Verification => {
  const attention: string[] = []
  const bodies = report.bodyCount
  const exact = report.exact
  const allExact = exact.length > 0 && exact.every((b) => b.exact)
  const exactVolume = allExact ? exact.reduce((sum, b) => sum + ("volumeMm3" in b ? (b.volumeMm3 as number) : 0), 0) : undefined
  const closedSolid = report.solids.length > 0 && report.solids.every((s) => s.closedSolid)
  const throughHoles = report.solids.length === 1 ? report.solids[0]!.throughHoles : null

  for (const issue of report.issues) if (issue.severity === "warning") attention.push(`${issue.feature}: ${issue.message}`)
  if (bodies > 1 && history.features.some((f) => "operation" in f && f.operation === "union")) {
    attention.push(`${bodies} separate bodies although a feature unites: a union that touches nothing stays a second body. Overlap the bodies by at least 0.1 mm or check the offsets and depths.`)
  }
  // A body the exact kernel did not get to within the interactive budget is not a defect of the part: the volume then comes from the
  // mesh and `parametric_exact` finishes the job. A body the exact kernel cannot model at all is something to say out loud.
  const pending = exact.filter((b) => !b.exact && "reason" in b && /(time|work) budget/.test(String(b.reason)))
  for (const body of exact) {
    if (!body.exact && "reason" in body && !/(time|work) budget/.test(String(body.reason))) attention.push(`Body '${body.id}' has no exact model (${String(body.reason)}): it is fine for the view and STL, not for STEP or machining by features.`)
  }
  for (const solid of report.solids) {
    if (solid.shells > 1) {
      attention.push(`Body '${solid.id}' is ${solid.shells} disjoint lumps in one body: a union whose tool does not touch the rest stays apart. Overlap them by at least 0.1 mm, or build the lump as its own body on purpose.`)
    }
  }
  if (report.ok === false && bodies > 0 && (report.volumeMm3 ?? 0) <= 1e-9) attention.push("The body has no volume left: a cut or intersect consumed it.")
  else if (bodies > 0 && !closedSolid) attention.push("A body is not a closed solid (open or non-manifold edges): it cannot be machined or printed; read `solids[].summary`.")
  const loose = report.sketches.filter((s) => s.status !== "fully-constrained")
  if (loose.length > 0) {
    attention.push(`Sketch ${loose.map((s) => `'${s.id}' is ${s.status}`).join(", ")}: dimension it until it is fully constrained so a parameter edit cannot move it.`)
  }
  if (Object.keys(history.parameters).length === 0) attention.push("No named parameters: every size is a literal. Name the sizes the user may change so the part can be edited by parameter.")
  else {
    const sizes = history.features.flatMap((f) => dimensionsOf(f).filter((d) => SIZE_PATH.test(d.path)).map((d) => ({ feature: f.id, path: d.path, literal: typeof d.value === "number" })))
    const literal = sizes.filter((d) => d.literal)
    if (literal.length >= 3 && literal.length * 2 >= sizes.length) {
      attention.push(`${literal.length} of ${sizes.length} sizes are literal numbers (${literal.slice(0, 4).map((d) => `${d.feature}.${d.path}`).join(", ")}${literal.length > 4 ? ", ..." : ""}): bind the ones that may change with parametric_edit set_parameter + set_dimension.`)
    }
  }
  if (report.timeline !== undefined && report.timeline.notBuilt.length > 0) {
    attention.push(`Not built: ${report.timeline.notBuilt.map((n) => `${n.id} (${n.state})`).join(", ")}. The volume above leaves them out.`)
  }

  const extent = report.bounds === null ? null : { x: round(report.bounds.max.x - report.bounds.min.x, 2), y: round(report.bounds.max.y - report.bounds.min.y, 2), z: round(report.bounds.max.z - report.bounds.min.z, 2) }
  return {
    verdict: !report.ok ? "failed" : attention.length > 0 ? "review" : "valid",
    bodies,
    volumeMm3: exactVolume !== undefined ? round(exactVolume) : report.volumeMm3 === null ? null : round(report.volumeMm3),
    volumeSource: exactVolume !== undefined ? "exact" : "mesh",
    sizeMm: extent,
    closedSolid,
    throughHoles,
    exactBodies: exact.filter((b) => b.exact).length,
    sketchesFullyConstrained: loose.length === 0,
    ...(report.warnings.length > 0 ? { exactWarnings: report.warnings.slice(0, 3) } : {}),
    ...(pending.length > 0 ? { exactPending: `${pending.length} body(ies) were too much work for the interactive budget (a big model, not a busy machine); the volume is the mesh volume (about 0.05 % low on round parts). Call parametric_exact for the exact volume and validity before quoting mass or exporting STEP.` } : {}),
    attention
  }
}

/** The move that usually fixes a kernel message; undefined when the message already says what to do. */
export const recoveryHint = (message: string, history: History): string | undefined => {
  const unknown = /Unknown name '([^']+)'/.exec(message)
  if (unknown !== null) {
    const known = Object.keys(history.parameters)
    return `Define '${unknown[1]}' in parameters (value or expression) or fix the spelling.${known.length > 0 ? ` Defined: ${known.slice(0, 12).join(", ")}${known.length > 12 ? ", ..." : ""}.` : " The history has no parameters yet."}`
  }
  if (/leaves no cavity|shell/i.test(message)) return "Use a wall below half the thinnest dimension, or open a face (open: top). "
  // Two blended edges across one face take a strip each; the kernel names the largest size that fits (and the issue's remedy the
  // largest for every edge), so the move is to use it, not to guess a smaller number.
  if (/exceeds the maximum|strips collide/i.test(message)) {
    return "Two blended edges across a face need their strips to fit its width: use the maximum named in the message or less, or select fewer edges (edges.within / parallel) so opposite edges are not rounded together."
  }
  if (/Not blended|Native curved fillet|blend/i.test(message)) {
    return "Lower the radius below half the shortest adjacent edge and half the thinnest wall, select fewer edges (edges.within / parallel), or use a chamfer of the same size."
  }
  if (/must be positive|positive width|positive depth/i.test(message)) return "A size evaluated to zero or less with the current parameters: check the expression and the parameter values it uses."
  if (/Not built: it needs '([^']+)'/.test(message)) return "Only follows from the earlier failure; fix that feature first."
  if (/no body|builds no body|nothing to (cut|subtract)/i.test(message)) return "A cut or intersect needs an existing body: make the solid with operation new/union first and keep the cutting sketch inside it."
  return undefined
}

export interface Diagnosis {
  /** The errors that start a chain of failures, with the usual fix; cascades ("Not built: it needs ...") are folded away. */
  readonly rootCauses: ReadonlyArray<{ readonly feature: string; readonly message: string; readonly hint?: string }>
  /** When the history builds no error but also no solid: the first feature after which no body is left. */
  readonly removedLastSolid?: { readonly feature: string; readonly type: string; readonly hint: string }
}

/** Where a history that did not build went wrong. Cheap on the failing path only: it re-runs the plain rebuild per prefix. */
export const diagnose = (history: History, report: Report): Diagnosis => {
  const errors = report.issues.filter((i) => i.severity === "error")
  const roots = errors.filter((i) => !i.message.startsWith("Not built:"))
  const rootCauses = (roots.length > 0 ? roots : errors).slice(0, 6).map((i) => {
    // The kernel's own remedy (the largest size that fits every selected edge) is more exact than the general move, so it comes first.
    const hint = [i.remedy, recoveryHint(i.message, history)].filter((x): x is string => x !== undefined).join(" ") || undefined
    return { feature: i.feature, message: i.message, ...(hint !== undefined ? { hint } : {}) }
  })
  const hollow = report.bodyCount === 0 || (report.volumeMm3 ?? 0) <= 1e-9
  if (errors.length > 0 || !hollow) return { rootCauses }
  // No error and no body: a boolean consumed everything. Find the feature whose prefix leaves no solid after the one before it had some.
  let hadBody = false
  for (let i = 0; i < history.features.length; i++) {
    const feature = history.features[i]!
    let count = 0
    try { count = rebuild({ ...history, features: history.features.slice(0, i + 1) }).bodies.filter((b) => Math.abs(meshVolume(b.mesh)) > 1e-9).length } catch { continue }
    if (count > 0) hadBody = true
    else if (hadBody) {
      return { rootCauses, removedLastSolid: { feature: feature.id, type: feature.type, hint: `'${feature.id}' (${feature.type}) leaves no solid: its cut or intersection covers the whole body. Shrink its sketch or depth, or move it so it only overlaps part of the body.` } }
    }
  }
  return { rootCauses }
}
