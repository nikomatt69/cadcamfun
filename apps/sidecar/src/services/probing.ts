import { BadRequest, Conflict, WORK_OFFSET_ROWS_MAX, Forbidden, InternalError, NotFound, type CamProbeReportData, type CamProbingEmitRequest, CamProbingFrame, type CamProbingPlan, type CamProbingPlanRequest, type CamProbingProgram, type CamProbingSettings, CamProbingSettingsInput, type CamProbingSimulation, type CamProbingSimulateRequest, type CamRotaryCalibrationRequest, type CamRotaryCalibrationResult, type MachineProbeConfigBody, type MachineProbeConfigDocument, type ProbeReportDocument, type ProbeReportRunBody, type ProbeReportSaveBody, type ProbeReportSummary, type WorkOffsetTableDocument } from "@cadcamfun/api"
import { camProbePlan, runKernelJobEffect, type CamProbeCalibrateInput, type CamProbePlanInput, type CamProbeRefusal, type CamProbeSimulateInput } from "@cadcamfun/ai"
import { cam } from "@cadcamfun/core"
import { Context, Effect, Layer, Schema } from "effect"
import { DrawingRepo } from "../repos/drawing-repo.ts"
import { MachineConfigRepo } from "../repos/machine-config-repo.ts"
import { ProbeReportRepo } from "../repos/probe-report-repo.ts"
import { ProjectRepo } from "../repos/project-repo.ts"
import { ToolpathRepo } from "../repos/toolpath-repo.ts"
import { WorkOffsetStore, type OffsetEntries, type StoreRefusal } from "../repos/work-offset-store.ts"
import { elementsOf } from "./ai-elements.ts"
import { explainKernelFailure } from "./kernel-errors.ts"
import type { ProbeRunProgress } from "./probe-progress.ts"

export type ProbingError = BadRequest | Forbidden | NotFound | Conflict | InternalError
/** A read of machine state: never a conflict. */
type ReadError = BadRequest | Forbidden | NotFound | InternalError
/** A project read or removal: access is "not found", never forbidden. */
type ProjectError = BadRequest | NotFound | InternalError

/** Default and ceiling of a report list page. */
const LIST_DEFAULT = 50
const LIST_MAX = 200

function refusal(r: StoreRefusal): BadRequest | Forbidden | NotFound | Conflict {
  return r.refused === "invalid" ? new BadRequest({ message: r.message }) : r.refused === "not-found" ? new NotFound({ message: r.message }) : r.refused === "forbidden" ? new Forbidden({ message: r.message }) : new Conflict({ message: r.message })
}

/** A read never races: a conflict there would be a store bug, reported as a server fault. */
const readRefusal = (r: StoreRefusal): Forbidden | NotFound | InternalError =>
  r.refused === "conflict" || r.refused === "invalid" ? new InternalError({ message: r.message }) : refusal(r) as Forbidden | NotFound

const dbFault = (message: string) => (cause: unknown) =>
  Effect.logError(message, cause).pipe(Effect.andThen(Effect.fail(new InternalError({ message }))))

const DEG = Math.PI / 180
const recordOf = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}

/** The setup a request plans with, resolved (spec 73 §3.2): the request's settings over the machine's probe over the core defaults. */
interface ResolvedSetup {
  readonly settings: cam.probing.ProbeSettings
  readonly device?: cam.probing.ProbeDevice
  readonly setter?: cam.probing.ToolSetter
  /** Machine position of the active work zero, from the machine's table: where a machine-coordinate tool setter is from the part. */
  readonly workOrigin?: cam.probing.OffsetEntry
  readonly frame?: cam.WorkFrame
  /** What the named machine's configuration says its rotary table is (the calibration's default `assumed`). */
  readonly assumed?: cam.probing.RotaryAssumption
  /** How the machine calls its own cycles. */
  readonly macroStyle?: cam.probing.MacroStyle
}

const setupInput = (setup: ResolvedSetup) => ({
  settings: setup.settings,
  ...(setup.device !== undefined ? { device: setup.device } : {}),
  ...(setup.setter !== undefined ? { setter: setup.setter } : {}),
  ...(setup.workOrigin !== undefined ? { workOrigin: { x: setup.workOrigin.x, y: setup.workOrigin.y, z: setup.workOrigin.z } } : {}),
  ...(setup.frame !== undefined ? { frame: setup.frame } : {})
})

/** The settings a plan was made with, on the wire: the offset as its key, `orientSpindle` in degrees. */
const settingsWire = (s: cam.probing.ProbeSettings): CamProbingSettings => ({
  stylusDiameter: s.stylusDiameter, feed: s.feed, fastFeed: s.fastFeed, positioningFeed: s.positioningFeed, search: s.search,
  clearance: s.clearance, safeZ: s.safeZ, overtravel: s.overtravel, backoff: s.backoff, doubleTouch: s.doubleTouch,
  workOffset: cam.probing.formatOffsetRef(s.workOffset),
  ...(s.toolNumber !== undefined ? { toolNumber: s.toolNumber } : {}),
  ...(s.effectiveRadius !== undefined ? { effectiveRadius: s.effectiveRadius } : {}),
  ...(s.orientSpindle !== undefined ? { orientSpindle: s.orientSpindle / DEG } : {})
})

/** A kernel refusal is the caller's to fix (400), or names an element that is not there (404). */
const refusalError = (r: CamProbeRefusal): BadRequest | NotFound => r.status === 404 ? new NotFound({ message: r.error }) : new BadRequest({ message: r.error })

/** The cycle a stored probe operation carries, decoded from its row data (wire degrees), or why it cannot be simulated. */
const storedCycleOf = (data: unknown): {
  readonly cycle: cam.probing.ProbeCycle; readonly checks?: ReadonlyArray<cam.probing.Characteristic>; readonly actions?: ReadonlyArray<cam.probing.ProbeAction>
  readonly settings?: CamProbingSettingsInput; readonly frame?: CamProbingFrame; readonly sourceRevision?: string
} | string => {
  const record = recordOf(data)
  const wire = record["operation"] ?? record["cycle"]
  if (wire === undefined) return "The stored probe operation carries no cycle to simulate (its data holds no operation or cycle)."
  try {
    const cycle = Schema.decodeUnknownSync(cam.kernel.ProbeCycleSchema)(wire)
    const checks = record["checks"] === undefined ? undefined : Schema.decodeUnknownSync(Schema.Array(cam.kernel.CharacteristicSchema))(record["checks"])
    const actions = record["actions"] === undefined ? undefined : Schema.decodeUnknownSync(Schema.Array(cam.kernel.ProbeActionSchema))(record["actions"])
    const settings = record["settings"] === undefined ? undefined : Schema.decodeUnknownSync(CamProbingSettingsInput)(record["settings"])
    const frame = record["frame"] === undefined ? undefined : Schema.decodeUnknownSync(CamProbingFrame)(record["frame"])
    const sourceRevision = record["sourceRevision"]
    return {
      cycle, ...(checks !== undefined && checks.length > 0 ? { checks } : {}), ...(actions !== undefined && actions.length > 0 ? { actions } : {}),
      ...(settings !== undefined ? { settings } : {}), ...(frame !== undefined ? { frame } : {}), ...(typeof sourceRevision === "string" ? { sourceRevision } : {})
    }
  } catch {
    return "The stored probe operation does not read as a probe cycle."
  }
}

/**
 * Probing, work offsets and inspection reports (spec 73 §3.2): one service the HTTP group and the assistant's `cam_edit` probe
 * actions share, so both refuse the same things with the same reasons. Work offsets and the probe configuration are machine
 * state (`WorkOffsetStore`); reports are project state (`ProbeReportRepo`) and need access to the project.
 */
export class Probing extends Context.Service<Probing, {
  readonly plan: {
    /** A cycle planned (and its moves written): an explicit cycle runs inline, a feature resolves in a kernel job. */
    plan(userId: string, payload: CamProbingPlanRequest): Effect.Effect<CamProbingPlan, ReadError>
    emit(userId: string, payload: CamProbingEmitRequest): Effect.Effect<CamProbingProgram, ReadError>
    simulate(userId: string, payload: CamProbingSimulateRequest, report?: (progress: ProbeRunProgress) => void): Effect.Effect<CamProbingSimulation, ReadError>
    calibrateRotary(userId: string, payload: CamRotaryCalibrationRequest, report?: (progress: ProbeRunProgress) => void): Effect.Effect<CamRotaryCalibrationResult, ReadError>
  }
  readonly workOffsets: {
    get(userId: string, machineConfigId: string, setupId?: string | undefined): Effect.Effect<WorkOffsetTableDocument, ReadError>
    put(userId: string, machineConfigId: string, input: { entries: OffsetEntries; setupId?: string | undefined; baseUpdatedAt?: string | undefined }, by?: string): Effect.Effect<WorkOffsetTableDocument, ProbingError>
  }
  readonly probeConfig: {
    get(userId: string, machineConfigId: string): Effect.Effect<MachineProbeConfigDocument, ReadError>
    put(userId: string, machineConfigId: string, input: MachineProbeConfigBody, by?: string): Effect.Effect<MachineProbeConfigDocument, ProbingError>
  }
  readonly reports: {
    list(userId: string, projectId: string, query: { operationId?: string | undefined; limit?: string | undefined; before?: string | undefined }): Effect.Effect<ReadonlyArray<ProbeReportSummary>, ProjectError>
    get(userId: string, projectId: string, reportId: string): Effect.Effect<ProbeReportDocument, ProjectError>
    /** The latest report of a probe operation, if any (the verdict `cam review` and the panel show). */
    latest(userId: string, projectId: string, toolpathId: string): Effect.Effect<ProbeReportDocument | undefined, ProjectError>
    /** Simulates a stored probe operation (a `Toolpath` row) against its drawing and keeps the report. */
    run(userId: string, projectId: string, body: ProbeReportRunBody, report?: (progress: ProbeRunProgress) => void): Effect.Effect<ProbeReportDocument, ProjectError | Forbidden>
    save(userId: string, projectId: string, body: ProbeReportSaveBody): Effect.Effect<ProbeReportDocument, ProjectError | Forbidden>
    remove(userId: string, projectId: string, reportId: string): Effect.Effect<void, ProjectError>
  }
}>()("cadcamfun/Probing") {
  static readonly layer = Layer.effect(Probing, Effect.gen(function*() {
    const store = yield* WorkOffsetStore
    const reports = yield* ProbeReportRepo
    const projects = yield* ProjectRepo
    const machines = yield* MachineConfigRepo
    const toolpaths = yield* ToolpathRepo
    const drawings = yield* DrawingRepo
    const projectAccess = Effect.fn("Probing.projectAccess")(function*(userId: string, projectId: string) {
      const found = yield* projects.find(userId, projectId).pipe(Effect.catchTag("DatabaseError", dbFault("Failed to read the project")))
      if (!found) return yield* new NotFound({ message: "Project not found or access denied" })
    })
    /** Request settings over the named machine's probe over the core defaults; the tilted frame's angles arrive in degrees. */
    const resolveSetup = Effect.fn("Probing.resolveSetup")(function*(userId: string, input: CamProbingSettingsInput | undefined, frameInput: CamProbingFrame | undefined) {
      const machineId = input?.machineConfig
      let profile: Parameters<typeof cam.probing.settingsFromMachine>[0] = undefined
      let setter: cam.probing.ToolSetter | undefined
      let assumed: cam.probing.RotaryAssumption | undefined
      if (machineId !== undefined) {
        const found = yield* machines.find(userId, machineId).pipe(Effect.catchTag("DatabaseError", dbFault("Failed to read the machine configuration")))
        if (!found) return yield* new NotFound({ message: "Machine configuration not found" })
        if (!found.permission.hasAccess) return yield* new Forbidden({ message: "You do not have permission to access this machine configuration" })
        const view = yield* store.getProbeConfig(userId, machineId).pipe(Effect.catchTag("DatabaseError", dbFault("Failed to read the probe configuration")))
        if ("refused" in view) return yield* readRefusal(view)
        profile = { ...(view.probing !== null ? { probing: view.probing } : {}), ...(view.toolSetter !== null ? { toolSetter: view.toolSetter } : {}) }
        setter = view.toolSetter ?? undefined
        const rotary = recordOf(recordOf(found.row.config)["rotary"])
        const layout = rotary["layout"]
        const pivot = recordOf(rotary["pivot"] ?? recordOf(rotary["calibration"])["pivotMeasured"])
        if ((layout === "table-AC" || layout === "table-BC") && typeof pivot.x === "number" && typeof pivot.y === "number" && typeof pivot.z === "number") {
          assumed = { layout, pivot: { x: pivot.x, y: pivot.y, z: pivot.z } }
        }
      }
      const overrides: { -readonly [K in keyof cam.probing.ProbeSettings]?: cam.probing.ProbeSettings[K] } = {}
      if (input !== undefined) {
        if (input.stylusDiameter !== undefined) overrides.stylusDiameter = input.stylusDiameter
        if (input.feed !== undefined) overrides.feed = input.feed
        if (input.fastFeed !== undefined) overrides.fastFeed = input.fastFeed
        if (input.positioningFeed !== undefined) overrides.positioningFeed = input.positioningFeed
        if (input.search !== undefined) overrides.search = input.search
        if (input.clearance !== undefined) overrides.clearance = input.clearance
        if (input.safeZ !== undefined) overrides.safeZ = input.safeZ
        if (input.overtravel !== undefined) overrides.overtravel = input.overtravel
        if (input.backoff !== undefined) overrides.backoff = input.backoff
        if (input.doubleTouch !== undefined) overrides.doubleTouch = input.doubleTouch
        if (input.toolNumber !== undefined) overrides.toolNumber = input.toolNumber
        if (input.effectiveRadius !== undefined) overrides.effectiveRadius = input.effectiveRadius
        if (input.orientSpindle !== undefined) overrides.orientSpindle = input.orientSpindle * DEG
        if (input.workOffset !== undefined) {
          const ref = cam.probing.parseOffsetRef(input.workOffset)
          if (ref === undefined) return yield* new BadRequest({ message: `'${input.workOffset}' is not a work offset` })
          overrides.workOffset = ref
        }
      }
      const settings = cam.probing.settingsFromMachine(profile, overrides)
      let workOrigin: cam.probing.OffsetEntry | undefined
      if (machineId !== undefined) {
        const table = yield* store.get(userId, machineId).pipe(Effect.catchTag("DatabaseError", dbFault("Failed to read the work offsets")))
        if (!("refused" in table)) workOrigin = table.entries[cam.probing.formatOffsetRef(settings.workOffset)]
      }
      const device = profile === undefined ? undefined : cam.probing.probeDeviceOfProfile(profile)
      const frame = frameInput === undefined ? undefined : cam.probing.workFrameOfAngles({
        ...(frameInput.a !== undefined ? { a: frameInput.a * DEG } : {}),
        ...(frameInput.b !== undefined ? { b: frameInput.b * DEG } : {}),
        ...(frameInput.c !== undefined ? { c: frameInput.c * DEG } : {})
      })
      const macroStyle = (profile as { probing?: cam.kernel.MachineProbing } | undefined)?.probing?.macroStyle
      return { settings, ...(macroStyle !== undefined ? { macroStyle } : {}), ...(device !== undefined ? { device } : {}), ...(setter !== undefined ? { setter } : {}), ...(workOrigin !== undefined ? { workOrigin } : {}), ...(frame !== undefined ? { frame } : {}), ...(assumed !== undefined ? { assumed } : {}) } satisfies ResolvedSetup
    })
    /** The kernel input of a plan or emit request: the cycle as given, or the feature an element resolves to. */
    const planInputOf = (setup: ResolvedSetup, payload: CamProbingPlanRequest | CamProbingEmitRequest): CamProbePlanInput => ({
      ...setupInput(setup),
      ...(payload.operation !== undefined ? { cycle: payload.operation } : {}),
      ...(payload.feature !== undefined ? { feature: { elements: payload.feature.elements, elementId: payload.feature.elementId, ...(payload.feature.ref !== undefined ? { ref: payload.feature.ref } : {}), ...(payload.feature.hint !== undefined ? { hint: payload.feature.hint } : {}) } } : {}),
      ...(payload.checks !== undefined ? { checks: payload.checks } : {}),
      ...(payload.actions !== undefined ? { actions: payload.actions } : {}),
      ...(payload.native === true ? { native: true } : {}),
      ...(payload.macroStyle ?? setup.macroStyle) !== undefined ? { macroStyle: (payload.macroStyle ?? setup.macroStyle)! } : {},
      ...(payload.assumed ?? setup.assumed) !== undefined ? { assumed: (payload.assumed ?? setup.assumed)! } : {}
    })
    return Probing.of({
      plan: {
        plan: Effect.fn("Probing.plan.plan")(function*(userId, payload) {
          const setup = yield* resolveSetup(userId, payload.settings, payload.frame)
          const input = planInputOf(setup, payload)
          // An explicit cycle is cheap and runs inline; resolving a feature reads the element's exact solid, in a worker.
          const out = payload.feature !== undefined
            ? yield* runKernelJobEffect("cam-probe-plan", input).pipe(Effect.catch(explainKernelFailure("Failed to plan the probing")))
            : camProbePlan(input)
          if ("error" in out) return yield* refusalError(out)
          return {
            operation: out.cycle, cycle: out.cycle.kind, ...(out.chosenBecause !== undefined ? { chosenBecause: out.chosenBecause } : {}),
            settings: settingsWire(out.settings), steps: out.steps, moves: out.moves, checks: out.checks, nominal: out.nominal, ...(out.native !== undefined ? { native: out.native } : {}), notes: out.notes, warnings: out.warnings
          }
        }),
        emit: Effect.fn("Probing.plan.emit")(function*(userId, payload) {
          const setup = yield* resolveSetup(userId, payload.settings, payload.frame)
          const input: CamProbePlanInput = {
            ...planInputOf(setup, payload), dialect: payload.dialect,
            ...(payload.options !== undefined ? { options: { ...(payload.options.orientSpindle !== undefined ? { orientSpindle: payload.options.orientSpindle } : {}), ...(payload.options.programNumber !== undefined ? { programNumber: payload.options.programNumber } : {}), ...(payload.options.lineNumbers !== undefined ? { lineNumbers: payload.options.lineNumbers } : {}) } } : {})
          }
          const out = payload.feature !== undefined
            ? yield* runKernelJobEffect("cam-probe-plan", input).pipe(Effect.catch(explainKernelFailure("Failed to write the probing program")))
            : camProbePlan(input)
          if ("error" in out) return yield* refusalError(out)
          if (out.program === undefined) return yield* new InternalError({ message: "Failed to write the probing program" })
          return { dialect: payload.dialect, nc: out.program.nc, identity: out.program.identity, lines: out.program.lines, ...(out.native !== undefined ? { native: out.native } : {}), steps: out.steps, notes: out.notes, warnings: out.warnings }
        }),
        simulate: Effect.fn("Probing.plan.simulate")(function*(userId, payload, report) {
          const setup = yield* resolveSetup(userId, payload.settings, payload.frame)
          const m = payload.misplacement
          const input: CamProbeSimulateInput = {
            ...setupInput(setup), elements: payload.elements,
            operations: payload.operations.map((op) => ({ cycle: op.operation, ...(op.id !== undefined ? { id: op.id } : {}), ...(op.checks !== undefined ? { checks: op.checks } : {}), ...(op.actions !== undefined ? { actions: op.actions } : {}) })),
            ...(payload.workOffsets !== undefined ? { workOffsets: Object.fromEntries(Object.entries(payload.workOffsets).map(([k, e]) => [k, cam.probing.offsetEntryFromWire(e)])) } : {}),
            ...(m !== undefined ? { misplacement: { ...(m.x !== undefined ? { x: m.x } : {}), ...(m.y !== undefined ? { y: m.y } : {}), ...(m.z !== undefined ? { z: m.z } : {}), ...(m.a !== undefined ? { a: m.a * DEG } : {}), ...(m.b !== undefined ? { b: m.b * DEG } : {}), ...(m.c !== undefined ? { c: m.c * DEG } : {}) } } : {})
          }
          const assumed = payload.assumed ?? setup.assumed
          const placed: CamProbeSimulateInput = {
            ...input,
            ...(payload.dialect !== undefined ? { dialect: payload.dialect } : {}),
            ...(payload.post !== undefined ? { post: payload.post as NonNullable<CamProbeSimulateInput["post"]> } : {}),
            ...(payload.options !== undefined ? { options: payload.options } : {}),
            ...(payload.partOrigin !== undefined ? { partOrigin: payload.partOrigin } : {}),
            ...(payload.stockElement !== undefined ? { stockElement: payload.stockElement } : {}),
            ...(assumed !== undefined ? { assumed } : {})
          }
          const out = yield* runKernelJobEffect("cam-probe-simulate", placed, report !== undefined ? { onProgress: report } : {}).pipe(Effect.catch(explainKernelFailure("Failed to simulate the probing")))
          if ("error" in out) return yield* refusalError(out)
          return {
            ...(out.program !== undefined ? { program: out.program } : {}),
            ...(out.played !== undefined ? { played: out.played } : {}),
            warnings: out.warnings,
            report: cam.probing.probeReportToWire(out.report) as CamProbeReportData,
            offsetTable: Object.fromEntries(Object.entries(out.offsetTable).map(([k, e]) => [k, cam.probing.offsetEntryToWire(e)])),
            identity: out.identity
          }
        }),
        calibrateRotary: Effect.fn("Probing.plan.calibrateRotary")(function*(userId, payload, report) {
          const setup = yield* resolveSetup(userId, payload.settings, undefined)
          const assumed = payload.assumed ?? setup.assumed
          if (assumed === undefined) return yield* new BadRequest({ message: "Send what the control believes about the table (assumed), or name a machine configuration with a rotary table." })
          const input: CamProbeCalibrateInput = {
            ...setupInput(setup), axis: payload.axis, sphere: payload.sphere, angles: payload.angles.map((a) => a * DEG), assumed,
            ...(payload.truth !== undefined ? { truth: { ...(payload.truth.pivot !== undefined ? { pivot: payload.truth.pivot } : {}), ...(payload.truth.tilt !== undefined ? { tilt: payload.truth.tilt * DEG } : {}) } } : {}),
            ...(payload.measured !== undefined ? { measured: payload.measured } : {}),
            ...(payload.dialect !== undefined ? { dialect: payload.dialect } : {})
          }
          const out = yield* runKernelJobEffect("cam-probe-calibrate", input, report !== undefined ? { onProgress: report } : {}).pipe(Effect.catch(explainKernelFailure("Failed to calibrate the rotary axis")))
          if ("error" in out) return yield* refusalError(out)
          return {
            axis: out.axis, centres: out.centres,
            ...(out.calibration !== undefined ? { calibration: { pivot: out.calibration.pivot, axisDirection: out.calibration.axisDirection, pivotError: out.calibration.pivotError, axisTilt: out.calibration.axisTilt / DEG, radius: out.calibration.radius, rms: out.calibration.rms } } : {}),
            ...(out.refused !== undefined ? { refused: out.refused } : {}),
            ...(out.nc !== undefined ? { nc: out.nc } : {}),
            notes: out.notes
          }
        })
      },
      workOffsets: {
        get: Effect.fn("Probing.workOffsets.get")(function*(userId, id, setupId) {
          const view = yield* store.get(userId, id, setupId).pipe(Effect.catchTag("DatabaseError", dbFault("Failed to read the work offsets")))
          return "refused" in view ? yield* readRefusal(view) : view
        }),
        put: Effect.fn("Probing.workOffsets.put")(function*(userId, id, input, by) {
          // Keys must be the canonical spelling of an offset the core can address (`G54`, `G54.1 P3`, `G505`, `G59.1`, `preset 4`).
          const problems = cam.probing.tableProblems({ entries: input.entries })
          if (problems.length > 0) return yield* new BadRequest({ message: problems.slice(0, 5).join("; ") })
          if (Object.keys(input.entries).length > WORK_OFFSET_ROWS_MAX) return yield* new BadRequest({ message: `At most ${WORK_OFFSET_ROWS_MAX} work offsets` })
          const view = yield* store.put(userId, id, input, by).pipe(Effect.catchTag("DatabaseError", dbFault("Failed to save the work offsets")))
          return "refused" in view ? yield* refusal(view) : view
        })
      },
      probeConfig: {
        get: Effect.fn("Probing.probeConfig.get")(function*(userId, id) {
          const view = yield* store.getProbeConfig(userId, id).pipe(Effect.catchTag("DatabaseError", dbFault("Failed to read the probe configuration")))
          return "refused" in view ? yield* readRefusal(view) : view
        }),
        put: Effect.fn("Probing.probeConfig.put")(function*(userId, id, input, by) {
          if (input.probing === undefined && input.toolSetter === undefined && input.rotaryCalibration === undefined) {
            return yield* new BadRequest({ message: "No probe configuration fields provided" })
          }
          const view = yield* store.putProbeConfig(userId, id, input, by).pipe(Effect.catchTag("DatabaseError", dbFault("Failed to save the probe configuration")))
          return "refused" in view ? yield* refusal(view) : view
        })
      },
      reports: {
        list: Effect.fn("Probing.reports.list")(function*(userId, projectId, query) {
          yield* projectAccess(userId, projectId)
          const limit = query.limit === undefined ? LIST_DEFAULT : Number(query.limit)
          if (!Number.isInteger(limit) || limit < 1 || limit > LIST_MAX) return yield* new BadRequest({ message: `limit must be an integer from 1 to ${LIST_MAX}` })
          if (query.before !== undefined && Number.isNaN(Date.parse(query.before))) return yield* new BadRequest({ message: "before must be an ISO timestamp" })
          return yield* reports.list(projectId, { toolpathId: query.operationId, limit, before: query.before }).pipe(Effect.catchTag("DatabaseError", dbFault("Failed to list the probe reports")))
        }),
        get: Effect.fn("Probing.reports.get")(function*(userId, projectId, reportId) {
          yield* projectAccess(userId, projectId)
          const found = yield* reports.get(projectId, reportId).pipe(Effect.catchTag("DatabaseError", dbFault("Failed to read the probe report")))
          if (!found) return yield* new NotFound({ message: "Probe report not found" })
          return found
        }),
        latest: Effect.fn("Probing.reports.latest")(function*(userId, projectId, toolpathId) {
          yield* projectAccess(userId, projectId)
          return yield* reports.latestFor(projectId, toolpathId).pipe(Effect.catchTag("DatabaseError", dbFault("Failed to read the probe report")))
        }),
        run: Effect.fn("Probing.reports.run")(function*(userId, projectId, body, report) {
          yield* projectAccess(userId, projectId)
          const found = yield* toolpaths.find(userId, body.operationId).pipe(Effect.catchTag("DatabaseError", dbFault("Failed to read the probe operation")))
          if (!found || found.project.id !== projectId) return yield* new NotFound({ message: "Probe operation not found" })
          const row = found.row
          const stored = storedCycleOf(row.data)
          if (typeof stored === "string") return yield* new BadRequest({ message: stored })
          if (row.drawingId === null) return yield* new BadRequest({ message: "The stored probe operation has no drawing to simulate against" })
          const drawing = yield* drawings.find(userId, row.drawingId).pipe(Effect.catchTag("DatabaseError", dbFault("Failed to read the drawing")))
          if (!drawing) return yield* new NotFound({ message: "Drawing not found" })
          const elements = elementsOf(drawing.data) as unknown as ReadonlyArray<Record<string, unknown>>
          if (elements.length === 0) return yield* new BadRequest({ message: "The drawing of the stored probe operation carries no elements to simulate against" })
          const machineId = body.machineConfig ?? row.machineConfigId ?? undefined
          // The figures the operation was planned with, on the machine it runs on now.
          const setup = yield* resolveSetup(userId, machineId !== undefined ? { ...stored.settings, machineConfig: machineId } : stored.settings, stored.frame)
          // The offsets the control holds before the run are the machine's table (of the setup, when one is named).
          let workOffsets: Record<string, cam.probing.OffsetEntry> | undefined
          if (machineId !== undefined) {
            const view = yield* store.get(userId, machineId, body.setupId).pipe(Effect.catchTag("DatabaseError", dbFault("Failed to read the work offsets")))
            if (!("refused" in view)) workOffsets = Object.fromEntries(Object.entries(view.entries).map(([k, e]) => [k, cam.probing.offsetEntryFromWire(e)]))
          }
          const m = body.misplacement
          const input: CamProbeSimulateInput = {
            ...setupInput(setup), elements,
            operations: [{ id: body.operationId, cycle: stored.cycle, ...(stored.checks !== undefined ? { checks: stored.checks } : {}), ...(stored.actions !== undefined ? { actions: stored.actions } : {}) }],
            // A calibration artefact stands in the cycle's own coordinates, not on the part: the run is not shifted by the work offset.
            ...(workOffsets !== undefined && stored.cycle.kind !== "rotary-axis" && stored.cycle.kind !== "stylus-calibrate" ? { workOffsets } : {}),
            ...(setup.assumed !== undefined ? { assumed: setup.assumed } : {}),
            // Contacts and offset changes get the line of their block in the program the operation stored.
            ...(cam.kernel.POST_IDS.find((id) => id === recordOf(row.data)["dialect"]) !== undefined ? { dialect: recordOf(row.data)["dialect"] as cam.PostId } : {}),
            ...(m !== undefined ? { misplacement: { ...(m.x !== undefined ? { x: m.x } : {}), ...(m.y !== undefined ? { y: m.y } : {}), ...(m.z !== undefined ? { z: m.z } : {}), ...(m.a !== undefined ? { a: m.a * DEG } : {}), ...(m.b !== undefined ? { b: m.b * DEG } : {}), ...(m.c !== undefined ? { c: m.c * DEG } : {}) } } : {})
          }
          const out = yield* runKernelJobEffect("cam-probe-simulate", input, report !== undefined ? { onProgress: report } : {}).pipe(Effect.catch(explainKernelFailure("Failed to run the probe operation")))
          if ("error" in out) return yield* refusalError(out)
          const wire = cam.probing.probeReportToWire(out.report) as CamProbeReportData
          const saved = yield* reports.create(projectId, userId, {
            name: row.name, kind: stored.cycle.kind === "rotary-axis" ? "rotary" : stored.cycle.kind === "stylus-calibrate" ? "stylus" : stored.cycle.kind.startsWith("tool-") || stored.cycle.kind === "broken-tool" ? "tool-setter" : "part", source: "simulated", verdict: wire.verdict, data: wire,
            toolpathId: body.operationId, drawingId: row.drawingId, machineConfigId: machineId ?? null, setupId: body.setupId ?? null, runId: body.runId ?? null,
            workOffset: cam.probing.formatOffsetRef(setup.settings.workOffset),
            // What makes the report stale: the program and the drawing revision it measured.
            ...(row.gcode ? { programHash: cam.kernel.sha256(row.gcode) } : {}),
            ...(stored.sourceRevision !== undefined ? { sourceRevision: stored.sourceRevision } : {})
          }).pipe(Effect.catchTag("DatabaseError", dbFault("Failed to save the probe report")))
          if ("refused" in saved) return yield* new BadRequest({ message: saved.refused })
          return saved
        }),
        save: Effect.fn("Probing.reports.save")(function*(userId, projectId, body) {
          yield* projectAccess(userId, projectId)
          if (body.measuredAt !== undefined && Number.isNaN(Date.parse(body.measuredAt))) return yield* new BadRequest({ message: "measuredAt must be an ISO timestamp" })
          if (body.machineConfigId) {
            const machine = yield* machines.find(userId, body.machineConfigId).pipe(Effect.catchTag("DatabaseError", dbFault("Failed to read the machine configuration")))
            if (!machine) return yield* new NotFound({ message: "Machine configuration not found" })
            if (!machine.permission.hasAccess) return yield* new Forbidden({ message: "You do not have permission to access this machine configuration" })
          }
          const saved = yield* reports.create(projectId, userId, {
            name: body.name.trim(), kind: body.kind, source: body.source, verdict: body.verdict, data: body.data,
            toolpathId: body.toolpathId, drawingId: body.drawingId, machineConfigId: body.machineConfigId, setupId: body.setupId, runId: body.runId,
            workOffset: body.workOffset, programHash: body.programHash, sourceRevision: body.sourceRevision,
            measuredAt: body.measuredAt !== undefined ? new Date(body.measuredAt) : undefined
          }).pipe(Effect.catchTag("DatabaseError", dbFault("Failed to save the probe report")))
          if ("refused" in saved) return yield* new BadRequest({ message: saved.refused })
          return saved
        }),
        remove: Effect.fn("Probing.reports.remove")(function*(userId, projectId, reportId) {
          yield* projectAccess(userId, projectId)
          const removed = yield* reports.remove(projectId, reportId).pipe(Effect.catchTag("DatabaseError", dbFault("Failed to delete the probe report")))
          if (!removed) return yield* new NotFound({ message: "Probe report not found" })
        })
      }
    })
  }))
}
