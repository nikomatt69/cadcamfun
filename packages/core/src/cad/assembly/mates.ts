/**
 * Mates as constraints between rigid occurrences (spec 46 A2). A mate relates two geometric FEATURES, each in the local frame of
 * the definition of one occurrence, so a mate follows the part wherever it is placed:
 *
 *   point   a location (a vertex, a circle centre)
 *   axis    a line through `origin` along `dir` (a hole, a pin, a cylinder; `radius` when it is a cylinder)
 *   plane   a plane through `origin` with outward `normal` (a planar face)
 *
 * Operands come from exact faces and edges through `featureOfFace` / `featureOfEdge`, or are given directly. A reference by
 * persistent name (spec 41) resolves to a face index first, then to a feature, behind the `FeatureResolver` interface.
 *
 * Every mate compiles to scalar equations in the world poses of the two occurrences (`R_i`, `t_i`), each with an analytic
 * gradient with respect to the pose update `(dt, delta)` (translation, and a small rotation applied on the left, `R <- exp(delta) R`).
 * The solver (solve.ts) is Levenberg-Marquardt on these rows.
 */
import { normalize3, type Brep, type Vec3 } from "../brep/index.ts"
import { AssemblyError } from "./model.ts"

export type Feature =
  | { readonly kind: "point"; readonly p: Vec3 }
  | { readonly kind: "axis"; readonly origin: Vec3; readonly dir: Vec3; readonly radius?: number }
  | { readonly kind: "plane"; readonly origin: Vec3; readonly normal: Vec3 }

export interface Operand {
  /** Leaf occurrence path. */
  readonly occurrence: string
  readonly feature: Feature
}

export interface Limits { readonly min: number; readonly max: number }

interface MateBase { readonly id?: string }
export type Mate = MateBase & (
  /** Contact: point-point, point-plane, point-axis (on the line), plane-plane (faces touch, normals opposed; `flip` aligns them), axis-axis (collinear). */
  | { readonly kind: "coincident"; readonly a: Operand; readonly b: Operand; readonly flip?: boolean; readonly offset?: number }
  | { readonly kind: "parallel"; readonly a: Operand; readonly b: Operand }
  | { readonly kind: "perpendicular"; readonly a: Operand; readonly b: Operand }
  /** Axes collinear (a pin in a hole). */
  | { readonly kind: "concentric"; readonly a: Operand; readonly b: Operand }
  /** point-point distance, point-plane distance, plane-plane offset (normals opposed). */
  | { readonly kind: "distance"; readonly a: Operand; readonly b: Operand; readonly value: number }
  /** Angle between two axes or two plane normals, degrees. */
  | { readonly kind: "angle"; readonly a: Operand; readonly b: Operand; readonly value: number }
  /** A cylinder (axis with radius) rests on a plane. */
  | { readonly kind: "tangent"; readonly a: Operand; readonly b: Operand; readonly side?: 1 | -1 }
  /** The two occurrences keep their present relative pose. */
  | { readonly kind: "lock"; readonly a: string; readonly b: string }
  /** Joints: axes concentric plus the position along it fixed (revolute), rotation fixed (slider), free (cylindrical), planar and ball. */
  | { readonly kind: "revolute"; readonly a: Operand; readonly b: Operand; readonly value?: number; readonly limits?: Limits }
  | { readonly kind: "slider"; readonly a: Operand; readonly b: Operand; readonly value?: number; readonly limits?: Limits }
  | { readonly kind: "cylindrical"; readonly a: Operand; readonly b: Operand; readonly angle?: number; readonly slide?: number; readonly angleLimits?: Limits; readonly slideLimits?: Limits }
  | { readonly kind: "planar"; readonly a: Operand; readonly b: Operand; readonly offset?: number }
  | { readonly kind: "ball"; readonly a: Operand; readonly b: Operand }
)

// ------------------------------------------------------------------------------------------------ features from exact bodies

export interface FeatureResolver {
  /** A feature of a definition by a persistent reference (or face index); undefined when it no longer resolves. */
  readonly resolve: (definition: string, ref: string) => Feature | undefined
}

const unit = (v: Vec3): Vec3 => normalize3(v)

/** The feature of a planar or cylindrical face of an exact body: its plane, or the axis of its cylinder. */
export const featureOfFace = (brep: Brep, faceIndex: number): Feature => {
  const face = brep.faces[faceIndex]
  if (face === undefined) throw new AssemblyError(`The body has no face ${faceIndex}`)
  const s = face.surface
  if (s.kind === "plane") {
    // The outward normal flips with the face orientation.
    const sign = face.reversed ? -1 : 1
    return { kind: "plane", origin: s.frame.origin, normal: unit({ x: s.frame.z.x * sign, y: s.frame.z.y * sign, z: s.frame.z.z * sign }) }
  }
  if (s.kind === "cylinder") return { kind: "axis", origin: s.frame.origin, dir: unit(s.frame.z), radius: s.radius }
  throw new AssemblyError(`Face ${faceIndex} is a ${s.kind}: only planar and cylindrical faces give a mate feature`)
}

// ------------------------------------------------------------------------------------------------ world vectors with pose gradients

/** Pose state of every occurrence: rotation matrices (9 each, row-major) and translations (3 each). */
export interface PoseState { readonly R: Float64Array; readonly t: Float64Array }

/** A world vector carried by an occurrence: where the pose update moves it. */
interface WV {
  readonly v: Vec3
  /** For a point, its offset from the occurrence origin (rotation arm); for a direction, the vector itself. */
  readonly r: Vec3
  readonly point: boolean
  readonly occ: number
}

const worldPoint = (S: PoseState, occ: number, p: Vec3): WV => {
  const o = occ * 9, t = occ * 3, R = S.R
  const rx = R[o]! * p.x + R[o + 1]! * p.y + R[o + 2]! * p.z, ry = R[o + 3]! * p.x + R[o + 4]! * p.y + R[o + 5]! * p.z, rz = R[o + 6]! * p.x + R[o + 7]! * p.y + R[o + 8]! * p.z
  return { v: { x: rx + S.t[t]!, y: ry + S.t[t + 1]!, z: rz + S.t[t + 2]! }, r: { x: rx, y: ry, z: rz }, point: true, occ }
}
const worldDir = (S: PoseState, occ: number, d: Vec3): WV => {
  const o = occ * 9, R = S.R
  const v = { x: R[o]! * d.x + R[o + 1]! * d.y + R[o + 2]! * d.z, y: R[o + 3]! * d.x + R[o + 4]! * d.y + R[o + 5]! * d.z, z: R[o + 6]! * d.x + R[o + 7]! * d.y + R[o + 8]! * d.z }
  return { v, r: v, point: false, occ }
}

const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z
const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x })
const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
const scale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s })
const unitVec = (k: number): Vec3 => ({ x: k === 0 ? 1 : 0, y: k === 1 ? 1 : 0, z: k === 2 ? 1 : 0 })
const comp = (v: Vec3, k: number): number => (k === 0 ? v.x : k === 1 ? v.y : v.z)

/** Row of the Jacobian over the two occurrences of an equation: [dt_a(3), delta_a(3), dt_b(3), delta_b(3)]. */
type Row = Float64Array

/** Adds the gradient `g` of the residual with respect to world vector `w` to the row (`a` is the first block, any other the second). */
const accumulate = (row: Row | null, a: number, w: WV, g: Vec3): void => {
  if (row === null) return
  const base = w.occ === a ? 0 : 6
  if (w.point) { row[base] = row[base]! + g.x; row[base + 1] = row[base + 1]! + g.y; row[base + 2] = row[base + 2]! + g.z }
  const rg = cross(w.r, g)
  row[base + 3] = row[base + 3]! + rg.x; row[base + 4] = row[base + 4]! + rg.y; row[base + 5] = row[base + 5]! + rg.z
}

export interface MateEquation {
  /** Occurrence indices (into the flat list) of the two blocks of the row. */
  readonly a: number
  readonly b: number
  /** Residual; when `row` is given its 12 entries (zeroed by the caller) receive the gradient. */
  readonly f: (S: PoseState, row: Row | null) => number
  /** Index of the mate in the list the assembly was compiled from. */
  readonly mate: number
}

type Feat<K extends Feature["kind"]> = Extract<Feature, { kind: K }>

// ------------------------------------------------------------------------------------------------ equation builders

type Builder = (a: number, b: number, mate: number, out: MateEquation[]) => void

const eq = (out: MateEquation[], a: number, b: number, mate: number, f: MateEquation["f"]): void => { out.push({ a, b, f, mate }) }

/** (Pa - Pb)_k - offset_k for two points. */
const pointPoint = (pa: Vec3, pb: Vec3, offset?: Vec3): Builder => (a, b, mate, out) => {
  for (let k = 0; k < 3; k++) eq(out, a, b, mate, (S, row) => {
    const A = worldPoint(S, a, pa), B = worldPoint(S, b, pb)
    if (row !== null) { accumulate(row, a, A, unitVec(k)); accumulate(row, a, B, scale(unitVec(k), -1)) }
    return comp(A.v, k) - comp(B.v, k) - (offset === undefined ? 0 : comp(offset, k))
  })
}
/** n_B . (P_A - O_B) - d: the point `pa` of A against the plane of B. */
const pointPlane = (pa: Vec3, plane: Feat<"plane">, d: number, swap = false): Builder => (a, b, mate, out) => {
  const [ia, ib] = swap ? [b, a] : [a, b]
  eq(out, a, b, mate, (S, row) => {
    const P = worldPoint(S, ia, pa), O = worldPoint(S, ib, plane.origin), N = worldDir(S, ib, plane.normal)
    const w = sub(P.v, O.v)
    if (row !== null) { accumulate(row, a, P, N.v); accumulate(row, a, O, scale(N.v, -1)); accumulate(row, a, N, w) }
    return dot(N.v, w) - d
  })
}
/** Component k of the vector from line (O, D) to the point: the perpendicular part of P - O. */
const pointAxis = (pa: Vec3, axis: Feat<"axis">, swap = false): Builder => (a, b, mate, out) => {
  const [ia, ib] = swap ? [b, a] : [a, b]
  for (let k = 0; k < 3; k++) eq(out, a, b, mate, (S, row) => {
    const P = worldPoint(S, ia, pa), O = worldPoint(S, ib, axis.origin), D = worldDir(S, ib, axis.dir)
    const e = sub(P.v, O.v)
    const along = dot(e, D.v)
    if (row !== null) {
      // w_k = e_k - (e.D) D_k;  dw_k/de_i = delta_ki - D_k D_i;  dw_k/dD_i = -e_i D_k - (e.D) delta_ki
      const de = sub(unitVec(k), scale(D.v, comp(D.v, k)))
      const dD = sub(scale(e, -comp(D.v, k)), scale(unitVec(k), along))
      accumulate(row, a, P, de); accumulate(row, a, O, scale(de, -1)); accumulate(row, a, D, dD)
    }
    return comp(e, k) - along * comp(D.v, k)
  })
}
/** (Da x Db)_k: the two directions are parallel (either sense). */
const crossDirs = (da: Vec3, db: Vec3): Builder => (a, b, mate, out) => {
  for (let k = 0; k < 3; k++) eq(out, a, b, mate, (S, row) => {
    const A = worldDir(S, a, da), B = worldDir(S, b, db)
    const c = cross(A.v, B.v)
    if (row !== null) { accumulate(row, a, A, cross(B.v, unitVec(k))); accumulate(row, a, B, cross(unitVec(k), A.v)) }
    return comp(c, k)
  })
}
/** (Da - s Db)_k: the directions coincide (s = 1) or oppose (s = -1). */
const sameDirs = (da: Vec3, db: Vec3, s: 1 | -1): Builder => (a, b, mate, out) => {
  for (let k = 0; k < 3; k++) eq(out, a, b, mate, (S, row) => {
    const A = worldDir(S, a, da), B = worldDir(S, b, db)
    if (row !== null) { accumulate(row, a, A, unitVec(k)); accumulate(row, a, B, scale(unitVec(k), -s)) }
    return comp(A.v, k) - s * comp(B.v, k)
  })
}
/** Da . Db - c. */
const dotDirs = (da: Vec3, db: Vec3, c: number): Builder => (a, b, mate, out) => {
  eq(out, a, b, mate, (S, row) => {
    const A = worldDir(S, a, da), B = worldDir(S, b, db)
    if (row !== null) { accumulate(row, a, A, B.v); accumulate(row, a, B, A.v) }
    return dot(A.v, B.v) - c
  })
}
/** |Pa - Pb| - d. */
const pointDistance = (pa: Vec3, pb: Vec3, d: number): Builder => (a, b, mate, out) => {
  eq(out, a, b, mate, (S, row) => {
    const A = worldPoint(S, a, pa), B = worldPoint(S, b, pb)
    const w = sub(A.v, B.v)
    const len = Math.hypot(w.x, w.y, w.z)
    if (row !== null) { const u = len > 1e-12 ? scale(w, 1 / len) : { x: 1, y: 0, z: 0 }; accumulate(row, a, A, u); accumulate(row, a, B, scale(u, -1)) }
    return len - d
  })
}
/** Signed angle of reference direction rb against ra about axis D (right-handed), minus `target`, wrapped. */
const rotationAbout = (axisA: Vec3, ra: Vec3, rb: Vec3, target: number): Builder => (a, b, mate, out) => {
  eq(out, a, b, mate, (S, row) => {
    const D = worldDir(S, a, axisA), A = worldDir(S, a, ra), B = worldDir(S, b, rb)
    const s = dot(cross(A.v, B.v), D.v), c = dot(A.v, B.v)
    const ang = Math.atan2(s, c)
    if (row !== null) {
      const q = s * s + c * c
      if (q > 1e-12) {
        // d ang = (c ds - s dc) / q;  ds: dA = B x D, dB = D x A, dD = A x B;  dc: dA = B, dB = A
        accumulate(row, a, A, scale(sub(scale(cross(B.v, D.v), c), scale(B.v, s)), 1 / q))
        accumulate(row, a, B, scale(sub(scale(cross(D.v, A.v), c), scale(A.v, s)), 1 / q))
        accumulate(row, a, D, scale(cross(A.v, B.v), c / q))
      }
    }
    return Math.atan2(Math.sin(ang - target), Math.cos(ang - target))
  })
}
/** (Pb - Pa) . Da - target: the slide of B's origin along A's axis. */
const slideAlong = (axisA: Vec3, pa: Vec3, pb: Vec3, target: number): Builder => (a, b, mate, out) => {
  eq(out, a, b, mate, (S, row) => {
    const D = worldDir(S, a, axisA), A = worldPoint(S, a, pa), B = worldPoint(S, b, pb)
    const w = sub(B.v, A.v)
    if (row !== null) { accumulate(row, a, B, D.v); accumulate(row, a, A, scale(D.v, -1)); accumulate(row, a, D, w) }
    return dot(w, D.v) - target
  })
}

// ------------------------------------------------------------------------------------------------ measuring joints

const RAD = Math.PI / 180

/** Any unit vector square to `d`. */
const perpendicularTo = (d: Vec3): Vec3 => {
  const n = unit(d)
  const helper = Math.abs(n.x) < 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 }
  return unit(cross(n, helper))
}

export interface InitialPose { readonly R: ArrayLike<number>; readonly t: ArrayLike<number> }

export interface JointMeasure {
  readonly id: string
  readonly kind: "revolute" | "slider" | "cylindrical"
  /** Current angle (degrees) and slide (mm) relative to the pose the assembly was solved from. */
  readonly measure: (S: PoseState) => { readonly angle?: number; readonly slide?: number }
  readonly limits?: Limits
  readonly slideLimits?: Limits
}

export interface CompiledMates {
  readonly equations: ReadonlyArray<MateEquation>
  readonly joints: ReadonlyArray<JointMeasure>
  /** Names of the mates (their id, or `kind#n`). */
  readonly names: ReadonlyArray<string>
}

/**
 * Compiles mates against the occurrences' initial poses (the "zero pose" of joints) into equations. `index` maps leaf occurrence
 * paths to block indices.
 */
export const compileMates = (mates: ReadonlyArray<Mate>, index: ReadonlyMap<string, number>, initial: PoseState): CompiledMates => {
  const equations: MateEquation[] = []
  const joints: JointMeasure[] = []
  const names: string[] = []
  let counter = 0
  const at = (path: string): number => {
    const i = index.get(path)
    if (i === undefined) throw new AssemblyError(`A mate refers to the occurrence '${path}', which is not in the assembly (or is suppressed)`)
    return i
  }
  mates.forEach((mate, mi) => {
    const name = mate.id ?? `${mate.kind}#${counter++}`
    names.push(name)
    const out: MateEquation[] = []
    if (mate.kind === "lock") {
      const a = at(mate.a), b = at(mate.b)
      if (a === b) throw new AssemblyError(`Mate '${name}' locks '${mate.a}' to itself`)
      // The origin of B and the axes of B keep their place in A's frame.
      const Ra = initial.R, Rb = initial.R
      const rel = (k: number): Vec3 => {
        // A-local vector of B's local basis vector e_k: R_a^T R_b e_k
        const v = [Rb[b * 9 + k]!, Rb[b * 9 + 3 + k]!, Rb[b * 9 + 6 + k]!]
        return { x: Ra[a * 9]! * v[0]! + Ra[a * 9 + 3]! * v[1]! + Ra[a * 9 + 6]! * v[2]!, y: Ra[a * 9 + 1]! * v[0]! + Ra[a * 9 + 4]! * v[1]! + Ra[a * 9 + 7]! * v[2]!, z: Ra[a * 9 + 2]! * v[0]! + Ra[a * 9 + 5]! * v[1]! + Ra[a * 9 + 8]! * v[2]! }
      }
      const dt = { x: initial.t[b * 3]! - initial.t[a * 3]!, y: initial.t[b * 3 + 1]! - initial.t[a * 3 + 1]!, z: initial.t[b * 3 + 2]! - initial.t[a * 3 + 2]! }
      const c = { x: Ra[a * 9]! * dt.x + Ra[a * 9 + 3]! * dt.y + Ra[a * 9 + 6]! * dt.z, y: Ra[a * 9 + 1]! * dt.x + Ra[a * 9 + 4]! * dt.y + Ra[a * 9 + 7]! * dt.z, z: Ra[a * 9 + 2]! * dt.x + Ra[a * 9 + 5]! * dt.y + Ra[a * 9 + 8]! * dt.z }
      pointPoint(c, { x: 0, y: 0, z: 0 })(a, b, mi, out)
      for (let k = 0; k < 3; k++) sameDirs(rel(k), unitVec(k), 1)(a, b, mi, out)
      equations.push(...out)
      return
    }
    const a = at(mate.a.occurrence), b = at(mate.b.occurrence)
    if (a === b) throw new AssemblyError(`Mate '${name}' relates occurrence '${mate.a.occurrence}' to itself`)
    const fa = mate.a.feature, fb = mate.b.feature
    const bad = (): never => { throw new AssemblyError(`Mate '${name}' (${mate.kind}) does not apply to a ${fa.kind} and a ${fb.kind}`) }
    const need = <K extends Feature["kind"]>(f: Feature, kind: K): Feat<K> => (f.kind === kind ? (f as Feat<K>) : bad())
    switch (mate.kind) {
      case "coincident": {
        const offset = mate.offset ?? 0
        if (fa.kind === "point" && fb.kind === "point") pointPoint(fa.p, fb.p)(a, b, mi, out)
        else if (fa.kind === "point" && fb.kind === "plane") pointPlane(fa.p, fb, offset)(a, b, mi, out)
        else if (fa.kind === "plane" && fb.kind === "point") pointPlane(fb.p, fa, offset, true)(a, b, mi, out)
        else if (fa.kind === "point" && fb.kind === "axis") pointAxis(fa.p, fb)(a, b, mi, out)
        else if (fa.kind === "axis" && fb.kind === "point") pointAxis(fb.p, fa, true)(a, b, mi, out)
        else if (fa.kind === "plane" && fb.kind === "plane") {
          // Faces touch: normals opposed (or aligned with `flip`), and A's origin on B's plane at the offset.
          sameDirs(fa.normal, fb.normal, mate.flip === true ? 1 : -1)(a, b, mi, out)
          pointPlane(fa.origin, fb, offset)(a, b, mi, out)
        } else if (fa.kind === "axis" && fb.kind === "axis") {
          crossDirs(fa.dir, fb.dir)(a, b, mi, out)
          pointAxis(fa.origin, fb)(a, b, mi, out)
        } else bad()
        break
      }
      case "concentric": {
        const x = need(fa, "axis"), y = need(fb, "axis")
        crossDirs(x.dir, y.dir)(a, b, mi, out)
        pointAxis(x.origin, y)(a, b, mi, out)
        break
      }
      case "parallel": {
        const da = fa.kind === "axis" ? fa.dir : fa.kind === "plane" ? fa.normal : bad()
        const db = fb.kind === "axis" ? fb.dir : fb.kind === "plane" ? fb.normal : bad()
        crossDirs(da, db)(a, b, mi, out)
        break
      }
      case "perpendicular": {
        const da = fa.kind === "axis" ? fa.dir : fa.kind === "plane" ? fa.normal : bad()
        const db = fb.kind === "axis" ? fb.dir : fb.kind === "plane" ? fb.normal : bad()
        dotDirs(da, db, 0)(a, b, mi, out)
        break
      }
      case "distance": {
        if (fa.kind === "point" && fb.kind === "point") pointDistance(fa.p, fb.p, mate.value)(a, b, mi, out)
        else if (fa.kind === "point" && fb.kind === "plane") pointPlane(fa.p, fb, mate.value)(a, b, mi, out)
        else if (fa.kind === "plane" && fb.kind === "plane") { sameDirs(fa.normal, fb.normal, -1)(a, b, mi, out); pointPlane(fa.origin, fb, mate.value)(a, b, mi, out) }
        else bad()
        break
      }
      case "angle": {
        const da = fa.kind === "axis" ? fa.dir : fa.kind === "plane" ? fa.normal : bad()
        const db = fb.kind === "axis" ? fb.dir : fb.kind === "plane" ? fb.normal : bad()
        dotDirs(da, db, Math.cos(mate.value * RAD))(a, b, mi, out)
        break
      }
      case "tangent": {
        const cyl = need(fa, "axis"), plane = need(fb, "plane")
        if (cyl.radius === undefined) throw new AssemblyError(`Mate '${name}': the cylinder has no radius`)
        // Axis parallel to the plane, and its distance from the plane equals the radius on the chosen side.
        const side = mate.side ?? 1
        const O = cyl.origin
        dotDirs(cyl.dir, plane.normal, 0)(a, b, mi, out)
        pointPlane(O, plane, side * cyl.radius)(a, b, mi, out)
        break
      }
      case "revolute": case "slider": case "cylindrical": case "planar": case "ball": {
        compileJoint(mate, name, mi, a, b, out, joints, initial)
        break
      }
    }
    equations.push(...out)
  })
  return { equations, joints, names }
}

const worldAxisOf = (S: PoseState, occ: number, f: Feat<"axis">): { origin: Vec3; dir: Vec3 } => ({ origin: worldPoint(S, occ, f.origin).v, dir: worldDir(S, occ, f.dir).v })

const compileJoint = (
  mate: Extract<Mate, { kind: "revolute" | "slider" | "cylindrical" | "planar" | "ball" }>, name: string, mi: number, a: number, b: number,
  out: MateEquation[], joints: JointMeasure[], initial: InitialPose
): void => {
  const fa = mate.a.feature, fb = mate.b.feature
  const state: PoseState = { R: Float64Array.from(initial.R), t: Float64Array.from(initial.t) }
  if (mate.kind === "ball") {
    if (fa.kind !== "point" || fb.kind !== "point") throw new AssemblyError(`Mate '${name}' (ball) needs two points`)
    pointPoint(fa.p, fb.p)(a, b, mi, out)
    return
  }
  if (mate.kind === "planar") {
    if (fa.kind !== "plane" || fb.kind !== "plane") throw new AssemblyError(`Mate '${name}' (planar) needs two planes`)
    sameDirs(fa.normal, fb.normal, -1)(a, b, mi, out)
    pointPlane(fa.origin, fb, mate.offset ?? 0)(a, b, mi, out)
    return
  }
  if (fa.kind !== "axis" || fb.kind !== "axis") throw new AssemblyError(`Mate '${name}' (${mate.kind}) needs two axes`)
  crossDirs(fa.dir, fb.dir)(a, b, mi, out)
  pointAxis(fa.origin, fb)(a, b, mi, out)
  // Zero references: the pose the assembly is in now is angle 0 and slide 0.
  const A = worldAxisOf(state, a, fa), B = worldAxisOf(state, b, fb)
  const sameSense = dot(A.dir, B.dir) >= 0
  const refA = perpendicularTo(fa.dir)
  // B's reference is the world reference of A, expressed in B's frame.
  const wA = worldDir(state, a, refA).v
  const refBworld = wA
  const Rb = initial.R
  const refB = { x: Rb[b * 9]! * refBworld.x + Rb[b * 9 + 3]! * refBworld.y + Rb[b * 9 + 6]! * refBworld.z, y: Rb[b * 9 + 1]! * refBworld.x + Rb[b * 9 + 4]! * refBworld.y + Rb[b * 9 + 7]! * refBworld.z, z: Rb[b * 9 + 2]! * refBworld.x + Rb[b * 9 + 5]! * refBworld.y + Rb[b * 9 + 8]! * refBworld.z }
  const slide0 = dot(sub(worldPoint(state, b, fb.origin).v, worldPoint(state, a, fa.origin).v), A.dir)
  void sameSense
  const angleValue = mate.kind === "revolute" ? mate.value : mate.kind === "cylindrical" ? mate.angle : undefined
  const slideValue = mate.kind === "slider" ? mate.value : mate.kind === "cylindrical" ? mate.slide : undefined
  if (mate.kind === "revolute") {
    // Position along the axis fixed: B's origin stays at the zero offset along A's axis.
    slideAlong(fa.dir, fa.origin, fb.origin, slide0)(a, b, mi, out)
  }
  if (mate.kind === "slider") rotationAbout(fa.dir, refA, refB, 0)(a, b, mi, out)
  if (angleValue !== undefined) rotationAbout(fa.dir, refA, refB, angleValue * RAD)(a, b, mi, out)
  if (slideValue !== undefined) slideAlong(fa.dir, fa.origin, fb.origin, slide0 + slideValue)(a, b, mi, out)
  const measure = (S: PoseState): { angle?: number; slide?: number } => {
    const D = worldDir(S, a, fa.dir).v, Aw = worldDir(S, a, refA).v, Bw = worldDir(S, b, refB).v
    const angle = Math.atan2(dot(cross(Aw, Bw), D), dot(Aw, Bw)) / RAD
    const slide = dot(sub(worldPoint(S, b, fb.origin).v, worldPoint(S, a, fa.origin).v), D) - slide0
    return mate.kind === "revolute" ? { angle } : mate.kind === "slider" ? { slide } : { angle, slide }
  }
  joints.push({
    id: name, kind: mate.kind, measure,
    ...(mate.kind === "revolute" || mate.kind === "slider" ? (mate.limits !== undefined ? { limits: mate.limits } : {}) : {}),
    ...(mate.kind === "cylindrical" ? { ...(mate.angleLimits !== undefined ? { limits: mate.angleLimits } : {}), ...(mate.slideLimits !== undefined ? { slideLimits: mate.slideLimits } : {}) } : {})
  })
}
