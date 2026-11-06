/**
 * The assistant's probing handlers (spec 73 §3.3), over the same `Probing` service as the HTTP group so both refuse the same things.
 * `probeOperation` stores a planned cycle with its program, `probeRun` simulates it and keeps the report, `probeApply` writes a report
 * (or named rows) into the machine's work offsets or its rotary calibration. Stale work is refused, never quietly used: a probe
 * measures one revision of the drawing, and an offset written from another would move the part by the wrong amount.
 */
import { CamRotaryCalibrationResult, PROBE_FORMAT, type CamProbeApplyInput, type CamProbeCalibration, type CamProbeInput, type CamProbeRunInput, type CamProbingDialect, type CamProbingSettingsInput, type ProbeReportDocument } from "@cadcamfun/api"
import type { ToolHandlersShape } from "@cadcamfun/ai"
import { cam } from "@cadcamfun/core"
import { Effect, Schema } from "effect"
import type { ToolpathRepo } from "../repos/toolpath-repo.ts"
import type { MachineConfigRepo } from "../repos/machine-config-repo.ts"
import { drawingRevision } from "./cam-program.ts"
import type { Element } from "./ai-elements.ts"
import type { CurrentTurn } from "./acting-user.ts"
import type { LiveEvents } from "./live-events.ts"
import { probeProgressReporter, probeResultFrame } from "./probe-progress.ts"
import type { Probing } from "./probing.ts"

type Loaded = { readonly id: string; readonly projectId: string; readonly data: Record<string, unknown>; readonly elements: Element[]; readonly created: boolean }

export interface AiProbingDeps {
  readonly probing: typeof Probing.Service
  readonly toolpaths: typeof ToolpathRepo.Service
  readonly machines: typeof MachineConfigRepo.Service
  readonly events: typeof LiveEvents.Service
  readonly actorId: () => string
  readonly load: (projectId: string, write?: boolean) => Promise<Loaded>
  readonly run: <A, E>(effect: Effect.Effect<A, E, CurrentTurn>) => Promise<A>
  readonly audit: (projectId: string, action: string, details: Record<string, unknown>) => Promise<void>
  readonly refused: (projectId: string) => Promise<unknown>
}

const record = (value: unknown): Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}

/** A spindle start outside a comment: a probe is a sensor, and turning it on would break the stylus. */
const startsSpindle = (nc: string): boolean => nc.split("\n").some((line) => /(^|[^A-Z0-9#])M0?[34](?![0-9])/.test(line.replace(/\([^)]*\)/g, "").replace(/;.*$/, "").toUpperCase()))

/** Which offset axes each cycle's results move, by the result of the same letter; a cycle not listed moves no offset. */
const FOLLOW: Readonly<Partial<Record<cam.probing.ProbeCycleKind, Partial<Record<cam.probing.OffsetAxis, string>>>>> = {
  "z-surface": { Z: "z" }, edge: { X: "x", Y: "y" }, corner: { X: "x", Y: "y" }, web: { X: "x", Y: "y" }, pocket: { X: "x", Y: "y" }, rectangle: { X: "x", Y: "y" },
  bore: { X: "x", Y: "y" }, boss: { X: "x", Y: "y" }, plane: { Z: "z" }, sphere: { X: "x", Y: "y", Z: "z" }
}

const OFFSET_FIELD: Readonly<Record<string, "x" | "y" | "z" | "a" | "b" | "c" | "rotation">> = { X: "x", Y: "y", Z: "z", A: "a", B: "b", C: "c", R: "rotation" }

type OffsetRow = { x: number; y: number; z: number; a?: number; b?: number; c?: number; rotation?: number }

const DIALECTS = ["generic", "fanuc", "grbl", "linuxcnc", "haas", "siemens", "heidenhain", "okuma", "mazak", "mitsubishi", "brother"] as const

export const makeAiProbing = (deps: AiProbingDeps) => {
  const { probing, toolpaths, machines, events, actorId, load, run, audit, refused } = deps
  /** A service failure as the answer the model reads: the reason, with `status: "conflict"` for a lost race. */
  const attempt = <A, E extends { readonly _tag: string; readonly message: string }>(effect: Effect.Effect<A, E, CurrentTurn>) =>
    run(effect.pipe(
      Effect.map((value) => ({ ok: true as const, value })),
      Effect.catch((error: E) => Effect.succeed({ ok: false as const, error: error.message, ...(error._tag === "Conflict" ? { status: "conflict" } : {}) }))
    ))
  const storedOperation = async (operationId: string, loaded: Loaded) => {
    const found = await run(toolpaths.find(actorId(), operationId))
    if (!found || found.row.drawingId !== loaded.id || found.project.id !== loaded.projectId) return undefined
    return record(found.row.data)["format"] === PROBE_FORMAT ? found.row : undefined
  }
  const dialectOf = async (input: CamProbeInput): Promise<typeof CamProbingDialect.Type> => {
    if (input.dialect !== undefined) return input.dialect
    if (input.machineConfig === undefined) return "fanuc"
    const found = await run(machines.find(actorId(), input.machineConfig))
    if (!found?.permission.hasAccess) return "fanuc"
    const profile = cam.kernel.profileOfConfig(found.row.config, found.row.type)
    const post = profile.post ?? cam.kernel.postOfController(profile.controller)
    return DIALECTS.includes(post) && post !== "generic" ? post : "fanuc"
  }
  const actionsOf = (cycle: cam.probing.ProbeCycle, input: CamProbeInput): ReadonlyArray<cam.probing.ProbeAction> | string => {
    if (input.workOffset === undefined) return []
    const ref = cam.probing.parseOffsetRef(input.workOffset)
    if (ref === undefined) return `'${input.workOffset}' is not a work offset`
    const axes = FOLLOW[cycle.kind]
    if (axes === undefined) return `A ${cycle.kind} cycle moves no work offset: leave workOffset out.`
    const mode = input.update ?? "set"
    const banded = mode === "update-within-tolerance" || mode === "alarm-outside-tolerance"
    if (banded && input.tolerance === undefined) return `The update mode ${mode} needs a tolerance.`
    return [{ kind: "set-offset", ref, axes, policy: { mode, ...(banded ? { tolerance: input.tolerance! } : {}) } }]
  }

  const probeOperation: NonNullable<ToolHandlersShape["probeOperation"]> = async (projectId, input) => {
    { const denied = await refused(projectId); if (denied) return denied }
    const loaded = await load(projectId, true)
    const revision = drawingRevision(loaded)
    if (input.expectedRevision !== undefined && input.expectedRevision !== revision) return { ok: false, status: "stale", error: "The drawing changed since it was read. Read cam plan_check or cad describe again." }
    if (input.feature !== undefined && input.operation !== undefined) return { ok: false, error: "Send feature or operation, not both." }
    const previous = input.operationId !== undefined ? await storedOperation(input.operationId, loaded) : undefined
    if (input.operationId !== undefined && previous === undefined) return { ok: false, error: "Probe operation not found in the active drawing." }
    const stored = record(previous?.data)
    if (input.feature === undefined && input.operation === undefined && stored["operation"] === undefined) return { ok: false, error: "Send feature (an element of the drawing) or operation (a cycle)." }
    const operation = input.operation ?? (input.feature === undefined && stored["operation"] !== undefined ? Schema.decodeUnknownSync(cam.kernel.ProbeCycleSchema)(stored["operation"]) : undefined)
    const elements = loaded.elements.filter((e) => e.type !== "workpiece") as unknown as ReadonlyArray<Record<string, Schema.Json>>
    if (input.feature !== undefined && elements.length === 0) return { ok: false, error: "The drawing has no elements to probe." }
    const settings: CamProbingSettingsInput = {
      ...input.settings,
      ...(input.workOffset !== undefined ? { workOffset: input.workOffset } : {}),
      ...(input.machineConfig !== undefined ? { machineConfig: input.machineConfig } : {})
    }
    const user = actorId()
    const dialect = await dialectOf(input)
    const request = {
      settings, ...(input.frame !== undefined ? { frame: input.frame } : {}), ...(input.checks !== undefined ? { checks: input.checks } : {}), ...(input.native === true ? { native: true } : {}),
      ...(input.feature !== undefined ? { feature: { ...input.feature, elements } } : { operation: operation! })
    }
    const planned = await attempt(probing.plan.plan(user, request))
    if (!planned.ok) return planned
    const cycle = planned.value.operation as cam.probing.ProbeCycle
    const chosenBecause = planned.value.chosenBecause
    const actions = actionsOf(cycle, input)
    if (typeof actions === "string") return { ok: false, error: actions }
    const written = await attempt(probing.plan.emit(user, {
      operation: cycle, settings, dialect, ...(input.frame !== undefined ? { frame: input.frame } : {}), ...(input.checks !== undefined ? { checks: input.checks } : {}),
      ...(actions.length > 0 ? { actions } : {}), ...(input.native === true ? { native: true } : {})
    }))
    if (!written.ok) return written
    const nc = written.value.nc
    const native = written.value.native
    const warnings = [...planned.value.warnings, ...written.value.warnings]
    if (startsSpindle(nc)) return { ok: false, error: "The written probing program starts the spindle: it was not stored. A probe must never turn under power." }
    const programHash = cam.kernel.sha256(nc)
    const data = {
      format: PROBE_FORMAT, operation: Schema.encodeSync(cam.kernel.ProbeCycleSchema)(cycle), dialect, sourceRevision: revision, identity: { nc: programHash },
      ...(native !== undefined ? { native } : {}),
      ...(input.checks !== undefined && input.checks.length > 0 ? { checks: Schema.encodeSync(Schema.Array(cam.kernel.CharacteristicSchema))(input.checks) } : {}),
      ...(actions.length > 0 ? { actions: Schema.encodeSync(Schema.Array(cam.kernel.ProbeActionSchema))(actions) } : {}),
      ...(Object.keys(settings).length > 0 ? { settings: Object.fromEntries(Object.entries(settings).filter(([key]) => key !== "machineConfig")) } : {}),
      ...(input.frame !== undefined ? { frame: input.frame } : {})
    }
    const name = `Probe ${cycle.kind}`
    const row = previous !== undefined
      ? await run(toolpaths.update(previous.id, { name, data, gcode: nc, ...(input.machineConfig !== undefined ? { machineConfigId: input.machineConfig } : {}) }))
      : await run(toolpaths.create(user, {
        name, description: "Probe operation by the nikcli CAD/CAM agent", projectId: loaded.projectId, drawingId: loaded.id, type: "mill", operationType: "probing", gcode: nc, data,
        ...(input.machineConfig !== undefined ? { machineConfigId: input.machineConfig } : {})
      }))
    await audit(loaded.projectId, "ai.cam.probe_saved", { drawingId: loaded.id, operationId: row.id, cycle: cycle.kind, dialect, nc: programHash })
    return {
      ok: true, operationId: row.id, cycle: cycle.kind, programHash, lines: nc.split("\n").length, dialect, revision, warnings,
      ...(chosenBecause !== undefined ? { chosenBecause } : {}), drawingId: loaded.id, projectId: loaded.projectId,
      // The control's own cycle is written, not expanded: the replay reads the inline touches, so the program itself stays unproven.
      ...(native !== undefined ? { native, claims: { probing: "unresolved" } } : {})
    }
  }

  /** The calibration a report holds: the job record of its operation, or the fit of a run against a table off its pivot. */
  const calibrationOf = (doc: ProbeReportDocument): CamProbeCalibration | undefined => {
    const data = record(doc.data)
    const operations = Array.isArray(data["operations"]) ? data["operations"] as ReadonlyArray<{ calibration?: CamProbeCalibration }> : []
    return operations.find((op) => op.calibration !== undefined)?.calibration ?? data["calibration"] as CamProbeCalibration | undefined
  }

  const answerOf = (doc: ProbeReportDocument, operationId: string) => {
    const data = record(doc.data)
    const checks = Array.isArray(data["checks"]) ? data["checks"].length : 0
    const updates = Array.isArray(data["updates"]) ? data["updates"] as ReadonlyArray<Record<string, unknown>> : []
    return {
      ok: doc.verdict === "pass" || doc.verdict === "warn", reportId: doc.id, operationId, kind: doc.kind, verdict: doc.verdict, checks,
      failed: typeof data["failed"] === "number" ? data["failed"] : 0, offsetsUpdated: updates.length > 0,
      ...(typeof data["maxDeviationMm"] === "number" ? { maxDeviationMm: data["maxDeviationMm"] } : {}),
      ...(updates.length > 0 ? { updates } : {}),
      ...(Array.isArray(data["checks"]) && checks > 0 ? { results: data["checks"] } : {}),
      ...(calibrationOf(doc) !== undefined ? { calibration: calibrationOf(doc) } : {})
    }
  }

  const probeRun: NonNullable<ToolHandlersShape["probeRun"]> = async (projectId, input) => {
    { const denied = await refused(projectId); if (denied) return denied }
    const loaded = await load(projectId, true)
    const row = await storedOperation(input.operationId, loaded)
    if (row === undefined) return { ok: false, error: "Probe operation not found in the active drawing." }
    const data = record(row.data)
    if (data["sourceRevision"] !== drawingRevision(loaded)) return { ok: false, status: "stale", error: "The drawing changed since this probe operation was planned. Store it again with cam_edit probe." }
    const user = actorId()
    const machineConfig = input.machineConfig ?? row.machineConfigId ?? undefined
    const report = input.runId === undefined ? undefined : probeProgressReporter({ publish: events.publish }, projectId, input.runId)
    const cycle = record(data["operation"])
    let doc: ProbeReportDocument
    // A job operation measures the table as the control believes it; a table off its pivot is simulated by the calibration route.
    if (cycle["kind"] === "rotary-axis" && input.calibrationError !== undefined) {
      const sphere = cycle["sphere"] as cam.probing.ProbeCycle & { centre: { x: number; y: number; z: number }; diameter: number }
      const error = input.calibrationError
      const run_ = await attempt(probing.plan.calibrateRotary(user, {
        axis: cycle["axis"] as "A" | "B" | "C", sphere, angles: cycle["angles"] as ReadonlyArray<number>,
        settings: { ...record(data["settings"]) as CamProbingSettingsInput, ...(machineConfig !== undefined ? { machineConfig } : {}) }, ...(error !== undefined ? { truth: error } : {})
      }, report))
      if (!run_.ok) return run_
      const measured: CamRotaryCalibrationResult = run_.value
      const saved = await attempt(probing.reports.save(user, projectId, {
        name: row.name, kind: "rotary", source: "simulated", verdict: measured.calibration === undefined ? "incomplete" : "pass",
        data: {
          verdict: measured.calibration === undefined ? "incomplete" : "pass", failed: 0, checks: [], updates: [], axis: measured.axis, centres: measured.centres, notes: measured.notes,
          ...(measured.calibration !== undefined ? { calibration: { kind: "rotary", axis: measured.axis, centres: measured.centres, angles: cycle["angles"], rotary: measured.calibration } } : { calibration: { kind: "refused", reason: measured.refused ?? "the centres do not make a circle" } })
        }, toolpathId: row.id, drawingId: loaded.id,
        ...(machineConfig !== undefined ? { machineConfigId: machineConfig } : {}), ...(input.runId !== undefined ? { runId: input.runId } : {}),
        ...(row.gcode ? { programHash: cam.kernel.sha256(row.gcode) } : {}), ...(typeof data["sourceRevision"] === "string" ? { sourceRevision: data["sourceRevision"] } : {})
      }))
      if (!saved.ok) return saved
      doc = saved.value
    } else {
      const saved = await attempt(probing.reports.run(user, projectId, {
        operationId: input.operationId, ...(machineConfig !== undefined ? { machineConfig } : {}), ...(input.setupId !== undefined ? { setupId: input.setupId } : {}),
        ...(input.misplace !== undefined ? { misplacement: input.misplace } : {}), ...(input.runId !== undefined ? { runId: input.runId } : {})
      }, report))
      if (!saved.ok) return saved
      doc = saved.value
    }
    report?.("done")
    if (input.runId !== undefined) await run(events.publish(probeResultFrame(projectId, input.runId, doc, input.operationId)))
    await audit(projectId, "ai.cam.probe_report", { operationId: input.operationId, reportId: doc.id, verdict: doc.verdict, kind: doc.kind })
    return answerOf(doc, input.operationId)
  }

  const probeApply: NonNullable<ToolHandlersShape["probeApply"]> = async (projectId, input) => {
    { const denied = await refused(projectId); if (denied) return denied }
    const loaded = await load(projectId, true)
    if ((input.reportId === undefined) === (input.entries === undefined)) return { ok: false, error: "Send reportId or entries, exactly one." }
    const user = actorId()
    let corrections: ReadonlyArray<{ offset: string; field: keyof OffsetRow; before?: number; after: number }> = []
    if (input.reportId !== undefined) {
      const report = await attempt(probing.reports.get(user, projectId, input.reportId))
      if (!report.ok) return report
      const doc = report.value
      if (doc.verdict === "fail" || doc.verdict === "missed" || doc.verdict === "incomplete") return { ok: false, error: `The report's verdict is ${doc.verdict}: a failed measurement is never written to the machine.` }
      if (doc.machineConfigId !== null && doc.machineConfigId !== input.machineConfig) return { ok: false, error: "The report was measured on another machine." }
      if (doc.machineConfigId === null && input.mode === "set") return { ok: false, error: "The report was measured without a machine, so its absolute values are not this machine's: use mode add." }
      const row = doc.toolpathId === null ? undefined : await storedOperation(doc.toolpathId, loaded)
      const stale = doc.sourceRevision !== drawingRevision(loaded) || row === undefined || (doc.programHash !== null && doc.programHash !== cam.kernel.sha256(row.gcode ?? ""))
      if (stale) return { ok: false, status: "stale", error: "The drawing or the probe program changed since this report: run cam_edit probe_run again." }
      const calibration = calibrationOf(doc)
      if (calibration?.kind === "refused") return { ok: false, error: `The run gave no calibration: ${calibration.reason}.` }
      if (calibration !== undefined) {
        if (input.setupId !== undefined) return { ok: false, error: "A calibration belongs to the machine, not to a setup: leave setupId out." }
        const base = input.baseUpdatedAt !== undefined ? { baseUpdatedAt: input.baseUpdatedAt } : {}
        const body = async (): Promise<Parameters<typeof probing.probeConfig.put>[2] | { ok: false; error: string }> => {
          if (calibration.kind === "rotary") {
            const fit = calibration.rotary
            return { rotaryCalibration: { pivotMeasured: fit.pivot, axisDirection: fit.axisDirection, axisError: Math.abs(fit.axisTilt), rms: fit.rms, at: doc.measuredAt }, ...base }
          }
          const held = await attempt(probing.probeConfig.get(user, input.machineConfig))
          if (!held.ok) return held
          const { ballDiameter: _ball, artefact: _artefact, ...stylus } = calibration.stylus
          return { probing: { ...held.value.probing, calibration: { ...stylus, calibratedAt: doc.measuredAt } }, ...base }
        }
        const write = await body()
        if ("ok" in write) return write
        const saved = await attempt(probing.probeConfig.put(user, input.machineConfig, write))
        if (!saved.ok) return saved
        await audit(projectId, calibration.kind === "rotary" ? "ai.cam.rotary_calibration_applied" : "ai.cam.stylus_calibration_applied", { machineConfigId: input.machineConfig, reportId: doc.id })
        return { ok: true, machineConfigId: input.machineConfig, updatedAt: saved.value.updatedAt, applied: [`${calibration.kind} calibration`] }
      }
      const updates = record(doc.data)["updates"]
      if (!Array.isArray(updates) || updates.length === 0) return { ok: false, error: "The report moved no offset: nothing to apply." }
      corrections = (updates as ReadonlyArray<{ offset: string; axis: string; before: number; after: number }>).flatMap((u) => {
        const field = OFFSET_FIELD[u.axis]
        return field === undefined ? [] : [{ offset: u.offset, field, before: u.before, after: u.after }]
      })
    } else {
      corrections = input.entries!.flatMap((e) => (["x", "y", "z", "a", "b", "c", "rotation"] as const).flatMap((field) => e[field] === undefined ? [] : [{ offset: e.offset, field, after: e[field]! }]))
    }
    const current = await attempt(probing.workOffsets.get(user, input.machineConfig, input.setupId))
    if (!current.ok) return current
    const entries: Record<string, OffsetRow> = Object.fromEntries(Object.entries(current.value.entries).map(([key, row]) => [key, { ...row }]))
    for (const c of corrections) {
      const row = entries[c.offset] ?? (entries[c.offset] = { x: 0, y: 0, z: 0 })
      row[c.field] = input.mode === "set" ? c.after : (row[c.field] ?? 0) + (c.before !== undefined ? c.after - c.before : c.after)
    }
    const saved = await attempt(probing.workOffsets.put(user, input.machineConfig, { entries, setupId: input.setupId, baseUpdatedAt: input.baseUpdatedAt ?? current.value.updatedAt }, user))
    if (!saved.ok) return saved
    const applied = [...new Set(corrections.map((c) => c.offset))]
    await audit(projectId, "ai.cam.work_offsets_set", { machineConfigId: input.machineConfig, setupId: input.setupId ?? null, mode: input.mode, offsets: applied, ...(input.reportId !== undefined ? { reportId: input.reportId } : {}) })
    return { ok: true, machineConfigId: input.machineConfig, updatedAt: saved.value.updatedAt, applied, entries: saved.value.entries, ...(input.setupId !== undefined ? { setupId: input.setupId } : {}) }
  }

  /** `cam review` of a stored probe operation: the verdict of its latest report, stale when the drawing or the program moved on. */
  const reviewProbe = async (loaded: Loaded, row: { readonly id: string; readonly gcode: string | null; readonly data: unknown }) => {
    const data = record(row.data)
    const revision = drawingRevision(loaded)
    const programHash = cam.kernel.sha256(row.gcode ?? "")
    const base = { operationId: row.id, drawingId: loaded.id, revision, verifiedRevision: data["sourceRevision"] ?? null, identity: { nc: programHash } }
    const planStale = data["sourceRevision"] !== revision || record(data["identity"])["nc"] !== programHash
    if (planStale) return { ok: false, status: "stale", ...base, note: "The drawing or the program changed since this probe operation was planned: store it again with cam_edit probe." }
    const latest = await run(probing.reports.latest(actorId(), loaded.projectId, row.id).pipe(Effect.catch(() => Effect.succeed(undefined))))
    if (latest === undefined) return { ok: false, status: "unverified", ...base, note: "No probe report yet: run cam_edit probe_run." }
    if (latest.sourceRevision !== revision || (latest.programHash !== null && latest.programHash !== programHash)) return { ok: false, status: "stale", ...base, reportId: latest.id, verdict: latest.verdict, note: "The latest report measured an older revision: run cam_edit probe_run again." }
    return { ok: latest.verdict === "pass" || latest.verdict === "warn", status: latest.verdict === "pass" || latest.verdict === "warn" ? "pass" : "failed", ...base, reportId: latest.id, verdict: latest.verdict, measuredAt: latest.measuredAt, note: "A simulated report measures the modelled part and machine, not the shop floor." }
  }

  return { probeOperation, probeRun, probeApply, reviewProbe }
}
