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
import {
  DEFAULT_ENVELOPE, MAX_PROBE_CYCLES, MAX_WORKPIECES, PROBE_KINDS, REGISTER_CHOICES, choicesOfSetup, defaultProbeCycle, evidenceOfProgram, expandedOperations, freshId, nextFixture,
  nextWorkpiece, offsetsOf, probeFields, registerKey, setupOfToolpaths, stepOfSettings, toggleStepDependency, toolpathsOfSetup, useOf, withFixtureCorner, withRegister,
  withStepSettings, withoutStep, withoutWorkpiece, type PartProbeCycle, type ProbeCycleKind, type SetupChoices
} from "../../lib/setup.ts"
import { stockOf } from "../../lib/job.ts"
import { useJob } from "../../hooks/useJob.ts"
import { useSelectionStore } from "../../../cad/store/selectorStore.ts"
import { useGeneratorStore } from "../../store/generatorStore.ts"
import { TOOLPATH_COLORS, useMultiToolpathStore } from "../../store/multiToolpathStore.ts"
import { useSetupStore } from "../../store/setupStore.ts"
import { useCamStore } from "../../store/camStore.ts"

const RELEASE_LABEL = { blocked: "cam.setupDoc.release.blocked", preview: "cam.setupDoc.release.preview", "verified-program": "cam.setupDoc.release.verified-program" } as const
const VERDICT_LABEL = { clean: "cam.setupDoc.verdict.clean", faults: "cam.setupDoc.verdict.faults", incomplete: "cam.setupDoc.verdict.incomplete" } as const

const GROUPINGS: ReadonlyArray<SetupChoices["grouping"]> = ["single", "perTool", "perOperation"]
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
  /** Opens one generated program in the editor and saves it as a project program (the page owns the save dialog). */
  readonly onSaveProgram?: (program: CamSetupGenerated["programs"][number]) => void
}

export default function SetupPanel(props: SetupPanelProps = {}): JSX.Element {
  const app = useApp()
  const service = makeSetupService(app.client)
  const setup = useSetupStore()
  const toolpaths = useMultiToolpathStore()
  const camStore = useCamStore()
  const document = useDocumentStore()
  const job = useJob()
  const selection = useSelectionStore()
  const [busy, setBusy] = createSignal(false)
  const [picked, setPicked] = createSignal<string>()
  let disposed = false
  onCleanup(() => { disposed = true })

  const projectId = (): string | null => document.projectId
  const current = () => setupOfToolpaths(toolpaths.toolpaths, setup.choices, stockOf(job.sources()))
  /** Template uses are operations too: a setup of uses alone is a setup to plan and generate. */
  const hasWork = () => toolpaths.toolpaths.length > 0 || setup.choices.uses.length > 0
  /** The tool table of the generated programs when there are some, else of the plan. */
  const table = () => setup.result?.toolTable ?? setup.plan?.toolTable
  const toolChanges = () => setup.result?.totals.toolChanges ?? setup.plan?.toolChanges
  const toolLoads = () => setup.result?.totals.toolLoads ?? setup.plan?.toolLoads
  const programs = () => setup.result?.programs.map((p) => ({ probe: p.kind === "probe", name: p.name, programNumber: p.programNumber, toolNumbers: p.toolNumbers, operations: p.operationIds.length, offsets: offsetsOf(p.program), generated: p, hints: p.warnings.filter((w) => / faster than /.test(w)), evidence: evidenceOfProgram(p.evidence, p.gcode) }))
    ?? setup.plan?.programs.map((p) => ({ probe: false, name: p.name, programNumber: p.programNumber, toolNumbers: p.toolNumbers, operations: p.operations.length, offsets: [] as ReadonlyArray<string>, generated: undefined, hints: [] as ReadonlyArray<string>, evidence: undefined }))
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
  const replaceWorkpiece = (id: string, change: (wp: SetupChoices["workpieces"][number]) => SetupChoices["workpieces"][number]): void =>
    useSetupStore.getState().setChoices({ workpieces: workpieces().map((wp) => (wp.id === id ? change(wp) : wp)) })
  /** A part's own blank: centred on its datum, top face at the datum, seeded from the raw piece the page holds. */
  const blankOf = (size: { readonly x: number; readonly y: number; readonly z: number }): NonNullable<SetupChoices["workpieces"][number]["stock"]> =>
    ({ x: size.x, y: size.y, z: size.z, origin: { x: -size.x / 2, y: -size.y / 2, z: 0 }, material: camStore.material || "aluminum" })
  /** What the setup says is wrong with the fixture, the tools and the order of the operations; the rows show their own. */
  const issues = () => !hasWork() ? [] : cam.program.validateSetup(current())
  const removeWorkpiece = (id: string): void => {
    const rest = workpieces().filter((wp) => wp.id !== id)
    // A toolpath limited to the part that left, or to a fixture of one part, runs unrestricted again.
    for (const toolpath of toolpaths.toolpaths) {
      if (toolpath.workpieceIds === undefined) continue
      toolpaths.updateToolpath(toolpath.id, { workpieceIds: withoutWorkpiece(toolpath.workpieceIds, id, rest.length) })
    }
    useSetupStore.getState().setChoices({ workpieces: rest.length === 1 ? [] : rest, ...(rest.length === 1 ? { workOffset: rest[0]!.workOffset } : {}) })
  }


  // ---- clamps, jaws and the machine's travel
  const fixtures = () => setup.choices.fixtures
  const choose = (patch: Partial<SetupChoices>): void => useSetupStore.getState().setChoices(patch)
  const addFixture = (): void => choose({ fixtures: [...fixtures(), nextFixture(fixtures(), (n) => t("cam.fixtures.defaultName", { n }))] })
  const patchFixture = (id: string, change: (box: SetupChoices["fixtures"][number]) => SetupChoices["fixtures"][number]): void =>
    choose({ fixtures: fixtures().map((box) => (box.id === id ? change(box) : box)) })
  const removeFixture = (id: string): void => choose({ fixtures: fixtures().filter((box) => box.id !== id) })
  const envelopeIssues = () => issues().filter((issue) => /machine travel/.test(issue.message))
  const fixtureIssues = (name: string) => issues().filter((issue) => issue.operationId === undefined && issue.message.includes(name))
  const patchEnvelope = (corner: "min" | "max", axis: "x" | "y" | "z", value: number): void => {
    const envelope = setup.choices.envelope ?? DEFAULT_ENVELOPE
    choose({ envelope: { ...envelope, [corner]: { ...envelope[corner], [axis]: value } } })
  }

  // ---- operation templates
  const templates = () => setup.choices.templates
  const stepsOfSettings = (template: SetupChoices["templates"][number]): SetupChoices["templates"][number] => {
    const id = freshId("step", template.steps.map((step) => step.id))
    const settings = { ...useGeneratorStore.getState().settings }
    return { ...template, steps: [...template.steps, stepOfSettings(id, t("cam.templates.stepName", { n: template.steps.length + 1 }), settings)] }
  }
  const addTemplate = (): void => {
    const id = freshId("tpl", templates().map((template) => template.id))
    const name = t("cam.templates.defaultName", { n: templates().length + 1 })
    choose({ templates: [...templates(), { id, name, steps: [stepOfSettings("step-1", t("cam.templates.stepName", { n: 1 }), { ...useGeneratorStore.getState().settings })] }] })
    setPicked(id)
  }
  const patchTemplate = (id: string, change: (template: SetupChoices["templates"][number]) => SetupChoices["templates"][number]): void =>
    choose({ templates: templates().map((template) => (template.id === id ? change(template) : template)) })
  const removeTemplate = (id: string): void => choose({ templates: templates().filter((template) => template.id !== id), uses: setup.choices.uses.filter((use) => use.templateId !== id) })
  const chosenTemplate = () => templates().find((template) => template.id === picked()) ?? templates()[0]
  const selectedIds = (): ReadonlyArray<string> => selection.selectedElementIds
  const applyTemplate = (template: SetupChoices["templates"][number]): void => {
    const ids = selectedIds()
    if (ids.length === 0) { toast.error(t("cam.templates.noSelection")); return }
    const id = freshId("use", setup.choices.uses.map((use) => use.id))
    choose({ uses: [...setup.choices.uses, useOf(id, template, ids, { name: template.name })] })
  }
  const patchUse = (id: string, change: (use: SetupChoices["uses"][number]) => SetupChoices["uses"][number]): void =>
    choose({ uses: setup.choices.uses.map((use) => (use.id === id ? change(use) : use)) })
  const removeUse = (id: string): void => choose({ uses: setup.choices.uses.filter((use) => use.id !== id) })
  const elementName = (id: string): string => {
    const element = useElementsStore.getState().elements.find((candidate) => candidate["id"] === id)
    return String(element?.["name"] ?? element?.["type"] ?? id)
  }
  const expanded = () => expandedOperations(current())

  // ---- the datum probe of every part
  const probe = () => setup.choices.partProbe
  const probeOn = (on: boolean): void => choose({ partProbe: on ? { cycles: [defaultProbeCycle("z-surface")] } : undefined, probePart: on })
  const patchProbeCycle = (index: number, cycle: PartProbeCycle): void => {
    const config = probe()
    if (config !== undefined) choose({ partProbe: { ...config, cycles: config.cycles.map((c, i) => (i === index ? cycle : c)) } })
  }
  const addProbeCycle = (): void => {
    const config = probe()
    if (config !== undefined && config.cycles.length < MAX_PROBE_CYCLES) choose({ partProbe: { ...config, cycles: [...config.cycles, defaultProbeCycle("bore")] } })
  }
  const removeProbeCycle = (index: number): void => {
    const config = probe()
    if (config !== undefined && config.cycles.length > 1) choose({ partProbe: { ...config, cycles: config.cycles.filter((_, i) => i !== index) } })
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
          <button type="button" class={BUTTON} data-testid="cam-setup-workpiece-add" disabled={busy() || workpieces().length >= MAX_WORKPIECES} onClick={addWorkpiece}>
            <Plus size={12} />{t("cam.workpieces.add")}
          </button>
        </div>
        <Show when={workpieces().length > 1} fallback={<p class="text-xs text-gray-500">{t("cam.workpieces.hint")}</p>}>
          <For each={workpieces()}>{(wp) => (
            <div class="space-y-1" data-testid="cam-setup-workpiece" data-id={wp.id}>
            <div class="grid grid-cols-[1fr_5rem_auto] items-center gap-2">
              <input class={FIELD} name={`camWorkpieceName-${wp.id}`} value={wp.name} aria-label={t("cam.workpieces.name")} disabled={busy()}
                onInput={(event) => patchWorkpiece(wp.id, { name: event.currentTarget.value })} />
              <select class={FIELD} name={`camWorkpieceOffset-${wp.id}`} value={registerKey(wp)} aria-label={t("cam.workpieces.offset")} disabled={busy()}
                onChange={(event) => replaceWorkpiece(wp.id, (current) => withRegister(current, event.currentTarget.value))}>
                <For each={REGISTER_CHOICES}>{(register) => <option value={register.key} disabled={register.key !== registerKey(wp) && workpieces().some((other) => registerKey(other) === register.key)}>{register.key}</option>}</For>
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
            <div class="grid grid-cols-3 items-center gap-2" role="group" aria-label={t("cam.workpieces.index")} title={t("cam.workpieces.index")}>
              <For each={["a", "b", "c"] as const}>{(axis) => (
                <label class="flex items-center gap-1 text-xs text-gray-400">
                  <span class="uppercase">{axis}</span>
                  <NumberField class={FIELD} name={`camWorkpiece${axis}-${wp.id}`} value={wp.index?.[axis] ?? 0} accept={() => true}
                    onValue={(value) => patchWorkpiece(wp.id, { index: { ...wp.index, [axis]: value } })} />
                </label>
              )}</For>
            </div>
            <label class="flex items-center gap-1.5 text-xs text-gray-400">
              <input type="checkbox" name={`camWorkpieceBlank-${wp.id}`} checked={wp.stock !== undefined} disabled={busy()}
                onChange={(event) => replaceWorkpiece(wp.id, ({ stock: _blank, ...rest }) => (event.currentTarget.checked ? { ...rest, stock: blankOf(camStore.workpiece) } : rest))} />
              <span>{t("cam.workpieces.blank")}</span>
            </label>
            <Show when={wp.stock}>{(blank) => (
              <div class="grid grid-cols-3 items-center gap-2" role="group" aria-label={t("cam.workpieces.blank")}>
                <For each={["x", "y", "z"] as const}>{(axis) => (
                  <label class="flex items-center gap-1 text-xs text-gray-400">
                    <span class="uppercase">{axis}</span>
                    <NumberField class={FIELD} name={`camWorkpieceBlank${axis}-${wp.id}`} value={blank()[axis]}
                      onValue={(value) => replaceWorkpiece(wp.id, (current) => ({ ...current, stock: blankOf({ x: blank().x, y: blank().y, z: blank().z, [axis]: value }) }))} />
                  </label>
                )}</For>
              </div>
            )}</Show>
            <For each={issues().filter((issue) => issue.operationId === undefined && issue.message.includes(wp.name) && !fixtures().some((box) => issue.message.includes(box.name)))}>{(issue) => (
              <p class="text-xs text-red-400" role="alert" data-testid="cam-setup-workpiece-issue">{issue.message}</p>
            )}</For>
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

      <label class="flex items-center gap-2 text-xs text-gray-400">
        <span>{t("cam.setupDoc.magazine")}</span>
        <NumberField class={`${FIELD} w-20`} name="camSetupMagazine" int value={setup.choices.magazineSize} accept={(value) => value >= 0}
          onValue={(value) => useSetupStore.getState().setChoices({ magazineSize: value })} />
      </label>

      <div class="space-y-1.5" data-testid="cam-setup-fixtures">
        <div class="flex items-center justify-between gap-2 text-xs text-gray-400">
          <span class="font-medium" title={t("cam.fixtures.hint")}>{t("cam.fixtures.title")}</span>
          <button type="button" class={BUTTON} data-testid="cam-setup-fixture-add" disabled={busy() || fixtures().length >= 64} onClick={addFixture}><Plus size={12} />{t("cam.fixtures.add")}</button>
        </div>
        <Show when={fixtures().length === 0}><p class="text-xs text-gray-500">{t("cam.fixtures.hint")}</p></Show>
        <For each={fixtures()}>{(box) => (
          <div class="space-y-1" data-testid="cam-setup-fixture" data-id={box.id}>
            <div class="grid grid-cols-[1fr_auto] items-center gap-2">
              <input class={FIELD} name={`camFixtureName-${box.id}`} value={box.name} aria-label={t("cam.fixtures.name")} disabled={busy()} onInput={(event) => patchFixture(box.id, (current) => ({ ...current, name: event.currentTarget.value }))} />
              <button type="button" class={BUTTON} data-testid="cam-setup-fixture-remove" disabled={busy()} onClick={() => removeFixture(box.id)} aria-label={t("cam.fixtures.remove")} title={t("cam.fixtures.remove")}><X size={12} /></button>
            </div>
            <For each={["min", "max"] as const}>{(corner) => (
              <div class="grid grid-cols-[2.5rem_1fr_1fr_1fr] items-center gap-2" role="group" aria-label={t(`cam.fixtures.${corner}`)}>
                <span class="text-xs text-gray-500">{t(`cam.fixtures.${corner}`)}</span>
                <For each={["x", "y", "z"] as const}>{(axis) => (
                  <label class="flex items-center gap-1 text-xs text-gray-400">
                    <span class="uppercase">{axis}</span>
                    <NumberField class={FIELD} name={`camFixture${corner}${axis}-${box.id}`} value={box[corner][axis]} accept={() => true}
                      onValue={(value) => patchFixture(box.id, (current) => withFixtureCorner(current, corner, axis, value))} />
                  </label>
                )}</For>
              </div>
            )}</For>
            <For each={fixtureIssues(box.name).concat(box.max.x > box.min.x && box.max.y > box.min.y && box.max.z > box.min.z ? [] : [{ message: t("cam.fixtures.degenerate", { name: box.name }) }])}>{(issue) => (
              <p class="text-xs text-red-400" role="alert" data-testid="cam-setup-fixture-issue">{issue.message}</p>
            )}</For>
          </div>
        )}</For>
        <label class="flex items-center gap-1.5 text-xs text-gray-400">
          <input type="checkbox" name="camSetupEnvelope" checked={setup.choices.envelope !== undefined} disabled={busy()} onChange={(event) => choose({ envelope: event.currentTarget.checked ? DEFAULT_ENVELOPE : undefined })} />
          <span>{t("cam.fixtures.envelope")}</span>
        </label>
        <Show when={setup.choices.envelope}>{(envelope) => (
          <div class="space-y-1" data-testid="cam-setup-envelope">
            <For each={["min", "max"] as const}>{(corner) => (
              <div class="grid grid-cols-[2.5rem_1fr_1fr_1fr] items-center gap-2" role="group" aria-label={`${t("cam.fixtures.envelope")} ${t(`cam.fixtures.${corner}`)}`}>
                <span class="text-xs text-gray-500">{t(`cam.fixtures.${corner}`)}</span>
                <For each={["x", "y", "z"] as const}>{(axis) => (
                  <label class="flex items-center gap-1 text-xs text-gray-400">
                    <span class="uppercase">{axis}</span>
                    <NumberField class={FIELD} name={`camEnvelope${corner}${axis}`} value={envelope()[corner][axis]} accept={() => true} onValue={(value) => patchEnvelope(corner, axis, value)} />
                  </label>
                )}</For>
              </div>
            )}</For>
            <For each={envelopeIssues()}>{(issue) => <p class="text-xs text-red-400" role="alert" data-testid="cam-setup-envelope-issue">{issue.message}</p>}</For>
          </div>
        )}</Show>
      </div>

      <div class="space-y-1.5" data-testid="cam-setup-templates">
        <div class="flex items-center justify-between gap-2 text-xs text-gray-400">
          <span class="font-medium">{t("cam.templates.title")}</span>
          <button type="button" class={BUTTON} data-testid="cam-setup-template-add" disabled={busy() || templates().length >= 64} onClick={addTemplate} title={t("cam.templates.addHint")}><Plus size={12} />{t("cam.templates.add")}</button>
        </div>
        <Show when={templates().length === 0}><p class="text-xs text-gray-500">{t("cam.templates.hint")}</p></Show>
        <Show when={templates().length > 1}>
          <select class={FIELD} name="camTemplatePicked" aria-label={t("cam.templates.pick")} value={chosenTemplate()?.id} onChange={(event) => setPicked(event.currentTarget.value)}>
            <For each={templates()}>{(template) => <option value={template.id}>{template.name}</option>}</For>
          </select>
        </Show>
        <Show when={chosenTemplate()}>{(template) => (
          <div class="space-y-1.5 rounded-md border border-gray-700 p-2" data-testid="cam-setup-template" data-id={template().id}>
            <div class="grid grid-cols-[1fr_auto] items-center gap-2">
              <input class={FIELD} name={`camTemplateName-${template().id}`} value={template().name} aria-label={t("cam.templates.name")} disabled={busy()} onInput={(event) => patchTemplate(template().id, (current) => ({ ...current, name: event.currentTarget.value }))} />
              <button type="button" class={BUTTON} data-testid="cam-setup-template-remove" disabled={busy()} onClick={() => removeTemplate(template().id)} aria-label={t("cam.templates.remove")} title={t("cam.templates.remove")}><Trash2 size={12} /></button>
            </div>
            <For each={template().steps}>{(step, index) => (
              <div class="space-y-1" data-testid="cam-setup-template-step" data-id={step.id}>
                <div class="grid grid-cols-[1fr_auto] items-center gap-2">
                  <input class={FIELD} name={`camTemplateStep-${template().id}-${step.id}`} value={step.name} aria-label={t("cam.templates.stepLabel")} disabled={busy()}
                    onInput={(event) => patchTemplate(template().id, (current) => ({ ...current, steps: current.steps.map((other) => (other.id === step.id ? { ...other, name: event.currentTarget.value } : other)) }))} />
                  <button type="button" class={BUTTON} data-testid="cam-setup-template-step-remove" disabled={busy() || template().steps.length <= 1} onClick={() => patchTemplate(template().id, (current) => withoutStep(current, step.id))} aria-label={t("cam.templates.removeStep")} title={t("cam.templates.removeStep")}><X size={12} /></button>
                </div>
                <div class="grid grid-cols-3 items-center gap-2" role="group" aria-label={t("cam.templates.settings")}>
                  <For each={[["toolDiameter", "cam.templates.diameter"], ["depth", "cam.templates.depth"], ["stepdown", "cam.templates.stepdown"]] as const}>{([key, label]) => (
                    <label class="flex items-center gap-1 text-xs text-gray-400" title={t(label)}>
                      <span>{t(label)}</span>
                      <NumberField class={FIELD} name={`camTemplate${key}-${template().id}-${step.id}`} value={Number(step.params[key])} accept={(value) => value > 0}
                        onValue={(value) => patchTemplate(template().id, (current) => ({ ...current, steps: current.steps.map((other) => (other.id === step.id ? withStepSettings(other, { [key]: value }) : other)) }))} />
                    </label>
                  )}</For>
                </div>
                <Show when={index() > 0}>
                  <div class="flex flex-wrap items-center gap-1 text-xs text-gray-400" role="group" aria-label={t("cam.templates.dependsOn")}>
                    <span>{t("cam.templates.dependsOn")}</span>
                    <For each={template().steps.slice(0, index())}>{(earlier) => (
                      <button type="button" class={BUTTON} aria-pressed={(step.dependsOn ?? []).includes(earlier.id)} data-testid="cam-setup-template-depends" data-active={(step.dependsOn ?? []).includes(earlier.id) ? "true" : "false"}
                        onClick={() => patchTemplate(template().id, (current) => toggleStepDependency(current, step.id, earlier.id))}>{earlier.name}</button>
                    )}</For>
                  </div>
                </Show>
              </div>
            )}</For>
            <div class="flex flex-wrap items-center gap-2">
              <button type="button" class={BUTTON} data-testid="cam-setup-template-step-add" disabled={busy() || template().steps.length >= 16} onClick={() => patchTemplate(template().id, stepsOfSettings)} title={t("cam.templates.addStepHint")}><Plus size={12} />{t("cam.templates.addStep")}</button>
              <button type="button" class={BUTTON} data-testid="cam-setup-template-apply" disabled={busy()} onClick={() => applyTemplate(template())} title={t("cam.templates.applyHint")}><Zap size={12} />{t("cam.templates.apply", { count: selectedIds().length })}</button>
            </div>
          </div>
        )}</Show>
        <For each={setup.choices.uses}>{(use) => (
          <div class="space-y-1 rounded-md bg-gray-800 px-2 py-1 text-xs text-white" data-testid="cam-setup-template-use" data-id={use.id}>
            <div class="flex items-center justify-between gap-2">
              <span class="truncate">{t("cam.templates.use", { name: use.name ?? use.templateId, elements: use.elementIds.map(elementName).join(", ") })}</span>
              <button type="button" class={BUTTON} data-testid="cam-setup-template-use-remove" disabled={busy()} onClick={() => removeUse(use.id)} aria-label={t("cam.templates.removeUse")} title={t("cam.templates.removeUse")}><X size={12} /></button>
            </div>
            <div class="flex flex-wrap items-center gap-3 text-gray-300">
              <label class="flex items-center gap-1.5"><input type="checkbox" checked={use.perElement === true} disabled={busy()} onChange={(event) => patchUse(use.id, (current) => ({ ...current, perElement: event.currentTarget.checked }))} /><span>{t("cam.templates.perElement")}</span></label>
              <select class={`${FIELD} w-auto`} name={`camTemplateOrder-${use.id}`} value={use.order ?? "perStep"} aria-label={t("cam.templates.order")} disabled={busy()}
                onChange={(event) => patchUse(use.id, (current) => ({ ...current, order: event.currentTarget.value as "perStep" | "perFeature" }))}>
                <option value="perStep">{t("cam.templates.order.perStep")}</option>
                <option value="perFeature">{t("cam.templates.order.perFeature")}</option>
              </select>
            </div>
            <Show when={workpieces().length > 1}>
              <div class="flex flex-wrap items-center gap-1 text-gray-400" role="group" aria-label={t("cam.workpieces.runsOn")}>
                <span>{t("cam.workpieces.runsOn")}</span>
                <For each={workpieces()}>{(wp) => {
                  const on = () => use.workpieceIds === undefined || use.workpieceIds.includes(wp.id)
                  return <button type="button" class={BUTTON} aria-pressed={on()} data-testid="cam-setup-template-use-part" data-active={on() ? "true" : "false"}
                    onClick={() => patchUse(use.id, (current) => {
                      const now = new Set(current.workpieceIds ?? workpieces().map((other) => other.id))
                      if (now.has(wp.id)) now.delete(wp.id); else now.add(wp.id)
                      if (now.size === 0) return current
                      const { workpieceIds: _old, ...rest } = current
                      return now.size === workpieces().length ? rest : { ...rest, workpieceIds: workpieces().filter((other) => now.has(other.id)).map((other) => other.id) }
                    })}>{wp.name}</button>
                }}</For>
              </div>
            </Show>
          </div>
        )}</For>
        <Show when={expanded().length > 0}>
          <ul class="space-y-0.5 text-xs text-gray-400" data-testid="cam-setup-expanded" aria-label={t("cam.templates.expanded")}>
            <For each={expanded()}>{(operation) => <li data-testid="cam-setup-expanded-operation">{t("cam.templates.operation", { name: operation.name, tool: operation.tool, elements: operation.elementIds.map(elementName).join(", ") })}</li>}</For>
          </ul>
        </Show>
      </div>

      <div class="space-y-1.5" data-testid="cam-setup-probe">
        <label class="flex items-center gap-1.5 text-xs text-gray-300">
          <input type="checkbox" name="camSetupProbePart" checked={probe() !== undefined} disabled={busy()} onChange={(event) => probeOn(event.currentTarget.checked)} />
          <span title={t("cam.partProbe.hint")}>{t("cam.partProbe.title")}</span>
        </label>
        <Show when={probe()}>{(config) => (
          <div class="space-y-1.5 rounded-md border border-gray-700 p-2">
            <p class="text-xs text-gray-500">{t("cam.partProbe.hint")}</p>
            <For each={config().cycles}>{(cycle, index) => (
              <div class="space-y-1" data-testid="cam-setup-probe-cycle" data-kind={cycle.kind}>
                <div class="grid grid-cols-[1fr_auto] items-center gap-2">
                  <select class={FIELD} name={`camProbeKind-${index()}`} value={cycle.kind} aria-label={t("cam.partProbe.kind")} disabled={busy()}
                    onChange={(event) => patchProbeCycle(index(), defaultProbeCycle(event.currentTarget.value as ProbeCycleKind))}>
                    <For each={PROBE_KINDS}>{(kind) => <option value={kind}>{t(`cam.partProbe.kind.${kind}`)}</option>}</For>
                  </select>
                  <button type="button" class={BUTTON} data-testid="cam-setup-probe-cycle-remove" disabled={busy() || config().cycles.length <= 1} onClick={() => removeProbeCycle(index())} aria-label={t("cam.partProbe.remove")} title={t("cam.partProbe.remove")}><X size={12} /></button>
                </div>
                <div class="grid grid-cols-3 items-center gap-2" role="group" aria-label={t(`cam.partProbe.kind.${cycle.kind}`)}>
                  <For each={probeFields(cycle)}>{(field) => (
                    <label class="flex items-center gap-1 text-xs text-gray-400" title={t(`cam.partProbe.field.${field.key}`)}>
                      <span>{t(`cam.partProbe.field.${field.key}`)}</span>
                      <NumberField class={FIELD} name={`camProbe${index()}-${field.key}`} value={field.value} accept={() => true} onValue={(value) => patchProbeCycle(index(), field.set(value))} />
                    </label>
                  )}</For>
                </div>
              </div>
            )}</For>
            <div class="flex flex-wrap items-center gap-2">
              <button type="button" class={BUTTON} data-testid="cam-setup-probe-cycle-add" disabled={busy() || config().cycles.length >= MAX_PROBE_CYCLES} onClick={addProbeCycle}><Plus size={12} />{t("cam.partProbe.add")}</button>
              <label class="flex items-center gap-1.5 text-xs text-gray-300">
                <input type="checkbox" name="camSetupProbeFirst" checked={setup.choices.probePart} disabled={busy()} onChange={(event) => choose({ probePart: event.currentTarget.checked })} />
                <span>{t("cam.partProbe.generate")}</span>
              </label>
            </div>
          </div>
        )}</Show>
      </div>

      <For each={issues().filter((issue) => issue.operationId === undefined && !workpieces().some((wp) => issue.message.includes(wp.name)) && !fixtures().some((box) => issue.message.includes(box.name)) && !/machine travel/.test(issue.message))}>{(issue) => (
        <p class="text-xs text-red-400" role="alert" data-testid="cam-setup-issue">{issue.message}</p>
      )}</For>

      <div class="flex flex-wrap items-center gap-2">
        <button type="button" class={BUTTON} data-testid="cam-setup-plan" disabled={busy() || !hasWork()} onClick={plan}>
          <ListOrdered size={14} />{t("cam.setupDoc.plan")}
        </button>
        <Show when={props.onGenerate}>{(generate) => (
          <button type="button" class={BUTTON} data-testid="cam-setup-generate" disabled={busy() || !hasWork()} onClick={() => generate()()}>
            <Zap size={14} />{t("cam.setupDoc.generate")}
          </button>
        )}</Show>
        <button type="button" class={BUTTON} data-testid="cam-setup-save" disabled={busy() || projectId() === null || !hasWork()} onClick={() => void save(false)}>
          <Save size={14} />{setup.saved === undefined ? t("cam.setupDoc.save") : t("cam.setupDoc.update")}
        </button>
        <Show when={setup.saved !== undefined}>
          <button type="button" class={BUTTON} data-testid="cam-setup-save-new" disabled={busy() || projectId() === null || !hasWork()} onClick={() => void save(true)}>
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
                    <Show when={program.probe}><span class="mr-1 rounded bg-gray-700 px-1 text-gray-200" data-testid="cam-setup-program-probe">{t("cam.partProbe.badge")}</span></Show>
                    {t("cam.setupDoc.program", { number: program.programNumber, name: program.name, tools: program.toolNumbers.map((n) => `T${n}`).join(" "), count: program.operations })}
                    <Show when={program.offsets.length > 1}>{" · "}{t("cam.setupDoc.offsets", { offsets: program.offsets.join(" ") })}</Show>
                  </span>
                  <Show when={program.hints.length > 0}><span class="block text-gray-500" data-testid="cam-setup-program-hint">{program.hints.join(" ")}</span></Show>
                  <Show when={program.evidence}>{(evidence) => (
                    <span class="block text-gray-500" data-testid="cam-setup-program-evidence" data-release={evidence().release} title={evidence().notes.join(" ")}>
                      {t("cam.setupDoc.evidence", { release: t(RELEASE_LABEL[evidence().release]), registers: evidence().registers.map((r) => `${r.register} ${t(VERDICT_LABEL[r.verdict])}`).join(" · ") })}
                    </span>
                  )}</Show>
                  <Show when={program.generated !== undefined && props.onOpenProgram}>
                    <button type="button" class={BUTTON} data-testid="cam-setup-open-program" onClick={() => props.onOpenProgram?.(program.generated!)} aria-label={t("cam.setupDoc.open")} title={t("cam.setupDoc.open")}><Play size={12} /></button>
                  </Show>
                  <Show when={program.generated !== undefined && props.onSaveProgram}>
                    <button type="button" class={BUTTON} data-testid="cam-setup-save-program" onClick={() => props.onSaveProgram?.(program.generated!)} aria-label={t("cam.setupDoc.saveProgram")} title={t("cam.setupDoc.saveProgram")}><Save size={12} /></button>
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
