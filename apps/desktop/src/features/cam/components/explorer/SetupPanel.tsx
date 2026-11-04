/**
 * The setup of the multi-toolpath panel (spec 14, RM-02): how its toolpaths become programs (grouping, retract before a tool
 * change), the tool table and tool changes the sidecar planned for them, and the project's saved setups (save, load, delete).
 *
 * A save replaces the setup this panel was loaded from only while that is still the stored revision; when it changed elsewhere the
 * panel says so and the user chooses: load the stored one, or keep this one (written over the revision they have now seen).
 */
import { For, Show, createEffect, createSignal, on, onCleanup, type JSX } from "solid-js"
import { FolderOpen, ListOrdered, Save, Trash2 } from "lucide-solid"
import type { CamSetupDocument } from "@cadcamfun/api"
import { Effect } from "effect"
import { t } from "../../../../i18n/index.ts"
import { useApp } from "../../../../shared/state/context.ts"
import { toast } from "../../../../shared/ui/toast.tsx"
import { useElementsStore } from "../../../cad/store/elementsStore.ts"
import { useDocumentStore } from "../../../cad/store/documentStore.ts"
import { makeSetupService, refOfDocument } from "../../api/setup.ts"
import { choicesOfSetup, setupOfToolpaths, toolpathsOfSetup, type SetupChoices } from "../../lib/setup.ts"
import { TOOLPATH_COLORS, useMultiToolpathStore } from "../../store/multiToolpathStore.ts"
import { useSetupStore } from "../../store/setupStore.ts"

const GROUPINGS: ReadonlyArray<SetupChoices["grouping"]> = ["single", "perTool", "perOperation"]
const FIELD = "w-full rounded-md border border-gray-600 bg-gray-900 px-2 py-1 text-sm text-white"
const ROW = "grid grid-cols-[3rem_1fr_4rem_5rem] gap-2 py-0.5"
const BUTTON ="px-2.5 py-1.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-45 disabled:cursor-not-allowed text-white text-xs rounded-md transition-colors flex items-center gap-1.5"

const messageOf = (cause: unknown): string => cause instanceof Error ? cause.message : typeof cause === "object" && cause !== null && "message" in cause ? String(cause.message) : String(cause)

export default function SetupPanel(): JSX.Element {
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
  const programs = () => setup.result?.programs.map((p) => ({ name: p.name, programNumber: p.programNumber, toolNumbers: p.toolNumbers, operations: p.operationIds.length }))
    ?? setup.plan?.programs.map((p) => ({ name: p.name, programNumber: p.programNumber, toolNumbers: p.toolNumbers, operations: p.operations.length }))

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

      <div class="flex flex-wrap items-center gap-2">
        <button type="button" class={BUTTON} data-testid="cam-setup-plan" disabled={busy() || toolpaths.toolpaths.length === 0} onClick={plan}>
          <ListOrdered size={14} />{t("cam.setupDoc.plan")}
        </button>
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
                <li data-testid="cam-setup-program">{t("cam.setupDoc.program", { number: program.programNumber, name: program.name, tools: program.toolNumbers.map((n) => `T${n}`).join(" "), count: program.operations })}</li>
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
