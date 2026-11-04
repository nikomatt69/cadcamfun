/**
 * The probing panel's controller (spec 73 §4): everything the Probing tab changes outside itself. Cycles are toolpaths in the
 * multi-toolpath store, offsets and reports go through the `ProbingService`, the program and the simulation through the program
 * service. `createProbingController` takes its dependencies as values, so a test drives it with a fake service; `useProbing` binds it
 * to the app, the CAD elements and the stores.
 */
import { cam } from "@cadcamfun/core"
import type { Effect } from "effect"
import { useApp } from "../../../shared/state/context.ts"
import type { ProbingDefaults } from "../../../shared/state/settings.ts"
import { t } from "../../../i18n/index.ts"
import { toast } from "../../../shared/ui/toast.tsx"
import { useCADStore } from "../../cad/store/cadStore.ts"
import { useDocumentStore } from "../../cad/store/documentStore.ts"
import { makeProbingStoreService, type ProbingService } from "../api/probing.ts"
import { POST_TARGETS } from "../components/AdvancedPostProcessorPanel.tsx"
import type { ProbingController } from "../components/probing/ProbingTab.tsx"
import type { DialectOption } from "../components/probing/ProbeProgramPreview.tsx"
import { stockOf, type CadElement } from "../lib/job.ts"
import type { PaletteEntry } from "../lib/probing/cycle-palette.data.ts"
import { isProbeToolpath } from "../lib/probing/cycles.ts"
import { loadOffsets, saveOffsets } from "../lib/probing/offset-sync.ts"
import { defaultChecks, defaultOperation, followOf, movesOffset, planLocal, type ProbeOperation } from "../lib/probing/operation.ts"
import { profileOfMachine } from "../lib/probing/machine.ts"
import { applyTarget, targetAt, targetsOf, workOriginOf, type ProbeTarget } from "../lib/probing/probe-targets.ts"
import { reportData, resultOfReport } from "../lib/probing/report-data.ts"
import { useInspectionStore } from "../store/inspectionStore.ts"
import { useMultiToolpathStore } from "../store/multiToolpathStore.ts"
import { useProbingStore } from "../store/probingStore.ts"
import { useCamStore } from "../store/camStore.ts"
import { useSetupStore } from "../store/setupStore.ts"
import { useWorkOffsetStore } from "../store/workOffsetStore.ts"
import { useJob } from "./useJob.ts"

type Run = <A, E>(effect: Effect.Effect<A, E>) => Promise<A>

/** The program-side calls: written by the sidecar (plan, emit, simulate), pending the `camProbing` program routes. */
export interface ProbingProgramService {
  generate(id: string, operation: ProbeOperation, dialect: string): Promise<void>
  simulate(id: string, operation: ProbeOperation, dialect: string): Promise<void>
}

export interface ControllerDeps {
  readonly run: Run
  readonly service: ProbingService
  /** The program calls; absent while the sidecar routes are not wired (the buttons then say so). */
  readonly program?: ProbingProgramService | undefined
  readonly machine: () => { readonly id: string; readonly name: string; readonly type?: string | undefined; readonly config: object } | null
  readonly defaults: () => ProbingDefaults
  readonly elements: () => ReadonlyArray<CadElement>
  readonly stock: () => { readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly topZ: number }
  readonly setups: () => ReadonlyArray<{ readonly id: string; readonly name: string }>
  readonly projectId: () => string | null
  readonly insert: (nc: string) => void
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
  return createProbingController({
    run: (effect) => app.runtime.run(effect), service: makeProbingStoreService(app.client), program: options.program,
    machine: () => cad.selectedMachine,
    defaults: () => app.settings.settings().probing,
    elements: () => job.elements(),
    stock: () => { const s = stockOf(job.sources()); return { x: s.x, y: s.y, width: s.width, height: s.height, topZ: s.topZ } },
    setups: () => setups.documents.map((d) => ({ id: d.id, name: d.name })),
    projectId: () => document.projectId,
    insert: options.insert
  })
}

