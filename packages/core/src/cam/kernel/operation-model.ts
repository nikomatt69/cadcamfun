/**
 * The operation model of a job (spec 69 C6): operations with ids and dependencies, enable / disable, and copy / mirror / pattern of an
 * operation, of a setup and of a whole job. Pure functions over the plain records of `contracts.ts`; the kernel runs what they return.
 *
 *   order       `resolveOperations` drops disabled operations and orders the rest so that every operation follows what it `dependsOn`
 *               (stable: operations keep their listed order wherever the dependencies allow it). A missing id, a dependency on a
 *               disabled operation and a cycle are refused with the ids, never repaired.
 *   transform   `transformOperation` moves an operation by a translation, a mirror about a vertical plane or a rotation about Z, in
 *               the coordinates the operation is given in. A mirror reverses the winding of every ring (the planners expect the
 *               orientation they were given) and flips the hand of a thread; what a mirror or rotation cannot honestly carry (a
 *               five-axis contact, a tilted hole) is refused with its reason.
 *   copy        `copyOperation`, `patternOperation` (linear and polar), `copySetup`, `patternSetups`, `mirrorSetup`, `transformJob`
 *               rename what they copy (`<id>.<n>`) and rewrite `dependsOn` / `restFrom` inside the copied set.
 */
import type { Vec2, Vec3 } from "../../cad/vec.ts"
import type { Mesh64 } from "../model/element-mesh.ts"
import { partMeshes } from "../model/model.ts"
import type { CadElement } from "../generator/schema.ts"
import type { CamIssue, CamResult, FixtureBody, JobSetup, ManufacturingJob, OperationSpec, RegionSpec, StockBox, StockModel } from "./contracts.ts"

const refuse = (message: string): CamResult<never> => ({ status: "failed", issues: [{ tag: "InvalidInput", severity: "error", stage: "prepare", message }] })

// ------------------------------------------------------------------------------------------------ order

/** Drops disabled operations and orders the others after their dependencies; see the module note. */
export const resolveOperations = (operations: ReadonlyArray<OperationSpec>): CamResult<ReadonlyArray<OperationSpec>> => {
  const byId = new Map<string, OperationSpec>()
  for (const op of operations) {
    if (byId.has(op.id)) return refuse(`Duplicate operation id '${op.id}'`)
    byId.set(op.id, op)
  }
  const issues: CamIssue[] = []
  const bad = (m: string): void => { issues.push({ tag: "InvalidInput", severity: "error", stage: "prepare", message: m }) }
  for (const op of operations) {
    if (op.enabled === false) continue
    for (const d of op.dependsOn ?? []) {
      const dep = byId.get(d)
      if (dep === undefined) bad(`Operation ${op.id} depends on '${d}', which is not in the job`)
      else if (dep.enabled === false) bad(`Operation ${op.id} depends on '${d}', which is disabled: enable it or drop the dependency`)
      else if (d === op.id) bad(`Operation ${op.id} depends on itself`)
    }
  }
  if (issues.length > 0) return { status: "failed", issues }
  const live = operations.filter((o) => o.enabled !== false)
  const placed = new Set<string>()
  const out: OperationSpec[] = []
  while (out.length < live.length) {
    const next = live.find((o) => !placed.has(o.id) && (o.dependsOn ?? []).every((d) => placed.has(d)))
    if (next === undefined) {
      return refuse(`Operations depend on each other in a cycle: ${live.filter((o) => !placed.has(o.id)).map((o) => o.id).join(", ")}`)
    }
    placed.add(next.id)
    out.push(next)
  }
  return { status: "ok", value: out }
}

// ------------------------------------------------------------------------------------------------ transforms

export type Transform2 =
  | { readonly kind: "translate"; readonly dx: number; readonly dy: number; readonly dz?: number }
  /** Mirror about the vertical plane `x = at` (`axis: "x"`) or `y = at` (`axis: "y"`). */
  | { readonly kind: "mirror"; readonly axis: "x" | "y"; readonly at: number }
  /** Rotation about the vertical line through `(cx, cy)`, degrees, counter-clockwise seen from +Z. */
  | { readonly kind: "rotate"; readonly angle: number; readonly cx: number; readonly cy: number }

const finite = (t: Transform2): boolean => {
  switch (t.kind) {
    case "translate": return [t.dx, t.dy, t.dz ?? 0].every(Number.isFinite)
    case "mirror": return Number.isFinite(t.at)
    case "rotate": return [t.angle, t.cx, t.cy].every(Number.isFinite)
  }
}

const mapPoint = (t: Transform2) => (p: Vec2): Vec2 => {
  switch (t.kind) {
    case "translate": return { x: p.x + t.dx, y: p.y + t.dy }
    case "mirror": return t.axis === "x" ? { x: 2 * t.at - p.x, y: p.y } : { x: p.x, y: 2 * t.at - p.y }
    case "rotate": {
      const a = (t.angle * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), x = p.x - t.cx, y = p.y - t.cy
      return { x: t.cx + c * x - s * y, y: t.cy + s * x + c * y }
    }
  }
}

const mapVec = (t: Transform2) => (p: Vec3): Vec3 => {
  const q = mapPoint(t)(p)
  return { x: q.x, y: q.y, z: p.z + (t.kind === "translate" ? (t.dz ?? 0) : 0) }
}

export interface TransformOptions {
  /** New id of an operation; default keeps it. */
  readonly rename?: (id: string) => string
}

/**
 * Moves one operation. `Z` heights (`top`, `bottom`, ...) shift only by a translation's `dz`. Refused: a mirror or rotation of a
 * five-axis operation or a tilted hole (their directions are not carried), a rotation of a raster whose `angle` has no meaning
 * under it is carried by adding the angle.
 */
export const transformOperation = (op: OperationSpec, t: Transform2, options: TransformOptions = {}): CamResult<OperationSpec> => {
  if (!finite(t)) return refuse("A transform needs finite numbers")
  const rename = options.rename ?? ((id: string) => id)
  const dz = t.kind === "translate" ? (t.dz ?? 0) : 0
  const pt = mapPoint(t), v3 = mapVec(t)
  const mirrored = t.kind === "mirror"
  const ring = (r: ReadonlyArray<Vec2>): ReadonlyArray<Vec2> => (mirrored ? r.map(pt).reverse() : r.map(pt))
  const region = (r: RegionSpec): RegionSpec => ({ boundary: ring(r.boundary), ...(r.islands !== undefined ? { islands: r.islands.map(ring) } : {}) })
  const base = { id: rename(op.id), ...(op.dependsOn !== undefined ? { dependsOn: op.dependsOn.map(rename) } : {}) }
  const z = (v: number): number => v + dz
  const limits = op.limits === undefined ? {} : { limits: {
    ...(op.limits.boundary !== undefined ? { boundary: ring(op.limits.boundary) } : {}),
    ...(op.limits.avoid !== undefined ? { avoid: op.limits.avoid.map(ring) } : {}),
    ...(op.limits.containment !== undefined ? { containment: op.limits.containment } : {})
  } }
  const keep = { ...op, ...base, ...limits } as OperationSpec
  switch (op.strategy) {
    case "face": return { status: "ok", value: { ...keep, bottom: z(op.bottom) } as OperationSpec }
    case "adaptive": return { status: "ok", value: { ...keep, region: region(op.region), top: z(op.top), bottom: z(op.bottom) } as OperationSpec }
    case "pocket": return { status: "ok", value: { ...keep, region: region(op.region), top: z(op.top), bottom: z(op.bottom) } as OperationSpec }
    case "profile": {
      const within = (op as { readonly within?: RegionSpec }).within
      return { status: "ok", value: { ...keep, loop: ring(op.loop), ...(within !== undefined ? { within: region(within) } : {}), top: z(op.top), bottom: z(op.bottom) } as OperationSpec }
    }
    case "bore": return { status: "ok", value: { ...keep, center: pt(op.center), top: z(op.top), bottom: z(op.bottom) } as OperationSpec }
    case "thread": return { status: "ok", value: { ...keep, center: pt(op.center), top: z(op.top), ...(mirrored ? { rightHand: !(op.rightHand ?? true) } : {}) } as OperationSpec }
    case "drill": {
      if (op.cycle?.kind === "tilted") return refuse(`Operation ${op.id}: a tilted hole keeps its direction in CAD space, so it is not ${mirrored ? "mirrored" : t.kind === "rotate" ? "rotated" : "moved"} here; re-plan it`)
      const cycle = op.cycle?.kind === "back-bore" ? { cycle: { ...op.cycle, face: z(op.cycle.face) } } : op.cycle !== undefined ? { cycle: op.cycle } : {}
      return { status: "ok", value: { ...keep, points: op.points.map(pt), top: z(op.top), bottom: z(op.bottom), ...cycle } as OperationSpec }
    }
    case "engrave": return { status: "ok", value: { ...keep, paths: op.paths.map((p) => ({ points: p.points.map(pt), closed: p.closed })), top: z(op.top) } as OperationSpec }
    case "chamfer": return { status: "ok", value: { ...keep, loops: op.loops.map((l) => ({ points: ring(l.points), side: l.side })), top: z(op.top) } as OperationSpec }
    case "surface": {
      const angle = op.angle === undefined ? {} : { angle: t.kind === "rotate" ? op.angle + t.angle : t.kind === "mirror" ? (t.axis === "x" ? 180 - op.angle : -op.angle) : op.angle }
      return { status: "ok", value: { ...keep, ...(op.center !== undefined ? { center: pt(op.center) } : {}), ...angle, ...(op.restFrom !== undefined ? { restFrom: rename(op.restFrom) } : {}) } as OperationSpec }
    }
    case "multiaxis": {
      if (t.kind !== "translate") return refuse(`Operation ${op.id}: a five-axis contact carries tool-axis directions and wall normals, which are not ${mirrored ? "mirrored" : "rotated"} here; re-plan it in the new place`)
      return { status: "ok", value: { ...keep, top: z(op.top), ...(op.near !== undefined ? { near: op.near.map(v3) } : {}), ...(op.walls !== undefined ? { walls: op.walls.map((w) => ({ ...w, bottom: w.bottom.map(v3), top: w.top.map(v3) })) } : {}) } as OperationSpec }
    }
  }
}

const all = (ops: ReadonlyArray<OperationSpec>, f: (op: OperationSpec) => CamResult<OperationSpec>): CamResult<ReadonlyArray<OperationSpec>> => {
  const out: OperationSpec[] = []
  for (const op of ops) {
    const r = f(op)
    if (r.status === "failed") return r
    out.push(r.value)
  }
  return { status: "ok", value: out }
}

/** A copy of `op` under a new id (and, with a transform, in another place). */
export const copyOperation = (op: OperationSpec, id: string, t?: Transform2): CamResult<OperationSpec> =>
  transformOperation(op, t ?? { kind: "translate", dx: 0, dy: 0 }, { rename: (x) => (x === op.id ? id : x) })

export type OperationPattern =
  | { readonly kind: "linear"; readonly count: number; readonly dx: number; readonly dy: number; readonly dz?: number }
  | { readonly kind: "polar"; readonly count: number; readonly cx: number; readonly cy: number; /** Angle between copies, degrees (default 360 / count). */ readonly step?: number }

/** The `count` copies of `op` (the original is copy 0 and is kept as it is), ids `<id>.<n>`. */
export const patternOperation = (op: OperationSpec, pattern: OperationPattern): CamResult<ReadonlyArray<OperationSpec>> => {
  if (!Number.isInteger(pattern.count) || pattern.count < 1 || pattern.count > 1000) return refuse("A pattern needs a whole number of copies from 1 to 1000")
  const out: OperationSpec[] = [op]
  for (let n = 1; n < pattern.count; n++) {
    const t: Transform2 = pattern.kind === "linear" ? { kind: "translate", dx: pattern.dx * n, dy: pattern.dy * n, dz: (pattern.dz ?? 0) * n } : { kind: "rotate", angle: (pattern.step ?? 360 / pattern.count) * n, cx: pattern.cx, cy: pattern.cy }
    const r = copyOperation(op, `${op.id}.${n}`, t)
    if (r.status === "failed") return r
    out.push(r.value)
  }
  return { status: "ok", value: out }
}

// ------------------------------------------------------------------------------------------------ setups and jobs

const moveBody = (f: FixtureBody, t: Transform2): FixtureBody => {
  if (t.kind === "translate") return { id: f.id, min: { x: f.min.x + t.dx, y: f.min.y + t.dy, z: f.min.z + (t.dz ?? 0) }, max: { x: f.max.x + t.dx, y: f.max.y + t.dy, z: f.max.z + (t.dz ?? 0) } }
  const cs = [f.min.x, f.max.x].flatMap((x) => [f.min.y, f.max.y].flatMap((y) => [f.min.z, f.max.z].map((z) => mapVec(t)({ x, y, z }))))
  return { id: f.id, min: { x: Math.min(...cs.map((c) => c.x)), y: Math.min(...cs.map((c) => c.y)), z: Math.min(...cs.map((c) => c.z)) }, max: { x: Math.max(...cs.map((c) => c.x)), y: Math.max(...cs.map((c) => c.y)), z: Math.max(...cs.map((c) => c.z)) } }
}

const moveStock = (s: StockBox, t: Transform2): StockBox => {
  const b = moveBody({ id: "", min: s.min, max: s.max }, t)
  return { min: b.min, max: b.max }
}

const moveMesh = (m: { readonly positions: ArrayLike<number>; readonly indices: ArrayLike<number> }, t: Transform2): { positions: Float64Array; indices: Uint32Array } => {
  const p = Float64Array.from(m.positions), f = mapVec(t)
  for (let i = 0; i < p.length; i += 3) { const q = f({ x: p[i]!, y: p[i + 1]!, z: p[i + 2]! }); p[i] = q.x; p[i + 1] = q.y; p[i + 2] = q.z }
  // A mirror turns the triangles inside out: swap two corners of each so the normals still point out.
  const ix = Uint32Array.from(m.indices)
  if (t.kind === "mirror") for (let i = 0; i + 2 < ix.length; i += 3) { const b = ix[i + 1]!; ix[i + 1] = ix[i + 2]!; ix[i + 2] = b }
  return { positions: p, indices: ix }
}

const moveStockModel = (m: StockModel, t: Transform2): StockModel => {
  if (m.kind === "mesh") return { kind: "mesh", mesh: moveMesh(m.mesh, t) }
  const c = mapPoint(t)(m.center)
  return { ...m, center: c, z0: m.z0 + (t.kind === "translate" ? (t.dz ?? 0) : 0), z1: m.z1 + (t.kind === "translate" ? (t.dz ?? 0) : 0) }
}

/** A setup moved with the part: its operations, stock and fixtures follow; the orientation and the datum stay (they are the fixing's). */
export const transformSetup = (setup: JobSetup, t: Transform2, options: TransformOptions & { readonly id?: string } = {}): CamResult<JobSetup> => {
  const ops = setup.operations === undefined ? undefined : all(setup.operations, (op) => transformOperation(op, t, options.rename === undefined ? {} : { rename: options.rename }))
  if (ops !== undefined && ops.status === "failed") return ops
  const { workOffset: _w, ...rest } = setup
  return { status: "ok", value: {
    ...rest, id: options.id ?? setup.id,
    ...(setup.stock !== undefined ? { stock: moveStock(setup.stock, t) } : {}), ...(setup.stockModel !== undefined ? { stockModel: moveStockModel(setup.stockModel, t) } : {}),
    ...(setup.fixtures !== undefined ? { fixtures: setup.fixtures.map((f) => moveBody(f, t)) } : {}), ...(ops !== undefined ? { operations: ops.value } : {})
  } }
}

/** A copy of a setup under a new id with its own datum (the job gives it the next free work offset). */
export const copySetup = (setup: JobSetup, id: string): JobSetup => {
  const { workOffset: _w, ...rest } = setup
  return { ...rest, id, ...(setup.name !== undefined ? { name: `${setup.name} (copy)` } : {}) }
}

/** The setup with its operations mirrored about a vertical plane, in the setup's own coordinates (a left-hand part from a right-hand one). */
export const mirrorSetup = (setup: JobSetup, axis: "x" | "y", at: number, id: string): CamResult<JobSetup> =>
  transformSetup(setup, { kind: "mirror", axis, at }, { id, rename: (x) => `${x}.m` })

/** `count` setups from one, each moved by a step; the original is kept as copy 0. Ids `<id>.<n>`, operation ids `<op>.<n>`. */
export const patternSetups = (setup: JobSetup, pattern: { readonly count: number; readonly dx: number; readonly dy: number; readonly dz?: number }): CamResult<ReadonlyArray<JobSetup>> => {
  if (!Number.isInteger(pattern.count) || pattern.count < 1 || pattern.count > 6) return refuse("A setup pattern needs 1 to 6 copies: the control has six work offsets G54-G59")
  const out: JobSetup[] = [setup]
  for (let n = 1; n < pattern.count; n++) {
    const r = transformSetup(setup, { kind: "translate", dx: pattern.dx * n, dy: pattern.dy * n, dz: (pattern.dz ?? 0) * n }, { id: `${setup.id}.${n}`, rename: (x) => `${x}.${n}` })
    if (r.status === "failed") return r
    out.push(r.value)
  }
  return { status: "ok", value: out }
}

const partMeshesOf = (job: ManufacturingJob): ReadonlyArray<Mesh64> => {
  if (job.part.kind === "meshes") return job.part.meshes.map((m) => ({ positions: Float64Array.from(m.positions), indices: Uint32Array.from(m.indices) }))
  const built = partMeshes((job.part.elements as ReadonlyArray<CadElement>).filter((e) => e["type"] !== "workpiece") as never, { tolerance: job.quality?.tolerance ?? 0.01 })
  return built === undefined ? [] : [...built.meshes]
}

/**
 * The whole job moved: the part (as meshes, tessellated at the job's tolerance; exact solids are not kept), the stock, the fixtures and
 * every operation, in the job and in each setup. The program of the moved job is the program of the original, because work coordinates
 * start at the stock: only the stock, not the machine, sees the move. Rotation and mirror also turn the part; a mirror is refused when
 * an operation cannot be mirrored.
 */
export const transformJob = (job: ManufacturingJob, t: Transform2, options: { readonly id?: string; readonly name?: string } = {}): CamResult<ManufacturingJob> => {
  const meshes = partMeshesOf(job)
  if (meshes.length === 0) return refuse("The part has no solid to move")
  const ops = job.operations === undefined ? undefined : all(job.operations, (op) => transformOperation(op, t))
  if (ops !== undefined && ops.status === "failed") return ops
  const setups: JobSetup[] = []
  for (const s of job.setups ?? []) {
    const r = transformSetup(s, t)
    if (r.status === "failed") return r
    // transformSetup drops the datum for a copy; a moved job keeps it.
    setups.push(s.workOffset !== undefined ? { ...r.value, workOffset: s.workOffset } : r.value)
  }
  return { status: "ok", value: {
    ...job, id: options.id ?? job.id, name: options.name ?? job.name,
    part: { kind: "meshes", meshes: meshes.map((m) => moveMesh(m, t)) },
    ...(job.stock !== undefined ? { stock: moveStock(job.stock, t) } : {}), ...(job.stockModel !== undefined ? { stockModel: moveStockModel(job.stockModel, t) } : {}),
    ...(job.fixtures !== undefined ? { fixtures: job.fixtures.map((f) => moveBody(f, t)) } : {}),
    ...(ops !== undefined ? { operations: ops.value } : {}), ...(job.setups !== undefined ? { setups } : {})
  } }
}
