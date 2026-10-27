/**
 * Dimensional acceptance of a parametric part (AI-11 Step 10). A rebuild that succeeds says the history is valid; it does not
 * say the part is the one that was asked for. Acceptance measures each requested quantity on the rebuilt part, through a
 * named reference in a named frame, and compares it with its limits: a part with the right volume but a wrong measure is
 * rejected.
 *
 * - Every measure keeps its full numeric value; rounding is for display only.
 * - A hole is identified by the history feature that asked for it and found on the exact model (`brep.recognizeHoles`) on
 *   that feature's axis. The count of holes is the count of identified holes; the body's genus (its through holes as
 *   topology) is reported beside it and never stands in for it.
 * - What cannot be measured (no exact model, a reference this module does not resolve) is `unmeasured`, and a part with an
 *   unmeasured check is not accepted.
 */
import { activeHistory, brep, dimensionValue, meshVolume, rebuild, rebuildExact, type History, type RebuildResult } from "@cadcamfun/core"

/** Allowed deviation from the nominal: `plus` above, `minus` below, both non-negative mm (or mm³ for a volume). */
export interface Tolerance {
  readonly plus: number
  readonly minus: number
}

export type Axis = "x" | "y" | "z"

export type AcceptanceCheck =
  /** Overall size of the part (all bodies, or one) along a world axis. */
  | { readonly kind: "extent"; readonly name: string; readonly axis: Axis; readonly nominal: number; readonly tolerance: Tolerance; readonly body?: string }
  /** The hole a `hole` feature asked for: found on its axis, measured for diameter and, when given, depth. */
  | { readonly kind: "hole"; readonly name: string; readonly feature: string; readonly diameter: { readonly nominal: number; readonly tolerance: Tolerance }; readonly depth?: { readonly nominal: number; readonly tolerance: Tolerance }; readonly through?: boolean }
  /** How many holes the exact model holds, counted by recognition, not by genus. */
  | { readonly kind: "hole_count"; readonly name: string; readonly nominal: number }
  /** Volume of the part (exact where every body has an exact model, mesh otherwise, and the method says which). */
  | { readonly kind: "volume"; readonly name: string; readonly nominal: number; readonly tolerance: Tolerance }

export type CheckStatus = "pass" | "fail" | "unmeasured"

export interface CheckResult {
  readonly name: string
  readonly kind: AcceptanceCheck["kind"]
  readonly status: CheckStatus
  readonly nominal?: number
  readonly limits?: { readonly min: number; readonly max: number }
  /** The measured value at full precision. */
  readonly measured?: number
  /** For a hole: the depth measured beside the diameter. */
  readonly measuredDepth?: number
  /** What was measured and in which frame (`world`, or the feature's plane). */
  readonly reference: string
  readonly frame: string
  /** How the value was obtained: `exact` (B-rep), `mesh` (triangulated, chordal error up to the tessellation tolerance). */
  readonly method?: "exact" | "mesh" | "recognition"
  readonly reason?: string
}

export interface AcceptanceReport {
  /** The history rebuilt without errors and produced at least one body. */
  readonly rebuilt: boolean
  /** Every check passed; never true when one could not be measured. */
  readonly accepted: boolean
  readonly checks: ReadonlyArray<CheckResult>
  /** Holes requested by `hole` features, holes recognised on the exact model, and the bodies' genus (topology), kept apart. */
  readonly holes: { readonly requested: number; readonly recognised: number | null; readonly genus: ReadonlyArray<number | null> }
}

const limitsOf = (nominal: number, tolerance: Tolerance) => ({ min: nominal - tolerance.minus, max: nominal + tolerance.plus })
const within = (value: number, limits: { min: number; max: number }) => value >= limits.min && value <= limits.max

const PLANES: Readonly<Record<string, { readonly n: { x: number; y: number; z: number }; readonly u: { x: number; y: number; z: number }; readonly v: { x: number; y: number; z: number } }>> = {
  XY: { u: { x: 1, y: 0, z: 0 }, v: { x: 0, y: 1, z: 0 }, n: { x: 0, y: 0, z: 1 } },
  YZ: { u: { x: 0, y: 1, z: 0 }, v: { x: 0, y: 0, z: 1 }, n: { x: 1, y: 0, z: 0 } },
  ZX: { u: { x: 0, y: 0, z: 1 }, v: { x: 1, y: 0, z: 0 }, n: { x: 0, y: 1, z: 0 } }
}

type Vec = { readonly x: number; readonly y: number; readonly z: number }
const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
const dot = (a: Vec, b: Vec): number => a.x * b.x + a.y * b.y + a.z * b.z
const len = (a: Vec): number => Math.sqrt(dot(a, a))
/** Distance from a point to the line through `origin` along unit `direction`. */
const offAxis = (point: Vec, origin: Vec, direction: Vec): number => {
  const d = sub(point, origin)
  const along = dot(d, direction)
  return len({ x: d.x - direction.x * along, y: d.y - direction.y * along, z: d.z - direction.z * along })
}

/** How far a recognised hole's axis may sit from the axis its feature asked for and still be that hole, mm. */
const AXIS_TOLERANCE = 1e-3

const bounds = (result: RebuildResult, body?: string) => {
  const min = { x: Infinity, y: Infinity, z: Infinity }, max = { x: -Infinity, y: -Infinity, z: -Infinity }
  for (const b of result.bodies) {
    if (body !== undefined && b.id !== body) continue
    const p = b.mesh.positions
    for (let i = 0; i < p.length; i += 3) {
      min.x = Math.min(min.x, p[i]!); max.x = Math.max(max.x, p[i]!)
      min.y = Math.min(min.y, p[i + 1]!); max.y = Math.max(max.y, p[i + 1]!)
      min.z = Math.min(min.z, p[i + 2]!); max.z = Math.max(max.z, p[i + 2]!)
    }
  }
  return Number.isFinite(min.x) ? { min, max } : undefined
}

/** Measures every check on the rebuilt part. Pure and synchronous: run it in a kernel job for heavy parts. */
export const acceptPart = (source: History, checks: ReadonlyArray<AcceptanceCheck>, options: { readonly budgetMs?: number } = {}): AcceptanceReport => {
  // Checks measure the model as built: suppressed and rolled-back features are not part of it.
  const history = activeHistory(source)
  const result = rebuild(history)
  const rebuilt = result.bodies.length > 0 && !result.issues.some((issue) => issue.severity === "error")
  let exact: ReturnType<typeof rebuildExact> | undefined
  let exactFailure: string | undefined
  const needsExact = checks.some((check) => check.kind === "hole" || check.kind === "hole_count" || check.kind === "volume")
  if (rebuilt && needsExact) {
    try { exact = rebuildExact(history, result, options.budgetMs === undefined ? {} : { budgetMs: options.budgetMs }) } catch (error) { exactFailure = error instanceof Error ? error.message : String(error) }
  }
  const breps = exact?.bodies.map((body) => body.brep) ?? []
  const allExact = exact !== undefined && breps.length > 0 && breps.every((b) => b !== undefined)
  const recognised = allExact ? breps.flatMap((b) => brep.recognizeHoles(b!)) : undefined
  const genus = allExact ? breps.map((b) => brep.validateBrep(b!, { skipVolume: true }).genus ?? null) : result.bodies.map(() => null)
  const noExact = exactFailure ?? exact?.bodies.find((body) => body.brep === undefined)?.reason ?? "no exact model"
  const holeFeatures = history.features.filter((feature) => feature.type === "hole")

  const measure = (check: AcceptanceCheck): CheckResult => {
    if (!rebuilt) return { name: check.name, kind: check.kind, status: "unmeasured", reference: "part", frame: "world", reason: "The history did not rebuild." }
    switch (check.kind) {
      case "extent": {
        const box = bounds(result, check.body)
        const reference = `${check.body ?? "all bodies"} bounding box along ${check.axis}`
        if (box === undefined) return { name: check.name, kind: check.kind, status: "unmeasured", reference, frame: "world", reason: `No body ${check.body ?? ""}`.trim() }
        const measured = box.max[check.axis] - box.min[check.axis]
        const limits = limitsOf(check.nominal, check.tolerance)
        return { name: check.name, kind: check.kind, status: within(measured, limits) ? "pass" : "fail", nominal: check.nominal, limits, measured, reference, frame: "world", method: "mesh" }
      }
      case "volume": {
        const limits = limitsOf(check.nominal, check.tolerance)
        const measured = allExact ? breps.reduce((sum, b) => sum + brep.massProperties(b!).volume, 0) : result.bodies.reduce((sum, b) => sum + Math.abs(meshVolume(b.mesh)), 0)
        return { name: check.name, kind: check.kind, status: within(measured, limits) ? "pass" : "fail", nominal: check.nominal, limits, measured, reference: "volume of all bodies", frame: "world", method: allExact ? "exact" : "mesh" }
      }
      case "hole_count": {
        if (recognised === undefined) return { name: check.name, kind: check.kind, status: "unmeasured", reference: "holes recognised on the exact model", frame: "world", reason: noExact }
        return { name: check.name, kind: check.kind, status: recognised.length === check.nominal ? "pass" : "fail", nominal: check.nominal, limits: { min: check.nominal, max: check.nominal }, measured: recognised.length, reference: "holes recognised on the exact model", frame: "world", method: "recognition" }
      }
      case "hole": {
        const feature = holeFeatures.find((candidate) => candidate.id === check.feature) as (History["features"][number] & { plane: string; offset?: unknown; at: ReadonlyArray<unknown> }) | undefined
        const reference = `axis of hole feature '${check.feature}'`
        if (feature === undefined) return { name: check.name, kind: check.kind, status: "unmeasured", reference, frame: "world", reason: `There is no hole feature '${check.feature}' in the history.` }
        const plane = PLANES[feature.plane]
        const frame = `plane ${feature.plane}`
        const later = history.features.slice(history.features.indexOf(feature) + 1).find((other) => other.type === "move" || other.type === "scale")
        if (later !== undefined) return { name: check.name, kind: check.kind, status: "unmeasured", reference, frame, reason: `The ${later.type} feature '${later.id}' after the hole changes its frame; measure the hole in a history without it.` }
        if (plane === undefined) return { name: check.name, kind: check.kind, status: "unmeasured", reference, frame, reason: `The hole's plane '${feature.plane}' is a work plane; only XY, YZ and ZX are resolved here.` }
        if (recognised === undefined) return { name: check.name, kind: check.kind, status: "unmeasured", reference, frame, reason: noExact }
        let u: number, v: number, offset: number
        try {
          u = dimensionValue(feature.at[0] as never, result.parameters)
          v = dimensionValue(feature.at[1] as never, result.parameters)
          offset = feature.offset === undefined ? 0 : dimensionValue(feature.offset as never, result.parameters)
        } catch (error) {
          return { name: check.name, kind: check.kind, status: "unmeasured", reference, frame, reason: error instanceof Error ? error.message : String(error) }
        }
        const origin = { x: plane.u.x * u + plane.v.x * v + plane.n.x * offset, y: plane.u.y * u + plane.v.y * v + plane.n.y * offset, z: plane.u.z * u + plane.v.z * v + plane.n.z * offset }
        const hole = recognised.find((candidate) => Math.abs(Math.abs(dot(candidate.direction, plane.n)) - 1) < 1e-6 && offAxis(candidate.entry, origin, plane.n) < AXIS_TOLERANCE)
        const limits = limitsOf(check.diameter.nominal, check.diameter.tolerance)
        if (hole === undefined) return { name: check.name, kind: check.kind, status: "fail", nominal: check.diameter.nominal, limits, reference, frame, method: "recognition", reason: "No hole was found on this feature's axis." }
        const depthLimits = check.depth === undefined ? undefined : limitsOf(check.depth.nominal, check.depth.tolerance)
        const failures = [
          ...(within(hole.diameter, limits) ? [] : [`diameter ${hole.diameter} outside ${limits.min}..${limits.max}`]),
          ...(depthLimits === undefined || within(hole.depth, depthLimits) ? [] : [`depth ${hole.depth} outside ${depthLimits.min}..${depthLimits.max}`]),
          ...(check.through === undefined || (hole.bottom === "through") === check.through ? [] : [`expected ${check.through ? "a through hole" : "a blind hole"}, found ${hole.bottom}`])
        ]
        return {
          name: check.name, kind: check.kind, status: failures.length === 0 ? "pass" : "fail", nominal: check.diameter.nominal, limits, measured: hole.diameter, measuredDepth: hole.depth,
          reference, frame, method: "recognition", ...(failures.length > 0 ? { reason: failures.join("; ") } : {})
        }
      }
    }
  }

  const results = checks.map(measure)
  return {
    rebuilt,
    accepted: rebuilt && results.length > 0 && results.every((check) => check.status === "pass"),
    checks: results,
    holes: { requested: holeFeatures.length, recognised: recognised?.length ?? null, genus }
  }
}
