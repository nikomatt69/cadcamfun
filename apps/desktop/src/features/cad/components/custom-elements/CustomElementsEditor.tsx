import { downloadFile } from "../../../../shared/lib/save-file.ts"
/**
 * The custom element editor (legacy `customElements/CustomElementsEditor.tsx`).
 *
 * One dialog that authors a parametric element: code and parameters on the left, a live Three.js
 * preview on the right, validity in the header. Saving writes the definition to the machine's
 * store; "Add to scene" saves (if needed) and drops an instance on the CAD canvas at the origin.
 */
import { For, Show, createEffect, createSignal, onCleanup, type JSX } from "solid-js"
import { Check, Download, Play, Plus, Save, Upload } from "lucide-solid"
import { Modal } from "../../../../shared/ui/modal.tsx"
import { toast } from "../../../../shared/ui/toast.tsx"
import { t, type Key } from "../../../../i18n/index.ts"
import { evaluateCustomElement } from "../../lib/customElements/evaluate.ts"
import { customElementTemplates, createDefinitionFromTemplate } from "../../lib/customElements/templates.ts"
import { useCustomElementsStore } from "../../store/customElementsStore.ts"
import { useElementsStore } from "../../store/elementsStore.ts"
import type { CustomElementDefinition } from "../../types/customElements.ts"
import CustomElementPreview from "./CustomElementPreview.tsx"
import CustomElementAssistant from "./CustomElementAssistant.tsx"
import JsonEditor from "./JsonEditor.tsx"
import ParameterControls from "./ParameterControls.tsx"
import SavedElementsPanel from "./SavedElementsPanel.tsx"

export interface CustomElementsEditorProps {
  readonly isOpen: boolean
  readonly onClose: () => void
}

type Tab = "code" | "parameters" | "assistant" | "preview" | "saved" | "settings"

const FIELD = "w-full px-3 py-2 border border-[color:var(--ent-line-strong)] rounded-md focus:outline-none focus:ring-2 focus:ring-[color:var(--ent-accent)] bg-[color:var(--ent-surface)] text-[color:var(--ent-text)]"
const ACTION = "px-3 py-1 rounded flex items-center gap-1 disabled:opacity-50"
const TAB = "flex items-center gap-2 px-4 py-2 border-b-2 transition-colors"

export default function CustomElementsEditor(props: CustomElementsEditorProps): JSX.Element {
  const store = useCustomElementsStore()
  const elements = useElementsStore()
  const [tab, setTab] = createSignal<Tab>("code")
  const [unsavedChanges, setUnsavedChanges] = createSignal(false)
  let fileInput: HTMLInputElement | undefined
  let previewTimer: number | undefined

  const definition = (): CustomElementDefinition | null => store.activeDefinition

  // Re-check the definition whenever it is edited; the editor only acts on valid definitions.
  createEffect(() => {
    const active = definition()
    if (active) store.setValidationErrors(store.validateDefinition(active).errors)
  })

  // Rebuild the preview shortly after the user stops typing, not on every keystroke.
  createEffect(() => {
    definition()
    store.previewParameters
    window.clearTimeout(previewTimer)
    previewTimer = window.setTimeout(generatePreview, 500)
  })
  onCleanup(() => window.clearTimeout(previewTimer))

  const generatePreview = (): void => {
    const active = definition()
    if (!active || store.validationErrors.length > 0) { store.setPreviewObject(null); return }
    store.setGeneratingPreview(true)
    store.setPreviewError(null)
    try {
      store.setPreviewObject(evaluateCustomElement(active, store.previewParameters))
    } catch (error) {
      store.setPreviewError(`Preview Error: ${error instanceof Error ? error.message : String(error)}`)
      store.setPreviewObject(null)
    } finally {
      store.setGeneratingPreview(false)
    }
  }

  /** The id to place an instance under: a definition that was never saved is saved first. */
  const savedDefinitionId = (): string | null => {
    const active = definition()
    if (!active) return null
    if (store.editorMode === "create") return store.createDefinition(active)
    return active.id
  }

  const handleSave = (): void => {
    const active = definition()
    if (!active || store.validationErrors.length > 0) return
    if (store.editorMode === "create") {
      const id = store.createDefinition(active)
      store.followSavedDefinition(id)
    } else {
      store.updateDefinition(active.id, active)
    }
    setUnsavedChanges(false)
    toast.success(t("cad.customElements.saved", { name: active.name }))
  }

  const handleAddToScene = (): void => {
    const active = definition()
    if (!active || store.validationErrors.length > 0) return
    // An element can only point at a definition the machine has stored.
    const id = savedDefinitionId()
    if (id === null) return
    elements.addElement({
      type: "custom",
      name: active.name,
      description: active.description ?? "",
      definitionId: id,
      parameters: { ...store.previewParameters },
      x: 0,
      y: 0,
      z: 0,
      color: "#1e88e5",
    })
    setUnsavedChanges(false)
    toast.success(t("cad.customElements.addedToScene", { name: active.name }))
    props.onClose()
  }

  const handleExport = (): void => {
    const active = definition()
    if (!active) return
    downloadFile({ name: `${active.name.replace(/\s+/g, "_")}.json`, data: JSON.stringify(active, null, 2), mime: "application/json" })
  }

  const handleImportFile = (file: File): void => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const imported = JSON.parse(String(reader.result)) as CustomElementDefinition
        store.setActiveDefinition(imported)
        setUnsavedChanges(true)
      } catch {
        toast.error(t("cad.customElements.invalidJson"))
      }
    }
    reader.readAsText(file)
  }

  const handleDefinitionChange = (updates: Partial<CustomElementDefinition>): void => {
    const active = definition()
    if (!active) return
    store.setActiveDefinition({ ...active, ...updates })
    setUnsavedChanges(true)
  }

  const handleApplyTemplate = (key: string): void => {
    const created = createDefinitionFromTemplate(key)
    if (!created) return
    store.setActiveDefinition({ ...created, id: definition()?.id ?? "temp", created: new Date().toISOString(), modified: new Date().toISOString() })
    store.updatePreviewParameters(Object.fromEntries(Object.entries(created.parameters).map(([name, parameter]) => [name, parameter.default])))
    setUnsavedChanges(true)
  }

  const tabs: ReadonlyArray<{ readonly id: Tab; readonly labelKey: Key }> = [
    { id: "code", labelKey: "cad.customElements.tabCode" },
    { id: "parameters", labelKey: "cad.customElements.tabParameters" },
    { id: "assistant", labelKey: "cad.customElements.tabAssistant" },
    { id: "preview", labelKey: "cad.customElements.tabPreview" },
    { id: "saved", labelKey: "cad.customElements.tabSaved" },
    { id: "settings", labelKey: "cad.customElements.tabSettings" },
  ]

  // Opening the dialog starts a fresh definition; closing it puts the store back to rest.
  createEffect(() => {
    if (props.isOpen) {
      if (!store.isEditorOpen) store.openEditor("create")
    } else if (store.isEditorOpen) {
      store.closeEditor()
    }
  })

  const editSaved = (definitionId: string): void => {
    store.openEditor("edit", definitionId)
    setTab("code")
    setUnsavedChanges(false)
  }

  return (
    <Modal open={props.isOpen} onClose={props.onClose} size="xl"
      title={store.editorMode === "create" ? t("cad.customElements.createTitle") : t("cad.customElements.editTitle")}
    >
      <Show when={definition()} keyed={false}>
        {(active) => (
          <div class="flex h-[min(78dvh,58rem)] min-h-[24rem] flex-col">
            <div class="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--ent-line)] pb-3">
              <div class="flex min-w-0 flex-wrap items-center gap-2">
                <span class="text-sm font-semibold text-[color:var(--ent-text)]">{active().name}</span>
                <Show when={unsavedChanges()}>
                  <span class="rounded-full bg-[color:var(--ent-warn-soft)] px-2.5 py-1 text-[11px] font-medium text-[color:var(--ent-warn)]">{t("cad.customElements.unsaved")}</span>
                </Show>
                <Show when={store.validationErrors.length === 0} fallback={
                  <span class="rounded-full bg-[color:var(--ent-bad-soft)] px-2.5 py-1 text-[11px] font-medium text-[color:var(--ent-bad)]">{t("cad.customElements.errorCount", { count: store.validationErrors.length })}</span>
                }>
                  <span class="inline-flex items-center gap-1 rounded-full bg-[color:var(--ent-ok-soft)] px-2.5 py-1 text-[11px] font-medium text-[color:var(--ent-ok)]"><Check size={12} />{t("cad.customElements.valid")}</span>
                </Show>
              </div>

              <div class="flex flex-wrap items-center gap-2">
                <button type="button" class={ACTION + " h-8 bg-[color:var(--ent-surface-subtle)] text-[color:var(--ent-text)] ring-1 ring-[color:var(--ent-line)] hover:bg-[color:var(--ent-surface-inset)]"} disabled={store.isGeneratingPreview || store.validationErrors.length > 0} onClick={generatePreview}>
                  <Play class="w-4 h-4" />
                  <span>{t("cad.customElements.preview")}</span>
                </button>
                <button type="button" class={ACTION + " h-8 bg-[color:var(--ent-action)] text-[color:var(--ent-action-text)] hover:bg-[color:var(--ent-action-hover)]"} disabled={store.validationErrors.length > 0} onClick={handleSave}>
                  <Save class="w-4 h-4" />
                  <span>{t("cad.customElements.save")}</span>
                </button>
                <button type="button" class={ACTION + " h-8 bg-[color:var(--ent-text)] text-[color:var(--ent-surface)] hover:bg-[color:var(--ent-text-muted)]"} disabled={store.validationErrors.length > 0} onClick={handleAddToScene}>
                  <Plus class="w-4 h-4" />
                  <span>{t("cad.customElements.addToScene")}</span>
                </button>
                <button type="button" class="p-2 text-[color:var(--ent-text-muted)] hover:text-[color:var(--ent-text)]" title={t("cad.customElements.exportJson")} onClick={handleExport}>
                  <Download class="w-4 h-4" />
                </button>
                <button type="button" class="p-2 text-[color:var(--ent-text-muted)] hover:text-[color:var(--ent-text)]" title={t("cad.customElements.importJson")} onClick={() => fileInput?.click()}>
                  <Upload class="w-4 h-4" />
                </button>
              </div>
            </div>

            <Show when={store.editorMode === "create"}>
              <div class="flex shrink-0 items-center gap-3 overflow-x-auto border-b border-[color:var(--ent-line)] py-2">
                <span class="sticky left-0 shrink-0 bg-[color:var(--ent-surface)] pr-1 text-[11px] font-semibold text-[color:var(--ent-text-muted)]">{t("cad.customElements.templates")}</span>
                <For each={Object.keys(customElementTemplates)}>
                  {(key) => <button type="button" class="shrink-0 rounded-lg border border-[color:var(--ent-line)] bg-[color:var(--ent-surface-subtle)] px-3 py-1.5 text-xs font-medium text-[color:var(--ent-text)] transition hover:border-[color:var(--ent-accent)] hover:bg-[color:var(--ent-accent-soft)] hover:text-[color:var(--ent-accent)]" onClick={() => handleApplyTemplate(key)}>{customElementTemplates[key]?.name ?? key}</button>}
                </For>
              </div>
            </Show>

            <div class="flex shrink-0 gap-1 overflow-x-auto border-b border-[color:var(--ent-line)] pt-2">
              <For each={tabs}>
                {(entry) => (
                  <button type="button" onClick={() => setTab(entry.id)} class={`${TAB} rounded-t-md ${tab() === entry.id ? "border-[color:var(--ent-accent)] bg-[color:var(--ent-accent-soft)] text-[color:var(--ent-accent)]" : "border-transparent text-[color:var(--ent-text-muted)] hover:bg-[color:var(--ent-surface-subtle)]"}`}>
                    {t(entry.labelKey)}
                  </button>
                )}
              </For>
            </div>

            <div class="flex flex-1 min-h-0 flex-col lg:flex-row">
              <div class="flex-1 min-h-0 border-b lg:border-b-0 lg:border-r border-[color:var(--ent-line)] overflow-y-auto">
                <Show when={tab() === "code"}>
                  <JsonEditor definition={active()} onChange={handleDefinitionChange} errors={store.validationErrors} />
                </Show>
                <Show when={tab() === "parameters"}>
                  <ParameterControls
                    definition={active()}
                    values={store.previewParameters}
                    onChange={(name, value) => store.updatePreviewParameters({ ...store.previewParameters, [name]: value })}
                    onDefinitionChange={handleDefinitionChange}
                  />
                </Show>
                <Show when={tab() === "assistant"}>
                  <CustomElementAssistant definition={active()} onGenerated={() => { setUnsavedChanges(true); setTab("parameters") }} />
                </Show>
                <Show when={tab() === "saved"}>
                  <SavedElementsPanel onEdit={editSaved} />
                </Show>
                <Show when={tab() === "settings"}>
                  <div class="p-4 space-y-4">
                    <div>
                      <span class="mb-1 block text-sm font-medium text-[color:var(--ent-text)]">{t("cad.customElements.name")}</span>
                      <input type="text" class={FIELD} value={active().name} onInput={(event) => handleDefinitionChange({ name: event.currentTarget.value })} />
                    </div>
                    <div>
                      <span class="mb-1 block text-sm font-medium text-[color:var(--ent-text)]">{t("cad.customElements.descriptionLabel")}</span>
                      <textarea rows={3} class={FIELD} value={active().description ?? ""} onInput={(event) => handleDefinitionChange({ description: event.currentTarget.value })} />
                    </div>
                    <div>
                      <span class="mb-1 block text-sm font-medium text-[color:var(--ent-text)]">{t("cad.customElements.category")}</span>
                      <input type="text" class={FIELD} value={active().category ?? ""} onInput={(event) => handleDefinitionChange({ category: event.currentTarget.value })} />
                    </div>
                    <div>
                      <span class="mb-1 block text-sm font-medium text-[color:var(--ent-text)]">{t("cad.customElements.tags")}</span>
                      <input type="text" class={FIELD} value={(active().tags ?? []).join(", ")} onInput={(event) => handleDefinitionChange({ tags: event.currentTarget.value.split(",").map((value) => value.trim()).filter(Boolean) })} />
                    </div>
                  </div>
                </Show>
              </div>

              <div class="flex-1 min-h-72 flex flex-col">
                <div class="flex items-center justify-between border-b border-[color:var(--ent-line)] px-4 py-3">
                  <div><h3 class="text-sm font-semibold text-[color:var(--ent-text)]">{t("cad.customElements.livePreview")}</h3><p class="mt-0.5 text-[11px] text-[color:var(--ent-text-muted)]">{active().description || t("cad.customElements.previewSubheading")}</p></div>
                  <Show when={store.previewError}>
                    {(error) => <div class="mt-2 p-2 bg-[color:var(--ent-bad-soft)] border border-[color:var(--ent-bad)] rounded text-[color:var(--ent-bad)] text-sm">{error()}</div>}
                  </Show>
                </div>
                <div class="flex-1 min-h-0">
                  <CustomElementPreview object={store.previewObject} definition={active()} isLoading={store.isGeneratingPreview} />
                </div>
              </div>
            </div>
          </div>
        )}
      </Show>

      <input ref={fileInput} type="file" accept=".json" class="hidden" onChange={(event) => {
        const file = event.currentTarget.files?.[0]
        if (file) handleImportFile(file)
        event.currentTarget.value = ""
      }} />
    </Modal>
  )
}
