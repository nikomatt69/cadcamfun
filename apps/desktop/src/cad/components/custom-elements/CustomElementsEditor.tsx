/**
 * The custom element editor (legacy `customElements/CustomElementsEditor.tsx`).
 *
 * One dialog that authors a parametric element: code and parameters on the left, a live Three.js
 * preview on the right, validity in the header. Saving writes the definition to the machine's
 * store; "Add to scene" saves (if needed) and drops an instance on the CAD canvas at the origin.
 */
import { For, Show, createEffect, createSignal, onCleanup, type JSX } from "solid-js"
import { Download, Play, Plus, Save, Upload } from "lucide-solid"
import { Modal } from "../../../components/ui/modal.tsx"
import { toast } from "../../../components/ui/toast.tsx"
import { t, type Key } from "../../../i18n/index.ts"
import { evaluateCustomElement } from "../../lib/customElements/evaluate.ts"
import { customElementTemplates, createDefinitionFromTemplate } from "../../lib/customElements/templates.ts"
import { useCustomElementsStore } from "../../store/customElementsStore.ts"
import { useElementsStore } from "../../store/elementsStore.ts"
import type { CustomElementDefinition } from "../../types/customElements.ts"
import CustomElementPreview from "./CustomElementPreview.tsx"
import JsonEditor from "./JsonEditor.tsx"
import ParameterControls from "./ParameterControls.tsx"
import SavedElementsPanel from "./SavedElementsPanel.tsx"

export interface CustomElementsEditorProps {
  readonly isOpen: boolean
  readonly onClose: () => void
}

type Tab = "code" | "parameters" | "preview" | "saved" | "settings"

const FIELD = "w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
const ACTION = "px-3 py-1 rounded text-white flex items-center gap-1 disabled:opacity-50"
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
    const blob = new Blob([JSON.stringify(active, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `${active.name.replace(/\s+/g, "_")}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
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
    <Modal open={props.isOpen} onClose={props.onClose} size="lg"
      title={store.editorMode === "create" ? t("cad.customElements.createTitle") : t("cad.customElements.editTitle")}
    >
      <Show when={definition()} keyed={false}>
        {(active) => (
          <div class="flex h-[calc(100dvh-11rem)] min-h-[28rem] flex-col">
            <div class="flex flex-wrap items-center justify-between gap-2 pb-3">
              <div class="flex flex-wrap items-center gap-2">
                <Show when={unsavedChanges()}>
                  <span class="text-sm text-orange-600">{t("cad.customElements.unsaved")}</span>
                </Show>
                <Show when={store.validationErrors.length === 0} fallback={
                  <span class="text-sm text-red-600">{t("cad.customElements.errorCount", { count: store.validationErrors.length })}</span>
                }>
                  <span class="text-sm text-green-600">{t("cad.customElements.valid")}</span>
                </Show>
                <Show when={store.editorMode === "create"}>
                  <For each={Object.keys(customElementTemplates)}>
                    {(key) => (
                      <button type="button" class="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600" onClick={() => handleApplyTemplate(key)}>
                        {customElementTemplates[key]?.name ?? key}
                      </button>
                    )}
                  </For>
                </Show>
              </div>

              <div class="flex flex-wrap items-center gap-2">
                <button type="button" class={ACTION + " bg-blue-600 hover:bg-blue-700"} disabled={store.isGeneratingPreview || store.validationErrors.length > 0} onClick={generatePreview}>
                  <Play class="w-4 h-4" />
                  <span>{t("cad.customElements.preview")}</span>
                </button>
                <button type="button" class={ACTION + " bg-green-600 hover:bg-green-700"} disabled={store.validationErrors.length > 0} onClick={handleSave}>
                  <Save class="w-4 h-4" />
                  <span>{t("cad.customElements.save")}</span>
                </button>
                <button type="button" class={ACTION + " bg-purple-600 hover:bg-purple-700"} disabled={store.validationErrors.length > 0} onClick={handleAddToScene}>
                  <Plus class="w-4 h-4" />
                  <span>{t("cad.customElements.addToScene")}</span>
                </button>
                <button type="button" class="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200" title={t("cad.customElements.exportJson")} onClick={handleExport}>
                  <Download class="w-4 h-4" />
                </button>
                <button type="button" class="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200" title={t("cad.customElements.importJson")} onClick={() => fileInput?.click()}>
                  <Upload class="w-4 h-4" />
                </button>
              </div>
            </div>

            <div class="flex border-b border-gray-200 dark:border-gray-700">
              <For each={tabs}>
                {(entry) => (
                  <button type="button" onClick={() => setTab(entry.id)} class={`${TAB} ${tab() === entry.id ? "border-blue-600 text-blue-600" : "border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"}`}>
                    {t(entry.labelKey)}
                  </button>
                )}
              </For>
            </div>

            <div class="flex flex-1 min-h-0 flex-col lg:flex-row">
              <div class="flex-1 min-h-0 border-b lg:border-b-0 lg:border-r border-gray-200 dark:border-gray-700 overflow-y-auto">
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
                <Show when={tab() === "saved"}>
                  <SavedElementsPanel onEdit={editSaved} />
                </Show>
                <Show when={tab() === "settings"}>
                  <div class="p-4 space-y-4">
                    <div>
                      <span class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">{t("cad.customElements.name")}</span>
                      <input type="text" class={FIELD} value={active().name} onInput={(event) => handleDefinitionChange({ name: event.currentTarget.value })} />
                    </div>
                    <div>
                      <span class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">{t("cad.customElements.descriptionLabel")}</span>
                      <textarea rows={3} class={FIELD} value={active().description ?? ""} onInput={(event) => handleDefinitionChange({ description: event.currentTarget.value })} />
                    </div>
                    <div>
                      <span class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">{t("cad.customElements.category")}</span>
                      <input type="text" class={FIELD} value={active().category ?? ""} onInput={(event) => handleDefinitionChange({ category: event.currentTarget.value })} />
                    </div>
                    <div>
                      <span class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">{t("cad.customElements.tags")}</span>
                      <input type="text" class={FIELD} value={(active().tags ?? []).join(", ")} onInput={(event) => handleDefinitionChange({ tags: event.currentTarget.value.split(",").map((value) => value.trim()).filter(Boolean) })} />
                    </div>
                  </div>
                </Show>
              </div>

              <div class="flex-1 min-h-72 flex flex-col">
                <div class="p-4 border-b border-gray-200 dark:border-gray-700">
                  <h3 class="text-lg font-medium text-gray-900 dark:text-white">{t("cad.customElements.livePreview")}</h3>
                  <Show when={store.previewError}>
                    {(error) => <div class="mt-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-red-700 dark:text-red-300 text-sm">{error()}</div>}
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
