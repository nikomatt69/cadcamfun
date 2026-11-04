/**
 * Runs a probe program's IR against a modelled part (spec 73 §5.10): the oracle the cycles, the actions and the posts are checked
 * against, and what the host runs to say what a probe program will measure before it reaches a machine.
 *
 * The machine is the truth: its position is machine coordinates; a program coordinate goes through the tilted plane (`frame`), the
 * active work offset and, with an `Orient`, the rotary table turning about its *true* pivot. A touch stops at the contact the world
 * gives for the probe's *true* trigger radius; the control reports the tip there in its skip frame. An offset written by the program
 * changes the frame of the moves that follow, as on a control. A missed touch, a contact on a protected move, an `Alarm` and a
 * program stop end the run with the reason.
 */
import type { Vec3 } from "../../cad/vec.ts"
import { evalCondition, evalExpr, varKey, type Expr, type VarRef } from "../macro.ts"
import type { Move } from "../ir.ts"
import type { WorkFrame } from "../setup.ts"
import { getOffset, machineToWork, offsetKey, withOffset, workToMachine, type OffsetAxis, type OffsetEntry, type WorkOffsetRef, type WorkOffsetTable } from "../work-offset.ts"
import { effectiveRadius, type ProbeDevice, type ToolSetter } from "./device.ts"
import type { Characteristic, InspectionVerdict, ProbeSimContact, ProbeSimOutcome, ProbeSimToolUpdate, ProbeSimUpdate } from "./types.ts"
import type { ProbeWorld3 } from "./world.ts"

const DEG = Math.PI / 180

/** The probe as it really is: the radius it triggers at by direction (pre-travel, lobing) and the noise of a contact. */
export interface ProbeTruth {
  /** Trigger radius for a touch moving along `dir` (unit, world); default the device's calibrated effective radius. */
  readonly radius?: (dir: Vec3) => number
  /** Extra travel past the contact before the trigger, mm, for a Z touch (a side touch has it in `radius`). */
  readonly pretravelZ?: number
  /** Added to each contact along the touch direction, mm (seeded measurement noise). */
  readonly noise?: () => number
}

export interface ToolEntry {
  readonly length: number
  readonly radius: number
  readonly lengthWear?: number
  readonly radiusWear?: number
}

export interface SimKinematics {
  readonly layout: "table-AC" | "table-BC"
  /** Where the control believes the table turns, machine coordinates. */
  readonly pivot: Vec3
  /** Where it really turns (a miscalibrated pivot); default `pivot`. */
  readonly truePivot?: Vec3
  /** The true direction of each rotary axis (unit), when it is not the nominal one (a tilted axis). */
  readonly trueAxes?: Partial<Record<"A" | "B" | "C", Vec3>>
}

export interface SimMachine {
  /** The offsets in the control, machine coordinates of each zero. */
  readonly offsets: WorkOffsetTable
  /** The offset the program runs in. */
  readonly active: WorkOffsetRef
  readonly tools?: Readonly<Record<number, ToolEntry>>
  readonly kinematics?: SimKinematics
  /** A tilted plane in force: program coordinates are the frame's, in the coordinates of the work offset. */
  readonly frame?: WorkFrame
  readonly probe: ProbeDevice
  readonly truth?: ProbeTruth
  readonly setter?: ToolSetter
  /** The frame the control reports a contact in under a tilted plane (default the program's). */
  readonly skipFrame?: "program" | "work"
  /** Tip position at the start, program coordinates; default the first move's target. */
  readonly start?: Vec3
}

export interface RunOptions {
  /** The routine's results (variables) and their units, read at the end. */
  readonly results?: Readonly<Record<string, Expr>>
  readonly units?: Readonly<Record<string, "mm" | "deg">>
  /** Checked on the results at the end (`evaluateInspection`). */
  readonly characteristics?: ReadonlyArray<Characteristic>
  /** NC line of each move (a text replay maps contacts to lines). */
  readonly lineOf?: (moveIndex: number) => number | undefined
  /** Values the program reads before it writes them (calibration variables). */
  readonly variables?: Readonly<Record<string, number>>
  readonly maxSteps?: number
}

/** A probe miss and a probe collision raise these codes (a program's own `Alarm` uses its code). */
export const PROBE_MISS_ALARM = 991
export const PROBE_COLLISION_ALARM = 992

const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z })
const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
const scale = (a: Vec3, k: number): Vec3 => ({ x: a.x * k, y: a.y * k, z: a.z * k })
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z

/** Program (frame) coordinates to the work offset's. */
export const frameToWork = (f: WorkFrame | undefined, p: Vec3): Vec3 =>
  f === undefined ? p : add(f.origin, add(add(scale(f.xAxis, p.x), scale(f.yAxis, p.y)), scale(f.zAxis, p.z)))
export const workToFrame = (f: WorkFrame | undefined, w: Vec3): Vec3 => {
  if (f === undefined) return w
  const d = sub(w, f.origin)
  return { x: dot(d, f.xAxis), y: dot(d, f.yAxis), z: dot(d, f.zAxis) }
}
const dirToWork = (f: WorkFrame | undefined, v: Vec3): Vec3 => (f === undefined ? v : add(add(scale(f.xAxis, v.x), scale(f.yAxis, v.y)), scale(f.zAxis, v.z)))

/** Rotation of a vector by `angle` (radians) about unit axis `k` (Rodrigues). */
const rotate = (v: Vec3, k: Vec3, angle: number): Vec3 => {
  const c = Math.cos(angle), s = Math.sin(angle)
  const kxv = { x: k.y * v.z - k.z * v.y, y: k.z * v.x - k.x * v.z, z: k.x * v.y - k.y * v.x }
  const kv = dot(k, v)
  return { x: v.x * c + kxv.x * s + k.x * kv * (1 - c), y: v.y * c + kxv.y * s + k.y * kv * (1 - c), z: v.z * c + kxv.z * s + k.z * kv * (1 - c) }
}

const NOMINAL_AXES: Readonly<Record<"A" | "B" | "C", Vec3>> = { A: { x: 1, y: 0, z: 0 }, B: { x: 0, y: 1, z: 0 }, C: { x: 0, y: 0, z: 1 } }

/**
 * Where a point fixed to the table (its coordinates with the table at 0) is in the machine for the pose: the rotary axis on top (C)
 * turns first, then the tilt (A or B); both about the axes through `pivot`. Inverse with `inverse: true`.
 */
export const tablePose = (k: SimKinematics, pose: { readonly a: number; readonly b: number; readonly c: number }, truth: boolean) => {
  const pivot = truth ? k.truePivot ?? k.pivot : k.pivot
  const axis = (n: "A" | "B" | "C"): Vec3 => (truth ? k.trueAxes?.[n] : undefined) ?? NOMINAL_AXES[n]
  const tilt = k.layout === "table-AC" ? { n: "A" as const, angle: pose.a } : { n: "B" as const, angle: pose.b }
  const forwardDir = (v: Vec3): Vec3 => rotate(rotate(v, axis("C"), pose.c), axis(tilt.n), tilt.angle)
  const inverseDir = (v: Vec3): Vec3 => rotate(rotate(v, axis(tilt.n), -tilt.angle), axis("C"), -pose.c)
  return {
    toMachine: (p: Vec3): Vec3 => add(pivot, forwardDir(sub(p, pivot))),
    toTable: (m: Vec3): Vec3 => add(pivot, inverseDir(sub(m, pivot))),
    dirToTable: inverseDir
  }
}

/** Structure of the control flow: the partner index of every If / Else / EndIf / While / EndWhile and the index of every Label. */
const structure = (moves: ReadonlyArray<Move>): { readonly partner: Map<number, number>; readonly elseOf: Map<number, number>; readonly labels: Map<string, number> } => {
  const partner = new Map<number, number>()
  const elseOf = new Map<number, number>()
  const labels = new Map<string, number>()
  const stack: Array<{ readonly kind: "If" | "While"; readonly at: number; else?: number }> = []
  moves.forEach((m, i) => {
    if (m._tag === "If" || m._tag === "While") stack.push({ kind: m._tag, at: i })
    else if (m._tag === "Else") {
      const top = stack[stack.length - 1]
      if (top === undefined || top.kind !== "If") throw new RangeError(`move ${i}: Else without If`)
      top.else = i
    } else if (m._tag === "EndIf" || m._tag === "EndWhile") {
      const top = stack.pop()
      if (top === undefined || top.kind !== (m._tag === "EndIf" ? "If" : "While")) throw new RangeError(`move ${i}: ${m._tag} without its opening`)
      partner.set(top.at, i)
      partner.set(i, top.at)
      if (top.else !== undefined) { elseOf.set(top.at, top.else); partner.set(top.else, i) }
    } else if (m._tag === "Label") labels.set(m.name, i)
  })
  if (stack.length > 0) throw new RangeError(`move ${stack[stack.length - 1]!.at}: ${stack[stack.length - 1]!.kind} is never closed`)
  return { partner, elseOf, labels }
}

/** What is wrong with a characteristic as data (limits the wrong way round, a true position without its second result), or undefined. */
export const characteristicProblem = (c: Characteristic): string | undefined => {
  if (!(c.lower <= c.upper)) return `characteristic ${c.name}: lower ${c.lower} exceeds upper ${c.upper}`
  if (c.kind === "true-position" && c.result2 === undefined) return `characteristic ${c.name}: a true position needs its second result`
  return undefined
}

/** Deviation and pass of each characteristic on the results (core units: mm, radians). A characteristic that is not valid throws. */
export const evaluateInspection = (results: Readonly<Record<string, number>>, characteristics: ReadonlyArray<Characteristic>): InspectionVerdict[] =>
  characteristics.map((c) => {
    const problem = characteristicProblem(c)
    if (problem !== undefined) throw new RangeError(problem)
    const a = results[c.result] ?? NaN
    if (c.kind === "true-position") {
      const b = c.result2 === undefined ? NaN : results[c.result2] ?? NaN
      const dev = 2 * Math.hypot(a - c.nominal, b - (c.nominal2 ?? 0))
      return { name: c.name, kind: c.kind, measured: dev, nominal: 0, deviation: dev, lower: c.lower, upper: c.upper, pass: Number.isFinite(dev) && dev <= c.upper + 1e-12 }
    }
    const deviation = a - c.nominal
    return { name: c.name, kind: c.kind, measured: a, nominal: c.nominal, deviation, lower: c.lower, upper: c.upper, pass: Number.isFinite(deviation) && deviation >= c.lower - 1e-12 && deviation <= c.upper + 1e-12 }
  })

const ENTRY: Readonly<Record<OffsetAxis, keyof OffsetEntry>> = { X: "x", Y: "y", Z: "z", A: "a", B: "b", C: "c", R: "rotation" }
const angular = (a: OffsetAxis): boolean => a === "A" || a === "B" || a === "C" || a === "R"

/** Executes probe moves against `world` on `machine`. */
export const runProbeMoves = (moves: ReadonlyArray<Move>, world: ProbeWorld3, machine: SimMachine, options: RunOptions = {}): ProbeSimOutcome => {
  const { partner, elseOf, labels } = structure(moves)
  const vars = new Map<string, number>(Object.entries(options.variables ?? {}))
  const look = (v: VarRef): number => vars.get(varKey(v)) ?? 0
  const val = (e: Expr): number => evalExpr(e, look)
  let table = machine.offsets
  const tools: Record<number, ToolEntry> = { ...(machine.tools ?? {}) }
  const contacts: ProbeSimContact[] = []
  const updates: ProbeSimUpdate[] = []
  const toolUpdates: ProbeSimToolUpdate[] = []
  const alarms: Array<{ code: number; text: string; moveIndex: number; line?: number }> = []
  const reports: Array<{ label: string; values: Record<string, number> }> = []
  const path: Vec3[] = []
  const kin = machine.kinematics
  let pose = { a: 0, b: 0, c: 0 }
  const frame = machine.frame
  const offset = (): OffsetEntry => getOffset(table, machine.active)
  const progToMachine = (p: Vec3): Vec3 => workToMachine(offset(), frameToWork(frame, p))
  const machineToProg = (m: Vec3): Vec3 => workToFrame(frame, machineToWork(offset(), m))
  const firstTarget = moves.find((m) => m._tag === "Rapid" || m._tag === "Linear" || m._tag === "Probe") as { readonly to: Vec3 } | undefined
  const startProg = machine.start ?? firstTarget?.to ?? { x: 0, y: 0, z: 0 }
  let at = progToMachine(startProg) // tip, machine coordinates
  let nominal = startProg // the writer's position, program coordinates
  path.push(startProg)
  const toWorld = (m: Vec3): Vec3 => (kin === undefined ? m : tablePose(kin, pose, true).toTable(m))
  const worldAxis = (): Vec3 => {
    const z = dirToWork(frame, { x: 0, y: 0, z: 1 })
    const r = offset().rotation ?? 0
    const m = { x: Math.cos(r) * z.x - Math.sin(r) * z.y, y: Math.sin(r) * z.x + Math.cos(r) * z.y, z: z.z }
    return kin === undefined ? m : tablePose(kin, pose, true).dirToTable(m)
  }
  const ball = machine.probe.stylus.ballDiameter / 2
  const truth = machine.truth
  const triggerRadius = (dirWorld: Vec3): number => truth?.radius?.(dirWorld) ?? effectiveRadius(machine.probe, dirWorld)
  let stopped: string | undefined
  const stop = (code: number, text: string, i: number): void => {
    const line = options.lineOf?.(i)
    alarms.push({ code, text, moveIndex: i, ...(line !== undefined ? { line } : {}) })
    stopped = `alarm ${code}: ${text}`
  }
  const target = (to: Vec3, expr: { readonly x?: Expr; readonly y?: Expr; readonly z?: Expr } | undefined): Vec3 => ({
    x: expr?.x !== undefined ? val(expr.x) : to.x, y: expr?.y !== undefined ? val(expr.y) : to.y, z: expr?.z !== undefined ? val(expr.z) : to.z
  })
  /** A straight move of the tip in machine coordinates; a protected move checks it for a contact. */
  const travel = (to: Vec3, guard: boolean, i: number): boolean => {
    if (guard) {
      const a = toWorld(at), b = toWorld(to)
      const dir = sub(b, a)
      const l = Math.hypot(dir.x, dir.y, dir.z)
      if (l > 1e-12) {
        const hit = world.touch(a, b, { radius: triggerRadius(scale(dir, 1 / l)), centre: ball, axis: worldAxis() })
        if (hit !== undefined) {
          stop(PROBE_COLLISION_ALARM, "the probe touched during a protected move", i)
          return false
        }
      }
    }
    at = to
    path.push(machineToProg(at))
    return true
  }
  const maxSteps = options.maxSteps ?? 1_000_000
  let steps = 0
  let pc = 0
  while (pc < moves.length && stopped === undefined) {
    if (++steps > maxSteps) { stopped = `the program ran more than ${maxSteps} moves (a loop that does not end?)`; break }
    const m = moves[pc]!
    const i = pc
    pc++
    switch (m._tag) {
      case "Rapid": {
        if (m.machine === true) { travel(target(m.to, m.expr), false, i); nominal = m.to; break }
        travel(progToMachine(target(m.to, m.expr)), false, i)
        nominal = m.to
        break
      }
      case "Linear": case "Arc": case "Spline":
        travel(progToMachine("expr" in m ? target(m.to, m.expr) : m.to), false, i)
        nominal = m.to
        break
      case "Cycle":
        stopped = `move ${i}: a drilling cycle in a probe program is not run here`
        break
      case "Orient": {
        if (kin === undefined && (m.a ?? 0) !== 0 || kin === undefined && (m.b ?? 0) !== 0 || kin === undefined && (m.c ?? 0) !== 0) { stopped = `move ${i}: an Orient needs the machine's kinematics`; break }
        pose = { a: m.a !== undefined ? m.a * DEG : pose.a, b: m.b !== undefined ? m.b * DEG : pose.b, c: m.c !== undefined ? m.c * DEG : pose.c }
        break
      }
      case "Probe": {
        const dirProg = m.direction
        if (m.kind === "protected") {
          travel(progToMachine(target(m.to, m.expr)), true, i)
          nominal = m.to
          break
        }
        const length = dot(sub(m.to, nominal), dirProg) + m.overtravel
        if (!(length > 0)) { stopped = `move ${i}: a touch that searches ${length.toFixed(4)} mm (the probe stands past the surface it is to find)`; break }
        const startProgNow = machineToProg(at)
        const endMachine = progToMachine(add(startProgNow, scale(dirProg, length)))
        const a = toWorld(at), b = toWorld(endMachine)
        const dw = sub(b, a)
        const lw = Math.hypot(dw.x, dw.y, dw.z)
        const unit = scale(dw, 1 / lw)
        const vertical = Math.abs(unit.z) > 0.999999
        const hit = world.touch(a, b, { radius: vertical ? ball : triggerRadius(unit), centre: ball, axis: worldAxis() })
        nominal = m.to
        if (hit === undefined) {
          at = endMachine
          path.push(machineToProg(at))
          if (m.onMiss === "alarm") { stop(PROBE_MISS_ALARM, "the probe did not touch", i); break }
          if (m.flag !== undefined) vars.set(varKey(m.flag), 1)
          break
        }
        if (m.flag !== undefined) vars.set(varKey(m.flag), 0)
        // The world says where the ball touches; the control stops there (plus the Z pre-travel and the noise along the touch).
        const extra = (vertical ? truth?.pretravelZ ?? 0 : 0) + (truth?.noise?.() ?? 0)
        const travelled = (hit.travelled + extra) / lw
        at = add(at, scale(sub(endMachine, at), travelled))
        const prog = machineToProg(at)
        path.push(prog)
        const reported = machine.skipFrame === "work" && frame !== undefined ? machineToWork(offset(), at) : prog
        const line = options.lineOf?.(i)
        contacts.push({ tip: reported, moveIndex: i, ...(line !== undefined ? { line } : {}) })
        if (m.store?.x !== undefined) vars.set(varKey(m.store.x), reported.x)
        if (m.store?.y !== undefined) vars.set(varKey(m.store.y), reported.y)
        if (m.store?.z !== undefined) vars.set(varKey(m.store.z), reported.z)
        break
      }
      case "Assign": vars.set(varKey(m.variable), val(m.value)); break
      case "If": {
        if (evalCondition(m.condition, look)) break
        const e = elseOf.get(i)
        pc = (e ?? partner.get(i)!) + 1
        break
      }
      case "Else": pc = partner.get(i)! + 1; break
      case "EndIf": break
      case "While": if (!evalCondition(m.condition, look)) pc = partner.get(i)! + 1; break
      case "EndWhile": pc = partner.get(i)!; break
      case "Label": break
      case "Goto": {
        if (m.condition !== undefined && !evalCondition(m.condition, look)) break
        const t = labels.get(m.label)
        if (t === undefined) { stopped = `move ${i}: no label ${m.label}`; break }
        pc = t
        break
      }
      case "OffsetUpdate": {
        const v = val(m.value)
        if (!Number.isFinite(v)) { stop(999, `an offset update computed ${v}`, i); break }
        if (m.target.kind === "work") {
          const ref = m.target.ref
          const entry = getOffset(table, ref)
          const key = ENTRY[m.axis]
          const before = (entry[key] as number | undefined) ?? 0
          const value = angular(m.axis) ? v * DEG : v
          // "The tip reads v": the offset is the machine position less v, whatever it was.
          const after = m.reads === true ? at[m.axis.toLowerCase() as "x" | "y" | "z"] - value : m.mode === "set" ? value : before + value
          table = withOffset(table, ref, { ...entry, [key]: after })
          updates.push({ ref, axis: m.axis, before, after })
        } else {
          const t = tools[m.target.tool] ?? { length: 0, radius: 0 }
          const field = m.target.quantity === "length" ? (m.target.part === "geometry" ? "length" : "lengthWear") : (m.target.part === "geometry" ? "radius" : "radiusWear")
          const before = (t[field] as number | undefined) ?? 0
          const after = m.mode === "set" ? v : before + v
          tools[m.target.tool] = { ...t, [field]: after }
          toolUpdates.push({ tool: m.target.tool, quantity: m.target.quantity, part: m.target.part, before, after })
        }
        break
      }
      case "Alarm": stop(m.code, m.text, i); break
      case "Report": reports.push({ label: m.label, values: Object.fromEntries(m.values.map((v) => [v.name, val(v.value)])) }); break
      case "Stop": if (!m.optional) stopped = `program stop at move ${i}`; break
      case "MacroCall": stopped = `move ${i}: the macro ${m.name} is not modelled`; break
      case "Dwell": case "Comment": case "Message": case "SpindleOrient": case "CutterComp": case "CycleBegin": case "CycleEnd": break
    }
  }
  const results: Record<string, number> = {}
  for (const [name, e] of Object.entries(options.results ?? {})) {
    const v = val(e)
    results[name] = options.units?.[name] === "deg" ? v * DEG : v
  }
  const offsets: Record<string, OffsetEntry> = { ...table.entries }
  return {
    contacts,
    variables: Object.fromEntries(vars),
    results,
    offsets,
    updates,
    tools: toolUpdates,
    inspections: options.characteristics === undefined ? [] : evaluateInspection(results, options.characteristics),
    alarms,
    reports,
    ...(stopped !== undefined ? { stopped } : {}),
    path
  }
}

/** The key of the active offset after a run (convenience for callers reading `offsets`). */
export const activeKey = (m: SimMachine): string => offsetKey(m.active)
