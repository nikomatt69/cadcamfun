/**
 * Parametric feature history: a model described as a table of named parameters and an ordered list of features (sketches, extrusions,
 * revolutions, holes, patterns) that are replayed from the top whenever anything changes. Edit `width` and every sketch that uses it
 * re-solves, every solid built from those sketches is rebuilt, and every Boolean after it is redone.
 *
 *   parameters  numbers or expressions of other parameters (`expr.ts`): `"width": 40`, `"half": "width / 2"`, `"hole": "half - 3in"`
 *   sketch      a plane (XY, YZ or ZX, with an offset along its normal) and a constraint sketch (`sketch.ts`) whose dimensions are
 *               numbers or expressions; solved at every rebuild
 *   extrude     the closed profiles of a sketch pushed along the plane's normal; loops inside loops are holes (even-odd), so a ring is
 *               drawn as two circles; combined with the existing bodies as a new body, a union, a subtraction or an intersection
 *   revolve     a profile turned about an axis of its sketch (a line, or the plane's own x or y axis) through an angle
 *   hole        a cylinder at a point of a plane, subtracted
 *   pattern     copies of the tool of an earlier extrude / revolve / hole along a line or round the Z axis, each applied the same way
 *
 * Bodies are triangle meshes (`csg.ts`): the Boolean results are exact up to the meshing tolerance, not an exact B-rep, and there is
 * no fillet, chamfer or shell yet (they need the topology a mesh does not have; see spec 12). A feature that cannot be built is
 * reported in `issues` and skipped; the features that do not depend on it still build.
 *
 * Planes are right-handed: XY has u = X, v = Y, normal +Z; YZ has u = Y, v = Z, normal +X; ZX has u = Z, v = X, normal +Y.
 */
import { booleanMesh, mergeMeshes, rotateMesh, translateMesh } from "./csg.ts"
import { dimensionValue, resolveParameters, type Dimension, type ParameterTable } from "./expr.ts"
import { SketchError, polygonArea, sketchProfiles, solveSketch, type Constraint, type SketchEntity, type SolveResult } from "./sketch.ts"
import type { Vec2 } from "./vec.ts"
import { meshOf, meshVolume, type Mesh } from "./solid.ts"

export type PlaneName = "XY" | "YZ" | "ZX"
type V3 = { readonly x: number; readonly y: number; readonly z: number }

const FRAMES: Readonly<Record<PlaneName, { readonly u: V3; readonly v: V3; readonly n: V3 }>> = {
  XY: { u: { x: 1, y: 0, z: 0 }, v: { x: 0, y: 1, z: 0 }, n: { x: 0, y: 0, z: 1 } },
  YZ: { u: { x: 0, y: 1, z: 0 }, v: { x: 0, y: 0, z: 1 }, n: { x: 1, y: 0, z: 0 } },
  ZX: { u: { x: 0, y: 0, z: 1 }, v: { x: 1, y: 0, z: 0 }, n: { x: 0, y: 1, z: 0 } }
}

type Dimensioned<C> = C extends { readonly value: number } ? Omit<C, "value"> & { readonly value: Dimension } : C
/** A constraint whose dimension may be an expression. */
export type DimConstraint = Dimensioned<Constraint>

export interface HistorySketch {
  readonly entities: ReadonlyArray<SketchEntity>
  readonly constraints: ReadonlyArray<DimConstraint>
}

export type Operation = "new" | "union" | "subtract" | "intersect"

export interface SketchFeature { readonly id: string; readonly type: "sketch"; readonly plane: PlaneName; readonly offset?: Dimension; readonly sketch: HistorySketch }
export interface ExtrudeFeature {
  readonly id: string
  readonly type: "extrude"
  readonly sketch: string
  readonly depth: Dimension
  readonly direction?: "up" | "down" | "symmetric"
  readonly operation: Operation
  /** Bodies the operation applies to; the default is every body so far. */
  readonly targets?: ReadonlyArray<string>
}
export interface RevolveFeature {
  readonly id: string
  readonly type: "revolve"
  readonly sketch: string
  /** A line of the sketch, or the plane's own `x` (u) or `y` (v) axis through its origin. */
  readonly axis: "x" | "y" | { readonly line: string }
  /** Degrees; the default is 360. */
  readonly angle?: Dimension
  readonly operation: Operation
  readonly targets?: ReadonlyArray<string>
}
export interface HoleFeature {
  readonly id: string
  readonly type: "hole"
  readonly plane: PlaneName
  readonly offset?: Dimension
  readonly at: readonly [Dimension, Dimension]
  readonly diameter: Dimension
  readonly depth: Dimension
  readonly targets?: ReadonlyArray<string>
}
export interface PatternFeature {
  readonly id: string
  readonly type: "pattern"
  /** The extrude / revolve / hole whose tool is copied. */
  readonly feature: string
  readonly kind: "linear" | "circular"
  readonly count: Dimension
  /** `linear`: the offset between two copies. */
  readonly step?: readonly [Dimension, Dimension, Dimension]
  /** `circular`: the centre on the XY plane (the axis is Z) and the angle spanned by all the copies, degrees (default 360). */
  readonly centre?: readonly [Dimension, Dimension]
  readonly span?: Dimension
}
export type Feature = SketchFeature | ExtrudeFeature | RevolveFeature | HoleFeature | PatternFeature

export interface History {
  readonly parameters: ParameterTable
  readonly features: ReadonlyArray<Feature>
}

export interface Issue { readonly feature: string; readonly severity: "error" | "warning"; readonly message: string }

export interface Body { readonly id: string; readonly mesh: Mesh; readonly feature: string }

export interface RebuildResult {
  readonly bodies: ReadonlyArray<Body>
  readonly parameters: Readonly<Record<string, number>>
  readonly sketches: Readonly<Record<string, { readonly plane: PlaneName; readonly offset: number; readonly solve: SolveResult }>>
  readonly issues: ReadonlyArray<Issue>
}

const ptOf = (frame: { u: V3; v: V3; n: V3 }, origin: V3, p: V3): V3 => ({
  x: origin.x + frame.u.x * p.x + frame.v.x * p.y + frame.n.x * p.z,
  y: origin.y + frame.u.y * p.x + frame.v.y * p.y + frame.n.y * p.z,
  z: origin.z + frame.u.z * p.x + frame.v.z * p.y + frame.n.z * p.z
})

/** A mesh built in local (x, y, z) carried to the frame: world = origin + x ex + y ey + z ez (rigid, so the winding is kept). */
const place = (mesh: Mesh, ex: V3, ey: V3, ez: V3, origin: V3): Mesh => {
  const out = new Float32Array(mesh.positions.length)
  for (let i = 0; i < out.length; i += 3) {
    const p = ptOf({ u: ex, v: ey, n: ez }, origin, { x: mesh.positions[i]!, y: mesh.positions[i + 1]!, z: mesh.positions[i + 2]! })
    out[i] = p.x; out[i + 1] = p.y; out[i + 2] = p.z
  }
  return { positions: out, indices: mesh.indices }
}

const insideRing = (p: Vec2, ring: ReadonlyArray<Vec2>): boolean => {
  let c = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!, b = ring[j]!
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c
  }
  return c
}

const prism = (ring: ReadonlyArray<Vec2>, from: number, to: number): Mesh =>
  meshOf({ _tag: "Extrude", profile: ring.map((p) => ({ x: p.x, y: p.y })), height: to - from, origin: { x: 0, y: 0, z: from } }, 0.01)

/** Solid of a set of loops in the plane between two depths along the normal: loops inside loops are holes, loops inside holes are solids. */
const profileSolid = (loops: ReadonlyArray<Vec2[]>, from: number, to: number): Mesh | undefined => {
  if (loops.length === 0) return undefined
  const depth = loops.map((l, i) => loops.filter((o, j) => j !== i && insideRing(l[0]!, o)).length)
  const parent = (i: number): number | undefined => {
    let best: number | undefined
    loops.forEach((o, j) => {
      if (j === i || depth[j] !== depth[i]! - 1 || !insideRing(loops[i]![0]!, o)) return
      if (best === undefined || Math.abs(polygonArea(o)) < Math.abs(polygonArea(loops[best]!))) best = j
    })
    return best
  }
  const solids: Mesh[] = []
  loops.forEach((loop, i) => {
    if (depth[i]! % 2 !== 0) return
    let solid = prism(loop, from, to)
    loops.forEach((_, j) => {
      if (depth[j] === depth[i]! + 1 && parent(j) === i) solid = booleanMesh(solid, prism(loops[j]!, from - 1, to + 1), "subtract")
    })
    solids.push(solid)
  })
  return solids.length === 0 ? undefined : solids.slice(1).reduce((acc, s) => booleanMesh(acc, s, "union"), solids[0]!)
}

/** Replays the history from the top. Never throws: what cannot be built is in `issues`. */
export const rebuild = (history: History): RebuildResult => {
  const issues: Issue[] = []
  const { values, errors } = resolveParameters(history.parameters)
  for (const [name, message] of Object.entries(errors)) issues.push({ feature: `parameter ${name}`, severity: "error", message })
  const dim = (d: Dimension, feature: string): number | undefined => {
    try { return dimensionValue(d, values) } catch (error) {
      issues.push({ feature, severity: "error", message: error instanceof Error ? error.message : String(error) })
      return undefined
    }
  }
  const sketches: Record<string, { plane: PlaneName; offset: number; solve: SolveResult }> = {}
  const bodies: Body[] = []
  const tools = new Map<string, { readonly meshes: ReadonlyArray<Mesh>; readonly operation: Operation; readonly targets?: ReadonlyArray<string> }>()

  const apply = (feature: string, tool: Mesh, operation: Operation, targets: ReadonlyArray<string> | undefined, label: string): void => {
    if (operation === "new") { bodies.push({ id: label, mesh: tool, feature }); return }
    const chosen = bodies.filter((b) => targets === undefined || targets.includes(b.id))
    if (chosen.length === 0) { issues.push({ feature, severity: "error", message: "There is no body for this operation to act on" }); return }
    if (operation === "union") {
      const merged = chosen.reduce((acc, b) => booleanMesh(b.mesh, acc, "union"), tool)
      const first = bodies.indexOf(chosen[0]!)
      for (const b of chosen.slice(1)) bodies.splice(bodies.indexOf(b), 1)
      bodies[first] = { ...chosen[0]!, mesh: merged }
      return
    }
    for (const b of chosen) bodies[bodies.indexOf(b)] = { ...b, mesh: booleanMesh(b.mesh, tool, operation === "subtract" ? "subtract" : "intersect") }
  }

  for (const f of history.features) {
    try {
      switch (f.type) {
        case "sketch": {
          const offset = f.offset === undefined ? 0 : dim(f.offset, f.id)
          if (offset === undefined) break
          const constraints: Constraint[] = []
          let ok = true
          for (const c of f.sketch.constraints) {
            if ("value" in c) {
              const v = dim(c.value as Dimension, f.id)
              if (v === undefined) { ok = false; continue }
              constraints.push({ ...c, value: v } as Constraint)
            } else constraints.push(c as Constraint)
          }
          if (!ok) break
          const solve = solveSketch({ entities: f.sketch.entities, constraints })
          sketches[f.id] = { plane: f.plane, offset, solve }
          if (solve.status === "conflicting" || solve.status === "failed") {
            issues.push({ feature: f.id, severity: "error", message: solve.message ?? `The sketch could not be solved (${solve.status})` })
          } else if (solve.status === "over-constrained") issues.push({ feature: f.id, severity: "warning", message: `The sketch has ${solve.redundant} redundant constraint(s)` })
          break
        }
        case "extrude": {
          const sk = sketches[f.sketch]
          if (sk === undefined || sk.solve.status === "conflicting" || sk.solve.status === "failed") { issues.push({ feature: f.id, severity: "error", message: `Sketch '${f.sketch}' is not available` }); break }
          const depth = dim(f.depth, f.id)
          if (depth === undefined) break
          if (!(depth > 0)) { issues.push({ feature: f.id, severity: "error", message: `The extrusion depth must be positive (it is ${depth})` }); break }
          const { loops, open } = sketchProfiles(sk.solve.sketch)
          if (open.length > 0) issues.push({ feature: f.id, severity: "warning", message: `${open.length} open chain(s) in the sketch are ignored` })
          const dir = f.direction ?? "up"
          const from = dir === "up" ? 0 : dir === "down" ? -depth : -depth / 2
          const local = profileSolid(loops, from, from + depth)
          if (local === undefined) { issues.push({ feature: f.id, severity: "error", message: "The sketch has no closed profile to extrude" }); break }
          const frame = FRAMES[sk.plane]
          const tool = place(local, frame.u, frame.v, frame.n, { x: frame.n.x * sk.offset, y: frame.n.y * sk.offset, z: frame.n.z * sk.offset })
          tools.set(f.id, { meshes: [tool], operation: f.operation, ...(f.targets !== undefined ? { targets: f.targets } : {}) })
          apply(f.id, tool, f.operation, f.targets, f.id)
          break
        }
        case "revolve": {
          const sk = sketches[f.sketch]
          if (sk === undefined || sk.solve.status === "conflicting" || sk.solve.status === "failed") { issues.push({ feature: f.id, severity: "error", message: `Sketch '${f.sketch}' is not available` }); break }
          const degrees = f.angle === undefined ? 360 : dim(f.angle, f.id)
          if (degrees === undefined) break
          if (!(degrees > 0 && degrees <= 360)) { issues.push({ feature: f.id, severity: "error", message: `The revolution angle must be in (0, 360] degrees (it is ${degrees})` }); break }
          const { loops } = sketchProfiles(sk.solve.sketch)
          if (loops.length !== 1) { issues.push({ feature: f.id, severity: "error", message: `A revolution needs exactly one closed profile (the sketch has ${loops.length})` }); break }
          const pts = new Map(sk.solve.sketch.entities.flatMap((e) => (e.kind === "point" ? [[e.id, e] as const] : [])))
          let a0: Vec2, dirA: Vec2
          if (f.axis === "x") { a0 = { x: 0, y: 0 }; dirA = { x: 1, y: 0 } }
          else if (f.axis === "y") { a0 = { x: 0, y: 0 }; dirA = { x: 0, y: 1 } }
          else {
            const axisId = f.axis.line
            const line = sk.solve.sketch.entities.find((e) => e.id === axisId && e.kind === "line")
            if (line === undefined || line.kind !== "line") { issues.push({ feature: f.id, severity: "error", message: `Axis '${axisId}' is not a line of the sketch` }); break }
            const p1 = pts.get(line.p1)!, p2 = pts.get(line.p2)!
            const len = Math.hypot(p2.x - p1.x, p2.y - p1.y)
            if (len < 1e-9) { issues.push({ feature: f.id, severity: "error", message: "The axis line has no length" }); break }
            a0 = { x: p1.x, y: p1.y }; dirA = { x: (p2.x - p1.x) / len, y: (p2.y - p1.y) / len }
          }
          // (axial, radial) of every profile point relative to the axis. The profile has to lie on one side; the axis is turned about
          // so that side is the positive radial one, which keeps the frame (radial, normal, axis) right-handed with no mirroring.
          const sideOf = (dir: Vec2) => loops[0]!.map((p) => (p.x - a0.x) * -dir.y + (p.y - a0.y) * dir.x)
          if (sideOf(dirA).every((r) => r <= 1e-9)) dirA = { x: -dirA.x, y: -dirA.y }
          const radial = sideOf(dirA)
          if (radial.some((r) => r < -1e-9)) { issues.push({ feature: f.id, severity: "error", message: "The profile crosses the axis of revolution" }); break }
          const ring = loops[0]!.map((p, i) => ({ a: (p.x - a0.x) * dirA.x + (p.y - a0.y) * dirA.y, r: Math.max(0, radial[i]!) }))
          const local = meshOf({ _tag: "Revolve", profile: ring.map((p) => ({ x: p.r, y: p.a })), angle: (degrees * Math.PI) / 180 }, 0.01)
          // Local x is the radial direction (N x axis), y the plane normal, z the axis: x cross y = z.
          const frame = FRAMES[sk.plane]
          const ax = ptOf(frame, { x: 0, y: 0, z: 0 }, { x: dirA.x, y: dirA.y, z: 0 })
          const nrm = frame.n
          const ex = { x: nrm.y * ax.z - nrm.z * ax.y, y: nrm.z * ax.x - nrm.x * ax.z, z: nrm.x * ax.y - nrm.y * ax.x }
          const origin = ptOf(frame, { x: nrm.x * sk.offset, y: nrm.y * sk.offset, z: nrm.z * sk.offset }, { x: a0.x, y: a0.y, z: 0 })
          const fixed = place(local, ex, nrm, ax, origin)
          tools.set(f.id, { meshes: [fixed], operation: f.operation, ...(f.targets !== undefined ? { targets: f.targets } : {}) })
          apply(f.id, fixed, f.operation, f.targets, f.id)
          break
        }
        case "hole": {
          const offset = f.offset === undefined ? 0 : dim(f.offset, f.id)
          const x = dim(f.at[0], f.id), y = dim(f.at[1], f.id), d = dim(f.diameter, f.id), depth = dim(f.depth, f.id)
          if (offset === undefined || x === undefined || y === undefined || d === undefined || depth === undefined) break
          if (!(d > 0 && depth > 0)) { issues.push({ feature: f.id, severity: "error", message: "A hole needs a positive diameter and depth" }); break }
          const n = Math.max(16, Math.ceil(Math.PI / Math.acos(Math.max(0, 1 - 0.01 / (d / 2)))))
          const ring = Array.from({ length: n }, (_, k) => ({ x: x + (d / 2) * Math.cos((2 * Math.PI * k) / n), y: y + (d / 2) * Math.sin((2 * Math.PI * k) / n) }))
          // The hole goes into the part, against the plane's normal; a little beyond the face so the cut is clean.
          const frame = FRAMES[f.plane]
          const tool = place(prism(ring, -depth, 0.01), frame.u, frame.v, frame.n, { x: frame.n.x * offset, y: frame.n.y * offset, z: frame.n.z * offset })
          tools.set(f.id, { meshes: [tool], operation: "subtract", ...(f.targets !== undefined ? { targets: f.targets } : {}) })
          apply(f.id, tool, "subtract", f.targets, f.id)
          break
        }
        case "pattern": {
          const source = tools.get(f.feature)
          if (source === undefined) { issues.push({ feature: f.id, severity: "error", message: `Feature '${f.feature}' has no tool to copy` }); break }
          const count = dim(f.count, f.id)
          if (count === undefined) break
          if (!Number.isInteger(count) || count < 2 || count > 500) { issues.push({ feature: f.id, severity: "error", message: `The pattern count must be an integer from 2 to 500 (it is ${count})` }); break }
          const tool0 = source.meshes.length === 1 ? source.meshes[0]! : mergeMeshes(source.meshes)
          if (f.kind === "linear") {
            const step = (f.step ?? [0, 0, 0]).map((d) => dim(d, f.id))
            if (step.some((s) => s === undefined)) break
            for (let i = 1; i < count; i++) apply(f.id, translateMesh(tool0, step[0]! * i, step[1]! * i, step[2]! * i), source.operation, source.targets, `${f.id}#${i}`)
          } else {
            const c = (f.centre ?? [0, 0]).map((d) => dim(d, f.id))
            const span = f.span === undefined ? 360 : dim(f.span, f.id)
            if (c.some((s) => s === undefined) || span === undefined) break
            // A full circle divides by the count (the last copy is the first again); a partial one spreads the copies end to end.
            const each = span >= 360 - 1e-9 ? span / count : span / (count - 1)
            for (let i = 1; i < count; i++) apply(f.id, rotateMesh(tool0, { x: 0, y: 0, z: 1 }, (each * i * Math.PI) / 180, { x: c[0]!, y: c[1]!, z: 0 }), source.operation, source.targets, `${f.id}#${i}`)
          }
          break
        }
      }
    } catch (error) {
      issues.push({ feature: f.id, severity: "error", message: error instanceof SketchError || error instanceof Error ? error.message : String(error) })
    }
  }
  return { bodies, parameters: values, sketches, issues }
}

/** Volume of the bodies together, mm^3 (they may touch but are assumed not to overlap). */
export const historyVolume = (result: RebuildResult): number => result.bodies.reduce((sum, b) => sum + meshVolume(b.mesh), 0)

/** A history with one parameter set to a new value (a number or an expression). */
export const withParameter = (history: History, name: string, value: number | string): History => ({
  ...history,
  parameters: { ...history.parameters, [name]: value }
})
