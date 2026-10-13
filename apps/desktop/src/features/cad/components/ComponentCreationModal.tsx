import { For, Show, createEffect, createMemo, createSignal, on, type JSX } from "solid-js"
import { Blocks, Save } from "lucide-solid"
import { useElementsStore, type Element } from "../store/elementsStore.ts"
import { useLayerStore } from "../store/layerStore.ts"
import { useSelectionStore } from "../store/selectorStore.ts"
import { useLocalComponentsLibraryStore } from "../store/localComponentsLibraryStore.ts"
import { useDocumentStore } from "../store/documentStore.ts"
import { componentBounds, componentEntries, componentLibraryDocument, cloneComponentElement, createComponentAssembly } from "../lib/component-assembly.ts"
import { Modal } from "../../../shared/ui/modal.tsx"
import { toast } from "../../../shared/ui/toast.tsx"
import { useApp } from "../../../shared/state/context.ts"
import { t } from "../../../i18n/index.ts"

interface ComponentCreationModalProps { readonly isOpen: boolean; onClose(): void }

/** Selection, assembly details and library destination form one editor transaction. */
export default function ComponentCreationModal(props: ComponentCreationModalProps): JSX.Element {
  const app = useApp()
  const layers = useLayerStore()
  const [selected, setSelected] = createSignal<Element[]>([])
  const [name, setName] = createSignal("")
  const [description, setDescription] = createSignal("")
  const [layerId, setLayerId] = createSignal("")
  const [tags, setTags] = createSignal("")
  const [keepOriginals, setKeepOriginals] = createSignal(false)
  const [saveLibrary, setSaveLibrary] = createSignal(true)
  const [destination, setDestination] = createSignal<"local" | "project">("local")
  const [projectId, setProjectId] = createSignal("")
  const [isPublic, setIsPublic] = createSignal(false)
  const [projects, setProjects] = createSignal<ReadonlyArray<{ readonly id: string; readonly name: string }>>([])
  const [projectsState, setProjectsState] = createSignal<"idle" | "loading" | "failed">("idle")
  const [busy, setBusy] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)
  const entries = createMemo(() => componentEntries(selected()))
  const bounds = createMemo(() => componentBounds(selected()))
  const subcomponents = () => entries().filter(({ element }) => element.type === "component" || element.type === "group").length
  const duplicate = () => saveLibrary() && destination() === "local" && useLocalComponentsLibraryStore().components.some(
    (component) => component.name.trim().toLowerCase() === name().trim().toLowerCase())

  createEffect(on(() => props.isOpen, (open) => {
    if (!open) return
    const state = useElementsStore.getState()
    const ids = useSelectionStore.getState().selectedElementIds
    const chosen = state.elements.filter((element) => ids.includes(element.id))
    setSelected(chosen.map((element) => cloneComponentElement(element)))
    setName(chosen.length === 1 ? chosen[0]!.name || "Component" : `Component (${chosen.length})`)
    setDescription(""); setLayerId(layers.activeLayer); setTags(""); setKeepOriginals(false)
    setSaveLibrary(true); setDestination("local"); setProjectId(useDocumentStore.getState().projectId ?? "")
    setIsPublic(false); setError(null)
  }))

  let request = 0
  const loadProjects = async (): Promise<void> => {
    const current = ++request
    setProjectsState("loading")
    try {
      const list = await app.runtime.run(app.client.projects.list())
      if (current !== request) return
      setProjects(list.map(({ id, name }) => ({ id, name })))
      setProjectsState("idle")
    } catch { if (current === request) setProjectsState("failed") }
  }
  createEffect(on(() => props.isOpen && saveLibrary() && destination() === "project", (load) => {
    if (load) void loadProjects()
    else { request++; setProjectsState("idle") }
  }))

  const close = (): void => { if (!busy()) props.onClose() }
  const create = async (event: SubmitEvent): Promise<void> => {
    event.preventDefault()
    if (busy()) return
    if (!name().trim()) { setError(t("cad.createComponent.nameRequired")); return }
    if (!selected().length) { setError(t("cad.createComponent.noSelection")); return }
    if (!layers.layers.some((layer) => layer.id === layerId() && !layer.locked)) { setError(t("cad.createComponent.layerRequired")); return }
    if (saveLibrary() && destination() === "project" && !projectId()) { setError(t("cad.saveElement.projectRequired")); return }
    // An asynchronous project save must never consume a selection that has since changed.
    const sourceIds = selected().map((element) => element.id)
    const selectionUnchanged = (): boolean => selected().every((element) => {
      const current = useElementsStore.getState().elements.find((candidate) => candidate.id === element.id)
      return !!current && JSON.stringify(cloneComponentElement(current)) === JSON.stringify(element)
    })
    if (!selectionUnchanged()) {
      setError(t("cad.createComponent.selectionChanged")); return
    }
    setBusy(true); setError(null)
    try {
      const component = createComponentAssembly(selected(), { name: name().trim(), description: description().trim(), layerId: layerId(),
        tags: [...new Set(tags().split(",").map((tag) => tag.trim()).filter(Boolean))] })
      if (saveLibrary()) {
        const data = componentLibraryDocument(component)
        if (destination() === "local") {
          const saved = useLocalComponentsLibraryStore.getState().addComponent({ name: component.name, description: component.description,
            type: "composite", tags: component.tags, data, meta: { ...component.metadata, elementType: "component" } })
          if (!saved) throw new Error(t("cad.saveElement.failedLocal"))
        } else {
          await app.runtime.run(app.client.components.createForProject({ params: { id: projectId() }, payload: {
            name: component.name, description: component.description, type: "composite", data, isPublic: isPublic(), thumbnail: null
          } }))
          window.dispatchEvent(new CustomEvent("component-library-updated"))
        }
      }
      // The dialog freezes its input snapshot. If an external edit happened during saving, retain it.
      const unchanged = selectionUnchanged()
      useElementsStore.getState().insertComponent(component, sourceIds, keepOriginals() || !unchanged)
      useSelectionStore.getState().selectElement(component.id)
      toast.success(t(saveLibrary() ? "cad.createComponent.createdSaved" : "cad.createComponent.created"))
      props.onClose()
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("cad.createComponent.failed")) }
    finally { setBusy(false) }
  }
  const canCreate = () => !busy() && !!name().trim() && selected().length > 0 && bounds() !== null && !!layerId()
    && (!saveLibrary() || destination() === "local" || !!projectId())

  return (
    <Modal open={props.isOpen} onClose={close} title={t("cad.createComponent.title")} size="lg">
      <form onSubmit={(event) => void create(event)} class="space-y-4" data-component-creation>
        <p class="text-sm text-gray-500 dark:text-gray-400">{t("cad.createComponent.workflowHint")}</p>
        <div class="grid gap-5 md:grid-cols-2">
          <fieldset disabled={busy()} class="min-w-0 space-y-3">
            <label class="block text-sm font-medium">{t("cad.createComponent.name")}
              <input class="ui-input mt-1 w-full" value={name()} onInput={(event) => setName(event.currentTarget.value)} required data-component-name />
            </label>
            <label class="block text-sm font-medium">{t("cad.createComponent.description")}
              <textarea class="ui-input mt-1 w-full" rows={2} value={description()} onInput={(event) => setDescription(event.currentTarget.value)} />
            </label>
            <label class="block text-sm font-medium">{t("cad.createComponent.tags")}
              <input class="ui-input mt-1 w-full" value={tags()} onInput={(event) => setTags(event.currentTarget.value)} placeholder={t("cad.saveElement.tagsPlaceholder")} />
            </label>
            <label class="block text-sm font-medium">{t("cad.createComponent.layer")}
              <select class="ui-input mt-1 w-full" value={layerId()} onChange={(event) => setLayerId(event.currentTarget.value)}>
                <For each={layers.layers.filter((layer) => !layer.locked)}>{(layer) => <option value={layer.id}>{layer.name}</option>}</For>
              </select>
            </label>
            <label class="flex items-center gap-2 text-sm"><input type="checkbox" checked={keepOriginals()} onChange={(event) => setKeepOriginals(event.currentTarget.checked)} />{t("cad.createComponent.keepOriginals")}</label>
          </fieldset>
          <section class="min-w-0 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900/40">
            <h4 class="flex items-center gap-2 text-sm font-medium"><Blocks size={16} />{t("cad.createComponent.contents")}</h4>
            <p class="my-2 text-xs text-gray-500 dark:text-gray-400">{t("cad.createComponent.summary", { roots: selected().length, total: entries().length, nested: subcomponents() })}</p>
            <Show when={bounds()}>{(value) => <p class="mb-2 font-mono text-xs">{t("cad.createComponent.size", { width: value().width.toFixed(2), height: value().height.toFixed(2), depth: value().depth.toFixed(2) })} mm</p>}</Show>
            <div class="max-h-56 overflow-auto" data-component-hierarchy>
              <For each={entries()}>{({ element, depth }) => <div class="flex justify-between gap-2 border-t border-gray-200 py-1.5 text-xs dark:border-gray-700" style={{ "padding-left": `${depth * 12}px` }}>
                <span class="truncate">{element.name || element.type}</span><span class="text-gray-500">{element.type}</span>
              </div>}</For>
            </div>
            <p class="mt-3 text-xs text-gray-500 dark:text-gray-400">{t("cad.createComponent.hierarchyHint")}</p>
          </section>
        </div>
        <fieldset disabled={busy()} class="space-y-3 border-t border-gray-200 pt-3 dark:border-gray-700">
          <label class="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={saveLibrary()} onChange={(event) => setSaveLibrary(event.currentTarget.checked)} data-component-save-library />{t("cad.saveElement.save")}</label>
          <Show when={saveLibrary()}>
            <div class="flex gap-2">
              <For each={["local", "project"] as const}>{(value) => <button type="button" class="ui-button flex-1" aria-pressed={destination() === value}
                classList={{ "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300": destination() === value }}
                onClick={() => setDestination(value)}>{t(value === "local" ? "cad.saveElement.destinationLocal" : "cad.saveElement.destinationProject")}</button>}</For>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400">{t(destination() === "local" ? "cad.saveElement.destinationHintLocal" : "cad.saveElement.destinationHintProject")}</p>
            <Show when={destination() === "project"}>
              <label class="block text-sm">{t("cad.saveElement.project")}
                <select class="ui-input mt-1 w-full" value={projectId()} onChange={(event) => setProjectId(event.currentTarget.value)} data-component-project>
                  <option value="">{t("cad.saveElement.pickProject")}</option>
                  <For each={projects()}>{(project) => <option value={project.id}>{project.name}</option>}</For>
                </select>
              </label>
              <Show when={projectsState() === "loading"}><p class="text-xs">{t("cad.saveElement.loadingProjects")}</p></Show>
              <Show when={projectsState() === "failed"}><button type="button" class="ui-button" onClick={() => void loadProjects()}>{t("cad.createComponent.retryProjects")}</button></Show>
              <Show when={projectsState() === "idle" && projects().length === 0}><p class="text-xs">{t("cad.saveElement.noProjects")}</p></Show>
              <label class="flex items-center gap-2 text-sm"><input type="checkbox" checked={isPublic()} onChange={(event) => setIsPublic(event.currentTarget.checked)} />{t("cad.saveElement.public")}</label>
            </Show>
          </Show>
        </fieldset>
        <Show when={duplicate()}><p class="text-xs text-amber-600">{t("cad.createComponent.duplicateHint")}</p></Show>
        <Show when={error()}><p class="ui-field-error" role="alert">{error()}</p></Show>
        <div class="flex justify-end gap-2 border-t border-gray-200 pt-3 dark:border-gray-700">
          <button type="button" class="ui-button" onClick={close} disabled={busy()}>{t("cad.saveElement.cancel")}</button>
          <button type="submit" class="ui-button ui-button-primary flex items-center gap-2" disabled={!canCreate()} data-component-submit><Save size={16} />
            {t(busy() ? "cad.saveElement.saving" : saveLibrary() ? "cad.createComponent.createSave" : "cad.createComponent.create")}
          </button>
        </div>
      </form>
    </Modal>
  )
}
