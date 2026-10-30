/**
 * Tolerance management across operations (spec 42 R6).
 *
 * Every vertex and edge carries the distance within which it is allowed to disagree with the geometry around it. Two rules keep
 * that number honest through a chain of operations:
 *
 *   - A result inherits the largest tolerance of its operands. A body made of exact primitives has the model tolerance
 *     (`MODEL_TOL`) everywhere, and an exact operation measures a fit far below it, so the result stays at the model tolerance
 *     however long the chain is. A body that is already looser than the model tolerance (a healed foreign body) is a different
 *     matter: nothing proves the operation did not build on its slack, so the operation's measured fit is added to it.
 *   - The fit is measured, not declared: the distance of each edge from the surfaces of its faces and of each vertex from the
 *     curve ends that meet there, on the result as built (`validateBrep` reports both).
 *
 * A body whose tolerance passes the declared limit has its affected faces flagged `loose` (`Face.loose`), which STEP export
 * refuses unless it is told otherwise. The limit is `LOOSE_TOLERANCE`, or three millionths of the body size when that is larger (a
 * fitted curve on a metre-long part is legitimately a few micrometres off).
 */
import { dist3, MODEL_TOL } from "./math.ts"
import type { Brep, Face } from "./topology.ts"
import { maxTolerance, type BrepReport } from "./validate.ts"

/** A body with a tolerance above this (mm, for a small body) is loose: 10 x the model tolerance. */
export const LOOSE_TOLERANCE = 10 * MODEL_TOL

/** An operand tolerance up to this multiple of the model tolerance is the model's own accuracy, not slack to be carried. */
const SLACK = 1.5

/** The size (bounding-box diagonal, mm) of a body; 0 when it has no vertex. */
export const bodySize = (b: Brep): number => {
  if (b.vertices.length === 0) return 0
  let lo = { x: Infinity, y: Infinity, z: Infinity }, hi = { x: -Infinity, y: -Infinity, z: -Infinity }
  for (const v of b.vertices) {
    lo = { x: Math.min(lo.x, v.point.x), y: Math.min(lo.y, v.point.y), z: Math.min(lo.z, v.point.z) }
    hi = { x: Math.max(hi.x, v.point.x), y: Math.max(hi.y, v.point.y), z: Math.max(hi.z, v.point.z) }
  }
  return dist3(lo, hi)
}

/** The declared tolerance limit of a body: `LOOSE_TOLERANCE`, or 3e-6 x its size when that is larger. */
export const toleranceLimit = (b: Brep): number => Math.max(LOOSE_TOLERANCE, 3e-6 * bodySize(b))

/**
 * The extra geometric tolerance a result may need because its operands are loose: their largest tolerance when it is above the
 * model's own accuracy, else 0. The Boolean validates its result with it, so a body healed to 1e-4 can be worked on.
 */
export const operandSlack = (...operands: ReadonlyArray<Brep>): number => {
  const m = operands.reduce((acc, o) => Math.max(acc, maxTolerance(o)), 0)
  return m > SLACK * MODEL_TOL ? m : 0
}

export interface InheritedTolerance {
  readonly brep: Brep
  /** The largest tolerance of the result, mm. */
  readonly maxTolerance: number
  /** The largest tolerance of the operands, mm. */
  readonly inherited: number
  /** The limit the result was compared with, mm. */
  readonly limit: number
  /** Faces flagged loose by this call (indices into the result). */
  readonly looseFaces: ReadonlyArray<number>
}

/**
 * Sets the tolerances of an operation's result from its operands and the fit measured in `report` (a `validateBrep` of the same
 * body), and flags the faces whose boundary passes `limit`. Faces that were loose in an operand are kept loose by the caller
 * (the result's faces are new objects); this only adds flags.
 */
export const inheritTolerance = (result: Brep, report: BrepReport, operands: ReadonlyArray<Brep>, limit?: number): InheritedTolerance => {
  const inherited = operands.reduce((m, o) => Math.max(m, maxTolerance(o)), 0)
  const bound = limit ?? Math.max(toleranceLimit(result), ...operands.map(toleranceLimit))
  const dev = report.edgeDeviation, gap = report.vertexGap
  // An operand tighter than the model tolerance (a foreign body written to its own accuracy) does not make the result tighter than the model.
  const floor = Math.max(inherited, MODEL_TOL)
  const grow = (measured: number) => (inherited > SLACK * MODEL_TOL ? inherited + measured : Math.max(floor, measured))
  const vertices = result.vertices.map((v, i) => ({ ...v, tol: grow(gap?.[i] ?? 0) }))
  const edges = result.edges.map((e, i) => ({ ...e, tol: grow(dev?.[i] ?? 0) }))
  const loose = (f: Face): boolean => f.loops.some((l) => l.coedges.some((c) => {
    const e = edges[c.edge]!
    return e.tol > bound || vertices[e.v0]!.tol > bound || vertices[e.v1]!.tol > bound
  }))
  const looseFaces: number[] = []
  const faces = result.faces.map((f, i) => {
    if (f.loose === true) return f
    if (!loose(f)) return f
    looseFaces.push(i)
    return { ...f, loose: true as const }
  })
  const brep: Brep = { ...result, vertices, edges, faces }
  return { brep, maxTolerance: maxTolerance(brep), inherited, limit: bound, looseFaces }
}

/** Why a body is loose (a face flagged, or a tolerance above `limit`, default `toleranceLimit`), or undefined when it is not. */
export const looseReason = (b: Brep, limit?: number): { readonly why: string; readonly maxTolerance: number; readonly limit: number; readonly looseFaces: ReadonlyArray<number> } | undefined => {
  const tol = maxTolerance(b), bound = limit ?? toleranceLimit(b), flagged = looseFaceIndices(b)
  if (flagged.length === 0 && tol <= bound) return undefined
  return { why: `${flagged.length > 0 ? `${flagged.length} face(s) flagged loose, ` : ""}largest tolerance ${tol.toExponential(2)} mm against the limit ${bound.toExponential(1)} mm`, maxTolerance: tol, limit: bound, looseFaces: flagged }
}

/** Faces of `b` flagged loose. */
export const looseFaceIndices = (b: Brep): ReadonlyArray<number> => b.faces.flatMap((f, i) => (f.loose === true ? [i] : []))
