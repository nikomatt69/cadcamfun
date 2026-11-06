/**
 * The probing panel's controller (spec 73 §4): everything the Probing tab changes outside itself. Cycles are toolpaths in the
 * multi-toolpath store, offsets and reports go through the `ProbingService`, the program and the simulation through the program
 * service. `createProbingController` takes its dependencies as values, so a test drives it with a fake service; `useProbing` binds it
 * to the app, the CAD elements and the stores.
 */
import { cam } from "@cadcamfun/core"
import type { Effect, Schema } from "effect"
import { useApp } from "../../../shared/state/context.ts"
import type { ProbingDefaults } from "../../../shared/state/settings.ts"
import { t } from "../../../i18n/index.ts"
import { toast } from "../../../shared/ui/toast.tsx"
import { useCADStore } from "../../cad/store/cadStore.ts"
import { useDocumentStore } from "../../cad/store/documentStore.ts"
import { makeProbingStoreService, type ProbingService } from "../api/probing.ts"
import { makeToolpathGenerator } from "../api/generator.ts"
import { POST_TARGETS } from "../components/AdvancedPostProcessorPanel.tsx"
import type { ProbingController } from "../components/probing/ProbingTab.tsx"
import type { DialectOption } from "../components/probing/ProbeProgramPreview.tsx"
import { stockOf, type CadElement } from "../lib/job.ts"
import type { PaletteEntry } from "../lib/probing/cycle-palette.data.ts"
import { isProbeToolpath } from "../lib/probing/cycles.ts"
import { loadOffsets, saveOffsets } from "../lib/probing/offset-sync.ts"
import { defaultChecks, defaultOperation, followOf, movesOffset, planLocal, type ProbeOperation } from "../lib/probing/operation.ts"
import { profileOfMachine } from "../lib/probing/machine.ts"
import { stockElementOf } from "../lib/probing/part-solids.ts"
import { applyTarget, targetAt, targetsOf, workOriginOf, type ProbeTarget } from "../lib/probing/probe-targets.ts"
import { reportData, resultOfReport } from "../lib/probing/report-data.ts"
import { useInspectionStore } from "../store/inspectionStore.ts"
import { useMultiToolpathStore } from "../store/multiToolpathStore.ts"
import { entriesOfRows } from "../lib/probing/work-offsets.ts"
import { fingerprintOf } from "../lib/probing/result.ts"
import { requestOf, resultOfCalibration, resultOfSimulation } from "../lib/probing/simulation.ts"
import { useProbingStore } from "../store/probingStore.ts"
import { useCamStore } from "../store/camStore.ts"
import { useSetupStore } from "../store/setupStore.ts"
import { useWorkOffsetStore } from "../store/workOffsetStore.ts"
import { useJob } from "./useJob.ts"

type Run = <A, E>(effect: Effect.Effect<A, E>) => Promise<A>

/** The program-side calls of one cycle, over the `camProbing` routes (`createProbingProgram`). */
export interface ProbingProgramService {
  generate(id: string, operation: ProbeOperation, dialect: string): Promise<void>
  simulate(id: string, operation: ProbeOperation, dialect: string): Promise<void>
}

/** Parses a program for the 3D view; a program that cannot be parsed still shows as text. */
type ParseProgram = (nc: string) => Promise<{ readonly program: cam.Program; readonly motion?: cam.viewer.MotionTrack | undefined } | undefined>

const newRunId = (): string => globalThis.crypto.randomUUID()

/** Write program and Simulate of the panel: the sidecar plans and writes, the results land in the probing store. */
export const createProbingProgram = (deps: Pick<ControllerDeps, "run" | "service" | "machine" | "defaults" | "elements" | "stock" | "projectId"> & { readonly parse: ParseProgram }): ProbingProgramService => {
  const probing = useProbingStore
  const context = () => {
    const machine = deps.machine()
    const stored = machine !== null && cam.kernel.findMachine(machine.id) === undefined
    return { profile: profileOfMachine(machine), defaults: deps.defaults(), ...(stored ? { machineConfig: machine.id } : {}) }
  }
  const calls = () => {
    if (deps.service.program === undefined) throw new Error(t("cam.probing.program.unavailable"))
    return deps.service.program
  }
  /** A program for the panel: parsed for the 3D view, which plays exactly this text (the run's lines are lines of it). */
  const keep = async (id: string, operation: ProbeOperation, dialect: string, written: { nc: string; lines: number; notes: ReadonlyArray<string>; warnings: ReadonlyArray<string>; hash?: string; native?: string; played?: { text: string; lines: ReadonlyArray<number> } }) => {
    const parsed = await deps.parse(written.played?.text ?? written.nc).catch(() => undefined)
    probing.getState().setProgram({ operationId: id, dialect, fingerprint: fingerprintOf(operation), ...written, ...(parsed !== undefined ? { parsed } : {}) })
  }
  return {
    generate: async (id, operation, dialect) => {
      const service = calls()
      const request = requestOf(operation, { ...context(), dialect })
      if ("refused" in request) throw new Error(request.refused)
      const out = await deps.run(service.emit({ ...request, dialect: dialect as never }))
      await keep(id, operation, dialect, { nc: out.nc, lines: out.lines, notes: out.notes, warnings: out.warnings, hash: out.identity.nc, ...(out.native !== undefined ? { native: out.native } : {}) })
    },
    simulate: async (id, operation, dialect) => {
      const service = calls()
      const ctx = context()
      const project = deps.projectId()
      const runId = newRunId()
      const progress = project !== null ? { progress: { projectId: project, runId } } : {}
      const m = probing.getState().misplacement
      const request = requestOf(operation, { ...ctx, dialect })
      if ("refused" in request) throw new Error(request.refused)
      const { operation: cycle, settings, frame, actions, checks, assumed } = request
      // A job operation measures the table the control believes in; the offset fields simulate one that is really elsewhere.
      if (cycle.kind === "rotary-axis" && (m.x !== 0 || m.y !== 0 || m.z !== 0)) {
        const out = await deps.run(service.calibrateRotary({ axis: cycle.axis, sphere: cycle.sphere, angles: cycle.angles.map((a) => a * 180 / Math.PI), settings, truth: { pivot: m }, ...(assumed !== undefined ? { assumed } : {}), ...progress }))
        probing.getState().setResult(resultOfCalibration(out, { operationId: id, operation }))
        return
      }
      const planned = planLocal(operation, { profile: ctx.profile, defaults: ctx.defaults })
      const stock = deps.stock()
      const origin = workOriginOf(stock)
      const stockElement = stockElementOf(stock)
      const drawn = deps.elements() as unknown as ReadonlyArray<Record<string, Schema.Json>>
      const elements = drawn.length > 0 ? drawn : stockElement !== undefined ? [stockElement] : []
      if (elements.length === 0) throw new Error(t("cam.probing.program.noPart"))
      const table = useWorkOffsetStore.getState()
      const workOffsets = table.machineConfigId !== undefined && table.rows.length > 0 ? entriesOfRows(table.rows, "machine") : undefined
      const sim = await deps.run(service.simulate({
        elements, settings, operations: [{ id, operation: cycle, ...(actions !== undefined ? { actions } : {}), ...(checks !== undefined ? { checks } : {}) }],
        ...(frame !== undefined ? { frame } : {}), ...(workOffsets !== undefined ? { workOffsets } : {}), ...(assumed !== undefined ? { assumed } : {}),
        dialect: dialect as never, misplacement: { x: m.x, y: m.y, z: m.z, c: m.c }, partOrigin: origin, ...(stockElement !== undefined ? { stockElement } : {}), ...progress
      }))
      // The report's lines are lines of this text: the 3D view must play it, not a program written earlier.
      if (sim.program !== undefined) await keep(id, operation, dialect, { nc: sim.program.nc, lines: sim.program.lines, notes: [], warnings: sim.warnings ?? [], hash: sim.program.identity.nc, ...(sim.played !== undefined ? { played: sim.played } : {}) })
      probing.getState().setResult(resultOfSimulation(sim, {
        operationId: id, operation, expected: planned.ok ? planned.routine.contacts : [], runId, ...(sim.program !== undefined ? { programHash: sim.program.identity.nc } : {})
      }))
      // The contacts are real but no program came with them: the panel says why, or the 3D view would just stay empty.
      if (sim.program === undefined) probing.getState().setError((sim.warnings ?? []).join("; ") || t("cam.probing.program.noProgram"))
      // A run the control stopped measured nothing: its alarm is the reason, and the panel must say it.
      const alarms = sim.report.operations.flatMap((o) => [...o.alarms.map((a) => a.text), ...(o.stopped !== undefined ? [o.stopped] : [])])
      if (alarms.length > 0) probing.getState().setError(t("cam.probing.program.stopped", { reason: [...new Set(alarms)].join("; ") }))
    }
  }
}

export interface ControllerDeps {
  readonly run: Run
  readonly service: ProbingService
  /** The program calls; absent while the sidecar routes are not wired (the buttons then say so). */
  readonly program?: ProbingProgramService | undefined
  readonly machine: () => { readonly id: string; readonly name: string; readonly type?: string | undefined; readonly config: object } | null
  readonly defaults: () => ProbingDefaults
  readonly elements: () => ReadonlyArray<CadElement>
  readonly stock: () => { readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly depth?: number; readonly topZ: number }
  readonly setups: () => ReadonlyArray<{ readonly id: string; readonly name: string }>
  readonly projectId: () => string | null
  readonly insert: (nc: string) => void
  /** A calibration reached the machine: the selected machine's config follows, so the next cycle plans with it. */
  readonly onMachineProbing?: ((config: { readonly probing: unknown; readonly rotaryCalibration: unknown }) => void) | undefined
}

const messageOf = (cause: unknown): string => (cause instanceof Error ? cause.message : typeof cause === "object" && cause !== null && "message" in cause ? String((cause as { message: unknown }).message) : String(cause))

const dialectOptions = (post: string | undefined): ReadonlyArray<DialectOption> => {
  const options = POST_TARGETS.map((target) => ({ id: target.id as string, label: target.label }))
  return post !== undefined && !options.some((o) => o.id === post) ? [...options, { id: post, label: post }] : options
}

export const createProbingController = (deps: ControllerDeps): ProbingController => {
  const multi = useMultiToolpathStore
  const probing = useProbingStore
  const profile = () => profileOfMachine(deps.machine())
  const nameFor = (entry: PaletteEntry): string => {
    const base = t(entry.label)
    const used = multi.getState().toolpaths.filter(isProbeToolpath).filter((tp) => tp.probe.name.startsWith(base)).length
    return used === 0 ? base : `${base} ${used + 1}`
  }
  const operationOf = (id: string): ProbeOperation | undefined => multi.getState().getToolpathById(id)?.probe
  const fail = (cause: unknown) => { probing.getState().setError(messageOf(cause)); probing.getState().setBusy(undefined) }

  const controller: ProbingController = {
    profile,
    machine: () => {
      const m = deps.machine()
      return m === null ? undefined : { id: m.id, name: m.name, stored: cam.kernel.findMachine(m.id) === undefined }
    },
    defaults: deps.defaults,
    targets: () => {
      const stock = deps.stock()
      return targetsOf(deps.elements(), { origin: workOriginOf(stock), stock })
    },
    setups: deps.setups,
    dialects: () => dialectOptions(profile()?.post),

    add: (entry) => {
      const base = defaultOperation(entry.kind, deps.defaults(), { name: nameFor(entry), ...(entry.preset === "inspect" ? { inspect: true } : {}) })
      const planned = planLocal(base, { profile: profile(), defaults: deps.defaults() })
      const operation = entry.preset === "inspect" && planned.ok ? { ...base, checks: defaultChecks(planned.routine, base.tolerance) } : base
      const id = multi.getState().addProbeCycle(operation)
      probing.getState().select(id)
      probing.getState().setError(undefined)
      if (!probing.getState().open.cycles) probing.getState().toggleSection("cycles")
    },
    update: (id, patch) => multi.getState().updateProbeCycle(id, patch),
    remove: (id) => { multi.getState().removeToolpath(id); probing.getState().forget(id) },
    duplicate: (id) => { const copy = multi.getState().duplicateProbeCycle(id); if (copy !== undefined) probing.getState().select(copy) },
    move: (id, direction) => { if (direction < 0) multi.getState().moveToolpathUp(id); else multi.getState().moveToolpathDown(id) },
    toggleVisible: (id) => multi.getState().toggleToolpathVisibility(id),
    pick: () => {
      const next = !probing.getState().picking
      probing.getState().setPicking(next)
      if (next) { probing.getState().setShowIn3d(true); useCamStore.getState().setActiveTab("toolpath") }
    },
    pickHit: (hit) => {
      const id = probing.getState().selectedId
      probing.getState().setLastPick(hit)
      if (id === undefined) return
      const stock = deps.stock()
      const target = targetAt(hit, targetsOf(deps.elements(), { origin: workOriginOf(stock), stock }))
      if (target === undefined) { probing.getState().setError(t("cam.probing.pick.none")); return }
      probing.getState().setError(undefined)
      probing.getState().setPicking(false)
      controller.applyTarget(id, target)
    },
    applyTarget: (id, target: ProbeTarget) => {
      const current = operationOf(id)
      if (current === undefined) return
      const cycle = applyTarget(current.cycle, target)
      const kindChanged = cycle.kind !== current.cycle.kind
      multi.getState().updateProbeCycle(id, {
        cycle, ...(kindChanged ? { follow: followOf(cycle.kind), checks: [], ...(movesOffset(cycle.kind) ? {} : { updateMode: "report" as const }) } : {})
      })
    },

    generate: async (id) => {
      const operation = operationOf(id)
      if (operation === undefined) return
      if (deps.program === undefined) { probing.getState().setError(t("cam.probing.program.unavailable")); return }
      probing.getState().setError(undefined)
      probing.getState().setBusy("emit")
      try { await deps.program.generate(id, operation, probing.getState().dialect ?? profile()?.post ?? "fanuc"); probing.getState().setBusy(undefined) } catch (cause) { fail(cause) }
    },
    simulate: async (id) => {
      const operation = operationOf(id)
      if (operation === undefined) return
      if (deps.program === undefined) { probing.getState().setError(t("cam.probing.program.unavailable")); return }
      probing.getState().setError(undefined)
      probing.getState().setBusy("simulate")
      try { await deps.program.simulate(id, operation, probing.getState().dialect ?? profile()?.post ?? "fanuc"); probing.getState().setBusy(undefined) } catch (cause) { fail(cause) }
    },
    insert: (nc) => deps.insert(nc),

    loadOffsets: async (setupId) => {
      const machine = deps.machine()
      const p = profile()
      if (machine === null || p === undefined) return
      await loadOffsets(deps.service, deps.run, p, machine.id, setupId)
    },
    saveOffsets: async () => {
      const p = profile()
      if (p === undefined) return
      const saved = await saveOffsets(deps.service, deps.run, p)
      if (saved) toast.success(t("cam.probing.offsets.savedToast"))
    },
    applyMeasured: (id) => {
      const result = probing.getState().results[id]
      if (result !== undefined) useWorkOffsetStore.getState().applyUpdates(result.outcome.updates)
    },

    calibrationOf: (id) => {
      const result = probing.getState().results[id]
      return result === undefined || result.verdict === "fail" || result.verdict === "missed" || result.verdict === "incomplete" ? undefined : result.calibration
    },
    applyCalibration: async (id) => {
      const machine = deps.machine()
      const calibration = controller.calibrationOf(id)
      if (calibration === undefined || machine === null) return
      if (cam.kernel.findMachine(machine.id) !== undefined) { probing.getState().setError(t("cam.probing.calibration.storedOnly")); return }
      probing.getState().setBusy("save")
      probing.getState().setError(undefined)
      try {
        const current = await deps.run(deps.service.probeConfig.get(machine.id))
        const body = calibration.kind === "rotary"
          ? { rotaryCalibration: calibration.rotary, baseUpdatedAt: current.updatedAt }
          : { probing: { ...current.probing, calibration: calibration.stylus }, baseUpdatedAt: current.updatedAt }
        const saved = await deps.run(deps.service.probeConfig.put(machine.id, body))
        deps.onMachineProbing?.(saved)
        probing.getState().setBusy(undefined)
        toast.success(t("cam.probing.calibration.savedToast"))
      } catch (cause) { fail(cause) }
    },

    saveReport: async (id) => {
      const project = deps.projectId()
      const result = probing.getState().results[id]
      const operation = operationOf(id)
      if (result === undefined || operation === undefined) return
      if (project === null) { probing.getState().setError(t("cam.probing.inspection.noProject")); return }
      probing.getState().setBusy("save")
      try {
        const machine = deps.machine()
        const document = await deps.run(deps.service.reports.save(project, {
          name: operation.name, kind: operation.cycle.kind === "rotary-axis" ? "rotary" : operation.cycle.kind === "stylus-calibrate" ? "stylus" : operation.cycle.kind.startsWith("tool") || operation.cycle.kind === "broken-tool" ? "tool-setter" : "part",
          source: result.source, verdict: result.verdict, data: reportData(result), toolpathId: null, ...(machine !== null && cam.kernel.findMachine(machine.id) === undefined ? { machineConfigId: machine.id } : {}),
          ...(result.runId !== undefined ? { runId: result.runId } : {}), workOffset: operation.workOffset, ...(result.programHash !== undefined ? { programHash: result.programHash } : {}), measuredAt: result.measuredAt
        }))
        probing.getState().setResult({ ...result, reportId: document.id })
        const list = await deps.run(deps.service.reports.list(project, { limit: 50 }))
        useInspectionStore.getState().setHistory(list.map((r) => ({ id: r.id, name: r.name, kind: r.kind, verdict: r.verdict, toolpathId: r.toolpathId, workOffset: r.workOffset, measuredAt: r.measuredAt })))
        probing.getState().setBusy(undefined)
      } catch (cause) { fail(cause) }
    },
    openReport: async (id) => {
      const inspection = useInspectionStore.getState()
      if (id === undefined) { inspection.open(undefined); return }
      const project = deps.projectId()
      if (project === null) return
      try {
        const document = await deps.run(deps.service.reports.get(project, id))
        const read = resultOfReport({ ...document, source: document.source, verdict: document.verdict })
        if (read.ok) inspection.open(read.result)
        else probing.getState().setError(read.reason)
      } catch (cause) { fail(cause) }
    }
  }
  return controller
}

/** The controller bound to the app: its client, the picked machine, the CAD elements and the project. */
export const useProbing = (options: { readonly insert: (nc: string) => void; readonly program?: ProbingProgramService | undefined }): ProbingController => {
  const app = useApp()
  const cad = useCADStore()
  const job = useJob()
  const setups = useSetupStore()
  const document = useDocumentStore()
  const service = makeProbingStoreService(app.client)
  const run: Run = (effect) => app.runtime.run(effect)
  const machine = () => cad.selectedMachine
  const defaults = () => app.settings.settings().probing
  const elements = () => job.elements()
  const stock = () => { const s = stockOf(job.sources()); return { x: s.x, y: s.y, width: s.width, height: s.height, depth: s.depth, topZ: s.topZ } }
  const projectId = () => document.projectId
  const generator = makeToolpathGenerator(app.client)
  return createProbingController({
    run, service, machine, defaults, elements, projectId,
    program: options.program ?? createProbingProgram({ run, service, machine, defaults, elements, stock, projectId, parse: (nc) => run(generator.parse(nc, "Probing")) }),
    stock,
    setups: () => setups.documents.map((d) => ({ id: d.id, name: d.name })),
    insert: options.insert,
    onMachineProbing: (saved) => {
      const m = cad.selectedMachine
      if (m === null) return
      const config = { ...(m.config as object) } as Record<string, unknown>
      if (saved.probing !== null) config["probing"] = saved.probing
      if (saved.rotaryCalibration !== null) config["rotary"] = { ...(config["rotary"] as object), calibration: saved.rotaryCalibration }
      cad.setSelectedMachine({ ...m, config } as typeof m)
    }
  })
}
