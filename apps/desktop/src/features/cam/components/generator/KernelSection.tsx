import { For, Show, createContext, createEffect, createMemo, createSignal, onCleanup, onMount, useContext, type JSX } from "solid-js"
import { ChevronDown, ChevronUp, X } from "lucide-solid"
import { cam } from "@cadcamfun/core"
import type { CamKernelArtifact, CamKernelRequest, CamKernelResult, CamMachineConfig } from "@cadcamfun/api"
import { useApp } from "../../../../shared/state/context.ts"
import { t } from "../../../../i18n/index.ts"
import { captureEditorOwner } from "../../../ai/lib/editor-sync.ts"
import { makeToolpathGenerator } from "../../api/generator.ts"
import { useJob } from "../../hooks/useJob.ts"
import { addJobSetup, jobRelease, kernelRequestOf, MAX_JOB_SETUPS, patchJobSetup, removeJobSetup, type JobSetup } from "../../lib/job.ts"
import { diffLines, modelChangeText } from "../../lib/model-change.ts"
import { ncVerifyRequest } from "../../lib/verify-nc.ts"
import { tcpRefusal } from "../../lib/kernel-tcp.ts"
import { kernelMachineConfigsOf, machinesFromResponse } from "../../lib/machines.ts"
import { useCamStore } from "../../store/camStore.ts"
import { ToolSilhouette } from "../ToolSilhouette.tsx"
import KernelSetups from "./KernelSetups.tsx"
import KernelPost from "./KernelPost.tsx"
import KernelSwarf from "./KernelSwarf.tsx"
import { downloadText, setupSheetFile } from "../../lib/setupSheet.ts"
import { useGeneratorStore } from "../../store/generatorStore.ts"
import { useVerifyStore } from "../../store/verifyStore.ts"
import { NumberField as DimensionField } from "../../../cad/components/property-inputs/NumberField.tsx"
import { INPUT, LABEL, NumberField } from "./ui.tsx"

type Operation = cam.kernel.OperationSpec
type Cutter = cam.kernel.Cutter

/** Cutter kinds an operation can run with (the kernel rejects the others). */
const KINDS: Readonly<Record<Operation["strategy"], ReadonlyArray<Cutter["kind"]>>> = {
  face: ["facemill", "flat", "bull"], adaptive: ["flat", "bull", "ball"], pocket: ["flat", "bull", "ball"], profile: ["flat", "bull", "ball"],
  bore: ["flat", "bull"], drill: ["drill", "spot", "chamfer"], thread: ["threadmill"], engrave: ["engraver", "chamfer", "spot", "ball"],
  chamfer: ["chamfer", "spot", "engraver"], surface: ["flat", "bull", "ball"], multiaxis: ["ball", "bull", "flat"],
  // A probe operation runs the machine's probe device, not a cutter (spec 73 §5.12): it is planned in the probing panel.
  probe: []
}
const OVERRIDES = ["rpm", "feed", "stepdown", "stepover"] as const

/**
 * A number field whose empty value means "not set". It takes what people type (`0,2`, `0.2`, `40/2`) and commits when the entry is
 * finished, not at every keystroke: a commit rebuilds the plan row or cutter card, which would drop the focus mid-entry.
 * A value that is not above zero is "not set" too.
 */
function OptionalNumber(props: { readonly value: number | undefined; readonly placeholder: string; readonly testId?: string; readonly onValue: (value: number | undefined) => void }): JSX.Element {
  return (
    <DimensionField
      optional deferred class="panel-input" placeholder={props.placeholder} value={props.value} testId={props.testId}
      onChange={(value) => props.onValue(value <= 0 ? undefined : value)} onClear={() => props.onValue(undefined)}
    />
  )
}

interface KernelApi {
  readonly settings: () => ReturnType<typeof useGeneratorStore.getState>["kernelSettings"]
  readonly savedMachines: () => ReadonlyArray<CamMachineConfig>
  readonly machineValue: () => string
  readonly printerValue: () => string
  readonly savedPrinters: () => ReadonlyArray<CamMachineConfig>
  readonly selectPrinter: (value: string) => void
  readonly linkPost: (postId: string | null) => Promise<void>
  readonly request: () => ReturnType<typeof kernelRequestOf> | undefined
  readonly artifact: () => CamKernelArtifact | undefined
  readonly stale: () => boolean
  /** The independent replay of the NC in the editor (spec 72 step 0.6). */
  readonly ncCheck: () => NcCheck
  readonly verifyEditorNc: () => Promise<void>
  /** What the last generation changed against the program that was there before it (spec 59 A4); undefined for the first one. */
  readonly diff: () => ReturnType<typeof cam.kernel.programDiff> | undefined
  /** Why the model the program was made from differs from the drawing now (spec 59 A2); undefined when the program has no stored elements. */
  readonly modelChange: () => ReturnType<typeof cam.kernel.programStatus> | undefined
  readonly planNotes: () => ReadonlyArray<string>
  readonly setPlanNotes: (notes: ReadonlyArray<string>) => void
  readonly plan: () => void
  readonly operations: () => ReadonlyArray<Operation>
  readonly setOperations: (next: ReadonlyArray<Operation>) => void
  readonly patchOperation: (index: number, patch: Readonly<Record<string, unknown>>) => void
  readonly moveOperation: (index: number, by: number) => void
  readonly library: () => ReadonlyArray<Cutter>
  readonly usedCutters: () => ReadonlyArray<Cutter>
  readonly patchCutter: (id: string, patch: Omit<Partial<Cutter>, "holder"> & { readonly holder?: Cutter["holder"] | null }) => void
  readonly generate: () => Promise<void>
  readonly progressLabel: () => string | undefined
  readonly error: () => string | undefined
  readonly setError: (message: string | undefined) => void
  readonly ownRun: () => boolean
  readonly result: () => CamKernelResult | undefined
  /** The programs of the last run of a job of several setups, one per setup (empty for a single fixing or when the job changed since). */
  readonly jobRuns: () => ReadonlyArray<JobRun>
  /** The setup whose program the editor holds. */
  readonly activeSetup: () => string | undefined
  readonly openSetup: (id: string) => void
}

/** One setup of a job: its own program and its own release. */
export interface JobRun { readonly id: string; readonly orientation: string; readonly workOffset: string; readonly result: CamKernelResult }

const KernelContext = createContext<KernelApi>()

export const useKernel = (): KernelApi => {
  const api = useContext(KernelContext)
  if (api === undefined) throw new Error("Kernel controls render inside KernelSession")
  return api
}

/** Holds the kernel run. The machine, operation and footer sections render its controls; this is not a section of its own. */

export type NcCheck =
  | { readonly state: "idle" }
  | { readonly state: "running" }
  | { readonly state: "failed"; readonly message: string }
  | { readonly state: "done"; readonly verdict: "clean" | "faults" | "incomplete"; readonly lines: ReadonlyArray<string> }


export function KernelSession(props: { readonly onGCodeGenerated: (code: string) => void; readonly children: JSX.Element }): JSX.Element {
  const app = useApp()
  const job = useJob()
  const gen = useGeneratorStore()
  const store = useCamStore()
  const api = makeToolpathGenerator(app.client)
  const settings = () => gen.kernelSettings
  const library = (): ReadonlyArray<Cutter> => settings().tools ?? cam.kernel.DEFAULT_CUTTERS
  const [planNotes, setPlanNotes] = createSignal<ReadonlyArray<string>>([])
  const [result, setResult] = createSignal<CamKernelResult>()
  const [error, setError] = createSignal<string>()
  const [ownRun, setOwnRun] = createSignal(false)
  const [diff, setDiff] = createSignal<ReturnType<typeof cam.kernel.programDiff>>()
  const [ncCheck, setNcCheck] = createSignal<NcCheck>({ state: "idle" })
  const [runs, setRuns] = createSignal<{ readonly requestId: string; readonly input: CamKernelRequest; readonly runs: ReadonlyArray<JobRun> }>()
  /** The machine configurations of the library: the machines the person configured, usable by the kernel. */
  const [savedMachines, setSavedMachines] = createSignal<ReadonlyArray<CamMachineConfig>>([])
  const [savedPrinters, setSavedPrinters] = createSignal<ReadonlyArray<CamMachineConfig>>([])
  const [printerValue, setPrinterValue] = createSignal(cam.kernel.PRINTERS[0]!.id)
  const selectPrinter = (value: string): void => {
    const config = savedPrinters().find((row) => `config:${row.id}` === value)
    const machine = config !== undefined ? cam.kernel.kernelMachineOfConfig(config) : cam.kernel.findPrinter(value)
    const printer = machine?.printer
    if (printer === undefined) return
    setPrinterValue(value)
    gen.patchSettings({
      bedWidth: printer.bed.width, bedDepth: printer.bed.depth, buildHeight: printer.buildHeight,
      bedOrigin: printer.bed.origin, printerKinematics: printer.kinematics,
      nozzleDiameter: printer.nozzle.diameter, extrusionWidth: printer.nozzle.diameter, filamentDiameter: printer.filamentDiameter
    })
    gen.setPrinter({ flavor: printer.flavor })
  }
  /** The machine the panel plans against: a saved configuration, else the preset id. */
  const machineValue = (): string => {
    const config = settings().machineConfig
    return config !== undefined ? `config:${config.id}` : (settings().machine ?? cam.kernel.DEFAULT_MACHINE.id)
  }
  /** Names a library post on the saved machine (or takes it off): the machine then brings that post to every program planned for it. */
  const linkPost = async (postId: string | null): Promise<void> => {
    const machine = settings().machineConfig
    if (machine === undefined) return
    await app.runtime.run(app.client.machineConfigs.update({ params: { id: machine.id }, payload: { name: machine.name, config: { postDefinitionId: postId } } }))
    const next = { ...machine, config: { ...machine.config, postDefinitionId: postId } }
    gen.patchKernelSettings({ machineConfig: next as never })
    setSavedMachines((rows) => rows.map((row) => (row.id === machine.id ? next as never : row)))
  }
  let controller: AbortController | undefined
  let runId = ""
  let disposed = false
  const request = createMemo(() => {
    try {
      // Tip control is only asked of a machine that can write it; the switch says why it cannot (the kernel would refuse the job).
      const { tcp, ...rest } = settings()
      return kernelRequestOf(job.sources(), { ...rest, ...(tcp === true && tcpRefusal(rest) === undefined ? { tcp } : {}), tolerance: gen.settings.tolerance, workOffset: gen.settings.workOffset })
    } catch { return undefined }
  })
  const artifact = createMemo<CamKernelArtifact | undefined>(() => {
    const value = result()
    if (value?.status === "ok" && value.value.release === "blocked") return value.value
    return store.kernelArtifact ?? (value?.status === "ok" ? value.value : undefined)
  })
  /**
   * Whether the model the program was made from changed (spec 59 A2). A program with its elements stored is compared by geometry, so a
   * rename, a colour or a layer change is not a model change; one without them (older, or imported) falls back to the digest of all the
   * element JSON, which can only over-report.
   */
  const partChanged = (value: CamKernelArtifact, elements: ReadonlyArray<Readonly<Record<string, unknown>>>): boolean => {
    const stored = store.kernelRequest
    if (stored !== undefined) {
      const status = cam.kernel.programStatus({ request: stored }, { elements })
      if (status.status !== "unknown") return status.status === "stale"
    }
    return value.identity.part !== cam.kernel.digestOf("cam-kernel/part@1", { kind: "elements", elements })
  }
  const modelChange = createMemo(() => {
    const current = request(), stored = store.kernelRequest
    return current === undefined || stored === undefined ? undefined : cam.kernel.programStatus({ request: stored }, { elements: current.elements })
  })
  const stale = () => {
    const value = artifact(), current = request()
    if (!value) return false
    if (!current) return true
    const source = store.kernelRequest, stock = current.stock
    // One setup of a job is its own fixing: its orientation and datum are the setup's, not the panel's single fixing.
    const mine = source?.setupId !== undefined ? current.setups?.find((setup) => setup.id === source.setupId) : undefined
    const orientation = mine?.orientation ?? current.setupOrientation ?? "+Z", offset = mine?.workOffset ?? current.workOffset ?? "G54"
    const stockChanged = orientation === "+Z" && current.setups === undefined && (stock !== undefined ? (
      Math.abs(stock.width - (value.stockBounds.max.x - value.stockBounds.min.x)) > 1e-9 ||
      Math.abs(stock.height - (value.stockBounds.max.y - value.stockBounds.min.y)) > 1e-9 ||
      Math.abs(stock.depth - (value.stockBounds.max.z - value.stockBounds.min.z)) > 1e-9 ||
      Math.abs(stock.x - (value.stockBounds.max.x + value.stockBounds.min.x) / 2) > 1e-9 ||
      Math.abs(stock.y - (value.stockBounds.max.y + value.stockBounds.min.y) / 2) > 1e-9
    ) : source?.stock !== undefined)
    // The machine the request names: a saved configuration becomes `config:<id>`, a preset keeps its id.
    const machineId = current.machineConfig !== undefined ? `config:${current.machineConfig.id}` : current.machine
    return value.nc !== store.gcode || value.material.id !== (cam.kernel.findMaterial(current.material)?.id ?? current.material) || value.machine.id !== machineId ||
      (value.setupOrientation ?? "+Z") !== orientation ||
      cam.kernel.canonicalJson(source?.stock ?? null) !== cam.kernel.canonicalJson(current.stock ?? null) ||
      stockChanged || value.program.workOffset !== offset ||
      source !== undefined && ((source.tolerance ?? 0.01) !== (current.tolerance ?? 0.01) || (source.origin ?? "stock-center") !== (current.origin ?? "stock-center") || source.finishAllowance !== current.finishAllowance || source.scallop !== current.scallop || source.resolution !== current.resolution) ||
      partChanged(value, current.elements) ||
      source !== undefined && cam.kernel.canonicalJson([source.operations ?? null, source.tools ?? null, source.deburr ?? null, source.tabs ?? null, source.breadth ?? null, source.tcp ?? false, source.nativeCycles ?? false, source.subprograms ?? false, source.smoothing ?? null, source.postDefinition ?? null, source.setups ?? null, source.carryStock ?? false]) !== cam.kernel.canonicalJson([current.operations ?? null, current.tools ?? null, current.deburr ?? null, current.tabs ?? null, current.breadth ?? null, current.tcp ?? false, current.nativeCycles ?? false, current.subprograms ?? false, current.smoothing ?? null, current.postDefinition ?? null, current.setups ?? null, current.carryStock ?? false])
  }
  const requestId = createMemo(() => request()?.id)
  createEffect(() => {
    requestId()
    controller?.abort()
  })
  // The library's machines: what the person configured is what the kernel plans against.
  onMount(() => {
    void app.runtime.run(app.client.machineConfigs.list({ query: {} }))
      .then((value) => {
        const configs = kernelMachineConfigsOf(machinesFromResponse(value))
        setSavedMachines(configs.filter((row) => cam.kernel.kernelMachineOfConfig(row)?.kind !== "printer"))
        setSavedPrinters(configs.filter((row) => cam.kernel.kernelMachineOfConfig(row)?.kind === "printer"))
      })
      .catch(() => { setSavedMachines([]); setSavedPrinters([]) })
  })
  onCleanup(() => { disposed = true; controller?.abort(); if (controller) gen.setGenerating(false) })

  /** What the run this panel started is doing now, from the sidecar's `cam.progress` frames. */
  const progressLabel = (): string | undefined => {
    const p = store.kernelProgress
    if (p === undefined || p.runId !== runId) return undefined
    if (p.stage === "queued") return t("cam.kernel.progress.queued", { ahead: p.ahead ?? 0 })
    if (p.stage === "operations" && p.operationId !== undefined) return t("cam.kernel.progress.operation", { index: (p.index ?? 0) + 1, count: p.count ?? 1, id: p.operationId })
    return p.stage === "operations" || p.stage === "post" || p.stage === "replay" || p.stage === "evidence" ? t(`cam.kernel.progress.${p.stage}`) : undefined
  }

  /** The kernel's plan for the current part, into the editable list. */
  const plan = (): void => {
    const input = request()
    if (!input) return
    setError(undefined)
    try {
      const { operations: _ignored, ...rest } = input
      const job = cam.kernel.jobOfSnapshot(rest)
      if (job.status === "failed") { setError(job.issues.map((i) => i.message).join("; ")); return }
      const planned = cam.kernel.planOnly(job.value)
      if (planned.status === "failed") { setError(planned.issues.map((i) => i.message).join("; ")); return }
      setPlanNotes([...planned.value.unmachined, ...planned.value.notes])
      gen.patchKernelSettings({ operations: [...planned.value.operations] })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }
  const operations = (): ReadonlyArray<Operation> => settings().operations ?? []
  const setOperations = (next: ReadonlyArray<Operation>): void => gen.patchKernelSettings({ operations: [...next] })
  const patchOperation = (index: number, patch: Readonly<Record<string, unknown>>): void => {
    const next = operations().map((op, i) => {
      if (i !== index) return op
      const merged: Record<string, unknown> = { ...op, ...patch }
      for (const key of Object.keys(merged)) if (merged[key] === undefined) delete merged[key]
      return merged as unknown as Operation
    })
    setOperations(next)
  }
  const moveOperation = (index: number, by: number): void => {
    const next = [...operations()], to = index + by
    if (to < 0 || to >= next.length) return
    ;[next[index], next[to]] = [next[to]!, next[index]!]
    setOperations(next)
  }
  /** Cutters the edited plan (or the last program) uses: the ones worth describing. */
  const usedCutters = createMemo((): ReadonlyArray<Cutter> => {
    const ids = new Set([...operations().map((op) => op.tool), ...(artifact()?.tools.map((t) => t.id) ?? [])])
    return library().filter((c) => ids.has(c.id))
  })
  const patchCutter = (id: string, patch: Omit<Partial<Cutter>, "holder"> & { readonly holder?: Cutter["holder"] | null }): void => {
    gen.patchKernelSettings({
      tools: library().map((c) => {
        if (c.id !== id) return c
        const { holder, ...rest } = patch
        const next: Record<string, unknown> = { ...c, ...rest }
        if (holder === null) delete next["holder"]
        else if (holder !== undefined) next["holder"] = holder
        return next as unknown as Cutter
      })
    })
  }

  /** Replays the NC as it is in the editor (a hand edit included) against the part, in the sidecar's kernel worker. */
  const verifyEditorNc = async (): Promise<void> => {
    const value = artifact(), source = store.kernelRequest ?? request()
    if (value === undefined || source === undefined) return
    const built = ncVerifyRequest(value, source, store.gcode)
    if (typeof built === "string") { setNcCheck({ state: "failed", message: built }); return }
    setNcCheck({ state: "running" })
    try {
      const result = await app.runtime.run(api.verifyNc(built))
      if (disposed) return
      setNcCheck({ state: "done", verdict: result.verdict, lines: [...result.findings.slice(0, 8).map((f) => f.message), ...(result.verdict === "incomplete" ? result.reasons.slice(0, 4) : [])] })
    } catch (cause) {
      if (!disposed) setNcCheck({ state: "failed", message: cause instanceof Error ? cause.message : String(cause) })
    }
  }

  type Made = Extract<CamKernelResult, { status: "ok" }>
  /** Publishes one program (the whole job's, or one setup's) as the editor's: its NC, its IR, its evidence and the request that reproduces it. */
  const publish = (value: Made, input: CamKernelRequest): void => {
    // Publish this exact program, retaining tool changes; old operation programs and verification belong to different NC.
    store.clearOperationResults()
    useVerifyStore.getState().reset()
    store.setKernelArtifact(value.value)
    store.setKernelRequest(input)
    gen.setResult(value.value.nc, [])
    store.setGcode(value.value.nc)
    store.setProgram(value.value.program)
    props.onGCodeGenerated(value.value.nc)
  }
  const jobRuns = (): ReadonlyArray<JobRun> => {
    const held = runs()
    return held !== undefined && held.requestId === request()?.id ? held.runs : []
  }
  const activeSetup = (): string | undefined => store.kernelRequest?.setupId
  /** Opens another setup of the job in the editor: its program was made by the same run. */
  const openSetup = (id: string): void => {
    const held = runs()
    const run = held?.runs.find((candidate) => candidate.id === id)
    if (held === undefined || run === undefined || held.requestId !== request()?.id || run.result.status !== "ok" || run.result.value.release === "blocked") return
    setResult(run.result)
    setNcCheck({ state: "idle" })
    setDiff(undefined)
    publish(run.result, { ...held.input, setupId: id })
  }

  const generate = async (): Promise<void> => {
    const input = request()
    if (!input || gen.isGenerating) return
    const signal = new AbortController()
    controller = signal
    const owner = captureEditorOwner()
    const previousCode = store.gcode
    setError(undefined)
    gen.setGenerating(true)
    setOwnRun(true)
    try {
      // The sidecar announces this run on the project's stream; the panel follows it under its own run id.
      const projectId = owner.projectId
      runId = crypto.randomUUID()
      store.setKernelProgress(undefined)
      // A job of several setups is one run per setup: each answers with that setup's program (`setupId`), the job is re-run for it so the
      // stock carried from the setup before reproduces it. A single fixing is the one run it always was.
      const listed = input.setups ?? []
      const wanted: ReadonlyArray<JobSetup | undefined> = listed.length > 0 ? listed : [undefined]
      const made: JobRun[] = []
      for (const setup of wanted) {
        const body: CamKernelRequest = setup === undefined ? input : { ...input, setupId: setup.id }
        const value = await app.runtime.run(api.manufacture(projectId == null ? body : { ...body, progress: { projectId, runId } }), { signal: signal.signal })
        if (disposed || signal.signal.aborted || !owner.current() || request()?.id !== input.id || store.gcode !== previousCode) return
        made.push({ id: setup?.id ?? "", orientation: setup?.orientation ?? input.setupOrientation ?? "+Z", workOffset: setup?.workOffset ?? (value.status === "ok" ? value.value.program.workOffset : input.workOffset ?? "G54"), result: value })
      }
      setRuns(listed.length > 0 ? { requestId: input.id, input, runs: made } : undefined)
      // The program shown: the first setup that was not blocked; else the first failure, so its reasons are what the panel lists.
      const shown = made.find((run) => run.result.status === "ok" && run.result.value.release !== "blocked") ?? made.find((run) => run.result.status !== "ok") ?? made[0]!
      const value = shown.result
      setResult(value)
      // The program that was there before this run, compared with the one this run made (also a blocked one: the person sees what got worse).
      const prior = store.kernelArtifact
      setNcCheck({ state: "idle" })
      setDiff(value.status === "ok" && prior !== undefined ? cam.kernel.programDiff(prior, value.value) : undefined)
      if (value.status !== "ok" || value.value.release === "blocked") return
      publish(value, listed.length > 0 ? { ...input, setupId: shown.id } : input)
    } catch (cause) {
      if (!disposed && !signal.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      if (controller === signal) { controller = undefined; setOwnRun(false); gen.setGenerating(false) }
    }
  }

  return (
    <KernelContext.Provider value={{
      settings, savedMachines, machineValue, printerValue, savedPrinters, selectPrinter, linkPost, request, artifact, stale, ncCheck, verifyEditorNc, diff, modelChange, planNotes, setPlanNotes, plan, operations, setOperations,
      patchOperation, moveOperation, library, usedCutters, patchCutter, generate, progressLabel, error, setError, ownRun, result, jobRuns, activeSetup, openSetup
    }}>
      {props.children}
    </KernelContext.Provider>
  )
}

/** The setups of a job: each is a fixing of the part (orientation) on its own work offset, and each becomes its own program. */
function KernelJobSetups(): JSX.Element {
  const gen = useGeneratorStore()
  const kernel = useKernel()
  const settings = kernel.settings
  const list = (): ReadonlyArray<JobSetup> => settings().setups ?? []
  const set = (next: ReadonlyArray<JobSetup> | undefined): void => {
    // A new list is a new plan: the edited operations belong to the single fixing.
    gen.patchKernelSettings({ setups: next === undefined ? undefined : [...next], ...(next === undefined && settings().setups === undefined ? {} : { operations: undefined }) })
    kernel.setPlanNotes([])
  }
  return (
    <div class="space-y-2" data-testid="kernel-job-setups">
      <div class="flex items-center justify-between gap-2">
        <span class="text-xs font-semibold text-[color:var(--panel-text)]">{t("cam.kernel.job.title")}</span>
        <button type="button" class="panel-btn" disabled={list().length >= MAX_JOB_SETUPS} data-testid="kernel-job-add"
          onClick={() => set(addJobSetup(settings().setups, settings().setupOrientation) ?? settings().setups)}>{t("cam.kernel.job.add")}</button>
      </div>
      <For each={list()}>{(setup) => (
        <div class="flex items-center gap-2 text-xs" data-testid="kernel-job-setup" data-setup={setup.id}>
          <span class="w-14 truncate" title={setup.id}>{setup.id}</span>
          <select class={INPUT} aria-label={t("cam.kernel.setupOrientation")} value={setup.orientation ?? "+Z"} data-testid="kernel-job-orientation"
            onChange={(event) => set(patchJobSetup(list(), setup.id, { orientation: event.currentTarget.value as cam.kernel.SetupOrientation }))}>
            <For each={cam.kernel.SETUP_ORIENTATIONS}>{(orientation) => <option value={orientation}>{orientation}</option>}</For>
          </select>
          <select class={INPUT} aria-label={t("cam.kernel.workOffset")} value={setup.workOffset ?? "G54"} data-testid="kernel-job-offset"
            onChange={(event) => set(patchJobSetup(list(), setup.id, { workOffset: event.currentTarget.value as cam.WorkOffset }))}>
            <For each={["G54", "G55", "G56", "G57", "G58", "G59"]}>{(offset) => <option value={offset}>{offset}</option>}</For>
          </select>
          <button type="button" class="panel-btn" aria-label={t("cam.kernel.job.remove")} title={t("cam.kernel.job.remove")} data-testid="kernel-job-remove"
            onClick={() => set(removeJobSetup(list(), setup.id))}><X size={12} /></button>
        </div>
      )}</For>
      <Show when={list().length > 1}>
        <label class="panel-check">
          <input type="checkbox" checked={settings().carryStock === true} data-testid="kernel-job-carry"
            onChange={(event) => gen.patchKernelSettings({ carryStock: event.currentTarget.checked ? true : undefined })} />
          {t("cam.kernel.job.carry")}
        </label>
      </Show>
    </div>
  )
}

const millOnly = (): boolean => useGeneratorStore().settings.machineType === "mill"

/** Machine, setup and post for a mill. Mounted inside the generator's machine section. */
export function KernelMachineControls(): JSX.Element {
  const gen = useGeneratorStore()
  const kernel = useKernel()
  const settings = kernel.settings
  return (
    <Show when={millOnly()}>
      <p class="panel-hint">{t("cam.kernel.description")}</p>
      <label class={LABEL}>{t("cam.kernel.machine")}
        <select
          class={INPUT} value={kernel.machineValue()} data-testid="kernel-machine"
          onChange={(event) => {
            const value = event.currentTarget.value
            if (value.startsWith("config:")) {
              const row = kernel.savedMachines().find((machine) => `config:${machine.id}` === value)
              if (row !== undefined) gen.patchKernelSettings({ machineConfig: row, machine: undefined })
              return
            }
            gen.patchKernelSettings({ machine: value, machineConfig: undefined })
          }}>
          <optgroup label={t("cam.machine.builtin")}>
            <For each={cam.kernel.MACHINES}>{(item) => <option value={item.id}>{item.name} · {item.post}</option>}</For>
          </optgroup>
          <Show when={kernel.savedMachines().length > 0}>
            <optgroup label={t("cam.gen.mach.yours")}>
              <For each={kernel.savedMachines()}>{(item) => <option value={`config:${item.id}`}>{item.name}</option>}</For>
            </optgroup>
          </Show>
        </select>
      </label>
      <label class={LABEL}>{t("cam.kernel.setupOrientation")}
        <select class={INPUT} value={settings().setupOrientation ?? "+Z"} onChange={(event) => {
          gen.patchKernelSettings({ setupOrientation: event.currentTarget.value as cam.kernel.SetupOrientation, operations: undefined })
          gen.updateSettings("workholdingConfigured", false)
          kernel.setPlanNotes([])
        }} data-testid="kernel-setup-orientation">
          <For each={cam.kernel.SETUP_ORIENTATIONS}>{(orientation) => <option value={orientation}>{orientation}</option>}</For>
        </select>
      </label>
      <Show when={settings().setupOrientation !== undefined && settings().setupOrientation !== "+Z"}>
        <p class="text-xs text-[color:var(--panel-warn)]" data-testid="kernel-manual-setup-hint">{t("cam.kernel.manualSetupHint")}</p>
      </Show>
      <KernelSetups
        elements={kernel.request()?.elements as ReadonlyArray<Record<string, unknown>> | undefined} current={settings().setupOrientation}
        onUse={(orientation) => { gen.patchKernelSettings({ setupOrientation: orientation, operations: undefined }); gen.updateSettings("workholdingConfigured", false); kernel.setPlanNotes([]) }}
      />
      <KernelJobSetups />
      <KernelSwarf
        elements={kernel.request()?.elements as ReadonlyArray<Record<string, unknown>> | undefined}
        fiveAxis={(() => {
          const config = settings().machineConfig
          const machine = config !== undefined ? cam.kernel.kernelMachineOfConfig(config) : cam.kernel.findMachine(settings().machine ?? cam.kernel.DEFAULT_MACHINE.id)
          return machine?.fiveAxis !== undefined
        })()}
        planned={kernel.operations().length > 0} flatCutter={[...kernel.library()].filter((c) => c.kind === "flat" && c.diameter >= 8).sort((a, b) => b.stickout - a.stickout)[0]?.id ?? kernel.library().find((c) => c.kind === "flat")?.id}
        top={kernel.artifact()?.stockBounds.max.z ?? kernel.request()?.stock?.depth ?? 0}
        onAdd={(operation) => kernel.setOperations([...kernel.operations(), operation])}
      />
      <KernelPost
        current={settings().postDefinition} onUse={(definition) => gen.patchKernelSettings({ postDefinition: definition as never })}
        machine={settings().machineConfig} onLink={kernel.linkPost}
      />
    </Show>
  )
}

/** Hole and feature breadth for the planner, and tool-centre-point output: each off unless asked, with what it needs said next to it. */
function KernelBreadthControls(): JSX.Element {
  const gen = useGeneratorStore()
  const settings = useKernel().settings
  const breadth = () => settings().breadth ?? {}
  const setBreadth = (key: "holeCycles" | "tilted" | "namedFeatures", on: boolean): void => {
    const next = { ...breadth(), [key]: on ? true : undefined }
    const kept = Object.fromEntries(Object.entries(next).filter(([, value]) => value === true))
    gen.patchKernelSettings({ breadth: Object.keys(kept).length > 0 ? kept : undefined })
  }
  const refusal = createMemo(() => tcpRefusal(settings()))
  return (
    <>
      <fieldset class="space-y-1" data-testid="kernel-breadth">
        <legend class="panel-group__title">{t("cam.kernel.breadth")}</legend>
        <label class="panel-check" title={t("cam.kernel.breadthHoleCyclesHint")}><input type="checkbox" checked={breadth().holeCycles === true} onChange={(event) => setBreadth("holeCycles", event.currentTarget.checked)} data-testid="kernel-breadth-hole-cycles" />{t("cam.kernel.breadthHoleCycles")}</label>
        <label class="panel-check" title={t("cam.kernel.breadthTiltedHint")}><input type="checkbox" checked={breadth().tilted === true} onChange={(event) => setBreadth("tilted", event.currentTarget.checked)} data-testid="kernel-breadth-tilted" />{t("cam.kernel.breadthTilted")}</label>
        <label class="panel-check" title={t("cam.kernel.breadthNamedHint")}><input type="checkbox" checked={breadth().namedFeatures === true} onChange={(event) => setBreadth("namedFeatures", event.currentTarget.checked)} data-testid="kernel-breadth-named" />{t("cam.kernel.breadthNamed")}</label>
        <p class="panel-hint" data-testid="kernel-breadth-hint">{t("cam.kernel.breadthHint")}</p>
      </fieldset>
      <div class="space-y-0.5">
        <label class="panel-check" title={refusal() !== undefined ? t(refusal()!.key, refusal()!.params) : t("cam.kernel.tcpHint")}>
          <input type="checkbox" checked={settings().tcp === true && refusal() === undefined} disabled={refusal() !== undefined} onChange={(event) => gen.patchKernelSettings({ tcp: event.currentTarget.checked ? true : undefined })} data-testid="kernel-tcp" />
          {t("cam.kernel.tcp")}
        </label>
        <p class="panel-hint" data-testid="kernel-tcp-hint">{refusal() !== undefined ? t(refusal()!.key, refusal()!.params) : t("cam.kernel.tcpHint")}</p>
      </div>
    </>
  )
}

/** Plan, quality and the cutters the plan uses. Mounted inside the generator's operation section. */
export function KernelOperationControls(): JSX.Element {
  const gen = useGeneratorStore()
  const kernel = useKernel()
  const settings = kernel.settings
  return (
    <Show when={millOnly()}>
      <details class="border-t border-[color:var(--panel-border)] pt-2" data-testid="kernel-settings">
        <summary class="cursor-pointer text-xs font-semibold text-[color:var(--panel-text)]">{t("cam.kernel.settings")}</summary>
        <div class="space-y-3 pt-3">
          <label class={LABEL}>{t("cam.kernel.tolerance")}<NumberField id="kernel-tolerance" min="0.001" step="0.001" value={gen.settings.tolerance} onValue={(value) => gen.updateSettings("tolerance", value)} /></label>
          <label class={LABEL}>{t("cam.kernel.finishAllowance")}<NumberField id="kernel-finish-allowance" min="0" max="5" step="0.01" value={settings().finishAllowance ?? cam.kernel.findMaterial(settings().material)?.finishAllowance ?? 0.2} accept={(value) => Number.isFinite(value) && value >= 0 && value <= 5} onValue={(value) => gen.patchKernelSettings({ finishAllowance: value })} /></label>
          <label class={LABEL}>{t("cam.kernel.scallop")}<NumberField id="kernel-scallop" min="0.001" max="1" step="0.001" value={settings().scallop ?? 0.01} accept={(value) => Number.isFinite(value) && value > 0 && value <= 1} onValue={(value) => gen.patchKernelSettings({ scallop: value })} /></label>
          <label class={LABEL}>{t("cam.kernel.deburr")}<NumberField id="kernel-deburr" min="0" max="5" step="0.05" value={settings().deburr ?? 0} accept={(value) => Number.isFinite(value) && value >= 0 && value <= 5} onValue={(value) => gen.patchKernelSettings({ deburr: value > 0 ? value : undefined })} /></label>
          <label class={LABEL}>{t("cam.kernel.tabs")}<NumberField id="kernel-tabs" min="0" max="64" step="1" value={settings().tabs?.count ?? 0} accept={(value) => Number.isInteger(value) && value >= 0 && value <= 64} onValue={(value) => gen.patchKernelSettings({ tabs: value > 0 ? { count: value, width: 4, height: 2 } : undefined })} /></label>
          <label class="panel-check"><input type="checkbox" checked={settings().subprograms === true} onChange={(event) => gen.patchKernelSettings({ subprograms: event.currentTarget.checked ? true : undefined })} data-testid="kernel-subprograms" />{t("cam.kernel.subprograms")}</label>
          <label class="panel-check" title={t("cam.kernel.nativeCyclesHint")}><input type="checkbox" checked={settings().nativeCycles === true} onChange={(event) => gen.patchKernelSettings({ nativeCycles: event.currentTarget.checked ? true : undefined })} data-testid="kernel-native-cycles" />{t("cam.kernel.nativeCycles")}</label>
          <KernelBreadthControls />
          <label class="panel-check"><input type="checkbox" checked={settings().smoothing !== undefined} onChange={(event) => gen.patchKernelSettings({ smoothing: event.currentTarget.checked ? 0.01 : undefined })} data-testid="kernel-smoothing" />{t("cam.kernel.smoothing")}</label>
          <Show when={settings().smoothing !== undefined}><label class={LABEL}>{t("cam.kernel.smoothingTolerance")}<NumberField id="kernel-smoothing-tolerance" min="0.001" max="1" step="0.001" value={settings().smoothing ?? 0.01} accept={(value) => Number.isFinite(value) && value > 0 && value <= 1} onValue={(value) => gen.patchKernelSettings({ smoothing: value })} /></label></Show>
          <label class="panel-check"><input type="checkbox" checked={settings().resolution === undefined} onChange={(event) => gen.patchKernelSettings({ resolution: event.currentTarget.checked ? undefined : 0.25 })} data-testid="kernel-auto-resolution" />{t("cam.kernel.autoResolution")}</label>
          <Show when={settings().resolution !== undefined}><label class={LABEL}>{t("cam.kernel.resolution")}<NumberField id="kernel-resolution" min="0.001" step="0.01" value={settings().resolution ?? 0.25} onValue={(value) => gen.patchKernelSettings({ resolution: value })} /></label></Show>
          <button type="button" class="panel-btn" onClick={() => gen.patchKernelSettings({ finishAllowance: undefined, scallop: undefined, resolution: undefined })}>{t("cam.kernel.resetQuality")}</button>
          <p class="panel-hint">{t("cam.kernel.qualityHint")}</p>
        </div>
      </details>
      <details class="border-t border-[color:var(--panel-border)] pt-2" data-testid="kernel-plan" open={kernel.operations().length > 0}>
        <summary class="cursor-pointer text-xs font-semibold text-[color:var(--panel-text)]">{t("cam.kernel.operations")}{kernel.operations().length > 0 ? ` (${kernel.operations().length})` : ""}</summary>
        <div class="space-y-2 pt-2">
          <p class="panel-hint">{t("cam.kernel.planHint")}</p>
          <div class="flex gap-2">
            <button type="button" class="panel-btn" disabled={!kernel.request()} onClick={kernel.plan} data-testid="kernel-plan-button">{t("cam.kernel.plan")}</button>
            <Show when={settings().operations !== undefined}>
              <button type="button" class="panel-btn" onClick={() => { gen.patchKernelSettings({ operations: undefined }); kernel.setPlanNotes([]) }} data-testid="kernel-plan-reset">{t("cam.kernel.planReset")}</button>
            </Show>
          </div>
          <For each={kernel.planNotes()}>{(note) => <p class="text-[11px] text-[color:var(--panel-warn)]">{note}</p>}</For>
          <For each={kernel.operations()}>
            {(op, index) => {
              const cutter = () => kernel.library().find((c) => c.id === op.tool)
              const own = op as unknown as Readonly<Record<string, number | undefined>>
              return (
                <div class="rounded-[4px] border border-[color:var(--panel-border)] p-2 text-xs space-y-1" data-testid="kernel-plan-operation">
                  <div class="flex items-center justify-between gap-1">
                    <span class="font-medium truncate" title={op.name ?? op.id}>{index() + 1}. {op.name ?? op.id}</span>
                    <span class="flex gap-0.5">
                      <button type="button" class="rounded px-2 py-1 hover:bg-[color:var(--panel-bg-inset)]" aria-label={t("cam.multi.moveUp")} onClick={() => kernel.moveOperation(index(), -1)}><ChevronUp size={14} /></button>
                      <button type="button" class="rounded px-2 py-1 hover:bg-[color:var(--panel-bg-inset)]" aria-label={t("cam.multi.moveDown")} onClick={() => kernel.moveOperation(index(), 1)}><ChevronDown size={14} /></button>
                      <button type="button" class="rounded px-2 py-1 text-[color:var(--panel-bad)] hover:bg-[color:var(--panel-bad-soft)]" aria-label={t("cam.multi.remove")} data-testid="kernel-plan-remove" onClick={() => kernel.setOperations(kernel.operations().filter((_, i) => i !== index()))}><X size={14} /></button>
                    </span>
                  </div>
                  <div class="flex items-center gap-1">
                    <Show when={cutter()}>{(c) => <ToolSilhouette cutter={c()} height={36} />}</Show>
                    <select class="panel-input flex-1" value={op.tool} onChange={(event) => kernel.patchOperation(index(), { tool: event.currentTarget.value })} data-testid="kernel-plan-tool">
                      <For each={kernel.library().filter((c) => KINDS[op.strategy].includes(c.kind) || c.id === op.tool)}>{(c) => <option value={c.id}>{c.name}</option>}</For>
                    </select>
                    <span class="text-[color:var(--panel-text-muted)]">{op.strategy}</span>
                  </div>
                  <div class="grid grid-cols-4 gap-1">
                    <For each={OVERRIDES}>{(key) => <label class="text-[11px] text-[color:var(--panel-text-muted)]">{key}<OptionalNumber value={own[key]} placeholder={t("cam.kernel.fromData")} testId={`kernel-plan-${key}`} onValue={(value) => kernel.patchOperation(index(), { [key]: value })} /></label>}</For>
                  </div>
                </div>
              )
            }}
          </For>
        </div>
      </details>
      <details class="border-t border-[color:var(--panel-border)] pt-2" data-testid="kernel-cutters">
        <summary class="cursor-pointer text-xs font-semibold text-[color:var(--panel-text)]">{t("cam.kernel.cutters")} ({kernel.usedCutters().length})</summary>
        <div class="space-y-2 pt-2">
          <p class="panel-hint">{t("cam.kernel.cuttersHint")}</p>
          <Show when={settings().tools !== undefined}>
            <button type="button" class="panel-btn" onClick={() => gen.patchKernelSettings({ tools: undefined })}>{t("cam.kernel.cuttersReset")}</button>
          </Show>
          <For each={kernel.usedCutters()}>
            {(c) => (
              <div class="flex gap-2 rounded-[4px] border border-[color:var(--panel-border)] p-2 text-xs" data-testid="kernel-cutter">
                <ToolSilhouette cutter={c} height={90} />
                <div class="flex-1 space-y-1">
                  <div class="font-medium">{c.name}</div>
                  <div class="grid grid-cols-2 gap-1">
                    <label class="text-[11px] text-[color:var(--panel-text-muted)]">flutes mm<OptionalNumber value={c.fluteLength} placeholder="" onValue={(v) => v !== undefined && kernel.patchCutter(c.id, { fluteLength: v })} /></label>
                    <label class="text-[11px] text-[color:var(--panel-text-muted)]">stickout mm<OptionalNumber value={c.stickout} placeholder="" testId="kernel-cutter-stickout" onValue={(v) => v !== undefined && kernel.patchCutter(c.id, { stickout: Math.max(v, c.fluteLength) })} /></label>
                    <label class="text-[11px] text-[color:var(--panel-text-muted)]">holder Ø<OptionalNumber value={c.holder?.diameter} placeholder={t("cam.kernel.holderNone")} testId="kernel-cutter-holder" onValue={(v) => kernel.patchCutter(c.id, { holder: v === undefined ? null : { diameter: v, length: c.holder?.length ?? 40 } })} /></label>
                    <label class="text-[11px] text-[color:var(--panel-text-muted)]">holder length<OptionalNumber value={c.holder?.length} placeholder="" onValue={(v) => { const holder = c.holder; if (v !== undefined && holder !== undefined) kernel.patchCutter(c.id, { holder: { diameter: holder.diameter, length: v } }) }} /></label>
                  </div>
                </div>
              </div>
            )}
          </For>
        </div>
      </details>
    </Show>
  )
}

/** The kernel's own generate button and the evidence of the last run. Mounted in the generator footer. */
export function KernelRunControls(): JSX.Element {
  const gen = useGeneratorStore()
  const kernel = useKernel()
  return (
    <Show when={millOnly()}>
      <button type="button" class="panel-btn panel-btn--primary panel-btn--block" disabled={!kernel.request() || gen.isGenerating} onClick={() => void kernel.generate()} data-testid="kernel-generate">
        {t(kernel.ownRun() ? "cam.kernel.generating" : "cam.kernel.generate")}
      </button>
      <Show when={kernel.ownRun() && kernel.progressLabel() !== undefined}>
        <p class="panel-hint" data-testid="kernel-progress" aria-live="polite">{kernel.progressLabel()}</p>
      </Show>
      <Show when={!kernel.request()}><p class="panel-hint">{t("cam.kernel.select")}</p></Show>
      <Show when={kernel.error()}><p role="alert" class="text-xs text-[color:var(--panel-bad)]">{kernel.error()}</p></Show>
      <Show when={kernel.result()?.status === "failed" ? kernel.result() : undefined}>{(value) => <ul class="text-xs text-[color:var(--panel-bad)]" role="alert"><For each={value().status === "failed" ? (value() as Extract<CamKernelResult, { status: "failed" }>).issues : []}>{(issue) => <li>{issue.message}</li>}</For></ul>}</Show>
      <Show when={kernel.artifact()}>{(value) => (
        <div class="space-y-2 text-xs" data-testid="kernel-evidence">
          <div class="flex justify-between gap-3 font-semibold"><span>{t("cam.kernel.release")}</span><span>{value().release}</span></div>
          <Show when={kernel.jobRuns().length > 1}>
            <div class="space-y-1" data-testid="kernel-job-programs">
              <div class="flex justify-between gap-3 font-semibold" data-testid="kernel-job-release">
                <span>{t("cam.kernel.job.release")}</span>
                <span>{jobRelease(kernel.jobRuns().map((run) => run.result.status === "ok" ? run.result.value.release : "blocked")) ?? ""}</span>
              </div>
              <For each={kernel.jobRuns()}>{(run) => (
                <div class="flex items-center justify-between gap-2" data-testid="kernel-job-program" data-setup={run.id} data-active={kernel.activeSetup() === run.id}>
                  <span class="truncate">
                    <strong>{run.id}</strong> {run.orientation} · {run.workOffset} ·{" "}
                    {run.result.status === "ok" ? run.result.value.release
                      : t("cam.kernel.job.failed", { id: run.id, message: run.result.issues[0]?.message ?? "" })}
                  </span>
                  <button type="button" class="panel-btn" data-testid="kernel-job-open"
                    disabled={run.result.status !== "ok" || run.result.value.release === "blocked" || kernel.activeSetup() === run.id}
                    onClick={() => kernel.openSetup(run.id)}>{t("cam.kernel.job.open")}</button>
                </div>
              )}</For>
            </div>
          </Show>
          <Show when={kernel.stale()}><p role="status" class="text-[color:var(--panel-warn)]" data-testid="kernel-stale">{t("cam.kernel.stale")}</p></Show>
          <Show when={diffLines(kernel.diff()).length > 0}>
            <div class="panel-hint space-y-1" data-testid="kernel-diff">
              <For each={diffLines(kernel.diff())}>{(line) => <p>{line}</p>}</For>
            </div>
          </Show>
          <Show when={kernel.stale() ? kernel.modelChange() : undefined}>{(change) => (
            <Show when={modelChangeText(change())}>{(text) => <p class="panel-hint" data-testid="kernel-model-change">{text()}</p>}</Show>
          )}</Show>
          <p>{t("cam.kernel.summary", { operations: value().operations.length, tools: value().tools.length, seconds: value().cycleTimeSeconds.toFixed(1) })}</p>
          <button type="button" class="panel-btn" data-testid="kernel-verify-nc" disabled={kernel.ncCheck().state === "running"} onClick={() => void kernel.verifyEditorNc()}>
            {t(kernel.ncCheck().state === "running" ? "cam.kernel.verifyNc.running" : "cam.kernel.verifyNc.button")}
          </button>
          <Show when={kernel.ncCheck()}>{(check) => (
            <div class="panel-hint space-y-1" role="status" data-testid="kernel-verify-nc-result" data-state={check().state} data-verdict={(check() as { verdict?: string }).verdict ?? ""}>
              <Show when={check().state === "failed"}><p>{t("cam.kernel.verifyNc.failed", { message: (check() as { message: string }).message })}</p></Show>
              <Show when={check().state === "done"}>
                <p class={(check() as { verdict: string }).verdict === "clean" ? "" : "text-[color:var(--panel-warn)]"}>
                  {t(`cam.kernel.verifyNc.${(check() as { verdict: "clean" | "faults" | "incomplete" }).verdict}` as "cam.kernel.verifyNc.clean")}
                </p>
                <For each={(check() as { lines: ReadonlyArray<string> }).lines}>{(line) => <p>{line}</p>}</For>
              </Show>
            </div>
          )}</Show>
          <button type="button" class="panel-btn" data-testid="kernel-setup-sheet" onClick={() => {
            const sheet = setupSheetFile(value(), kernel.request()?.name ?? value().jobId)
            if ("reason" in sheet) kernel.setError(sheet.reason)
            else downloadText(sheet.file, sheet.html, "text/html")
          }}>{t("cam.kernel.setupSheet")}</button>
          <Show when={value().tolerance}>{(budget) => (
            <p class="text-[color:var(--panel-text-muted)]" data-testid="kernel-tolerance-budget" title={budget().terms.map((term) => `${term.id} ${term.mm} mm: ${term.basis}`).join("\n")}>
              {t(budget().met ? "cam.kernel.tolerance.met" : "cam.kernel.tolerance.notMet", { requested: budget().requested, achieved: budget().achieved.toFixed(3) })}
              {budget().unbounded.length > 0 ? ` ${budget().unbounded.join("; ")}.` : ""}
            </p>
          )}</Show>
          <Show when={value().stock.fiveAxis}>{(five) => (
            <p class="text-[color:var(--panel-text-muted)]" data-testid="kernel-fiveaxis-stock">
              {t("cam.kernel.fiveAxisStock", { removedLower: five().removedLower.toFixed(0), removedUpper: five().removedUpper.toFixed(0), remainingLower: five().remainingLower.toFixed(0), remainingUpper: five().remainingUpper.toFixed(0), voxel: five().voxelMm })}
            </p>
          )}</Show>
          <div class="flex flex-wrap gap-2" data-testid="kernel-tools">
            <For each={value().tools}>
              {(tool) => (
                <div class="flex items-center gap-1 rounded border border-[color:var(--panel-border)] bg-[color:var(--panel-bg)] px-2 py-1 text-[11px] text-[color:var(--panel-text)]" title={`${tool.name}: Ø${tool.diameter}, ${tool.fluteLength} mm flutes, ${tool.stickout} mm stickout${tool.holder ? `, holder Ø${tool.holder.diameter} x ${tool.holder.length}` : ""}`}>
                  <ToolSilhouette cutter={tool as cam.kernel.Cutter} height={48} />
                  <span>T{tool.number}<br />Ø{tool.diameter}</span>
                </div>
              )}
            </For>
          </div>
          <For each={value().operations}>{(operation) => <div class="border-t border-[color:var(--panel-border)] pt-1"><span class="font-medium">{operation.name}</span><span class="block text-[color:var(--panel-text-muted)]">{operation.strategy} · {operation.toolId}{operation.cutting ? ` · ${operation.cutting.rpm.toFixed(0)} rpm · ${operation.cutting.feed.toFixed(0)} mm/min` : ""}</span></div>}</For>
          <For each={value().claims}>{(claim) => <div class="flex justify-between gap-2" title={claim.detail}><span>{claim.id}</span><span>{claim.status}</span></div>}</For>
          <For each={value().issues}>{(issue) => <p class={issue.severity === "error" ? "text-[color:var(--panel-bad)]" : "text-[color:var(--panel-warn)]"}>{issue.message}</p>}</For>
          <Show when={value().notes.length > 0}>
            <div class="space-y-0.5" data-testid="kernel-notes">
              <p class="font-medium">{t("cam.kernel.notes")}</p>
              <For each={value().notes}>{(note) => <p class="text-[color:var(--panel-text-muted)]">{note}</p>}</For>
            </div>
          </Show>
          <p class="text-[color:var(--panel-text-muted)]">{t("cam.kernel.scope")}</p>
        </div>
      )}</Show>
    </Show>
  )
}

/** The controls together, for a host that renders the kernel on its own. */
export default function KernelSection(props: { readonly onGCodeGenerated: (code: string) => void }): JSX.Element {
  return (
    <KernelSession onGCodeGenerated={props.onGCodeGenerated}>
      <KernelMachineControls />
      <KernelOperationControls />
      <KernelRunControls />
    </KernelSession>
  )
}
