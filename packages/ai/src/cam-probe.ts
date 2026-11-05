/**
 * `cam-probe-*`: planning, simulating and calibrating probe cycles (spec 73 §3.2). The HTTP routes (`camProbing`) and the assistant
 * (`cam_edit.probe`, `probe_run`) call the same functions through the kernel job queue: resolving a feature reads the element's exact
 * solid, a simulation meshes the part and casts every touch against it, which costs seconds on a real part and never belongs on the
 * sidecar's event loop. Inputs and outputs are plain data in core units (millimetres, radians): the transport schemas of
 * `@cadcamfun/api` convert degrees at the edge. A refusal is `{ error, status }` (400 for what the caller can fix, 404 for a missing
 * element), never a throw.
 */
import { createHash } from "node:crypto"
import { cam } from "@cadcamfun/core"

const p = cam.probing
type Vec3 = { readonly x: number; readonly y: number; readonly z: number }

export interface CamProbeRefusal { readonly error: string; readonly status: 400 | 404 }

/** What a probe job may report while it runs: the touch or step it is on (the sidecar turns it into `probe.progress`). */
export interface ProbeJobProgress {
  readonly stage: "probe"
  readonly step: { readonly index: number; readonly count: number }
  readonly label?: string
  /** `plan` | `touch` | `check` | `offsets`: where in the operation. */
  readonly phase?: "plan" | "touch" | "check" | "offsets"
  readonly operationId?: string
}

type Report = ((progress: ProbeJobProgress) => void) | undefined

const hash = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("hex")
const DEG = Math.PI / 180

/** The probe a request plans with: the machine's device when it has one, else the settings' own (a stylus of that diameter). */
export interface ProbeSetup {
  readonly settings: cam.probing.ProbeSettings
  readonly device?: cam.probing.ProbeDevice
  readonly setter?: cam.probing.ToolSetter
  /** Machine position of the active work zero (tool setter cycles). */
  readonly workOrigin?: Vec3
  /** The tilted plane the cycles run in. */
  readonly frame?: cam.WorkFrame
}

const contextOf = (setup: ProbeSetup, prefix = "pr"): cam.probing.ProbeContext => {
  const probe = setup.device ?? p.deviceOfSettings(setup.settings)
  const s = setup.settings
  return {
    probe: { ...probe, doubleTouch: s.doubleTouch, ...(setup.device === undefined ? {} : { feeds: { ...probe.feeds, touch: s.feed, fast: s.fastFeed, positioning: s.positioningFeed } }) },
    safeZ: s.safeZ, clearance: s.clearance, search: s.search, prefix,
    ...(setup.frame !== undefined ? { frame: setup.frame } : {}),
    ...(setup.setter !== undefined ? { setter: setup.setter } : {}),
    ...(setup.workOrigin !== undefined ? { workOrigin: setup.workOrigin } : {})
  }
}

const problems = (setup: ProbeSetup): string | undefined => {
  const list = p.validateSettings(setup.settings)
  return list.length === 0 ? undefined : list.join("; ")
}

// ---------------------------------------------------------------- plan and emit

export interface CamProbePlanInput extends ProbeSetup {
  readonly cycle?: cam.probing.ProbeCycle
  readonly feature?: { readonly elements: ReadonlyArray<Record<string, unknown>>; readonly elementId: string; readonly ref?: string; readonly hint?: cam.probing.ProbeFeatureHint }
  /** Characteristics checked after the cycle (an inspect action that raises an alarm on a failure). */
  readonly checks?: ReadonlyArray<cam.probing.Characteristic>
  readonly actions?: ReadonlyArray<cam.probing.ProbeAction>
  /** Write the program for this control as well. */
  readonly dialect?: cam.PostId
  readonly options?: { readonly orientSpindle?: number; readonly programNumber?: number; readonly lineNumbers?: boolean }
  /** Options of the post (the swivel data of a Siemens tilted plane, the machine's probing words). */
  readonly post?: Partial<cam.PostOptions>
  /** Write the control's own cycle; `macroStyle` is the machine's (`KernelProbing.macroStyle`). A cycle that has none is refused with the reason. */
  readonly native?: boolean
  readonly macroStyle?: cam.probing.MacroStyle
  /** The machine's rotary table: a `rotary-axis` cycle needs it. */
  readonly assumed?: cam.probing.RotaryAssumption
}

export interface CamProbePlanOutput {
  readonly cycle: cam.probing.ProbeCycle
  readonly chosenBecause?: string
  readonly settings: cam.probing.ProbeSettings
  readonly steps: ReadonlyArray<cam.probing.PreviewMove>
  readonly moves: ReadonlyArray<cam.Move>
  readonly checks: ReadonlyArray<cam.probing.Characteristic>
  readonly nominal: Readonly<Record<string, number>>
  readonly notes: ReadonlyArray<string>
  readonly warnings: ReadonlyArray<string>
  readonly program?: ProbeProgram
  /** What the post writes for a native cycle (`TCH PROBE 412`, `G65 P9814`, `CYCLE977`). */
  readonly native?: string
}

export interface ProbeProgram { readonly dialect: cam.PostId; readonly nc: string; readonly lines: number; readonly identity: { readonly nc: string } }

const programOf = (dialect: cam.PostId, nc: string): ProbeProgram => ({ dialect, nc, lines: nc.split("\n").length - (nc.endsWith("\n") ? 1 : 0), identity: { nc: hash(nc) } })

/** The routine of a cycle: a rotary calibration needs the machine's table, every other cycle the context. */
const routineOf = (cycle: cam.probing.ProbeCycle, ctx: cam.probing.ProbeContext, assumed: cam.probing.RotaryAssumption | undefined): cam.probing.ProbeRoutineResult =>
  cycle.kind !== "rotary-axis" ? p.planProbeCycle(cycle, ctx)
    : assumed === undefined ? { refused: "A rotary-axis calibration needs the machine's rotary table (its layout and pivot)." }
    : p.rotaryRoutine(cycle, ctx, assumed)

/** The cycle of a request: given, or read from a feature of an element. */
const resolveCycle = (input: CamProbePlanInput): { readonly cycle: cam.probing.ProbeCycle; readonly because?: string } | CamProbeRefusal => {
  if ((input.cycle === undefined) === (input.feature === undefined)) return { error: "Send exactly one of operation (a cycle) and feature (an element of the drawing).", status: 400 }
  if (input.cycle !== undefined) return { cycle: input.cycle }
  const f = input.feature!
  const found = p.planProbeForFeature(f.elements as never, { elementId: f.elementId, ...(f.ref !== undefined ? { ref: f.ref } : {}), ...(f.hint !== undefined ? { hint: f.hint } : {}) }, contextOf(input))
  if (!found.ok) return { error: found.reason, status: /no element/.test(found.reason) ? 404 : 400 }
  return { cycle: found.cycle, because: found.chosenBecause }
}

const withChecks = (actions: ReadonlyArray<cam.probing.ProbeAction> | undefined, checks: ReadonlyArray<cam.probing.Characteristic> | undefined): ReadonlyArray<cam.probing.ProbeAction> =>
  [...(actions ?? []), ...(checks !== undefined && checks.length > 0 ? [{ kind: "inspect" as const, characteristics: checks, onFail: "alarm" as const }] : [])]

/** The program of a plan's moves for a control: a probe toolpath, the spindle never started. */
export const probeProgramText = (moves: ReadonlyArray<cam.Move>, setup: ProbeSetup, dialect: cam.PostId, options: CamProbePlanInput["options"], post: Partial<cam.PostOptions> | undefined): { readonly nc: string } | CamProbeRefusal => {
  const d = cam.dialectOf(dialect)
  if (d === undefined) return { error: `Unknown dialect '${dialect}'.`, status: 400 }
  if (d.probing === undefined) return { error: `The ${dialect} post writes no probing words (it refuses a probe program rather than writing it without them): use fanuc, haas, mazak, mitsubishi, brother, generic, linuxcnc, siemens or heidenhain.`, status: 400 }
  const first = moves.find((m) => m._tag === "Probe")
  const lead: cam.Move[] = [
    ...(options?.orientSpindle !== undefined ? [{ _tag: "SpindleOrient" as const, angle: options.orientSpindle }] : []),
    ...(first !== undefined && first._tag === "Probe" ? [{ _tag: "Rapid" as const, to: { x: first.to.x, y: first.to.y, z: setup.settings.safeZ } }] : [])
  ]
  const ref = setup.settings.workOffset
  const toolpath: cam.Toolpath = { id: "probe", name: "probe", toolId: "probe", spindleRpm: 0, coolant: "off", moves: [...lead, ...moves] }
  const program = cam.makeProgram(options?.programNumber !== undefined ? `PROBE ${options.programNumber}` : "PROBE", [toolpath], {
    ...(ref.kind === "g5x" ? { workOffset: ref.code } : {}), metadata: { ...(options?.programNumber !== undefined ? { programNumber: String(options.programNumber) } : {}), purpose: "probing: the spindle stays off" }
  })
  const programRef = ref.kind === "g5x" ? program : { ...program, workOffsetRef: ref }
  const planes = setup.frame === undefined ? {} : { workPlanes: { probe: { frame: setup.frame } } }
  try {
    const nc = cam.posts[dialect].emit(programRef, {
      decimals: 3, header: true, ...(options?.lineNumbers === true ? { lineNumbers: { start: 10, step: 10 } } : {}),
      toolNumbers: { probe: setup.settings.toolNumber ?? 99 }, ...planes, ...(post ?? {})
    })
    // A sensor never starts the spindle: a program with M3 / M4 in it is refused, not handed out.
    if (/(^|\s)M0?[34](\s|$)/m.test(nc)) return { error: "The program would start the spindle: a probe is a sensor. Not written.", status: 400 }
    return { nc }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error), status: 400 }
  }
}

export const camProbePlan = (input: CamProbePlanInput, report?: Report): CamProbePlanOutput | CamProbeRefusal => {
  const bad = problems(input)
  if (bad !== undefined) return { error: `The probe settings are not usable: ${bad}.`, status: 400 }
  report?.({ stage: "probe", step: { index: 0, count: 2 }, phase: "plan", label: "resolve the cycle" })
  const resolved = resolveCycle(input)
  if ("error" in resolved) return resolved
  const ctx = contextOf(input)
  const planned = routineOf(resolved.cycle, ctx, input.assumed)
  if ("refused" in planned) return { error: planned.refused, status: 400 }
  let moves: cam.Move[]
  const actions = withChecks(input.actions, input.checks)
  try { moves = p.compileActions(planned, actions, ctx) } catch (error) { return { error: error instanceof Error ? error.message : String(error), status: 400 } }
  const warnings: string[] = []
  if (input.checks !== undefined) for (const c of input.checks) {
    if (planned.results[c.result] === undefined) return { error: `Check '${c.name}' reads '${c.result}', which the ${resolved.cycle.kind} cycle does not measure (it measures ${Object.keys(planned.results).join(", ")}).`, status: 400 }
  }
  let native: string | undefined
  if (input.native === true) {
    const marked = p.nativeCycle(resolved.cycle, actions, input.macroStyle ?? "inline", moves, { probe: ctx.probe, safeZ: ctx.safeZ, clearance: ctx.clearance, tilted: input.frame !== undefined })
    if ("refused" in marked) return { error: `No native cycle: ${marked.refused}. Clear native for the inline touches.`, status: 400 }
    moves = [...marked.moves]
    native = marked.word
  }
  const out: CamProbePlanOutput = {
    ...(native !== undefined ? { native } : {}),
    cycle: resolved.cycle, ...(resolved.because !== undefined ? { chosenBecause: resolved.because } : {}), settings: input.settings,
    steps: p.previewMoves(moves), moves, checks: input.checks ?? [],
    nominal: Object.fromEntries(Object.entries(planned.nominal).map(([k, v]) => [k, planned.units[k] === "deg" ? v : v])), notes: planned.notes, warnings
  }
  report?.({ stage: "probe", step: { index: 1, count: 2 }, phase: "plan", label: "write the program" })
  if (input.dialect === undefined) return out
  const text = probeProgramText(moves, input, input.dialect, input.options, { ...input.post, ...(native !== undefined ? { nativeCycles: true } : {}) })
  if ("error" in text) return text
  return { ...out, program: programOf(input.dialect, text.nc) }
}

// ---------------------------------------------------------------- simulate

export interface CamProbeSimulateOperation {
  readonly id?: string
  readonly cycle: cam.probing.ProbeCycle
  readonly checks?: ReadonlyArray<cam.probing.Characteristic>
  readonly actions?: ReadonlyArray<cam.probing.ProbeAction>
}

export interface CamProbeSimulateInput extends ProbeSetup {
  readonly elements: ReadonlyArray<Record<string, unknown>>
  readonly operations: ReadonlyArray<CamProbeSimulateOperation>
  /** The offsets the control holds, by `offsetKey` (core units); default all zero. */
  readonly workOffsets?: Readonly<Record<string, cam.probing.OffsetEntry>>
  /** Where the part really sits against where the program believes: mm, `c` radians about the vertical. */
  readonly misplacement?: { readonly x?: number; readonly y?: number; readonly z?: number; readonly a?: number; readonly b?: number; readonly c?: number }
  /** The probe as it is: trigger radius by direction is the device's calibration; `noise` a seeded measurement noise, mm. */
  readonly noise?: number
  /**
   * The control the simulation is for. With it the operations are posted as one program and that text is replayed, so every contact and
   * offset change in the report carries the line of its block in `program.nc` (spec 73 §1); without it there are no lines.
   */
  readonly dialect?: cam.PostId
  readonly post?: Partial<cam.PostOptions>
  /** As in a plan: block numbers in the text do not change the lines, which count the lines of the text. */
  readonly options?: CamProbePlanInput["options"]
  /** The machine's rotary table: a `rotary-axis` operation needs it. */
  readonly assumed?: cam.probing.RotaryAssumption
  /**
   * The point of the drawing that is work zero, for cycles planned in work coordinates (the desktop: stock centre, top face); without it
   * the drawing's own coordinates are the work coordinates.
   */
  readonly partOrigin?: { readonly x: number; readonly y: number; readonly z: number }
  /** The stock as an element: what the probe touches when the drawing has no closed solid yet. */
  readonly stockElement?: Readonly<Record<string, unknown>>
}

export interface CamProbeSimulateOutput {
  /** The program `line` numbers refer to: lines of `program.nc`, 1-based. Absent without `dialect`, or when the post refused (a warning says why). */
  readonly program?: ProbeProgram
  readonly report: cam.probing.ProbeReport
  readonly offsetTable: Readonly<Record<string, cam.probing.OffsetEntry>>
  readonly identity: { readonly elements: string; readonly operations: string }
  readonly warnings: ReadonlyArray<string>
}

/**
 * The program of a simulation and the runs with their NC lines: the moves posted as one program for `dialect`, that text replayed on the
 * same part, and each contact and offset change of the IR run given the line of the block that made it. The IR stays the figures (the
 * text is rounded to the post's decimals); the text gives the place. When the two do not pair up one to one, the lines are left out and
 * a warning says why: a line on the wrong block would show a contact at the wrong moment.
 */
const linesOnText = (dialect: cam.PostId, input: CamProbeSimulateInput, moves: ReadonlyArray<cam.Move>, runs: ReadonlyArray<cam.probing.ReportRun>, world: cam.probing.ProbeWorld3, machine: cam.probing.SimMachine, warnings: string[]): { readonly program?: ProbeProgram; readonly runs: ReadonlyArray<cam.probing.ReportRun> } | undefined => {
  const text = probeProgramText(moves, input, dialect, input.options, input.post)
  if ("error" in text) { warnings.push(`no NC lines on the contacts: ${text.error}`); return undefined }
  const program = programOf(dialect, text.nc)
  const codes = cam.dialectOf(dialect)?.probing
  if (codes === undefined) return { program, runs }
  const nc = cam.testing.simulateNc(text.nc, { world, machine, codes, ...(input.post?.probing !== undefined ? { probing: input.post.probing } : {}) })
  const contacts = runs.flatMap((r) => r.outcome.contacts)
  const updates = runs.flatMap((r) => r.outcome.updates)
  const sameContacts = nc.contacts.length === contacts.length
  const sameUpdates = nc.updates.length === updates.length && nc.updates.every((u, i) => u.axis === updates[i]!.axis)
  if (!sameContacts) warnings.push(`no NC lines on the contacts: the text makes ${nc.contacts.length} contacts, the moves ${contacts.length}`)
  if (!sameUpdates) warnings.push(`no NC lines on the offset changes: the text makes ${nc.updates.length}, the moves ${updates.length}`)
  let c = 0, u = 0
  return {
    program,
    runs: runs.map((r) => ({
      ...r,
      outcome: {
        ...r.outcome,
        contacts: r.outcome.contacts.map((k) => { const line = sameContacts ? nc.contacts[c++]?.line : undefined; return line === undefined ? k : { ...k, line } }),
        updates: r.outcome.updates.map((k) => { const line = sameUpdates ? nc.updates[u++]?.line : undefined; return line === undefined ? k : { ...k, line } })
      }
    }))
  }
}

export const camProbeSimulate = (input: CamProbeSimulateInput, report?: Report): CamProbeSimulateOutput | CamProbeRefusal => {
  const bad = problems(input)
  if (bad !== undefined) return { error: `The probe settings are not usable: ${bad}.`, status: 400 }
  const m = input.misplacement
  if (m !== undefined && ((m.a ?? 0) !== 0 || (m.b ?? 0) !== 0)) return { error: "The part may be shifted and turned about the vertical (x, y, z, c); a tilt of the part (a, b) is not simulated.", status: 400 }
  const warnings: string[] = []
  const drawn = cam.model.partMeshes(input.elements as never)
  const built = drawn ?? (input.stockElement !== undefined ? cam.model.partMeshes([input.stockElement] as never) : undefined)
  if (built === undefined) return { error: "The drawing has no closed solid to touch (send solids, not curves or surfaces).", status: 400 }
  if (drawn === undefined) warnings.push("the drawing has no closed solid: the probe touches the stock block")
  if (built.skipped.length > 0) warnings.push(`not part of the world the probe touches: ${built.skipped.join(", ")}`)
  warnings.push(...built.warnings)
  const active = input.settings.workOffset
  const table: cam.probing.WorkOffsetTable = { entries: input.workOffsets ?? {} }
  const base = p.getOffset(table, active)
  // The part sits where the control believes (the offset) plus how far it is really displaced.
  const o = input.partOrigin ?? { x: 0, y: 0, z: 0 }
  const placement = { translate: { x: base.x + (m?.x ?? 0) - o.x, y: base.y + (m?.y ?? 0) - o.y, z: base.z + (m?.z ?? 0) - o.z }, ...(m?.c !== undefined && m.c !== 0 ? { rotate: m.c } : {}) }
  // A stylus artefact stands where its cycle says in work coordinates, so the machine sees it through the offset; a rotary sphere is given in machine coordinates.
  const artefacts = input.operations.flatMap((op) => {
    const w = p.artefactWorld(op.cycle.kind === "stylus-calibrate" ? p.translateCycle(op.cycle, base.x, base.y, base.z) : op.cycle)
    return w === undefined ? [] : [w]
  })
  const world = artefacts.length === 0 ? p.meshWorld(built.meshes, placement) : p.unionWorld([p.meshWorld(built.meshes, placement), ...artefacts])
  const ctx = contextOf(input)
  const probe = ctx.probe
  let seed = 11
  const rnd = (): number => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 - 0.5 }
  const runs: cam.probing.ReportRun[] = []
  const allMoves: cam.Move[] = []
  const kinematics = input.assumed === undefined ? undefined : { layout: input.assumed.layout, pivot: input.assumed.pivot }
  let entries = { ...table.entries }
  const count = input.operations.length
  for (const [index, op] of input.operations.entries()) {
    const id = op.id ?? `op${index + 1}`
    report?.({ stage: "probe", step: { index, count }, phase: "plan", operationId: id, label: `${op.cycle.kind}` })
    const planned = routineOf(op.cycle, { ...ctx, prefix: `p${index + 1}_` }, input.assumed)
    if ("refused" in planned) return { error: `${id}: ${planned.refused}`, status: 400 }
    let moves: cam.Move[]
    try { moves = p.compileActions(planned, withChecks(op.actions, op.checks), { prefix: `p${index + 1}_`, ...(input.frame !== undefined ? { frame: input.frame } : {}) }) } catch (error) { return { error: `${id}: ${error instanceof Error ? error.message : String(error)}`, status: 400 } }
    report?.({ stage: "probe", step: { index, count }, phase: "touch", operationId: id })
    const machine: cam.probing.SimMachine = {
      offsets: { entries }, active, probe, start: { x: base.x === 0 ? 0 : 0, y: 0, z: input.settings.safeZ },
      ...(input.frame !== undefined ? { frame: input.frame } : {}),
      ...(kinematics !== undefined ? { kinematics } : {}),
      ...(input.noise !== undefined && input.noise > 0 ? { truth: { noise: () => input.noise! * 2 * rnd() } } : {})
    }
    allMoves.push(...moves)
    const chars = [...(op.checks ?? []), ...(op.actions ?? []).flatMap((a) => (a.kind === "inspect" ? a.characteristics : []))]
    const raw = p.runProbeMoves(moves, world, machine, { results: planned.results, units: planned.units, ...(chars.length > 0 ? { characteristics: chars } : {}) })
    const outcome = { ...raw, results: p.withHostFit(planned, raw.results, probe) }
    report?.({ stage: "probe", step: { index, count }, phase: "check", operationId: id })
    entries = { ...outcome.offsets }
    const calibration = p.calibrationOf(op.cycle, outcome.results, probe, input.assumed)
    runs.push({ operationId: id, cycle: op.cycle.kind, outcome, nominal: planned.nominal, units: planned.units, ...(chars.length > 0 ? { characteristics: chars } : {}), ...(calibration !== undefined ? { calibration } : {}) })
  }
  report?.({ stage: "probe", step: { index: count, count }, phase: "offsets" })
  const placed = input.dialect === undefined ? undefined : linesOnText(input.dialect, input, allMoves, runs, world, { offsets: table, active, probe, start: { x: 0, y: 0, z: input.settings.safeZ }, ...(input.frame !== undefined ? { frame: input.frame } : {}), ...(kinematics !== undefined ? { kinematics } : {}) }, warnings)
  return {
    ...(placed !== undefined ? { program: placed.program } : {}),
    report: p.buildProbeReport(placed?.runs ?? runs), offsetTable: entries, warnings,
    identity: { elements: hash(input.elements), operations: hash(input.operations) }
  }
}

// ---------------------------------------------------------------- rotary axis calibration

export interface CamProbeCalibrateInput extends ProbeSetup {
  readonly axis: "A" | "B" | "C"
  readonly sphere: { readonly centre: Vec3; readonly diameter: number }
  /** Radians. */
  readonly angles: ReadonlyArray<number>
  readonly assumed: cam.probing.RotaryAssumption
  /** Simulated machine: where the table really turns (machine coordinates) and how far its axis leans (radians about X). */
  readonly truth?: { readonly pivot?: Vec3; readonly tilt?: number }
  /** Centres a machine measured (same order as `angles`): fitted, nothing simulated. */
  readonly measured?: ReadonlyArray<Vec3>
  readonly dialect?: cam.PostId
}

export interface CamProbeCalibrateOutput {
  readonly axis: "A" | "B" | "C"
  readonly centres: ReadonlyArray<Vec3>
  readonly calibration?: cam.probing.RotaryCalibration
  readonly refused?: string
  readonly nc?: string
  readonly notes: ReadonlyArray<string>
}

export const camProbeCalibrate = (input: CamProbeCalibrateInput, report?: Report): CamProbeCalibrateOutput | CamProbeRefusal => {
  const bad = problems(input)
  if (bad !== undefined) return { error: `The probe settings are not usable: ${bad}.`, status: 400 }
  const ctx = contextOf(input)
  const routine = p.rotaryRoutine({ kind: "rotary-axis", axis: input.axis, sphere: input.sphere, angles: input.angles }, ctx, input.assumed)
  if ("refused" in routine) return { error: routine.refused, status: 400 }
  const notes = [...routine.notes]
  let nc: string | undefined
  if (input.dialect !== undefined) {
    const text = probeProgramText(routine.moves, input, input.dialect, undefined, undefined)
    if ("error" in text) return text
    nc = text.nc
  }
  let centres: Vec3[]
  if (input.measured !== undefined) {
    if (input.measured.length !== input.angles.length) return { error: "Send one measured centre per angle.", status: 400 }
    centres = [...input.measured]
    notes.push("fitted from the centres a machine measured")
  } else {
    // A simulated machine: a ball on the table, a table that turns about `truth`.
    const truth = input.truth
    const tiltAxis = truth?.tilt === undefined ? undefined : { x: 0, y: -Math.sin(truth.tilt), z: Math.cos(truth.tilt) }
    const machine: cam.probing.SimMachine = {
      offsets: { entries: {} }, active: input.settings.workOffset, probe: ctx.probe, start: { x: 0, y: 0, z: input.settings.safeZ },
      kinematics: { layout: input.assumed.layout, pivot: input.assumed.pivot, ...(truth?.pivot !== undefined ? { truePivot: truth.pivot } : {}), ...(tiltAxis !== undefined ? { trueAxes: { [input.axis]: input.axis === "C" ? tiltAxis : { x: 1, y: 0, z: 0 } } } : {}) }
    }
    report?.({ stage: "probe", step: { index: 0, count: 2 }, phase: "touch", label: "measure the ball" })
    const outcome = p.runProbeMoves(routine.moves, p.sphereWorld(input.sphere.centre, input.sphere.diameter / 2), machine)
    if (outcome.stopped !== undefined) return { error: `The simulated run stops: ${outcome.stopped}`, status: 400 }
    const values = outcome.reports[0]?.values ?? {}
    centres = input.angles.map((_, i) => ({ x: values[`x${i}`] ?? NaN, y: values[`y${i}`] ?? NaN, z: values[`z${i}`] ?? NaN }))
    notes.push("simulated against a machine whose table turns where the request says")
  }
  report?.({ stage: "probe", step: { index: 1, count: 2 }, phase: "check", label: "fit the circle" })
  const fit = p.calibrateRotary(centres, input.angles, input.assumed, input.axis)
  if ("refused" in fit) return { axis: input.axis, centres, refused: fit.refused, ...(nc !== undefined ? { nc } : {}), notes }
  return { axis: input.axis, centres, calibration: fit, ...(nc !== undefined ? { nc } : {}), notes: [...notes, "nothing is written to the machine: the result is a report (the control's own cycle 451 / CYCLE996 writes parameters)"] }
}

export { DEG as PROBE_DEG }
