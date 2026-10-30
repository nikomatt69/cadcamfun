import type { NominalSketchCurve } from "./sketch-curves.ts"

/** The data model of the parametric sketch (entities, constraints, results); the solver lives in `sketch-solver.ts`. */
export class SketchError extends Error {
  constructor(message: string) { super(message); this.name = "SketchError" }
}

export type PointId = string

export interface SketchPoint { readonly id: string; readonly kind: "point"; readonly x: number; readonly y: number }
export interface SketchLine { readonly id: string; readonly kind: "line"; readonly p1: PointId; readonly p2: PointId }
export interface SketchCircle { readonly id: string; readonly kind: "circle"; readonly center: PointId; readonly radius: number }
/** Counter-clockwise from `start` to `end` about `center`. */
export interface SketchArc { readonly id: string; readonly kind: "arc"; readonly center: PointId; readonly start: PointId; readonly end: PointId }
/** An ellipse: centre point, two semi-axes (unknowns of their own) and a fixed rotation of the x axis, radians. */
export interface SketchEllipse { readonly id: string; readonly kind: "ellipse"; readonly center: PointId; readonly radiusX: number; readonly radiusY: number; readonly rotation?: number }
/** A Catmull-Rom spline through its points (which are ordinary point entities, so constraints move the curve). */
export interface SketchSpline { readonly id: string; readonly kind: "spline"; readonly points: ReadonlyArray<PointId>; readonly closed?: boolean }
export type SketchEntity = SketchPoint | SketchLine | SketchCircle | SketchArc | SketchEllipse | SketchSpline

/** A constraint, optionally named so a conflict can point at it. */
export type Constraint = (
  | { readonly type: "fixed"; readonly point: string; readonly x?: number; readonly y?: number }
  | { readonly type: "coincident"; readonly a: string; readonly b: string }
  | { readonly type: "horizontal"; readonly line: string }
  | { readonly type: "vertical"; readonly line: string }
  | { readonly type: "horizontalPoints"; readonly a: string; readonly b: string }
  | { readonly type: "verticalPoints"; readonly a: string; readonly b: string }
  | { readonly type: "distance"; readonly a: string; readonly b: string; readonly value: number }
  | { readonly type: "distanceX"; readonly a: string; readonly b: string; readonly value: number }
  | { readonly type: "distanceY"; readonly a: string; readonly b: string; readonly value: number }
  | { readonly type: "length"; readonly line: string; readonly value: number }
  | { readonly type: "parallel"; readonly a: string; readonly b: string }
  | { readonly type: "perpendicular"; readonly a: string; readonly b: string }
  | { readonly type: "equalLength"; readonly a: string; readonly b: string }
  | { readonly type: "equalRadius"; readonly a: string; readonly b: string }
  | { readonly type: "radius"; readonly circle: string; readonly value: number }
  | { readonly type: "diameter"; readonly circle: string; readonly value: number }
  /** Angle from line `a` to line `b`, counter-clockwise, radians. */
  | { readonly type: "angle"; readonly a: string; readonly b: string; readonly value: number }
  | { readonly type: "pointOnLine"; readonly point: string; readonly line: string }
  | { readonly type: "pointOnCircle"; readonly point: string; readonly circle: string }
  | { readonly type: "midpoint"; readonly point: string; readonly line: string }
  | { readonly type: "symmetric"; readonly a: string; readonly b: string; readonly line: string }
  | { readonly type: "tangentLineCircle"; readonly line: string; readonly circle: string }
  /** Two circles (or arcs) touch: externally (distance = r1 + r2) or internally (distance = |r1 - r2|). */
  | { readonly type: "tangentCircles"; readonly a: string; readonly b: string; readonly internal?: boolean }
  /** The centre of a circle or arc lies on a point (or: the circle is concentric with another). */
  | { readonly type: "concentric"; readonly a: string; readonly b: string }
  /** The semi-axes of an ellipse. */
  | { readonly type: "ellipseSize"; readonly ellipse: string; readonly radiusX: number; readonly radiusY: number }
  /** A point lies on an ellipse. */
  | { readonly type: "pointOnEllipse"; readonly point: string; readonly ellipse: string }
  /** Two lines lie on one line (both end points of `b` are on line `a`). */
  | { readonly type: "collinear"; readonly a: string; readonly b: string }
) & {
  readonly id?: string
  /**
   * A reference (driven) dimension: it measures instead of constraining. It adds no equation, so it never removes freedom or
   * conflicts; its measured value is reported in `SolveResult.driven`. Only the dimension kinds can be driven.
   */
  readonly driven?: boolean
}

export interface Sketch {
  readonly entities: ReadonlyArray<SketchEntity>
  readonly constraints: ReadonlyArray<Constraint>
  /** Runtime provenance generated from authored shapes; sampled construction edges keep their constraint ids. */
  readonly nominalCurves?: ReadonlyArray<NominalSketchCurve>
}

export type SolveStatus = "fully-constrained" | "under-constrained" | "over-constrained" | "conflicting" | "failed"

/** Why a sketch is over-constrained or conflicting, and what can still move. */
export interface SketchDiagnostics {
  /** Constraints that can be deleted without changing the rank of the constraint set (consistent redundancy), by name. */
  readonly redundant: ReadonlyArray<string>
  /**
   * For a conflicting sketch: a set of constraints that cannot all hold, every other constraint removed (deletion filter). Each
   * member is necessary: removing any one of them makes the rest satisfiable. `minimal` is false only when the solve budget ran out.
   */
  readonly conflictSet: ReadonlyArray<string>
  readonly minimal: boolean
  /** Remaining degrees of freedom of every point that can still move (0 is omitted), by id. */
  readonly freedom: Readonly<Record<string, number>>
}

export interface SolveResult {
  readonly sketch: Sketch
  readonly status: SolveStatus
  readonly dof: number
  readonly iterations: number
  /** Largest absolute residual left. */
  readonly residual: number
  /** Ids of the points that can still move, and of the circles whose radius can still change. */
  readonly free: ReadonlyArray<string>
  /** Constraints that could not be satisfied (conflicting), worst first. */
  readonly conflicts: ReadonlyArray<string>
  /** Redundant equations (rank deficiency of the constraint set). */
  readonly redundant: number
  readonly message?: string
  /** Redundancy, minimal conflict set and per-point freedom; present when the sketch is analysed (the default). */
  readonly diagnostics?: SketchDiagnostics
  /** Measured values of the reference (`driven`) dimensions, by constraint name. */
  readonly driven?: ReadonlyArray<{ readonly id: string; readonly type: string; readonly value: number }>
}

export interface SolveOptions {
  readonly maxIterations?: number
  readonly tolerance?: number
  /** Skip the rank analysis (dof, free points, diagnostics): the solved geometry only. Default true. */
  readonly analyze?: boolean
  /** Maximum number of re-solves the minimal-conflict search may spend. Default 300. */
  readonly diagnoseBudget?: number
  /** Search for the minimal conflicting set of a conflicting sketch. Default true. */
  readonly diagnose?: boolean
  readonly signal?: AbortSignal
}
