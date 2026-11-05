/**
 * The setup of the multi-toolpath panel (spec 14, RM-02): how its toolpaths become programs (grouping, retract before a tool
 * change), the tool table and tool changes the sidecar planned for them, and the project's saved setups (save, load, delete).
 *
 * A save replaces the setup this panel was loaded from only while that is still the stored revision; when it changed elsewhere the
 * panel says so and the user chooses: load the stored one, or keep this one (written over the revision they have now seen).
 */
import { For, Show, createEffect, createSignal, on, onCleanup, type JSX } from "solid-js"
import { FolderOpen, ListOrdered, Play, Plus, Save, Trash2, X, Zap } from "lucide-solid"
import type { CamSetupDocument } from "@cadcamfun/api"
import { Effect } from "effect"
import { cam } from "@cadcamfun/core"
import type { CamSetupGenerated } from "@cadcamfun/api"
import { NumberField } from "../../../../shared/components/panel/ui.tsx"
import { t } from "../../../../i18n/index.ts"
import { useApp } from "../../../../shared/state/context.ts"
import { toast } from "../../../../shared/ui/toast.tsx"
import { useElementsStore } from "../../../cad/store/elementsStore.ts"
import { useDocumentStore } from "../../../cad/store/documentStore.ts"
import { makeSetupService, refOfDocument } from "../../api/setup.ts"
import { choicesOfSetup, nextWorkpiece, offsetsOf, setupOfToolpaths, toolpathsOfSetup, type SetupChoices } from "../../lib/setup.ts"
import { TOOLPATH_COLORS, useMultiToolpathStore } from "../../store/multiToolpathStore.ts"
import { useSetupStore } from "../../store/setupStore.ts"

const GROUPINGS: ReadonlyArray<SetupChoices["grouping"]> = ["single", "perTool", "perOperation"]
const REGISTERS = ["G54", "G55", "G56", "G57", "G58", "G59"] as const
const ORDERS: ReadonlyArray<SetupChoices["workpieceOrder"]> = ["toolFirst", "partFirst"]
const FIELD = "w-full rounded-md border border-gray-600 bg-gray-900 px-2 py-1 text-sm text-white"
const ROW = "grid grid-cols-[3rem_1fr_4rem_5rem] gap-2 py-0.5"
const BUTTON ="px-2.5 py-1.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-45 disabled:cursor-not-allowed text-white text-xs rounded-md transition-colors flex items-center gap-1.5"

const messageOf = (cause: unknown): string => cause instanceof Error ? cause.message : typeof cause === "object" && cause !== null && "message" in cause ? String(cause.message) : String(cause)

export interface SetupPanelProps {
  /** Generates the setup's programs (the page owns the elements and the stock they need); the result lands in the setup store. */
  readonly onGenerate?: () => void
  /** Opens one generated program in the editor and the viewport. */
  readonly onOpenProgram?: (program: CamSetupGenerated["programs"][number]) => void
}

export default function SetupPanel(props: SetupPanelProps = {}): JSX.Element {
  const app = useApp()
  const service = makeSetupService(app.client)
  const setup = useSetupStore()
  const toolpaths = useMultiToolpathStore()
  const document = useDocumentStore()
  const [busy, setBusy] = createSignal(false)
  let disposed = false
  onCleanup(() => { disposed = true })

  const projectId = (): string | null => document.projectId
  const current = () => setupOfToolpaths(toolpaths.toolpaths, setup.choices)
  /** The tool table of the generated programs when there are some, else of the plan. */
  const table = () => setup.result?.toolTable ?? setup.plan?.toolTable
  const toolChanges = () => setup.result?.totals.toolChanges ?? setup.plan?.toolChanges
  const toolLoads = () => setup.result?.totals.toolLoads ?? setup.plan?.toolLoads
  const programs = () => setup.result?.programs.map((p) => ({ name: p.name, programNumber: p.programNumber, toolNumbers: p.toolNumbers, operations: p.operationIds.length, offsets: offsetsOf(p.program), generated: p }))
    ?? setup.plan?.programs.map((p) => ({ name: p.name, programNumber: p.programNumber, toolNumbers: p.toolNumbers, operations: p.operations.length, offsets: [] as ReadonlyArray<string>, generated: undefined }))
  /** The tool changes of the same operations in each order: the cost of finishing a part before the next is visible before it is chosen. */
  const orders = () => {
    if (setup.choices.workpieces.length < 2) return undefined
    const base = current()
    return { toolFirst: cam.program.planPrograms({ ...base, workpieceOrder: "toolFirst" }).toolChanges, partFirst: cam.program.planPrograms({ ...base, workpieceOrder: "partFirst" }).toolChanges }
  }

  const run = async <A,>(work: Effect.Effect<A, unknown>): Promise<A | undefined> => {
    setBusy(true)
    try { return await app.runtime.run(work) } finally { if (!disposed) setBusy(false) }
  }

  const refresh = async (id: string): Promise<void> => {
    const documents = await run(service.list(id)).catch((cause: unknown) => { toast.error(messageOf(cause)); return undefined })
    if (documents !== undefined && !disposed && projectId() === id) useSetupStore.getState().setDocuments(documents)
  }

  const plan = (): void => {
    void run(service.plan({ setup: current() }))
      .then((result) => { if (result !== undefined && !disposed) { useSetupStore.getState().setPlan(result); for (const warning of result.warnings) toast(warning) } })
      .catch((cause: unknown) => toast.error(messageOf(cause)))
  }

  /** `asNew` writes a new document even when the panel was loaded from one. */
  const save = async (asNew: boolean): Promise<void> => {
    const id = projectId()
    if (id === null) return
    const name = setup.choices.name.trim()
    if (name === "") { toast.error(t("cam.setupDoc.nameRequired")); return }
    const saved = asNew ? undefined : setup.saved
    const outcome = await run(service.persist({ projectId: id, saved, name, setup: current() }).pipe(
      Effect.map((document) => ({ kind: "saved" as const, document })),
      Effect.catchTag("SetupConflict", () => Effect.succeed({ kind: "conflict" as const }))
    )).catch((cause: unknown) => { toast.error(messageOf(cause)); return undefined })
    if (outcome === undefined || disposed) return
    if (outcome.kind === "conflict") { useSetupStore.getState().setConflict(true); toast.error(t("cam.setupDoc.conflict")); return }
    useSetupStore.getState().setSaved(refOfDocument(outcome.document))
    toast.success(t("cam.setupDoc.saved", { name }))
    await refresh(id)
  }

  /** Puts a saved setup on the panel: its operations become the toolpaths (to be regenerated) and its choices the panel's. */
  const apply = (document: CamSetupDocument): void => {
    const restored = toolpathsOfSetup(document.setup, useElementsStore.getState().elements, TOOLPATH_COLORS)
    useMultiToolpathStore.getState().replaceToolpaths(restored.toolpaths)
    const store = useSetupStore.getState()
    store.setChoices(choicesOfSetup(document.setup))
    store.setSaved(refOfDocument(document))
    if (restored.missingElementIds.length > 0) toast.error(t("cam.setupDoc.missingElements", { count: restored.missingElementIds.length }))
    if (restored.skippedOperationIds.length > 0) toast.error(t("cam.setupDoc.skippedOperations", { count: restored.skippedOperationIds.length }))
    toast.success(t("cam.setupDoc.loaded", { name: document.name }))
  }

  const load = (setupId: string): void => {
    const id = projectId()
    if (id === null) return
    void run(service.load(id, setupId)).then((document) => { if (document !== undefined && !disposed) apply(document) }).catch((cause: unknown) => toast.error(messageOf(cause)))
  }

  const remove = (target: CamSetupDocument): void => {
    void run(service.remove(target.projectId, target.id))
      .then(async () => {
        if (disposed) return
        if (setup.saved?.id === target.id) useSetupStore.getState().setSaved(undefined)
        await refresh(target.projectId)
      })
      .catch((cause: unknown) => toast.error(messageOf(cause)))
  }

  /** The conflict, resolved for the stored setup: it replaces the panel's. */
  const takeTheirs = (): void => { const saved = setup.saved; if (saved !== undefined) load(saved.id) }
  /** The conflict, resolved for the panel's setup: written over the stored revision, now that the user has seen there is one. */
  const keepMine = (): void => {
    const saved = setup.saved
    if (saved === undefined) return
    void run(service.load(saved.projectId, saved.id))
      .then(async (stored) => {
        if (stored === undefined || disposed) return
        useSetupStore.getState().setSaved(refOfDocument({ ...stored, name: saved.name }))
        await save(false)
      })
      .catch((cause: unknown) => toast.error(messageOf(cause)))
  }

  const workpieces = () => setup.choices.workpieces
  const addWorkpiece = (): void => {
    // The first press turns the one implicit part into a fixture of two: the part the setup already machines keeps its register.
    const base = workpieces().length === 0 ? [{ id: "wp-1", name: t("cam.workpieces.defaultName", { n: 1 }), workOffset: setup.choices.workOffset }] : workpieces()
    const next = nextWorkpiece(base, (n) => t("cam.workpieces.defaultName", { n }))
    if (next !== undefined) useSetupStore.getState().setChoices({ workpieces: [...base, next] })
  }
  const patchWorkpiece = (id: string, patch: Partial<SetupChoices["workpieces"][number]>): void =>
    useSetupStore.getState().setChoices({ workpieces: workpieces().map((wp) => (wp.id === id ? { ...wp, ...patch } : wp)) })
  const removeWorkpiece = (id: string): void => {
    const rest = workpieces().filter((wp) => wp.id !== id)
    useSetupStore.getState().setChoices({ workpieces: rest.length === 1 ? [] : rest, ...(rest.length === 1 ? { workOffset: rest[0]!.workOffset } : {}) })
  }

  // The saved list follows the open project; a setup saved in another project is not the one a save would replace.
  createEffect(on(projectId, (id) => {
    const saved = useSetupStore.getState().saved
    if (saved !== undefined && saved.projectId !== id) useSetupStore.getState().setSaved(undefined)
    if (id === null) useSetupStore.getState().setDocuments([])
    else void refresh(id)
  }))

  return (
    <div class="border-b border-gray-700 bg-gray-900 px-4 py-3 space-y-3" data-testid="cam-setup-panel">
      <div class="grid grid-cols-[1fr_auto_auto] items-end gap-2">
        <label class="space-y-1 text-xs text-gray-400">
          <span>{t("cam.setupDoc.name")}</span>
          <input class={FIELD} name="camSetupName" value={setup.choices.name} disabled={busy()}
            onInput={(event) => useSetupStore.getState().setChoices({ name: event.currentTarget.value })} />
        </label>
        <label class="space-y-1 text-xs text-gray-400">
          <span>{t("cam.setupDoc.grouping")}</span>
          <select class={FIELD} name="camSetupGrouping" value={setup.choices.grouping} disabled={busy()}
            onChange={(event) => useSetupStore.getState().setChoices({ grouping: event.currentTarget.value as SetupChoices["grouping"] })}>
            <For each={GROUPINGS}>{(grouping) => <option value={grouping}>{t(`cam.setupDoc.grouping.${grouping}`)}</option>}</For>
          </select>
        </label>
        <label class="flex items-center gap-1.5 pb-1.5 text-xs text-gray-300">
          <input type="checkbox" name="camSetupRetract" checked={setup.choices.retractBeforeToolChange} disabled={busy()}
            onChange={(event) => useSetupStore.getState().setChoices({ retractBeforeToolChange: event.currentTarget.checked })} />
          <span>{t("cam.setupDoc.retract")}</span>
        </label>
      </div>

      <div class="space-y-1.5" data-testid="cam-setup-workpieces">
        <div class="flex items-center justify-between gap-2 text-xs text-gray-400">
          <span class="font-medium">{t("cam.workpieces.title")}</span>
          <button type="button" class={BUTTON} data-testid="cam-setup-workpiece-add" disabled={busy() || workpieces().length >= 6} onClick={addWorkpiece}>
            <Plus size={12} />{t("cam.workpieces.add")}
          </button>
        </div>
        <Show when={workpieces().length > 1} fallback={<p class="text-xs text-gray-500">{t("cam.workpieces.hint")}</p>}>
          <For each={workpieces()}>{(wp) => (
            <div class="space-y-1" data-testid="cam-setup-workpiece" data-id={wp.id}>
            <div class="grid grid-cols-[1fr_5rem_auto] items-center gap-2">
              <input class={FIELD} name={`camWorkpieceName-${wp.id}`} value={wp.name} aria-label={t("cam.workpieces.name")} disabled={busy()}
                onInput={(event) => patchWorkpiece(wp.id, { name: event.currentTarget.value })} />
              <select class={FIELD} name={`camWorkpieceOffset-${wp.id}`} value={wp.workOffset} aria-label={t("cam.workpieces.offset")} disabled={busy()}
                onChange={(event) => patchWorkpiece(wp.id, { workOffset: event.currentTarget.value as typeof REGISTERS[number] })}>
                <For each={REGISTERS}>{(register) => <option value={register} disabled={register !== wp.workOffset && workpieces().some((other) => other.workOffset === register)}>{register}</option>}</For>
              </select>
              <button type="button" class={BUTTON} data-testid="cam-setup-workpiece-remove" disabled={busy()} onClick={() => removeWorkpiece(wp.id)} aria-label={t("cam.workpieces.remove")} title={t("cam.workpieces.remove")}><X size={12} /></button>
            </div>
            <Show when={wp.id !== workpieces()[0]?.id}>
              <div class="grid grid-cols-3 items-center gap-2" role="group" aria-label={t("cam.workpieces.placement")} title={t("cam.workpieces.placement")}>
                <For each={["x", "y", "z"] as const}>{(axis) => (
                  <label class="flex items-center gap-1 text-xs text-gray-400">
                    <span class="uppercase">{axis}</span>
                    <NumberField class={FIELD} name={`camWorkpiece${axis}-${wp.id}`} value={wp.placement?.[axis] ?? 0} accept={() => true}
                      onValue={(value) => patchWorkpiece(wp.id, { placement: { x: 0, y: 0, z: 0, ...wp.placement, [axis]: value } })} />
                  </label>
                )}</For>
              </div>
            </Show>
            </div>
          )}</For>
          <label class="flex items-center gap-2 text-xs text-gray-400">
            <span>{t("cam.workpieces.order")}</span>
            <select class={FIELD} name="camWorkpieceOrder" value={setup.choices.workpieceOrder} disabled={busy()}
              onChange={(event) => useSetupStore.getState().setChoices({ workpieceOrder: event.currentTarget.value as SetupChoices["workpieceOrder"] })}>
              <For each={ORDERS}>{(order) => <option value={order}>{t(`cam.workpieces.order.${order}`)}</option>}</For>
            </select>
          </label>
          <Show when={orders()}>{(counts) => <p class="text-xs text-gray-500" data-testid="cam-setup-order-changes">{t("cam.workpieces.orderChanges", { toolFirst: counts().toolFirst, partFirst: counts().partFirst })}</p>}</Show>
        </Show>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <button type="button" class={BUTTON} data-testid="cam-setup-plan" disabled={busy() || toolpaths.toolpaths.length === 0} onClick={plan}>
          <ListOrdered size={14} />{t("cam.setupDoc.plan")}
        </button>
        <Show when={props.onGenerate}>{(generate) => (
          <button type="button" class={BUTTON} data-testid="cam-setup-generate" disabled={busy() || toolpaths.toolpaths.length === 0} onClick={() => generate()()}>
            <Zap size={14} />{t("cam.setupDoc.generate")}
          </button>
        )}</Show>
        <button type="button" class={BUTTON} data-testid="cam-setup-save" disabled={busy() || projectId() === null || toolpaths.toolpaths.length === 0} onClick={() => void save(false)}>
          <Save size={14} />{setup.saved === undefined ? t("cam.setupDoc.save") : t("cam.setupDoc.update")}
        </button>
        <Show when={setup.saved !== undefined}>
          <button type="button" class={BUTTON} data-testid="cam-setup-save-new" disabled={busy() || projectId() === null || toolpaths.toolpaths.length === 0} onClick={() => void save(true)}>
            <Save size={14} />{t("cam.setupDoc.saveAsNew")}
          </button>
        </Show>
        <Show when={projectId() === null}>
          <span class="text-xs text-gray-500" data-testid="cam-setup-no-project">{t("cam.setupDoc.noProject")}</span>
        </Show>
        <Show when={setup.saved}>
          {(saved) => <span class="text-xs text-gray-400" data-testid="cam-setup-saved">{t("cam.setupDoc.editing", { name: saved().name })}</span>}
        </Show>
      </div>

      <Show when={setup.conflict}>
        <div role="alert" class="rounded-md border border-amber-500/60 bg-amber-500/10 p-2 text-xs text-amber-200 space-y-2" data-testid="cam-setup-conflict">
          <p>{t("cam.setupDoc.conflict")}</p>
          <div class="flex gap-2">
            <button type="button" class={BUTTON} data-testid="cam-setup-take-theirs" disabled={busy()} onClick={takeTheirs}>{t("cam.setupDoc.takeTheirs")}</button>
            <button type="button" class={BUTTON} data-testid="cam-setup-keep-mine" disabled={busy()} onClick={keepMine}>{t("cam.setupDoc.keepMine")}</button>
          </div>
        </div>
      </Show>

      <Show when={table()}>
        {(entries) => (
          <div class="space-y-2" data-testid="cam-setup-tooltable">
            <div class="flex gap-4 text-xs text-gray-300">
              <span data-testid="cam-setup-tool-loads">{t("cam.setupDoc.toolLoads", { count: toolLoads() ?? 0 })}</span>
              <span data-testid="cam-setup-tool-changes">{t("cam.setupDoc.toolChanges", { count: toolChanges() ?? 0 })}</span>
            </div>
            {/* An ARIA grid of divs: a row template of its own (`<tr>` outside a table) does not parse everywhere the panel renders. */}
            <div role="table" class="text-xs text-gray-300">
              <div role="row" class={`${ROW} text-gray-500`}>
                <span role="columnheader">{t("cam.setupDoc.pocket")}</span>
                <span role="columnheader">{t("cam.setupDoc.tool")}</span>
                <span role="columnheader" class="text-right">{t("cam.setupDoc.diameter")}</span>
                <span role="columnheader" class="text-right">{t("cam.setupDoc.operations")}</span>
              </div>
              <For each={entries()}>{(entry) => (
                <div role="row" class={ROW} data-testid="cam-setup-tool-row" data-pocket={entry.pocket}>
                  <span role="cell" class="tabular-nums">{`T${entry.pocket}`}</span>
                  <span role="cell" class="truncate">{entry.tool.name}</span>
                  <span role="cell" class="text-right tabular-nums">{entry.tool.diameter}</span>
                  <span role="cell" class="text-right tabular-nums">{entry.operationIds.length}</span>
                </div>
              )}</For>
            </div>
            <ul class="space-y-0.5 text-xs text-gray-400">
              <For each={programs() ?? []}>{(program) => (
                <li class="flex items-center justify-between gap-2" data-testid="cam-setup-program">
                  <span>
                    {t("cam.setupDoc.program", { number: program.programNumber, name: program.name, tools: program.toolNumbers.map((n) => `T${n}`).join(" "), count: program.operations })}
                    <Show when={program.offsets.length > 1}>{" · "}{t("cam.setupDoc.offsets", { offsets: program.offsets.join(" ") })}</Show>
                  </span>
                  <Show when={program.generated !== undefined && props.onOpenProgram}>
                    <button type="button" class={BUTTON} data-testid="cam-setup-open-program" onClick={() => props.onOpenProgram?.(program.generated!)} aria-label={t("cam.setupDoc.open")} title={t("cam.setupDoc.open")}><Play size={12} /></button>
                  </Show>
                </li>
              )}</For>
            </ul>
          </div>
        )}
      </Show>

      <Show when={projectId() !== null}>
        <div class="space-y-1" data-testid="cam-setup-documents">
          <div class="text-xs font-medium text-gray-400">{t("cam.setupDoc.savedList")}</div>
          <Show when={setup.documents.length > 0} fallback={<div class="text-xs text-gray-500">{t("cam.setupDoc.noneSaved")}</div>}>
            <For each={setup.documents}>{(saved) => (
              <div class="flex items-center justify-between gap-2 rounded-md bg-gray-800 px-2 py-1 text-xs text-white" data-testid="cam-setup-document" data-id={saved.id}>
                <span class="truncate">{saved.name}</span>
                <span class="text-gray-500 tabular-nums">{t("cam.setupDoc.operationCount", { count: saved.setup.operations.length })}</span>
                <div class="flex gap-1">
                  <button type="button" class={BUTTON} data-testid="cam-setup-load" disabled={busy()} onClick={() => load(saved.id)} aria-label={t("cam.setupDoc.load")} title={t("cam.setupDoc.load")}><FolderOpen size={12} /></button>
                  <button type="button" class={BUTTON} data-testid="cam-setup-delete" disabled={busy()} onClick={() => remove(saved)} aria-label={t("cam.setupDoc.delete")} title={t("cam.setupDoc.delete")}><Trash2 size={12} /></button>
                </div>
              </div>
            )}</For>
          </Show>
        </div>
      </Show>
    </div>
  )
}
