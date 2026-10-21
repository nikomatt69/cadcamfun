/**
 * The CAM kernel pipeline (spec 29 §4): a manufacturing job in, machine NC plus evidence about that exact NC out.
 *
 *   prepare   material, cutters, machine, part meshes, stock, work origin, operations (given, or planned from the CAD)
 *   generate  per operation, in order: cutting data for the material / cutter / cut -> strategy parameters -> the existing
 *             operation generator, entering from the material actually left over the region (a provisional stock carried
 *             from operation to operation, so roughing, rest and finishing see what the previous tools removed)
 *   post      one program, one emission with the machine's post
 *   replay    the emitted NC text is interpreted independently of the IR and replayed on the initial stock with the cutter
 *             active at each block: rapids through material, shank / holder contact, gouges below the part, material left,
 *             removed volume per operation
 *   evidence  claims, issues and the release level the evidence supports
 *
 * Pure and synchronous: no I/O, no clock, no global state. The same job gives byte-identical NC and evidence.
 */
import { applyPoint } from "../../cad/brep/math.ts"
import { SETUP_ORIENTATIONS, setupTransform } from "../setup.ts"
import { Schema } from "effect"
import type { Mesh } from "../../cad/solid.ts"
import type { Vec2, Vec3 } from "../../cad/vec.ts"
import { distanceToChain, pointInRing } from "../geometry.ts"
import { estimateTime, makeProgram, type Move, type Program, type Toolpath } from "../ir.ts"
import { buildPartModelFromMeshes, partMeshes, type PartModel } from "../model/model.ts"
import { meshBounds, type Mesh64 } from "../model/element-mesh.ts"
import { AdaptiveParams, generateAdaptive } from "../operations/adaptive.ts"
import { DrillParams, generateDrill } from "../operations/drill.ts"
import { EngraveParams, generateEngrave } from "../operations/engrave.ts"
import { FaceParams, generateFace } from "../operations/face.ts"
import { MultiaxisParams, generateMultiaxis } from "../operations/multiaxis.ts"
import { fiveAxisKinematic } from "../five-axis.ts"
import { tableRotation, type RotaryAngles, type RotaryLayout } from "../indexing.ts"
import { remainingVolume, removeTipPath, voxelStock, type VoxelStock } from "./stock.ts"
import { TriangleSoup } from "../model/mesh-queries.ts"
import { PocketParams, generatePocket } from "../operations/pocket.ts"
import { ProfileParams, generateProfile } from "../operations/profile.ts"
import { SurfaceParams, generateSurface } from "../operations/surface.ts"
import { ThreadParams, generateThread } from "../operations/thread.ts"
import { ChamferParams, chamferGeometry, generateChamfer } from "../operations/chamfer.ts"
import { dialectOf, getPost } from "../post/index.ts"
import { genericPost } from "../post/generic.ts"
import { interpretGcode, type GSegment } from "../testing/gcode-interpreter.ts"
import type { Stock } from "../tool.ts"
import { HeightField } from "../verify/heightfield.ts"
import { forEachSample, pathFromProgram, type PathSegment } from "../verify/path.ts"
import { toolModel, type ToolModel } from "../verify/tool-model.ts"
import type { CadElement } from "../generator/schema.ts"
import {
  KERNEL_SCHEMA_VERSION,
  type CamArtifact,
  type CamIssue,
  type CamResult,
  type Claim,
  type KernelMachine,
  type ManufacturingJob,
  type OperationOutcome,
  type OperationSpec,
  type ReleaseLevel,
  type StockBox
} from "./contracts.ts"
import { DEFAULT_CUTTERS, cutterIssues, legacyTool, verifyTool, type Cutter } from "./cutters.ts"
import { cuttingData, type CutClass, type CuttingData } from "./cutting-data.ts"
import { digestOf, sha256 } from "./identity.ts"
import { DEFAULT_MACHINE } from "./machines.ts"
import { checkNcClearance, type TableGeometry } from "./machine-clearance.ts"
import { findMaterial, type WorkpieceMaterial } from "./materials.ts"
import { horizontalFaces, offsetRing, planJob, type Plan } from "./planner.ts"

export const KERNEL_ALGORITHM = "cadcamfun-cam-kernel@1"

/** Heights above the stock top (work Z = 0) the operations use. */
const CLEARANCE = 10
const SAFE = 5
const RETRACT = 2

export interface PreparedJob {
  readonly job: ManufacturingJob
  readonly material: WorkpieceMaterial
  readonly tools: ReadonlyArray<Cutter>
  readonly machine: KernelMachine
  readonly meshes: ReadonlyArray<Mesh64>
  readonly bounds: { readonly min: readonly [number, number, number]; readonly max: readonly [number, number, number] }
  readonly stock: StockBox
  /** Work zero in oriented setup coordinates. */
  readonly origin: Vec3
  readonly operations: ReadonlyArray<OperationSpec>
  readonly plan: Plan | undefined
  readonly finishAllowance: number
  readonly scallop: number
  readonly tolerance: number
}

const issue = (tag: CamIssue["tag"], stage: CamIssue["stage"], message: string, extra: Partial<CamIssue> = {}): CamIssue =>
  ({ tag, severity: extra.severity ?? "error", stage, message, ...extra })

const boundsOf = (meshes: ReadonlyArray<Mesh64>): PreparedJob["bounds"] => {
  const min: [number, number, number] = [Infinity, Infinity, Infinity], max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
  for (const m of meshes) { const b = meshBounds(m); for (let a = 0; a < 3; a++) { min[a] = Math.min(min[a]!, b.min[a]!); max[a] = Math.max(max[a]!, b.max[a]!) } }
  return { min, max }
}

/** Downward-facing triangles above the underside cannot be reached by a vertical cutter from this setup. */
const hiddenSurfaces = (meshes: ReadonlyArray<Mesh64>, bottom: number, tolerance: number): number => {
  let count = 0
  for (const { positions: p, indices: ix } of meshes) for (let i = 0; i + 2 < ix.length; i += 3) {
    const a = ix[i]! * 3, b = ix[i + 1]! * 3, c = ix[i + 2]! * 3
    const ux = p[b]! - p[a]!, uy = p[b + 1]! - p[a + 1]!, uz = p[b + 2]! - p[a + 2]!
    const vx = p[c]! - p[a]!, vy = p[c + 1]! - p[a + 1]!, vz = p[c + 2]! - p[a + 2]!
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
    if (nz < -1e-6 * Math.hypot(nx, ny, nz) && Math.max(p[a + 2]!, p[b + 2]!, p[c + 2]!) > bottom + tolerance) count++
  }
  return count
}

/** Resolves the job: everything the run needs, or the reasons it cannot run. */
export const prepareJob = (job: ManufacturingJob): CamResult<PreparedJob> => {
  const issues: CamIssue[] = []
  if (job.setupOrientation !== undefined && !SETUP_ORIENTATIONS.includes(job.setupOrientation)) return { status: "failed", issues: [issue("InvalidInput", "prepare", "Unknown manual setup orientation")] }
  if (job.schemaVersion !== KERNEL_SCHEMA_VERSION) return { status: "failed", issues: [issue("InvalidInput", "prepare", `Unsupported job schema version ${String(job.schemaVersion)}`)] }
  const material = findMaterial(job.material)
  if (material === undefined) issues.push(issue("UnknownMaterial", "prepare", `Unknown material '${job.material}'`))
  const tools = job.tools ?? DEFAULT_CUTTERS
  const seen = new Set<string>()
  for (const t of tools) {
    if (seen.has(t.id)) issues.push(issue("InvalidInput", "prepare", `Duplicate cutter id '${t.id}'`))
    seen.add(t.id)
    for (const m of cutterIssues(t)) issues.push(issue("InvalidInput", "prepare", m))
  }
  const machine = job.machine ?? DEFAULT_MACHINE
  if (!(machine.limits.maxRpm > 0) || !(machine.limits.maxFeed > 0)) issues.push(issue("InvalidInput", "prepare", `Machine ${machine.id}: spindle speed and feed limits must be positive`))

  let meshes: Mesh64[] = []
  let elements: ReadonlyArray<CadElement> | undefined
  if (job.part.kind === "elements") {
    elements = job.part.elements as ReadonlyArray<CadElement>
    const built = partMeshes(elements.filter((e) => e["type"] !== "workpiece") as never, { tolerance: job.quality?.tolerance ?? 0.01 })
    if (built !== undefined) meshes = [...built.meshes]
  } else {
    meshes = job.part.meshes.filter((m) => m.indices.length >= 3).map((m) => ({ positions: Float64Array.from(m.positions), indices: Uint32Array.from(m.indices) }))
  }
  if (meshes.length === 0) issues.push(issue("InvalidInput", "prepare", "The part has no solid to machine"))
  for (const m of meshes) if (!m.positions.every(Number.isFinite)) { issues.push(issue("InvalidInput", "prepare", "The part mesh has non-finite coordinates")); break }
  if (issues.length > 0 || material === undefined) return { status: "failed", issues }

  const transform = setupTransform(job.setupOrientation ?? "+Z")
  if (job.setupOrientation !== undefined && job.setupOrientation !== "+Z") meshes = meshes.map((mesh) => {
    const positions = new Float64Array(mesh.positions.length)
    for (let i = 0; i < positions.length; i += 3) {
      const p = applyPoint(transform, { x: mesh.positions[i]!, y: mesh.positions[i + 1]!, z: mesh.positions[i + 2]! })
      positions.set([p.x, p.y, p.z], i)
    }
    return { positions, indices: mesh.indices }
  })
  const bounds = boundsOf(meshes)
  const rawStock = job.stock
  const orientedStock = rawStock === undefined ? undefined : (() => {
    const corners = [rawStock.min.x, rawStock.max.x].flatMap((x) => [rawStock.min.y, rawStock.max.y].flatMap((y) => [rawStock.min.z, rawStock.max.z].map((z) => applyPoint(transform, { x, y, z }))))
    return {
      min: { x: Math.min(...corners.map((p) => p.x)), y: Math.min(...corners.map((p) => p.y)), z: Math.min(...corners.map((p) => p.z)) },
      max: { x: Math.max(...corners.map((p) => p.x)), y: Math.max(...corners.map((p) => p.y)), z: Math.max(...corners.map((p) => p.z)) }
    }
  })()
  const stock: StockBox = orientedStock ?? {
    min: { x: bounds.min[0] - 2, y: bounds.min[1] - 2, z: bounds.min[2] },
    max: { x: bounds.max[0] + 2, y: bounds.max[1] + 2, z: bounds.max[2] + 1 }
  }
  if (!(stock.max.x > stock.min.x && stock.max.y > stock.min.y && stock.max.z > stock.min.z)) return { status: "failed", issues: [issue("InvalidInput", "prepare", "The stock box is empty or inverted")] }
  const eps = 1e-6
  if (bounds.min[0] < stock.min.x - eps || bounds.min[1] < stock.min.y - eps || bounds.min[2] < stock.min.z - eps || bounds.max[0] > stock.max.x + eps || bounds.max[1] > stock.max.y + eps || bounds.max[2] > stock.max.z + eps) {
    return { status: "failed", issues: [issue("InvalidInput", "prepare", "The part does not fit inside the stock")] }
  }
  const origin: Vec3 = (job.origin ?? "stock-center") === "stock-corner"
    ? { x: stock.min.x, y: stock.min.y, z: stock.max.z }
    : { x: (stock.min.x + stock.max.x) / 2, y: (stock.min.y + stock.max.y) / 2, z: stock.max.z }
  const finishAllowance = job.quality?.finishAllowance ?? material.finishAllowance
  const scallop = job.quality?.scallop ?? 0.01
  const plan = job.operations === undefined
    ? planJob({
        ...(job.setupOrientation !== undefined ? { setupOrientation: job.setupOrientation } : {}),
        elements, bounds, stock, tools, material, rigidity: machine.limits.rigidity ?? "standard", finishAllowance, scallop, flats: horizontalFaces(meshes),
        rigidTap: dialectOf(machine.post)?.rigidTap !== undefined, ...(job.quality?.deburr !== undefined ? { deburr: job.quality.deburr } : {})
      })
    : undefined
  const operations = job.operations ?? plan!.operations
  if (operations.length === 0) return { status: "failed", issues: [issue("InvalidInput", "plan", "No operation to run: the part needs no machining or no feature could be planned"), ...(plan?.unmachined ?? []).map((m) => issue("UnsupportedCapability", "plan", m))] }
  const ids = new Set<string>()
  for (const op of operations) {
    if (ids.has(op.id)) issues.push(issue("InvalidInput", "prepare", `Duplicate operation id '${op.id}'`))
    ids.add(op.id)
    if (!tools.some((t) => t.id === op.tool)) issues.push(issue("UnknownTool", "prepare", `Operation ${op.id}: cutter '${op.tool}' is not in the library`, { operationId: op.id }))
  }
  if (issues.length > 0) return { status: "failed", issues }
  return { status: "ok", value: { job, material, tools, machine, meshes, bounds, stock, origin, operations, plan, finishAllowance, scallop, tolerance: job.quality?.tolerance ?? 0.01 } }
}

// ---------------------------------------------------------------- helpers

const cutOf = (op: OperationSpec, tool: Cutter): CutClass => {
  switch (op.strategy) {
    case "face": return "face"
    case "adaptive": return "adaptive"
    case "pocket": return op.finish === true ? "finish-wall" : "rough-side"
    case "profile": return op.finish === true ? "finish-wall" : "rough-side"
    case "bore": return "rough-side"
    case "drill": return op.cut === "tap" || tool.kind === "tap" ? "tap" : op.cut === "ream" || tool.kind === "reamer" ? "ream"
      : op.cut === "spot" || tool.kind === "spot" || tool.kind === "chamfer" ? "spot" : "drill"
    case "thread": return "thread-mill"
    case "engrave": return "engrave"
    case "chamfer": return "chamfer"
    case "surface": return op.mode === "roughing" || op.mode === "rest" ? (op.clearing === "contour" ? "rough-side" : "adaptive") : op.mode === "flat" ? "finish-floor" : "finish-3d"
    case "multiaxis": return "finish-3d"
  }
}

const shift2 = (p: Vec2, o: Vec3): Vec2 => ({ x: p.x - o.x, y: p.y - o.y })

/** What the five-axis moves removed from the raw stock, as the bracket of the voxel stock; the height field does not cover them. */
const fiveAxisRemovalText = (vs: VoxelStock): string => {
  const raw = vs.nx * vs.ny * vs.nz * vs.voxel ** 3
  const left = remainingVolume(vs)
  return `Five-axis moves remove between ${(raw - left.upper).toFixed(0)} and ${(raw - left.lower).toFixed(0)} mm³ of the raw stock; the three-axis height field does not cover them`
}

/**
 * Removes the cutter of a feed move made with the table turned. The NC position is the tip in machine coordinates, so the tip in the
 * part is `Rᵀ (m - pivot) + pivot`, and the tool axis (up from the tip) in the part is `Rᵀ ẑ`. The stock voxels are measured along it.
 */
const removeTurnedMove = (vs: VoxelStock, cutter: Cutter, layout: RotaryLayout, pivot: Vec3, from: Vec3, to: Vec3, angles: RotaryAngles): void => {
  const m = tableRotation(angles, layout)
  const toPart = (p: Vec3): Vec3 => {
    const x = p.x - pivot.x, y = p.y - pivot.y, z = p.z - pivot.z
    return { x: m[0] * x + m[3] * y + m[6] * z + pivot.x, y: m[1] * x + m[4] * y + m[7] * z + pivot.y, z: m[2] * x + m[5] * y + m[8] * z + pivot.z }
  }
  const axis: Vec3 = { x: m[6], y: m[7], z: m[8] }
  removeTipPath(vs, cutter, [toPart(from), toPart(to)], [axis, axis])
}

/** The cone of a chamfer mill / spot drill / engraver. */
const coneOf = (c: Cutter): { readonly radius: number; readonly tipRadius: number; readonly halfAngle: number } =>
  ({ radius: c.diameter / 2, tipRadius: c.kind === "spot" ? 0 : (c.tipDiameter ?? 0) / 2, halfAngle: ((c.angle ?? 90) * Math.PI) / 360 })

/** Column test of the region an operation's cutter can sweep, in work coordinates. */
const sweptRegion = (op: OperationSpec, o: Vec3, radius: number): { readonly box: readonly [number, number, number, number]; readonly inside: (x: number, y: number) => boolean } | undefined => {
  const boxOf = (pts: ReadonlyArray<Vec2>, grow: number) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y) }
    return [x0 - grow, y0 - grow, x1 + grow, y1 + grow] as const
  }
  switch (op.strategy) {
    case "adaptive":
    case "pocket": {
      const b = op.region.boundary.map((p) => shift2(p, o))
      const islands = (op.region.islands ?? []).map((r) => r.map((p) => shift2(p, o)))
      return { box: boxOf(b, 0), inside: (x, y) => pointInRing({ x, y }, b) && !islands.some((r) => pointInRing({ x, y }, r)) }
    }
    case "profile": {
      const l = op.loop.map((p) => shift2(p, o))
      const grow = 2 * radius + (op.allowance ?? 0) + 0.5
      return op.side === "inside"
        ? { box: boxOf(l, 0), inside: (x, y) => pointInRing({ x, y }, l) }
        : { box: boxOf(l, grow), inside: (x, y) => !pointInRing({ x, y }, l) }
    }
    case "bore":
    case "thread": {
      const c = shift2(op.center, o)
      const r = op.diameter / 2 + radius
      return { box: [c.x - r, c.y - r, c.x + r, c.y + r], inside: (x, y) => Math.hypot(x - c.x, y - c.y) <= r }
    }
    case "drill": {
      const pts = op.points.map((p) => shift2(p, o))
      return { box: boxOf(pts, radius), inside: (x, y) => pts.some((p) => Math.hypot(x - p.x, y - p.y) <= radius) }
    }
    case "engrave": {
      const pts = op.paths.flatMap((p) => p.points.map((q) => shift2(q, o)))
      return { box: boxOf(pts, radius), inside: () => true }
    }
    case "chamfer": {
      const pts = op.loops.flatMap((l) => l.points.map((q) => shift2(q, o)))
      return { box: boxOf(pts, radius), inside: () => true }
    }
    case "face":
    case "surface":
    case "multiaxis":
      return undefined
  }
}

class Grid {
  constructor(readonly hf: HeightField) {}
  index(x: number, y: number): number {
    const i = Math.floor((x - this.hf.minX) / this.hf.cellX), j = Math.floor((y - this.hf.minY) / this.hf.cellY)
    return i < 0 || j < 0 || i >= this.hf.nx || j >= this.hf.ny ? -1 : j * this.hf.nx + i
  }
  /** Highest material in the columns of a region (the whole stock when no region is given); `-Infinity` when none is covered. */
  topOver(region: ReturnType<typeof sweptRegion>): number {
    const { hf } = this
    let top = -Infinity
    const [x0, y0, x1, y1] = region?.box ?? [hf.minX, hf.minY, hf.minX + hf.width, hf.minY + hf.height]
    const i0 = Math.max(0, Math.floor((x0 - hf.minX) / hf.cellX)), i1 = Math.min(hf.nx - 1, Math.ceil((x1 - hf.minX) / hf.cellX))
    const j0 = Math.max(0, Math.floor((y0 - hf.minY) / hf.cellY)), j1 = Math.min(hf.ny - 1, Math.ceil((y1 - hf.minY) / hf.cellY))
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      if (region !== undefined && !region.inside(hf.centreX(i), hf.centreY(j))) continue
      top = Math.max(top, hf.top[j * hf.nx + i]!)
    }
    return top
  }
}

const cuts = (tp: Toolpath): boolean => tp.moves.some((m) => m._tag === "Linear" || m._tag === "Arc" || m._tag === "Cycle")

const decode = <A>(schema: Schema.Codec<A, unknown>, value: unknown): A => Schema.decodeUnknownSync(schema as never)(value) as A

/** Replays a path on a height field with one cutter; returns removed volume. */
/**
 * Sampling step along a path: discs `s` apart leave a lateral cusp of s² / 8r between them, so r / 8 keeps it under r / 512
 * (0.016 mm for a Ø16 cutter) while the work per millimetre stays proportional to the radius, not its square.
 */
export const sampleStep = (cell: number, radius: number): number => Math.max(cell, Math.min(radius / 8, 2))

const carve = (hf: HeightField, segments: ReadonlyArray<PathSegment>, model: ToolModel, step: number): number => {
  let removed = 0
  for (const s of segments) {
    if (s.rapid) continue
    forEachSample(s, step, (x, y, z) => { removed += hf.cut(model, x, y, z) })
  }
  return removed
}

// ---------------------------------------------------------------- run

interface Generated {
  readonly toolpath: Toolpath | undefined
  readonly warnings: ReadonlyArray<string>
}

/** Where a running job is, reported before each operation and each stage after them. */
export interface KernelProgress {
  readonly stage: "operations" | "post" | "replay" | "evidence"
  /** The operation about to run (stage `operations`). */
  readonly operation?: { readonly id: string; readonly index: number; readonly count: number }
}

/**
 * Optional hooks of a run. The kernel is synchronous, so `signal` is read at the checkpoints (before each operation and stage);
 * a host that must stop a job mid-operation runs it in a worker and terminates it (`runKernelJob` in `@cadcamfun/ai`).
 */
export interface RunOptions {
  readonly onProgress?: (progress: KernelProgress) => void
  readonly signal?: { readonly aborted: boolean }
}

class Cancelled extends Error {}

/** Runs a prepared job to its artifact. */
export const executeJob = (prepared: PreparedJob, options: RunOptions = {}): CamResult<CamArtifact> => {
  try {
    return executeJobWith(prepared, (progress) => {
      if (options.signal?.aborted === true) throw new Cancelled()
      options.onProgress?.(progress)
    })
  } catch (error) {
    if (error instanceof Cancelled) return { status: "failed", issues: [issue("Cancelled", "prepare", "The job was cancelled before it finished; no artifact was produced")] }
    throw error
  }
}

const executeJobWith = (prepared: PreparedJob, checkpoint: (progress: KernelProgress) => void): CamResult<CamArtifact> => {
  const { job, material, tools, machine, origin, stock, operations } = prepared
  const issues: CamIssue[] = []
  const o = origin
  const workMeshes: Mesh64[] = prepared.meshes.map((m) => {
    const p = Float64Array.from(m.positions)
    for (let k = 0; k < p.length; k += 3) { p[k] = p[k]! - o.x; p[k + 1] = p[k + 1]! - o.y; p[k + 2] = p[k + 2]! - o.z }
    return { positions: p, indices: m.indices }
  })
  const sMin = { x: stock.min.x - o.x, y: stock.min.y - o.y, z: stock.min.z - o.z }
  const sMax = { x: stock.max.x - o.x, y: stock.max.y - o.y, z: stock.max.z - o.z }
  const width = sMax.x - sMin.x, depthY = sMax.y - sMin.y
  const partBottom = prepared.bounds.min[2] - o.z
  const cell = prepared.job.quality?.resolution ?? Math.min(0.5, Math.max(0.15, Math.sqrt((width * depthY) / 150_000)))
  const nx = Math.max(1, Math.ceil(width / cell)), ny = Math.max(1, Math.ceil(depthY / cell))
  const field = (): HeightField => new HeightField(nx, ny, sMin.x, sMin.y, width, depthY, sMin.z, sMax.z)
  const provisional = field()
  const grid = new Grid(provisional)
  const workStock = (top: number): Stock => ({ x: width, y: depthY, z: Math.max(1e-3, top - sMin.z), origin: { x: sMin.x, y: sMin.y, z: top }, material: material.id })

  let partModel: PartModel | undefined
  const part = (): PartModel | undefined => {
    if (partModel === undefined) {
      const maxD = Math.max(...tools.map((t) => t.diameter))
      partModel = buildPartModelFromMeshes(workMeshes, { cell: Math.min(0.25, cell), margin: Math.min(maxD, 20), tolerance: prepared.tolerance })
    }
    return partModel
  }

  const outcomes: OperationOutcome[] = []
  const toolpaths: Toolpath[] = []
  const opOfToolpath: number[] = []
  const toolOf = (id: string): Cutter => tools.find((t) => t.id === id)!

  operations.forEach((op, opIndex) => {
    checkpoint({ stage: "operations", operation: { id: op.id, index: opIndex, count: operations.length } })
    const tool = toolOf(op.tool)
    const cut = cutOf(op, tool)
    const legacy = legacyTool(tool, machine.limits.maxRpm)
    const radius = tool.diameter / 2
    const region = sweptRegion(op, o, radius)
    const materialTop = Math.min(sMax.z, grid.topOver(region))
    const opTop = op.strategy === "face" || op.strategy === "surface" || op.strategy === "multiaxis" ? sMax.z : op.top - o.z
    const opBottom = op.strategy === "face" ? op.bottom - o.z
      : op.strategy === "surface" || op.strategy === "multiaxis" ? partBottom
      : op.strategy === "thread" ? op.top - o.z - op.length
      : op.strategy === "engrave" ? op.top - o.z - op.depth
      : op.strategy === "chamfer" ? op.top - o.z - chamferGeometry(coneOf(tool), op.width, op.tipOffset ?? 0.2).tipDepth
      : op.bottom - o.z
    const finishing = cut === "finish-wall" || cut === "finish-3d" || cut === "thread-mill" || cut === "engrave" || cut === "spot" || cut === "chamfer" || cut === "tap" || cut === "ream"
    // Enter from the material really left over the region: above the feature top when stock is still there, lower when it is gone.
    let start = op.strategy === "thread" || op.strategy === "chamfer" || cut === "tap" || cut === "ream" ? opTop : materialTop > opTop + 1e-6 ? materialTop : finishing || materialTop === -Infinity ? opTop : Math.max(materialTop, opBottom)
    if (op.strategy === "face") start = Math.max(materialTop, opBottom)
    const warnings: string[] = []
    const overridden: string[] = []
    const fail = (tag: CamIssue["tag"], message: string, data?: CuttingData): void => {
      issues.push(issue(tag, "generate", message, { operationId: op.id }))
      outcomes.push({ id: op.id, name: op.name ?? op.id, strategy: op.strategy, toolId: tool.id, cut, status: "failed", ...(data ? { cutting: data } : {}), parameters: {}, overridden, warnings, startZ: start, cutLength: 0, timeSeconds: 0, removedVolume: 0 })
    }
    if (!finishing && op.strategy !== "surface" && start <= opBottom + 1e-4) {
      warnings.push("No material left over the region: the operation was skipped")
      outcomes.push({ id: op.id, name: op.name ?? op.id, strategy: op.strategy, toolId: tool.id, cut, status: "ok", parameters: {}, overridden, warnings, startZ: start, cutLength: 0, timeSeconds: 0, removedVolume: 0 })
      return
    }
    const depth = Math.max(1e-3, start - opBottom)
    const allowance = "allowance" in op && op.allowance !== undefined ? op.allowance : undefined
    const data = cuttingData({
      material, cutter: tool, cut, machine: machine.limits, depth,
      ...(cut === "finish-wall" ? { ae: Math.max(0.05, prepared.finishAllowance) } : op.radialEngagement !== undefined ? { ae: op.radialEngagement } : {}),
      ...(op.strategy === "surface" && op.scallop !== undefined ? { scallop: op.scallop } : { scallop: prepared.scallop })
    })
    for (const m of data.exceeded) issues.push(issue("MachineLimit", "cutting-data", `${op.id}: ${m}`, { operationId: op.id, severity: "warning" }))
    const pick = <K extends keyof typeof op & ("rpm" | "feed" | "plungeFeed" | "stepdown" | "stepover" | "coolant")>(key: K, fallback: NonNullable<(typeof op)[K]>): NonNullable<(typeof op)[K]> => {
      const v = op[key]
      if (v !== undefined) { overridden.push(key); return v as NonNullable<(typeof op)[K]> }
      return fallback
    }
    const rpm = pick("rpm", data.rpm)
    const feed = pick("feed", data.feed)
    const plungeFeed = pick("plungeFeed", data.plungeFeed)
    const stepdown = pick("stepdown", data.ap)
    const stepover = pick("stepover", data.stepoverPercent)
    const coolant = pick("coolant", data.coolant)
    if (rpm > machine.limits.maxRpm + 1e-9 || (tool.maxRpm !== undefined && rpm > tool.maxRpm + 1e-9)) issues.push(issue("MachineLimit", "cutting-data", `${op.id}: ${rpm} rpm exceeds the spindle or the cutter rating`, { operationId: op.id }))
    if (feed > machine.limits.maxFeed + 1e-9) issues.push(issue("MachineLimit", "cutting-data", `${op.id}: feed ${feed} mm/min exceeds the machine's ${machine.limits.maxFeed}`, { operationId: op.id }))
    const name = op.name ?? op.id
    const common = {
      id: op.id, name, clearanceHeight: CLEARANCE, safeHeight: SAFE, retractHeight: RETRACT,
      totalDepth: depth, stepdown: Math.max(0.01, Math.min(stepdown, depth)), feed, plungeFeed, spindleRpm: rpm, coolant
    }
    const opStock = workStock(start)
    let generated: Generated
    try {
      switch (op.strategy) {
        case "face": {
          const params = decode(FaceParams, { ...common, stepover: Math.max(1, Math.min(100, stepover)), tolerance: prepared.tolerance })
          generated = { toolpath: generateFace(params, undefined, legacy, opStock), warnings: [] }
          break
        }
        case "adaptive": {
          const params = decode(AdaptiveParams, { ...common, engagement: Math.max(1, Math.min(50, stepover)), helixPitch: data.helixPitch, tolerance: prepared.tolerance })
          // Adaptive clears the region its tool CENTRE may occupy: the walls move in, the islands out, by the cutter radius.
          const boundary = offsetRing(op.region.boundary.map((p) => shift2(p, o)), -radius - (allowance ?? 0))
          if (boundary === undefined) { fail("NoSuitableTool", `${op.id}: Ø${tool.diameter} does not fit the region`, data); return }
          const islands = (op.region.islands ?? []).flatMap((r) => { const g = offsetRing(r.map((p) => shift2(p, o)), radius + (allowance ?? 0)); return g === undefined ? [] : [{ points: g, closed: true }] })
          const floor = opBottom + 1e-3
          const r = generateAdaptive(params, { boundary: { points: boundary, closed: true }, islands }, legacy, opStock, {
            material: (x, y) => { const k = grid.index(x, y); return k >= 0 && provisional.top[k]! > floor },
            helix: true
          })
          generated = { toolpath: r.toolpath, warnings: r.warnings }
          break
        }
        case "pocket":
        case "bore": {
          const params = decode(PocketParams, {
            ...common, stepover: Math.max(1, Math.min(100, stepover)), allowance: allowance ?? 0, finishPass: false, entry: "helix",
            helixPitch: data.helixPitch, rampAngle: Math.max(0.1, Math.min(45, data.rampAngle)), tolerance: prepared.tolerance
          })
          const geometry = op.strategy === "bore"
            ? { _tag: "Circle", id: `${op.id}-circle`, layerId: "cam", visible: true, locked: false, center: shift2(op.center, o), radius: op.diameter / 2 }
            : { boundary: { points: op.region.boundary.map((p) => shift2(p, o)), closed: true }, islands: (op.region.islands ?? []).map((r) => ({ points: r.map((p) => shift2(p, o)), closed: true })) }
          if (op.strategy === "bore" && tool.diameter >= op.diameter) { fail("NoSuitableTool", `${op.id}: the cutter Ø${tool.diameter} does not fit the Ø${op.diameter} bore`, data); return }
          generated = { toolpath: generatePocket(params, geometry as never, legacy, opStock), warnings: [] }
          break
        }
        case "profile": {
          const params = decode(ProfileParams, {
            ...common, side: op.side, allowance: allowance ?? 0, leadIn: "arc", leadRadius: Math.max(0.5, Math.min(radius, 5)),
            helixPitch: data.helixPitch, rampAngle: Math.max(0.1, Math.min(45, data.rampAngle)), arcFit: true, tolerance: prepared.tolerance
          })
          generated = { toolpath: generateProfile(params, { points: op.loop.map((p) => shift2(p, o)), closed: true }, legacy, opStock), warnings: [] }
          break
        }
        case "drill": {
          const { stepdown: _s, feed: _f, ...drillCommon } = common
          const tapping = cut === "tap"
          if (tapping && tool.pitch === undefined) { fail("InvalidInput", `${op.id}: the tap ${tool.id} has no pitch`, data); return }
          const notes: string[] = []
          // A tap advances one pitch per revolution whatever was asked: the feed follows the (possibly overridden) speed.
          if (tapping && op.feed !== undefined) notes.push(`${op.id}: a tap feeds one pitch per revolution (${tool.pitch} mm x ${rpm} rpm); the feed override is not used`)
          const params = decode(DrillParams, {
            ...drillCommon, plungeFeed: tapping ? tool.pitch! * rpm : pick("feed", data.feed), peck: cut === "drill" ? data.peck ?? 0 : 0,
            chipBreak: cut === "drill" ? data.chipBreak ?? false : false, dwell: cut === "spot" ? 0.2 : 0,
            mode: tapping ? "tap" : cut === "ream" ? "ream" : "drill", ...(tapping ? { pitch: tool.pitch } : {})
          })
          generated = { toolpath: generateDrill(params, op.points.map((p) => shift2(p, o)), legacy, opStock), warnings: notes }
          break
        }
        case "thread": {
          const c = shift2(op.center, o)
          const params = decode(ThreadParams, {
            ...common, stepdown: 1_000_000, x: c.x, y: c.y, diameter: op.diameter, pitch: op.pitch, internal: op.internal,
            rightHand: op.rightHand ?? true, passes: Math.max(1, Math.min(20, data.passes ?? 2)), springPasses: 1, tolerance: prepared.tolerance
          })
          const r = generateThread(params, legacy, opStock)
          generated = { toolpath: r.toolpath, warnings: r.warnings }
          break
        }
        case "engrave": {
          const params = decode(EngraveParams, { ...common, stepdown: depth, tolerance: prepared.tolerance })
          generated = { toolpath: generateEngrave(params, op.paths.map((p) => ({ points: p.points.map((q) => shift2(q, o)), closed: p.closed })), legacy, opStock), warnings: [] }
          break
        }
        case "chamfer": {
          if (tool.kind !== "chamfer" && tool.kind !== "spot" && tool.kind !== "engraver") { fail("NoSuitableTool", `${op.id}: ${tool.name} is not a cone cutter (chamfer mill, spot drill or engraver)`, data); return }
          const tipDepth = chamferGeometry(coneOf(tool), op.width, op.tipOffset ?? 0.2).tipDepth
          const params = decode(ChamferParams, { ...common, totalDepth: tipDepth, stepdown: tipDepth, width: op.width, tipOffset: op.tipOffset ?? 0.2, lead: Math.max(1, radius) })
          const r = generateChamfer(params, op.loops.map((l) => ({ points: l.points.map((p) => shift2(p, o)), side: l.side })), coneOf(tool), legacy, opTop)
          if (r.skipped.length > 0 && !cuts(r.toolpath)) { fail("NoSuitableTool", `${op.id}: ${r.skipped.join("; ")}`, data); return }
          for (const m of r.skipped) issues.push(issue("UnsupportedCapability", "generate", `${op.id}: ${m}`, { operationId: op.id, severity: "warning" }))
          generated = { toolpath: r.toolpath, warnings: [...r.warnings, ...r.skipped] }
          break
        }
        case "multiaxis": {
          const five = machine.fiveAxis
          if (five === undefined) { fail("InvalidInput", `${op.id}: the machine has no rotary table: choose a 5-axis machine`, data); return }
          const soup = new TriangleSoup(workMeshes, Math.max(0.5, cell))
          const params = decode(MultiaxisParams, {
            ...common, strategy: "parallel", stepover: Math.max(1, Math.min(100, op.stepover)), angle: op.angle ?? 0,
            toolAxis: op.toolAxis ?? "normal", lead: op.lead ?? 10, tilt: op.tilt ?? 0, tolerance: prepared.tolerance
          })
          const kin = fiveAxisKinematic({
            layout: five.layout, limits: { tilt: five.tilt, ...(five.rotation !== undefined ? { rotation: five.rotation } : {}) },
            pivot: five.pivot, tcp: "program"
          })
          const r = generateMultiaxis(params, soup, legacyTool(tool), kin)
          generated = { toolpath: r.toolpath, warnings: [...r.warnings, ...(r.stats.skipped > 0 ? [`${op.id}: ${r.stats.skipped} points skipped (no lean clears the part, or the table cannot reach it)`] : [])] }
          break
        }
        case "surface": {
          const model = part()
          if (model === undefined) { fail("InvalidInput", `${op.id}: the part has no surface model`, data); return }
          const restTool = op.restFrom !== undefined ? tools.find((t) => t.id === op.restFrom) : undefined
          if (op.restFrom !== undefined && restTool === undefined) { fail("UnknownTool", `${op.id}: rest-from cutter '${op.restFrom}' is not in the library`, data); return }
          const params = decode(SurfaceParams, {
            ...common, strategy: op.mode, stepover: Math.max(1, Math.min(100, stepover)), scallop: op.mode === "roughing" || op.mode === "rest" ? 0 : (op.scallop ?? prepared.scallop),
            angle: op.angle ?? 0, ...(op.slopeAngle !== undefined ? { slopeAngle: op.slopeAngle } : {}), ...(op.center !== undefined ? { center: shift2(op.center, o) } : {}), allowance: allowance ?? 0, tolerance: prepared.tolerance, entry: "helix", helixPitch: data.helixPitch,
            rampAngle: Math.max(0.1, Math.min(45, data.rampAngle)), clearing: op.clearing ?? "adaptive", engagement: Math.max(1, Math.min(50, stepover)),
            ...(restTool !== undefined ? { restFrom: { diameter: restTool.diameter, kind: legacyTool(restTool).kind, ...(restTool.kind === "bull" && restTool.cornerRadius !== undefined ? { tipRadius: restTool.cornerRadius } : {}) } } : {})
          })
          // The stock the operations before left (the carried height field): rest works from it, not from one previous tool's reach.
          const remaining = (x: number, y: number): number => { const k = grid.index(x, y); return k >= 0 ? provisional.top[k]! : -Infinity }
          const r = generateSurface(params, model, legacy, workStock(start), op.mode === "rest" || op.restFrom !== undefined ? remaining : undefined)
          generated = { toolpath: r.toolpath, warnings: r.warnings }
          break
        }
      }
    } catch (error) {
      fail("GenerationFailed", `${op.id}: ${error instanceof Error ? error.message : String(error)}`, data)
      return
    }
    const tp = generated.toolpath
    // A rest pass over stock the earlier operations already cleared is a checked "nothing left", not a failed operation.
    if (op.strategy === "surface" && op.mode === "rest" && (tp === undefined || !cuts(tp))) {
      warnings.push("No material left for the rest tool: the operation was skipped", ...generated.warnings)
      outcomes.push({ id: op.id, name: op.name ?? op.id, strategy: op.strategy, toolId: tool.id, cut, status: "ok", parameters: {}, overridden, warnings, startZ: start, cutLength: 0, timeSeconds: 0, removedVolume: 0 })
      return
    }
    if (tp === undefined || !cuts(tp)) { fail("EmptyToolpath", `${op.id}: the strategy produced no cutting move${generated.warnings.length > 0 ? ` (${generated.warnings.join("; ")})` : ""}`, data); return }
    // The marker comment ties every NC block to its operation in the replay.
    const marked: Toolpath = { ...tp, moves: [{ _tag: "Comment", text: `OP${toolpaths.length + 1} ${op.id}` } as Move, ...tp.moves] }
    // Provisional stock: what this operation removes, so the next one enters from the right height.
    const replay = pathFromProgram(makeProgram("provisional", [marked]), { x: 0, y: 0, z: CLEARANCE })
    if (marked.moves.some((m) => (m._tag === "Rapid" || m._tag === "Linear") && m.rotary !== undefined)) {
      warnings.push(`${op.id}: five-axis moves are not carved into the height field; the stock after this operation is not tracked`)
    } else {
      carve(provisional, replay.segments, toolModel(verifyTool(tool)), Math.max(cell, Math.min(radius / 4, 3)))
    }
    toolpaths.push(marked)
    opOfToolpath.push(outcomes.length)
    warnings.push(...generated.warnings, ...data.warnings)
    outcomes.push({
      id: op.id, name, strategy: op.strategy, toolId: tool.id, cut, status: "ok", cutting: data,
      parameters: { ...common, stepover, ...(allowance !== undefined ? { allowance } : {}) }, overridden, warnings, startZ: start,
      cutLength: 0, timeSeconds: estimateTime(marked, machine.rapidFeed ?? 10000), removedVolume: 0
    })
  })

  // ------------------------------------------------------------ post
  checkpoint({ stage: "post" })
  const numbers: Record<string, number> = {}
  let next = 1
  const taken = new Set(tools.filter((t) => t.number !== undefined).map((t) => t.number!))
  for (const tp of toolpaths) {
    if (numbers[tp.toolId] !== undefined) continue
    const t = toolOf(tp.toolId)
    if (t.number !== undefined) numbers[tp.toolId] = t.number
    else { while (taken.has(next)) next++; numbers[tp.toolId] = next; taken.add(next) }
  }
  const program: Program = makeProgram(job.name, toolpaths, {
    ...(job.workOffset !== undefined ? { workOffset: job.workOffset } : {}),
    metadata: { ...(job.setupOrientation !== undefined && job.setupOrientation !== "+Z" ? { setup: `Manual ${job.setupOrientation} setup - refixture and touch off; workholding unverified` } : {}), material: material.name, machine: machine.name, stock: `${width.toFixed(2)} x ${depthY.toFixed(2)} x ${(sMax.z - sMin.z).toFixed(2)} mm` }
  })
  const post = getPost(machine.post) ?? genericPost
  let nc = ""
  try {
    nc = toolpaths.length === 0 ? "" : post.emit(program, { ...job.post?.options, toolNumbers: numbers, retractBeforeToolChange: true })
  } catch (error) {
    issues.push(issue("GenerationFailed", "post", `Post ${post.id}: ${error instanceof Error ? error.message : String(error)}`))
  }

  // ------------------------------------------------------------ replay of the emitted NC
  checkpoint({ stage: "replay" })
  const hf = field()
  const initialVolume = hf.volume()
  const target = hf.rasterise(workMeshes as unknown as ReadonlyArray<Mesh>)
  for (let k = 0; k < target.length; k++) if (target[k]! <= hf.floor + 1e-9) target[k] = Math.max(hf.floor, partBottom)
  // Lowest the cutter may go: the part, except below blind drilled holes where the point cone is the hole's bottom.
  const limit = Float64Array.from(target)
  for (const a of prepared.plan?.allowances ?? []) {
    const c = shift2(a.center, o), floor = a.floor - o.z - a.depth - 1e-3
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      if (Math.hypot(hf.centreX(i) - c.x, hf.centreY(j) - c.y) <= a.radius + Math.max(hf.cellX, hf.cellY)) {
        const k = j * nx + i
        limit[k] = Math.min(limit[k]!, floor)
      }
    }
  }
  // Declared removal the model does not carry: the band of a chamfer may go down to the chamfer's bottom at the edge.
  for (const op of operations) {
    if (op.strategy !== "chamfer") continue
    const t = toolOf(op.tool)
    const g = chamferGeometry(coneOf(t), op.width, op.tipOffset ?? 0.2)
    const floor = op.top - o.z - g.depth - 1e-3
    for (const loop of op.loops) {
      const ring = loop.points.map((p) => shift2(p, o))
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
      for (const p of ring) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y) }
      const reach = op.width + 2 * Math.max(hf.cellX, hf.cellY)
      const i0 = Math.max(0, Math.floor((x0 - reach - hf.minX) / hf.cellX)), i1 = Math.min(nx - 1, Math.ceil((x1 + reach - hf.minX) / hf.cellX))
      const j0 = Math.max(0, Math.floor((y0 - reach - hf.minY) / hf.cellY)), j1 = Math.min(ny - 1, Math.ceil((y1 + reach - hf.minY) / hf.cellY))
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const p = { x: hf.centreX(i), y: hf.centreY(j) }
        if (distanceToChain(p, ring, true) > reach) continue
        const k = j * nx + i
        limit[k] = Math.min(limit[k]!, floor)
      }
    }
  }
  // Declared removal the model does not carry: a thread, milled or tapped, cuts out to its major diameter beyond the drilled hole.
  for (const op of operations) {
    const t = toolOf(op.tool)
    const rings = op.strategy === "thread" ? [{ c: op.center, r: op.diameter / 2, floor: op.top - o.z - op.length }]
      : op.strategy === "drill" && (op.cut === "tap" || t.kind === "tap") ? op.points.map((c) => ({ c, r: t.diameter / 2, floor: op.bottom - o.z }))
      : []
    for (const { c: centre, r, floor } of rings) {
      const c = shift2(centre, o), reach = r + Math.max(hf.cellX, hf.cellY)
      const i0 = Math.max(0, Math.floor((c.x - reach - hf.minX) / hf.cellX)), i1 = Math.min(nx - 1, Math.ceil((c.x + reach - hf.minX) / hf.cellX))
      const j0 = Math.max(0, Math.floor((c.y - reach - hf.minY) / hf.cellY)), j1 = Math.min(ny - 1, Math.ceil((c.y + reach - hf.minY) / hf.cellY))
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        if (Math.hypot(hf.centreX(i) - c.x, hf.centreY(j) - c.y) > reach) continue
        const k = j * nx + i
        limit[k] = Math.min(limit[k]!, floor - 1e-3)
      }
    }
  }
  const { min: limitMin } = hf.neighbourhood(limit)
  const { max: targetMax } = hf.neighbourhood(target)
  const partVolume = target.reduce((s, z) => s + (z - hf.floor), 0) * hf.cellArea

  const lines = nc.split("\n")
  const toolAtLine: Array<number | undefined> = new Array(lines.length + 2)
  const opAtLine: Array<number | undefined> = new Array(lines.length + 2)
  let activeTool: number | undefined, activeOp: number | undefined
  lines.forEach((raw, i) => {
    const marker = /\(\s*OP(\d+)\b/i.exec(raw)
    if (marker) activeOp = Number(marker[1]) - 1
    const code = raw.replace(/\([^)]*\)/g, " ").replace(/;.*$/, "")
    const t = /\bT(\d+)/i.exec(code)
    if (t) activeTool = Number(t[1])
    toolAtLine[i + 1] = activeTool
    opAtLine[i + 1] = activeOp
  })
  const cutterByNumber = new Map<number, Cutter>()
  for (const [id, n] of Object.entries(numbers)) cutterByNumber.set(n, toolOf(id))
  const models = new Map<number, ToolModel>()
  const modelOf = (n: number): ToolModel => { let m = models.get(n); if (m === undefined) { m = toolModel(verifyTool(cutterByNumber.get(n)!)); models.set(n, m) } return m }

  const initial = { x: 0, y: 0, z: CLEARANCE + 10 }
  const interpreted = nc === "" ? undefined : interpretGcode(nc, { start: initial })
  const removedByOp = new Map<number, number>()
  const cutLengthByOp = new Map<number, number>()
  let rapidHits = 0, shankHits = 0, holderHits = 0, noTool = 0
  // Moves with A/B/C words: their XYZ is in the machine frame, not the work frame the height field is in, so they are not carved or checked here.
  let turnedMoves = 0
  let turnedVoxels: VoxelStock | undefined
  const firstFinding = new Map<string, CamIssue>()
  const finding = (key: string, make: () => CamIssue): void => { if (!firstFinding.has(key)) firstFinding.set(key, make()) }
  let gougeColumns = 0, gougeDepth = 0
  const gougeByOp = new Map<number, { columns: number; depth: number }>()
  const checkGouges = (op: number | undefined): void => {
    let columns = 0, deepest = 0
    for (let k = 0; k < hf.top.length; k++) {
      // Below the stock floor with no part in reach is a breakthrough into the fixture plate, not a gouge of the part.
      if (limitMin[k]! <= hf.floor + 1e-6) continue
      const below = limitMin[k]! - hf.top[k]!
      if (below > 0.02 + prepared.tolerance) { columns++; deepest = Math.max(deepest, below) }
    }
    const before = gougeColumns
    if (columns > before && op !== undefined) gougeByOp.set(op, { columns: columns - before, depth: deepest })
    gougeColumns = columns
    gougeDepth = Math.max(gougeDepth, deepest)
  }
  if (interpreted !== undefined) {
    let lastOp: number | undefined
    const cellSize = Math.min(hf.cellX, hf.cellY)
    // The five-axis removal is tracked on its own voxel stock from the raw stock; the height field keeps the three-axis removal.
    const five = machine.fiveAxis
    const turnedStock: VoxelStock | undefined = five === undefined ? undefined : voxelStock(
      { x: stock.min.x - origin.x, y: stock.min.y - origin.y, z: stock.min.z - origin.z },
      { x: stock.max.x - origin.x, y: stock.max.y - origin.y, z: stock.max.z - origin.z },
      2
    )
    turnedVoxels = turnedStock
    for (const s of interpreted.segments as ReadonlyArray<GSegment>) {
      if (s.kind === "dwell") continue
      if (s.kind !== "arc" && s.rotary !== undefined) {
        turnedMoves++
        const n = toolAtLine[s.line]
        const cutter = n === undefined ? undefined : cutterByNumber.get(n)
        if (turnedStock !== undefined && five !== undefined && s.kind === "linear" && cutter !== undefined) {
          const r = s.rotary
          removeTurnedMove(turnedStock, cutter, five.layout, five.pivot, s.from, s.to, { a: r.a ?? 0, b: r.b ?? 0, c: r.c ?? 0 })
        }
        continue
      }
      const op = opAtLine[s.line]
      if (op !== lastOp) { checkGouges(lastOp); lastOp = op }
      const n = toolAtLine[s.line]
      const seg: PathSegment = s.kind === "arc"
        ? { rapid: false, from: s.from, to: s.to, center: s.center, clockwise: s.clockwise, line: s.line }
        : { rapid: s.kind === "rapid", from: s.from, to: s.to, line: s.line }
      if (n === undefined || !cutterByNumber.has(n)) {
        if (!seg.rapid) { noTool++; finding("notool", () => issue("ReplayMismatch", "replay", `Feed motion at NC line ${s.line} with no known cutter selected`, { line: s.line })) }
        continue
      }
      const model = modelOf(n)
      const cutter = cutterByNumber.get(n)!
      let removed = 0
      forEachSample(seg, sampleStep(cellSize, model.radius), (x, y, z) => {
        if (seg.rapid) {
          if (hf.touches(model, x, y, z)) {
            rapidHits++
            finding(`rapid`, () => issue("RapidInStock", "replay", `Rapid move through material at NC line ${s.line} (${cutter.name})`, { line: s.line, point: { x, y, z }, ...(op !== undefined ? { operationId: outcomes[opOfToolpath[op]!]?.id } : {}) }))
          }
          return
        }
        removed += hf.cut(model, x, y, z)
        if (model.fluteLength !== undefined && hf.reaches(x, y, model.shankRadius, z + model.fluteLength)) {
          shankHits++
          finding("shank", () => issue("HolderCollision", "replay", `Shank of ${cutter.name} touches material above its ${cutter.fluteLength} mm flutes at NC line ${s.line}`, { line: s.line, point: { x, y, z }, ...(op !== undefined ? { operationId: outcomes[opOfToolpath[op]!]?.id } : {}) }))
        }
        if (model.holderStart !== undefined && model.holderRadius !== undefined && hf.reaches(x, y, model.holderRadius, z + model.holderStart)) {
          holderHits++
          finding("holder", () => issue("HolderCollision", "replay", `Holder of ${cutter.name} touches material at NC line ${s.line}`, { line: s.line, point: { x, y, z }, ...(op !== undefined ? { operationId: outcomes[opOfToolpath[op]!]?.id } : {}) }))
        }
      })
      if (op !== undefined) {
        removedByOp.set(op, (removedByOp.get(op) ?? 0) + removed)
        if (!seg.rapid) cutLengthByOp.set(op, (cutLengthByOp.get(op) ?? 0) + Math.hypot(s.to.x - s.from.x, s.to.y - s.from.y, s.to.z - s.from.z))
      }
    }
    checkGouges(lastOp)
  }
  issues.push(...firstFinding.values())
  for (const [op, g] of gougeByOp) {
    const outcome = outcomes[opOfToolpath[op]!]
    issues.push(issue("Gouge", "replay", `${outcome?.id ?? `operation ${op + 1}`} cuts up to ${g.depth.toFixed(3)} mm below the part over ${g.columns} cells (${(g.columns * hf.cellArea).toFixed(2)} mm²)`, { ...(outcome ? { operationId: outcome.id } : {}) }))
  }
  // Volumes and lengths per operation from the replay of the real NC.
  const finalOutcomes = outcomes.map((oc) => {
    const t = toolpaths.findIndex((tp) => tp.id === oc.id)
    if (t < 0) return oc
    return { ...oc, removedVolume: Math.round(removedByOp.get(t) ?? 0), cutLength: Math.round((cutLengthByOp.get(t) ?? 0) * 10) / 10 }
  })

  // Material left above the part plus its allowance.
  const allowed = Math.max(0.05, prepared.scallop * 1.5) + prepared.tolerance + Math.max(hf.cellX, hf.cellY) * 0.1
  let remainingVolume = 0, maxRemaining = 0
  for (let k = 0; k < hf.top.length; k++) {
    const excess = hf.top[k]! - targetMax[k]!
    if (excess > allowed) { remainingVolume += (excess - allowed) * hf.cellArea; maxRemaining = Math.max(maxRemaining, excess) }
  }
  if (maxRemaining > 0) issues.push(issue("RemainingStock", "evidence", `${remainingVolume.toFixed(1)} mm³ of material is left above the part, up to ${maxRemaining.toFixed(3)} mm thick (corners smaller than the finishing cutter, or features not machined)`, { severity: "warning" }))

  // Independent replay versus the planned motion.
  const planned = pathFromProgram(program, initial)
  const extent = (segs: ReadonlyArray<{ readonly rapid: boolean; readonly to: { x: number; y: number; z: number } }>) => {
    let minZ = Infinity, minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const s of segs) { if (s.rapid) continue; minZ = Math.min(minZ, s.to.z); minX = Math.min(minX, s.to.x); maxX = Math.max(maxX, s.to.x); minY = Math.min(minY, s.to.y); maxY = Math.max(maxY, s.to.y) }
    return [minX, maxX, minY, maxY, minZ]
  }
  const decimals = job.post?.options?.decimals ?? 3
  const rounding = 2 * Math.pow(10, -decimals) + 1e-9
  const plannedExtent = extent(planned.segments)
  const replayedExtent = interpreted === undefined ? [] : extent(interpreted.segments.filter((s): s is Exclude<GSegment, { kind: "dwell" }> => s.kind !== "dwell").map((s) => ({ rapid: s.kind === "rapid", to: s.to })))
  const extentAgrees = replayedExtent.length === plannedExtent.length && plannedExtent.every((v, i) => Math.abs(v - replayedExtent[i]!) <= rounding)
  if (interpreted !== undefined && interpreted.errors.length > 0) issues.push(issue("ReplayMismatch", "replay", `The NC interpreter could not model: ${interpreted.errors.slice(0, 3).join("; ")}`))
  if (interpreted !== undefined && !extentAgrees) issues.push(issue("ReplayMismatch", "replay", `The replayed NC reaches [${replayedExtent.map((v) => v.toFixed(3)).join(", ")}], the planned motion [${plannedExtent.map((v) => v.toFixed(3)).join(", ")}]`))

  // Machine travel.
  let travelHits = 0
  if (machine.travel !== undefined && interpreted !== undefined) {
    const t = machine.travel
    for (const s of interpreted.segments) {
      if (s.kind === "dwell") continue
      const p = s.to
      if (p.x < t.minX - 1e-9 || p.x > t.maxX + 1e-9 || p.y < t.minY - 1e-9 || p.y > t.maxY + 1e-9 || p.z < t.minZ - 1e-9 || p.z > t.maxZ + 1e-9) {
        if (travelHits++ === 0) issues.push(issue("MachineLimit", "replay", `NC line ${s.line} moves outside the machine travel`, { line: s.line, point: p }))
      }
    }
  }

  // Holder and shank against the table over every NC move (linear axes; the table itself does not rotate).
  const table: TableGeometry | undefined = machine.table === undefined ? undefined : {
    cx: (stock.min.x + stock.max.x) / 2 - origin.x,
    cy: (stock.min.y + stock.max.y) / 2 - origin.y,
    top: stock.min.z - origin.z - machine.table.gap,
    length: machine.table.length,
    width: machine.table.width
  }
  const clearance = interpreted !== undefined && table !== undefined
    ? checkNcClearance(interpreted.segments, (line) => { const n = toolAtLine[line]; return n === undefined ? undefined : cutterByNumber.get(n) }, table)
    : undefined
  if (clearance?.first !== undefined) {
    const f = clearance.first
    const cutter = cutterByNumber.get(toolAtLine[f.line] ?? -1)
    issues.push(issue("HolderCollision", "replay", `${cutter?.name ?? "The tool"} holder or shank touches the machine table at NC line ${f.line} (clearance ${f.clearance.toFixed(3)} mm)`, { line: f.line, point: f.point }))
  }

  // ------------------------------------------------------------ evidence
  checkpoint({ stage: "evidence" })
  const failedOps = finalOutcomes.filter((x) => x.status === "failed")
  const unmachined = prepared.plan?.unmachined ?? []
  for (const m of unmachined) issues.push(issue("UnsupportedCapability", "plan", m, { severity: "warning" }))
  const exceeded = finalOutcomes.flatMap((x) => x.cutting?.exceeded ?? [])
  const rubbing = finalOutcomes.filter((x) => x.cutting?.warnings.some((w) => /below the .* needs to cut|not suitable|unsuitable|wears in minutes/.test(w)))
  const claims: Claim[] = [
    {
      id: "cutting-data",
      status: finalOutcomes.some((x) => x.status === "ok" && x.cutting === undefined && x.removedVolume > 0) ? "unresolved" : rubbing.length > 0 ? "unresolved" : "passed",
      detail: rubbing.length > 0 ? `Cutting data outside the material's window in: ${rubbing.map((x) => x.id).join(", ")}` : `Every operation runs at cutting data computed for ${material.name} and its cutter`
    },
    {
      id: "machine-limits",
      status: exceeded.length > 0 || issues.some((i) => i.tag === "MachineLimit" && i.severity === "error") ? "failed" : machine.limits.powerKw === undefined ? "unsupported" : "passed",
      detail: exceeded.length > 0 ? exceeded.join("; ") : machine.limits.powerKw === undefined ? "The machine has no spindle power figure: load not checked" : `Spindle speed, feed, power${machine.limits.torqueNm !== undefined ? ", torque" : ""} and cutter deflection within limits`
    },
    {
      id: "operations-complete",
      status: failedOps.length > 0 || unmachined.length > 0 ? "failed" : "passed",
      detail: failedOps.length > 0 || unmachined.length > 0 ? [...failedOps.map((x) => `${x.id} failed`), ...unmachined].join("; ") : `${finalOutcomes.length} operations generated; every planned feature has an operation`
    },
    { id: "no-rapid-in-stock", status: interpreted === undefined ? "unresolved" : rapidHits > 0 ? "failed" : turnedMoves > 0 ? "unresolved" : "passed", detail: rapidHits > 0 ? `${rapidHits} rapid samples inside material` : turnedMoves > 0 ? `${turnedMoves} moves turn the table: their rapids are not checked against the height field` : "No rapid move touches the stock as replayed" },
    {
      id: "holder-clearance", status: interpreted === undefined ? "unresolved" : shankHits + holderHits > 0 ? "failed" : "passed",
      detail: shankHits + holderHits > 0 ? `${shankHits} shank and ${holderHits} holder contacts with the stock` : "Shank and holder stay clear of the stock (3-axis height-field replay)"
    },
    { id: "no-gouge", status: interpreted === undefined ? "unresolved" : gougeColumns > 0 ? "failed" : turnedMoves > 0 ? "unresolved" : "passed", detail: gougeColumns > 0 ? `${gougeColumns} cells cut below the part, up to ${gougeDepth.toFixed(3)} mm` : turnedMoves > 0 ? `${turnedMoves} moves turn the table: their cuts are not checked against the part` : `No cut below the part beyond ${(0.02 + prepared.tolerance).toFixed(3)} mm (one cell of lateral slack)` },
    {
      id: "material-removed", status: interpreted === undefined ? "unresolved" : maxRemaining > 0 ? "failed" : turnedMoves > 0 ? "unresolved" : "passed",
      detail: [
        maxRemaining > 0 ? `${remainingVolume.toFixed(1)} mm³ left, up to ${maxRemaining.toFixed(3)} mm` : `The replayed stock matches the part within ${allowed.toFixed(3)} mm`,
        ...(turnedMoves > 0 && turnedVoxels !== undefined ? [fiveAxisRemovalText(turnedVoxels)] : [])
      ].join("; ")
    },
    {
      id: "nc-replay", status: interpreted === undefined ? "unresolved" : interpreted.errors.length > 0 || noTool > 0 || !extentAgrees ? "failed" : "passed",
      detail: interpreted === undefined ? "No NC was emitted" : `Interpreted ${interpreted.segments.length} NC motions independently of the post; extents agree within ${rounding.toExponential(1)} mm`
    },
    { id: "machine-travel", status: machine.travel === undefined ? "unsupported" : travelHits > 0 ? "failed" : "passed", detail: machine.travel === undefined ? "The machine has no travel limits configured" : travelHits > 0 ? `${travelHits} moves outside the travel` : "Every move within the machine travel" },
    {
      id: "machine-clearance",
      status: interpreted === undefined ? "unresolved" : table === undefined ? "unsupported" : clearance === undefined ? "unresolved" : clearance.rotaryMoves > 0 ? "unsupported" : clearance.first !== undefined ? "failed" : clearance.unresolved > 0 ? "unresolved" : "passed",
      detail: table === undefined ? "The machine has no table geometry configured" : clearance === undefined ? "No NC to check" : clearance.rotaryMoves > 0 ? `${clearance.rotaryMoves} moves turn the table (A/B/C): the rotating part body is not modelled, so they are not checked` : clearance.first !== undefined ? `Holder or shank reaches the table at NC line ${clearance.first.line}` : clearance.unresolved > 0 ? `${clearance.unresolved} of ${clearance.checked} moves not proven clear within the subdivision depth` : `${clearance.checked} moves checked; the holder and shank stay ${clearance.minClearance !== undefined ? `at least ${clearance.minClearance.toFixed(3)} mm` : "clear"} from the table`
    }
  ]
  const hidden = hiddenSurfaces(prepared.meshes, prepared.bounds.min[2], Math.max(1e-6, prepared.tolerance))
  if (hidden > 0) {
    const detail = `${hidden} downward-facing mesh triangles above the underside are hidden from this setup; prepare another manual setup or a supported rotary process. Height-field replay does not verify these surfaces`
    claims.push({ id: "part-coverage", status: "unresolved", detail })
    issues.push(issue("UnsupportedCapability", "evidence", detail, { severity: "warning" }))
  }
  if (job.setupOrientation !== undefined && job.setupOrientation !== "+Z") claims.push(
    { id: "setup-workholding", status: "unresolved", detail: "Manual refixture requires independently configured and checked workholding; no fixture is assumed by this program" },
    ...(hidden === 0 ? [{ id: "part-coverage" as const, status: "unresolved" as const, detail: "This separate setup checks the visible height field only; hidden surfaces and coverage across setups are not certified" }] : [])
  )
  const hardFailure = issues.some((i) => i.severity === "error")
  const release: ReleaseLevel = hardFailure || nc === "" ? "blocked" : claims.every((c) => c.status === "passed" || (c.status === "unsupported" && c.id === "machine-travel")) ? "verified-program" : "preview"

  const usedTools = Object.entries(numbers).map(([id, number]) => ({ ...toolOf(id), number }))
  const toolChanges = usedTools.length
  const cycleTimeSeconds = Math.round(finalOutcomes.reduce((s, x) => s + x.timeSeconds, 0) + toolChanges * (machine.toolChangeSeconds ?? 8))
  const jobDigest = digestOf("cam-kernel/job@1", {
    ...job,
    part: job.part.kind === "meshes" ? { kind: "meshes", meshes: job.part.meshes.map((m) => ({ positions: Array.from(m.positions), indices: Array.from(m.indices) })) } : job.part,
    resolved: { material: material.id, machine: machine.id, tools: tools.map((t) => t.id) }
  })
  return {
    status: "ok",
    value: {
      schemaVersion: KERNEL_SCHEMA_VERSION, jobId: job.id,
      material: { id: material.id, name: material.name, iso: material.iso },
      machine: { id: machine.id, name: machine.name, post: post.id },
      ...(job.setupOrientation !== undefined ? { setupOrientation: job.setupOrientation } : {}),
      origin, stockBounds: prepared.stock, operations: finalOutcomes, program, tools: usedTools, nc, claims, issues, release,
      stock: { initialVolume: Math.round(initialVolume), finalVolume: Math.round(hf.volume()), partVolume: Math.round(partVolume), remainingVolume: Math.round(remainingVolume * 10) / 10, maxRemaining: Math.round(maxRemaining * 1000) / 1000, cellSize: Math.round(Math.max(hf.cellX, hf.cellY) * 1000) / 1000 },
      cycleTimeSeconds,
      identity: { job: jobDigest, part: digestOf("cam-kernel/part@1", job.part), nc: sha256(nc), algorithm: KERNEL_ALGORITHM },
      notes: [...(prepared.plan?.notes ?? []), ...subprogramNotes(nc)]
    }
  }
}

/** One note when the NC calls subprograms (`post.options.subprograms`): how many, how many calls, how many blocks they save. */
const subprogramNotes = (nc: string): ReadonlyArray<string> => {
  const calls = (nc.match(/^(?:N\d+ )?M98 P\d+/gm) ?? []).length
  const programs = new Set([...nc.matchAll(/^(?:N\d+ )?M98 P(\d+)/gm)].map((m) => m[1])).size
  return calls === 0 ? [] : [`The NC repeats ${calls} toolpaths through ${programs} subprogram${programs === 1 ? "" : "s"} (M98): the same motion at another place is written once`]
}

/** Prepares and runs a job. */
export const runJob = (job: ManufacturingJob, options: RunOptions = {}): CamResult<CamArtifact> => {
  const prepared = prepareJob(job)
  return prepared.status === "ok" ? executeJob(prepared.value, options) : prepared
}

/** Only the plan: the operations the kernel would run, with their cutters, and what it cannot machine. */
export const planOnly = (job: ManufacturingJob): CamResult<{ readonly operations: ReadonlyArray<OperationSpec>; readonly notes: ReadonlyArray<string>; readonly unmachined: ReadonlyArray<string> }> => {
  const prepared = prepareJob(job)
  if (prepared.status === "failed") return prepared
  const p = prepared.value
  const hidden = hiddenSurfaces(p.meshes, p.bounds.min[2], Math.max(1e-6, p.tolerance))
  return { status: "ok", value: {
    operations: p.operations,
    notes: [...(p.plan?.notes ?? []), ...(job.setupOrientation !== undefined && job.setupOrientation !== "+Z" ? [`Manual ${job.setupOrientation} setup: separate NC, refixture and touch off required; workholding and full-part coverage unverified`] : [])],
    unmachined: [...(p.plan?.unmachined ?? []), ...(hidden > 0 ? [`${hidden} downward-facing mesh triangles above the underside need another setup or a supported rotary process; their coverage is unverified`] : [])]
  } }
}
