/**
 * Probe operations in a manufacturing job (spec 73 §5.12): a probe is a sensor, not a cutter. `probeToolpath` turns a probe operation into
 * a toolpath (spindle 0, coolant off, protected moves and touches, the actions on the results); `nominalProbeWorld` is the part as drawn
 * for the probe to touch; `simulateProbing` runs a job's probe operations on the part where it really sits (a misplaced stock, a pivot
 * that is not where the control believes), the figures the closed loop is built on: what the probe measures, which offsets it moves,
 * and whether the cut that follows then runs in the right place.
 *
 * Coordinates: the operations are in the setup's (oriented) coordinates with the work zero at `origin`; a tilted plane (3+2) is the
 * frame of the program in the work offset's, and the world the probe touches is in the work offset's axes (the CAD world turned out of
 * the plane), so the IR run, the NC text and a misplacement all see one thing.
 */
import type { Vec3 } from "../../cad/vec.ts"
import type { Move, Toolpath } from "../ir.ts"
import { compileActions } from "../probing/actions.ts"
import { planProbeCycle } from "../probing/cycles.ts"
import { translateCycle } from "../probing/transform.ts"
import { runProbeMoves, type ProbeTruth, type SimMachine } from "../probing/simulate.ts"
import { createNcProbeHost, simulateNc, type NcProbeHost } from "../testing/probe-machine.ts"
import { meshWorld, type Placement, type ProbeWorld3 } from "../probing/world.ts"
import type { ProbeCycle, ProbeOperationSummary, ProbeRoutine, ProbeSimOutcome } from "../probing/types.ts"
import type { ProbeDevice } from "../probing/device.ts"
import { resolveProbe } from "../probing/device.ts"
import { dialectOf } from "../post/index.ts"
import type { Dialect, PostProbingOptions } from "../post/types.ts"
import type { WorkFrame } from "../setup.ts"
import type { WorkOffsetRef } from "../work-offset.ts"
import { workplaneFrame } from "./workplane.ts"
import type { Cutter } from "./cutters.ts"
import type { KernelMachine, ManufacturingJob, ProbeOperationSpec } from "./contracts.ts"

/** The cutter record of a probe device: the numbering, the replay's tool model and the clearance checks need one (`kind: "probe"`). */
export const probeCutterOf = (d: ProbeDevice): Cutter => ({
  id: d.id,
  name: `Probe ${d.id}`,
  kind: "probe",
  diameter: d.stylus.ballDiameter,
  flutes: 1,
  material: "carbide",
  coating: "none",
  fluteLength: Math.max(0.1, d.stylus.length - d.stylus.ballDiameter / 2),
  shankDiameter: d.stylus.shankDiameter,
  stickout: d.stylus.length,
  holder: { diameter: d.body.diameter, length: d.body.length },
  maxRpm: 0,
  number: d.toolNumber
})

export interface ProbeEnvironment {
  readonly machine: KernelMachine
  /** Highest point of the stock in work coordinates. */
  readonly stockTop: number
  readonly index: number
  /** Work zero in the setup's coordinates: the operation's cycle is in the setup's coordinates, the program in the work offset's. */
  readonly origin: Vec3
  /** The setup's tilted plane, when it has one: the cycle runs in it and its offset changes are written in the machine's axes. */
  readonly job?: Pick<ManufacturingJob, "workplane">
}

export type ProbeToolpathResult =
  | { readonly toolpath: Toolpath; readonly routine: ProbeRoutine; readonly moves: ReadonlyArray<Move>; readonly summary: ProbeOperationSummary; readonly device: ProbeDevice }
  | { readonly refused: string }

/** Why a probe operation cannot be run on this machine and post, or undefined. */
export const probeRefusal = (op: ProbeOperationSpec, machine: KernelMachine, dialect: Dialect | undefined, tilted = false): string | undefined => {
  if (machine.kind !== "mill") return `Machine ${machine.id} is not a milling machine: a spindle probe is a milling accessory here`
  if (machine.probing === undefined) return `Machine ${machine.id} has no probe: add one to its profile (probing)`
  const device = resolveProbe(machine.probing, op.tool)
  if (device === undefined) return `Machine ${machine.id} has no probe '${op.tool}' (it has ${machine.probing.probes.map((p) => p.id).join(", ") || "none"})`
  if (device.on !== undefined || device.off !== undefined) return `The probe ${device.id} needs its own on / off words (${[...(device.on ?? []), ...(device.off ?? [])].join(" ")}): the post does not write them, put them in the tool-change macro and remove them from the device`
  if (dialect?.probing === undefined) return `Post ${machine.post} writes no probing words: use a post that does (fanuc, haas, mazak, mitsubishi, brother, generic, linuxcnc, siemens, heidenhain) or a machine with one`
  if (tilted && machine.probing.tiltedPlane !== true) return `The setup is a tilted plane and the machine's probing does not say the control probes inside one (probing.tiltedPlane): the touches would be read in the wrong frame`
  if (op.cycle.kind === "stylus-calibrate" || op.cycle.kind === "rotary-axis") return `The ${op.cycle.kind} cycle is run through cam.probing, not as an operation of a cutting job`
  return undefined
}

/**
 * The toolpath of a probe operation. The cycle is planned with the machine's probe, the job's heights and the operation's own search,
 * clearance and double touch; its actions follow; the spindle stays off.
 */
export const probeToolpath = (op: ProbeOperationSpec, env: ProbeEnvironment, setterOrigin?: Vec3): ProbeToolpathResult => {
  const { machine } = env
  const device = resolveProbe(machine.probing, op.tool)
  if (device === undefined) return { refused: `no probe '${op.tool}'` }
  const probe: ProbeDevice = op.doubleTouch === undefined ? device : { ...device, doubleTouch: op.doubleTouch }
  const prefix = op.resultPrefix ?? `p${env.index + 1}_`
  const frame = jobFrameOf(env.job)
  const ctx = {
    probe, safeZ: env.stockTop + 15, ...(frame !== undefined ? { frame } : {}), clearance: op.clearance ?? 3, search: op.search ?? 6, prefix,
    ...(machine.probing?.toolSetter !== undefined ? { setter: machine.probing.toolSetter } : {}),
    ...(setterOrigin !== undefined ? { workOrigin: setterOrigin } : {})
  }
  const cycle = translateCycle(op.cycle, -env.origin.x, -env.origin.y, -env.origin.z)
  const routine = planProbeCycle(cycle, ctx)
  if ("refused" in routine) return { refused: routine.refused }
  let moves: Move[]
  try { moves = compileActions(routine, op.actions ?? [], ctx) } catch (error) { return { refused: error instanceof Error ? error.message : String(error) } }
  const first = moves.find((m) => m._tag === "Probe")
  const approach: Move[] = []
  if (device.orientSpindle !== undefined) approach.push({ _tag: "SpindleOrient", angle: device.orientSpindle / (Math.PI / 180) })
  if (first !== undefined && first._tag === "Probe") approach.push({ _tag: "Rapid", to: { x: first.to.x, y: first.to.y, z: ctx.safeZ } })
  const toolpath: Toolpath = { id: op.id, name: op.name ?? op.id, toolId: device.id, spindleRpm: 0, coolant: "off", moves: [...approach, ...moves] }
  const targets = (op.actions ?? []).flatMap((a) => (a.kind === "set-offset" ? [`${a.ref.kind === "g5x" ? a.ref.code : a.ref.kind}:${Object.keys(a.axes).join("")}`] : a.kind === "tool-offset" ? [`T${a.tool} ${a.quantity}`] : []))
  const summary: ProbeOperationSummary = {
    cycle: op.cycle.kind, touches: routine.contacts.length, device: device.id, nominal: routine.nominal,
    variables: Object.fromEntries(Object.keys(routine.results).map((k) => [k, `${prefix}${k}`])), offsetTargets: targets
  }
  return { toolpath, routine, moves: toolpath.moves, summary, device }
}

const transformMesh = (m: { readonly positions: ArrayLike<number>; readonly indices: ArrayLike<number> }, f: (p: Vec3) => Vec3): { readonly positions: Float64Array; readonly indices: Uint32Array } => {
  const out = new Float64Array(m.positions.length)
  for (let i = 0; i + 2 < m.positions.length; i += 3) {
    const p = f({ x: m.positions[i]!, y: m.positions[i + 1]!, z: m.positions[i + 2]! })
    out[i] = p.x; out[i + 1] = p.y; out[i + 2] = p.z
  }
  return { positions: out, indices: Uint32Array.from(m.indices as ArrayLike<number>) }
}

const jobFrameOf = (job: Pick<ManufacturingJob, "workplane"> | undefined): WorkFrame | undefined => (job === undefined ? undefined : jobFrame(job))

/** The tilted plane of a job as the frame of its program in the work offset's, or undefined for an upright setup. */
export const jobFrame = (job: Pick<ManufacturingJob, "workplane">): WorkFrame | undefined => {
  if (job.workplane === undefined) return undefined
  const f = workplaneFrame(job.workplane)
  return "frame" in f ? f.frame : undefined
}

/**
 * The part as drawn in the work offset's axes: the setup's meshes less the work zero, turned out of the tilted plane. `placement` is
 * where the part really sits (a stock clamped away from where the program believes it is), in the same axes.
 */
export const nominalProbeWorld = (prepared: { readonly job: Pick<ManufacturingJob, "workplane">; readonly meshes: ReadonlyArray<{ readonly positions: ArrayLike<number>; readonly indices: ArrayLike<number> }>; readonly origin: Vec3 }, placement?: Placement): ProbeWorld3 => {
  const frame = jobFrame(prepared.job)
  const o = prepared.origin
  const toWork = (q: Vec3): Vec3 => {
    const p = { x: q.x - o.x, y: q.y - o.y, z: q.z - o.z }
    return frame === undefined ? p : { x: frame.xAxis.x * p.x + frame.yAxis.x * p.y + frame.zAxis.x * p.z, y: frame.xAxis.y * p.x + frame.yAxis.y * p.y + frame.zAxis.y * p.z, z: frame.xAxis.z * p.x + frame.yAxis.z * p.y + frame.zAxis.z * p.z }
  }
  return meshWorld(prepared.meshes.map((m) => transformMesh(m, toWork)), placement)
}

export interface SimulateProbingOptions {
  /** Where the part really sits (work-offset axes); default where it is drawn. */
  readonly placement?: Placement
  /** The probe as it really is (pre-travel, lobing, noise). */
  readonly probeTruth?: ProbeTruth
  /** Where the table really turns, machine coordinates (a pivot the control has wrong). */
  readonly truePivot?: Vec3
  /** The offsets the control holds (machine coordinates of each zero); default all zero. */
  readonly offsets?: Readonly<Record<string, { readonly x: number; readonly y: number; readonly z: number; readonly rotation?: number }>>
}

export interface ProbeOperationRun {
  readonly operationId: string
  readonly cycle: ProbeCycle["kind"]
  readonly routine: ProbeRoutine
  readonly outcome: ProbeSimOutcome
  /** The IR the run executed. */
  readonly moves: ReadonlyArray<Move>
}

/** The reference of the offset a setup runs in. */
export const offsetRefOfJob = (job: Pick<ManufacturingJob, "workOffset" | "workOffsetRef">): WorkOffsetRef => job.workOffsetRef ?? { kind: "g5x", code: job.workOffset ?? "G54" }

/**
 * Runs the probe operations of a prepared job against the part where it really sits. Each operation runs from the offsets the previous
 * one left (a probe that moves G54 changes the frame of the operations after it), the way the control does.
 */
export const simulateProbing = (
  prepared: { readonly job: ManufacturingJob; readonly machine: KernelMachine; readonly stock: { readonly max: Vec3 }; readonly meshes: ReadonlyArray<{ readonly positions: ArrayLike<number>; readonly indices: ArrayLike<number> }>; readonly origin: Vec3; readonly operations: ReadonlyArray<{ readonly id: string; readonly strategy: string }> },
  options: SimulateProbingOptions = {}
): ReadonlyArray<ProbeOperationRun> | { readonly refused: string } => {
  const { job, machine } = prepared
  const probeOps = prepared.operations.filter((o): o is ProbeOperationSpec => o.strategy === "probe")
  if (probeOps.length === 0) return []
  const dialect = dialectOf(machine.post)
  const world = nominalProbeWorld(prepared, options.placement)
  const frame = jobFrame(job)
  const active = offsetRefOfJob(job)
  let entries = { ...(options.offsets ?? {}) }
  const runs: ProbeOperationRun[] = []
  const stockTop = prepared.stock.max.z - prepared.origin.z
  for (const [index, op] of probeOps.entries()) {
    const refusal = probeRefusal(op, machine, dialect, job.workplane !== undefined)
    if (refusal !== undefined) return { refused: `${op.id}: ${refusal}` }
    const planned = probeToolpath(op, { machine, stockTop, index, origin: prepared.origin, job }, machine.probing?.toolSetter === undefined ? undefined : { x: 0, y: 0, z: 0 })
    if ("refused" in planned) return { refused: `${op.id}: ${planned.refused}` }
    const five = machine.fiveAxis
    const sim: SimMachine = {
      offsets: { entries }, active, probe: planned.device,
      ...(frame !== undefined ? { frame } : {}),
      ...(machine.probing !== undefined ? { skipFrame: machine.probing.skipFrame } : {}),
      ...(machine.probing?.toolSetter !== undefined ? { setter: machine.probing.toolSetter } : {}),
      ...(options.probeTruth !== undefined ? { truth: options.probeTruth } : {}),
      ...(five !== undefined && options.truePivot !== undefined ? { kinematics: { layout: five.layout, pivot: five.pivot, truePivot: options.truePivot } } : {})
    }
    const outcome = runProbeMoves(planned.moves, world, sim, { results: planned.routine.results, units: planned.routine.units })
    entries = { ...outcome.offsets }
    runs.push({ operationId: op.id, cycle: op.cycle.kind, routine: planned.routine, outcome, moves: planned.moves })
  }
  return runs
}

/** The probe operations of a prepared job. */
export const probeOperationsOf = (operations: ReadonlyArray<{ readonly strategy: string }>): ReadonlyArray<ProbeOperationSpec> => operations.filter((o): o is ProbeOperationSpec => o.strategy === "probe")


// ---------------------------------------------------------------- the claim

const DEG = Math.PI / 180

export interface ProbingEvidence {
  readonly claim: { readonly id: "probing"; readonly status: "passed" | "failed" | "unresolved"; readonly detail: string }
  readonly textReplay: "agrees" | "differs" | "not-replayed"
}

/**
 * The `probing` claim: each probe operation, run on the part as drawn, finds its feature where the cycle expects it (no alarm, every
 * result within the mesh's tolerance of its nominal value), and the NC text the post wrote for it, replayed on the same part by
 * `simulateNc`, makes the same contacts, moves the same offsets and raises the same alarms as the IR it came from. A native cycle (the
 * control's own) is not replayed: that is `unresolved`, said so.
 */
export const probingEvidence = (args: {
  readonly prepared: { readonly job: ManufacturingJob; readonly machine: KernelMachine; readonly stock: { readonly max: Vec3 }; readonly meshes: ReadonlyArray<{ readonly positions: ArrayLike<number>; readonly indices: ArrayLike<number> }>; readonly origin: Vec3; readonly tolerance: number }
  readonly planned: ReadonlyArray<{ readonly op: ProbeOperationSpec; readonly moves: ReadonlyArray<Move>; readonly routine: ProbeRoutine; readonly toolpath: Toolpath }>
  /** The NC text of one toolpath alone, written by the job's post with the job's options. */
  readonly emit: (toolpath: Toolpath) => string
  readonly dialect: Dialect | undefined
  readonly decimals: number
  readonly probing?: PostProbingOptions
}): ProbingEvidence => {
  const { prepared, planned } = args
  const codes = args.dialect?.probing
  if (codes === undefined) return { claim: { id: "probing", status: "unresolved", detail: "The post has no probing words: the probe operations are not replayed" }, textReplay: "not-replayed" }
  const world = nominalProbeWorld(prepared)
  const frame = jobFrame(prepared.job)
  const active = offsetRefOfJob(prepared.job)
  const problems: string[] = []
  const mismatches: string[] = []
  let replayed = 0
  const tol = Math.max(0.05, 6 * prepared.tolerance)
  const near = 5 * Math.max(1e-3, Math.pow(10, -args.decimals)) + 1e-3
  for (const p of planned) {
    const device = prepared.machine.probing?.probes.find((d) => d.id === p.op.tool)
    if (device === undefined) continue
    const sim: SimMachine = {
      offsets: { entries: {} }, active, probe: device,
      ...(frame !== undefined ? { frame } : {}),
      ...(prepared.machine.probing !== undefined ? { skipFrame: prepared.machine.probing.skipFrame } : {})
    }
    const ir = runProbeMoves(p.moves, world, sim, { results: p.routine.results, units: p.routine.units })
    if (ir.stopped !== undefined) { problems.push(`${p.op.id}: on the part as drawn the probe stops: ${ir.stopped}`); continue }
    for (const [k, v] of Object.entries(p.routine.nominal)) {
      const want = p.routine.units[k] === "deg" ? v * DEG : v
      const got = ir.results[k]
      if (got === undefined || !(Math.abs(got - want) <= (p.routine.units[k] === "deg" ? tol / 100 : tol))) problems.push(`${p.op.id}: ${k} measures ${got === undefined ? "nothing" : got.toFixed(4)} on the part as drawn, the cycle expects ${want.toFixed(4)}`)
    }
    if (p.op.native === true) { mismatches.push(`${p.op.id}: native cycle not replayed`); continue }
    let text: string
    try { text = args.emit(p.toolpath) } catch (error) { mismatches.push(`${p.op.id}: ${error instanceof Error ? error.message : String(error)}`); continue }
    const nc = simulateNc(text, { world, machine: sim, codes, ...(args.probing !== undefined ? { probing: args.probing } : {}) })
    replayed++
    const same = nc.errors.length === 0 && nc.stopped === undefined && nc.contacts.length === ir.contacts.length &&
      nc.contacts.every((c, i) => Math.abs(c.tip.x - ir.contacts[i]!.tip.x) <= near && Math.abs(c.tip.y - ir.contacts[i]!.tip.y) <= near && Math.abs(c.tip.z - ir.contacts[i]!.tip.z) <= near) &&
      nc.updates.length === ir.updates.length && nc.updates.every((u, i) => u.axis === ir.updates[i]!.axis && Math.abs(u.after - ir.updates[i]!.after) <= near) &&
      nc.tools.length === ir.tools.length && nc.tools.every((u, i) => Math.abs(u.after - ir.tools[i]!.after) <= near)
    if (!same) mismatches.push(`${p.op.id}: the NC text makes ${nc.contacts.length} contacts and ${nc.updates.length} offset changes${nc.errors.length > 0 ? ` (${nc.errors[0]})` : ""}${nc.stopped !== undefined ? ` and stops: ${nc.stopped}` : ""}; the IR makes ${ir.contacts.length} and ${ir.updates.length}`)
  }
  const textReplay: ProbingEvidence["textReplay"] = replayed === 0 ? "not-replayed" : mismatches.some((m) => !/native cycle/.test(m)) ? "differs" : mismatches.length > 0 ? "not-replayed" : "agrees"
  if (problems.length > 0 || textReplay === "differs") return { claim: { id: "probing", status: "failed", detail: [...problems, ...mismatches].join("; ") }, textReplay }
  if (textReplay === "not-replayed") return { claim: { id: "probing", status: "unresolved", detail: mismatches.length > 0 ? mismatches.join("; ") : "No probe operation was replayed" }, textReplay }
  return { claim: { id: "probing", status: "passed", detail: `${planned.length} probe operation${planned.length === 1 ? "" : "s"}: each finds its feature on the part as drawn, and the NC text replays to the same contacts and offset changes as the IR` }, textReplay }
}

/**
 * The machine the replay of a job's NC runs its probing blocks on (the part as drawn, the job's offsets and tilted plane): the macro host
 * the interpreter takes. Probing blocks come back as moves that end where the probe touched, every other block is left as it is.
 */
export const probeReplayHost = (prepared: { readonly job: ManufacturingJob; readonly machine: KernelMachine; readonly meshes: ReadonlyArray<{ readonly positions: ArrayLike<number>; readonly indices: ArrayLike<number> }>; readonly origin: Vec3 }, dialect: Dialect | undefined, probing: PostProbingOptions | undefined, device: ProbeDevice): NcProbeHost | undefined => {
  const codes = dialect?.probing
  if (codes === undefined) return undefined
  const frame = jobFrame(prepared.job)
  const sim: SimMachine = {
    offsets: { entries: {} }, active: offsetRefOfJob(prepared.job), probe: device,
    ...(frame !== undefined ? { frame } : {}),
    ...(prepared.machine.probing !== undefined ? { skipFrame: prepared.machine.probing.skipFrame } : {})
  }
  return createNcProbeHost({ world: nominalProbeWorld(prepared), machine: sim, codes, rewrite: true, ...(probing !== undefined ? { probing } : {}) })
}
