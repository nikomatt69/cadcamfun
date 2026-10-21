/**
 * How a program runs on its machine, for the assistant (spec 31 §7): the same timeline, set-up, bodies and checks the CAM
 * preview draws, as data. What turns and in which sense, where the tool is at a given time (program and preview
 * coordinates, spindle, line), the set-up findings (vise jaws, chuck, bed), and the result so far: the turned part on a lathe,
 * the deposited layers on a printer. Pure: it never touches the project.
 */
import { Schema } from "effect"
import { cam } from "@cadcamfun/core"

export interface MachineRunInput {
  readonly kind: cam.MachineKind
  readonly gcode: string
  /** Generator settings laid over the machine's defaults (workholding, turret, grip, bed...). A `stock` key is the mill stock. */
  readonly params?: Readonly<Record<string, unknown>>
  /** A tool resource (Resources: type, diameter, lengths, corner radius, angle, pitch, holder); else the params' tool. */
  readonly tool?: cam.ToolResource
  /** Seconds into the program for the pose; the end when absent. */
  readonly at?: number
}

const round = (n: number) => Math.round(n * 1000) / 1000
const point = (p: { readonly x: number; readonly y: number; readonly z: number }) => ({ x: round(p.x), y: round(p.y), z: round(p.z) })

export const machineRun = (input: MachineRunInput): Record<string, unknown> => {
  const { stock: stockParam, machinePreset, machineTravel, ...rest } = (input.params ?? {}) as Record<string, unknown>
  let settings: cam.generator.ToolpathSettings
  try { settings = cam.generator.withMachineDefaults(cam.generator.decodeSettings({ ...rest, machineType: input.kind })) }
  catch (cause) { return { ok: false, error: `params are not valid generator settings: ${cause instanceof Error ? cause.message.slice(0, 300) : String(cause)}` } }
  const analysis = cam.generator.analyseGcode(input.gcode)
  // The same believable start the preview draws (the program does not say where the machine is before its first move).
  const timeline = cam.viewer.buildTimeline(analysis.program, analysis.motion, cam.viewer.DEFAULT_RAPID_RATE, cam.viewer.programStart(input.kind, analysis.program))
  let toolModel = input.tool !== undefined ? cam.toolModelOf(input.tool, input.kind) : cam.toolForOperation(settings, input.kind)
  // The mill stock: given, else a box round the cutting moves (top at the highest cut, at least Z0).
  let stock: cam.generator.Stock
  if (stockParam !== undefined) {
    try { stock = Schema.decodeUnknownSync(cam.generator.StockSchema)(stockParam) } catch { return { ok: false, error: "params.stock must be { width, height, depth, x?, y?, topZ? } in mm" } }
  } else {
    const cuts = timeline.moves.filter((m) => m.kind === "feed")
    const xs = cuts.flatMap((m) => [m.from.x, m.to.x]), ys = cuts.flatMap((m) => [m.from.y, m.to.y]), zs = cuts.flatMap((m) => [m.from.z, m.to.z])
    const margin = settings.toolDiameter + 2
    const top = Math.max(0, ...zs)
    stock = xs.length === 0
      ? { width: 100, height: 100, depth: 20, radius: 0, x: 0, y: 0, topZ: 0, allowance: 0 }
      : { width: Math.max(...xs) - Math.min(...xs) + 2 * margin, height: Math.max(...ys) - Math.min(...ys) + 2 * margin, depth: Math.max(1, top - Math.min(...zs) + 5), radius: 0, x: (Math.max(...xs) + Math.min(...xs)) / 2, y: (Math.max(...ys) + Math.min(...ys)) / 2, topZ: top, allowance: 0 }
  }
  const base = input.kind === "lathe" && toolModel.family === "lathe" ? cam.viewer.latheSetupOf(settings, toolModel) : cam.viewer.setupOf(input.kind, settings, stock)
  const setup = cam.viewer.withRotary(base, analysis.program, input.gcode)
  const at = Math.min(timeline.duration, Math.max(0, input.at ?? timeline.duration))
  const pose = cam.viewer.poseAt(timeline, at)
  const millTurn = setup.kind === "lathe" && setup.turnMill !== undefined
  const tools = millTurn ? cam.viewer.turnMillToolModels(analysis.program, analysis.motion, input.gcode) : undefined
  const millingPaths = analysis.program.toolpaths.map((path, i) => {
    const model = input.tool !== undefined ? toolModel : tools?.get(path.toolId)
    return millTurn && (model !== undefined ? model.family === "mill" || model.family === "probe" : cam.viewer.turnMillPathIsMilling(analysis.program, i))
  })
  const activePath = pose.move?.path ?? 0
  if (input.tool === undefined) toolModel = tools?.get(analysis.program.toolpaths[activePath]?.toolId ?? "") ?? toolModel
  const sense = pose.state === undefined || pose.state.spindle === "off" ? 0 : cam.viewer.spinSense(input.kind, pose.state.spindle)
  const findings = cam.viewer.checkSetup(setup, timeline, cam.toolEnvelope(toolModel))
  const { axes, rotary } = cam.viewer.displayAxes(setup)
  const out: Record<string, unknown> = {
    ok: true,
    machine: input.kind,
    turns: cam.KINEMATICS[input.kind].rotates,
    axes: axes.map((a) => ({ name: a.name, display: a.direction, moves: a.moves, positive: a.positive })),
    ...(rotary !== undefined ? { rotary: rotary.name } : {}),
    setup: { ...setup, assumedParts: setup.assumed },
    // What this tool cannot do for the operation named in params (spec 32 §4.2): the same findings the panel and preview show.
    tool: { model: toolModel, description: cam.describeTool(toolModel), ...(rest["operationType"] !== undefined ? { operation: cam.operationKey(settings), issues: cam.settingsToolIssues(settings, toolModel) } : {}) },
    ...(setup.kind === "mill" && setup.rotary !== undefined ? { rotary: { ...setup.rotary, toolAxisAtPose: cam.viewer.toolAxisInPart(cam.viewer.poseAt(timeline, Math.min(timeline.duration, Math.max(0, input.at ?? timeline.duration))).angles, setup.rotary) } } : {}),
    setupProblems: cam.viewer.validateMachineSetup(setup),
    duration: round(timeline.duration),
    moves: timeline.moves.length,
    pose: {
      seconds: round(at),
      program: point(pose.point),
      preview: point(cam.viewer.displayPoint(setup, pose.point, pose.state?.xMode)),
      ...(pose.state !== undefined ? { spindle: pose.state.spindle, rpm: Math.round(pose.state.rpm), plane: `G${pose.state.plane}`, xMode: pose.state.xMode, extrude: round(pose.state.extrude), ...(pose.state.line !== undefined ? { line: pose.state.line } : {}), ...(pose.state.tool !== undefined ? { tool: pose.state.tool } : {}) } : {}),
      rotation: millTurn && millingPaths[activePath] ? "C positions the workpiece; the B head carries the milling spindle (spindle mode inferred)"
        : sense === 0 ? "nothing turns" : cam.viewer.spinSenseText(input.kind, pose.state!.spindle as "cw" | "ccw"),
      angles: pose.angles,
      displaySpin: round(millTurn ? cam.viewer.turnMillChuckAngleAt(timeline, millingPaths, cam.viewer.turnMillChuckTrack(timeline, millingPaths, true), at)
        : cam.viewer.spinAngleAt(timeline, input.kind, cam.viewer.spinTable(timeline, input.kind), at))
    },
    findings: findings.slice(0, 20).map((f) => ({ code: f.code, severity: f.severity, assumed: f.assumed, ...(f.line !== undefined ? { line: f.line } : {}), count: f.count, message: f.message })),
    unsupported: analysis.motion.unsupported.slice(0, 20)
  }
  if (setup.kind === "lathe") {
    const runs = cam.viewer.profileRuns(cam.viewer.turnedProfileAt(setup, timeline, at, millTurn ? new Set(millingPaths.flatMap((yes, i) => yes ? [i] : [])) : undefined), 0.01)
    if (setup.turnMill !== undefined) {
      const head = cam.viewer.turnMillDisplayPose(setup, pose.point, pose.angles, "machine", pose.state?.xMode)
      out["millTurn"] = {
        axesAt: { X: round(pose.point.x), Y: round(pose.point.y), Z: round(pose.point.z), B: round(pose.angles.b ?? 0), C: round(pose.angles.c ?? 0) },
        milling: millingPaths[activePath] ?? false, tip: point(head.tip), toolAxis: point(head.axis),
        chuckAngle: round(head.chuckAngle), limits: cam.viewer.turnMillLimitFindings(setup, timeline),
        note: "Assumed B-head/C-spindle geometry; positioned-C milling removal and full-machine collision are not certified."
      }
    }
    out["turnedPart"] = {
      note: `${setup.noseRadius > 0 ? `insert nose radius ${setup.noseRadius} mm (shoulders rounded by it)` : "point tool (nose radius 0)"}; Z of the program, diameters`,
      sections: runs.slice(0, 60).map((r) => ({ zFrom: round(r.x0), zTo: round(r.x1), diameter: round(2 * r.outer), bore: round(2 * r.inner) })),
      ...(runs.length > 60 ? { more: runs.length - 60 } : {})
    }
  }
  if (setup.kind === "3dprinter") {
    const deposits = cam.viewer.printerDeposits(timeline, setup.layerHeight)
    const laid = cam.viewer.depositedAt(deposits, timeline, at)
    out["print"] = {
      layers: deposits.layers.length,
      ...(deposits.layers.length > 0 ? { firstZ: round(deposits.layers[0]!), lastZ: round(deposits.layers[deposits.layers.length - 1]!) } : {}),
      beads: deposits.beads.length,
      depositedBeads: laid.length,
      currentLayer: laid.length > 0 ? laid[laid.length - 1]!.layer + 1 : 0,
      filament: round(timeline.moves.reduce((sum, m) => sum + Math.max(0, m.state.extrude), 0)),
      travelMoves: deposits.travels.length
    }
  }
  // What the simulation player shows (spec 32 P3, P5, P7): the operations on the clock, what the moves are for, the machine
  // drawn round a mill with its axis values at `at` and its limits, and the collisions on the same timeline.
  const classes = cam.viewer.classifyMoves(timeline, { kind: input.kind, ...(setup.kind === "mill" ? { stockTop: setup.stock.max.z } : {}), cycleLines: cam.viewer.cycleLinesOf(input.gcode) })
  out["operations"] = cam.viewer.operationSpans(timeline).map((s) => {
    const path = analysis.program.toolpaths[s.path]
    return { name: path?.name ?? `#${s.path + 1}`, toolId: path?.toolId ?? "", from: round(s.start), to: round(s.end) }
  })
  out["moveClasses"] = cam.viewer.moveClassSummary(timeline, classes).map((c) => ({ kind: c.kind, count: c.count, length: round(c.length), seconds: round(c.seconds) }))
  if (setup.kind === "mill") {
    const preset = typeof machinePreset === "string" && cam.viewer.MACHINE_PRESETS.some((p) => p.id === machinePreset) ? machinePreset as cam.viewer.MachinePresetId : undefined
    const travel = typeof machineTravel === "object" && machineTravel !== null ? machineTravel as { x: number; y: number; z: number } : undefined
    const model = cam.viewer.machineModelOf(setup, { ...(preset !== undefined ? { preset } : {}), ...(travel !== undefined ? { travel } : {}) })
    const gauge = (toolModel.family === "mill" || toolModel.family === "probe") ? cam.toolProfile(toolModel.family === "mill" ? { ...toolModel, holder: toolModel.holder ?? cam.assumedHolderOf(toolModel) } : toolModel).length : 60
    if (model !== undefined) {
      const pose = cam.viewer.machinePose(model, cam.viewer.poseAt(timeline, at).point, cam.viewer.poseAt(timeline, at).angles, setup.rotary, gauge, "machine")
      out["machineModel"] = {
        preset: model.preset, name: model.name, ...(model.layout !== undefined ? { layout: model.layout } : {}), tableCarries: model.tableCarries,
        travel: model.travel, rotaryLimits: model.rotaryLimits, assumed: model.assumed,
        axesAt: Object.fromEntries(Object.entries(pose.joints).map(([k, v]) => [k.toUpperCase(), round(v as number)])),
        limits: cam.viewer.checkLimits(model, timeline, setup.rotary, () => gauge).map((f) => ({ code: f.code, severity: f.severity, ...(f.line !== undefined ? { line: f.line } : {}), count: f.count, message: f.message }))
      }
    }
    out["collisions"] = cam.viewer.checkCollisions({ setup, timeline, reachOf: () => cam.viewer.toolReachOf(toolModel), clearance: 2, ...(setup.rotary === undefined ? { live: { toolOf: () => toolModel } } : {}), ...(model !== undefined ? { model, gaugeOf: () => gauge } : {}), ...(setup.rotary !== undefined ? { rotary: setup.rotary } : {}) })
      .slice(0, 20).map((e) => ({ code: e.code, severity: e.severity, seconds: round(e.seconds), ...(e.line !== undefined ? { line: e.line } : {}), count: e.count, message: e.message }))
  }
  return out
}
