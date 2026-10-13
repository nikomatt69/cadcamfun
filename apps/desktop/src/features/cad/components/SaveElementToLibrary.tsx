import { For, Show, createEffect, createMemo, createSignal, on, type JSX } from "solid-js"
import { AlertCircle, Check, Save } from "lucide-solid"
import { componentLibraryDocument } from "../lib/component-assembly.ts"
import { useElementsStore, type Element } from "../store/elementsStore.ts"
import { useLocalComponentsLibraryStore } from "../store/localComponentsLibraryStore.ts"
import { elementMetadataExtractors, generateSuggestedTags } from "../lib/elementMetadata.ts"
import { Modal } from "../../../shared/ui/modal.tsx"
import { t } from "../../../i18n/index.ts"
import { useApp } from "../../../shared/state/context.ts"

const TYPES = ["mechanical", "geometric", "structural", "reference", "annotation", "manufacturing", "composite", "custom"]

const humanize = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1)

/** How the other screens run typed client calls without importing Effect types into the component. */
type Run = <A>(effect: unknown) => Promise<A>

const describe = (element: { type: string } & Record<string, unknown>): string => {
  const name = humanize(element.type)
  const n = (key: string): string => (typeof element[key] === "number" ? Number(element[key]).toFixed(2) : String(element[key] ?? "-"))
  switch (element.type) {
    case "cube": return `${name}: ${n("width")}×${n("height")}×${n("depth")}`
    case "rectangle": return `${name}: ${n("width")}×${n("height")}`
    case "circle": case "sphere": return `${name}: R=${n("radius")}`
    case "cylinder": case "cone": return `${name}: R=${n("radius")}, H=${n("height")}`
    default: return name
  }
}

/** The element fields worth showing as the "is this what I am saving" summary. */
const HIDDEN_FIELDS = ["id", "selected", "layerId", "aiSuggestions", "visible", "locked"]
const previewOf = (element: Record<string, unknown>): ReadonlyArray<readonly [string, string]> =>
  Object.entries(element)
    .filter(([key]) => !HIDDEN_FIELDS.includes(key))
    .slice(0, 6)
    .map(([key, value]) => [key, typeof value === "object" ? JSON.stringify(value).slice(0, 24) : String(value).slice(0, 24)] as const)

interface Props {
  readonly onSaveComplete?: (destination: "local" | "project") => void
}

/**
 * The "save to library" action of the property panel: it turns the selected element into a reusable
 * component, either on this device or in a project on the server (the second is what the Components
 * page lists, so it survives the machine and is shared).
 */
export default function SaveElementToLibrary(props: Props): JSX.Element {
  const elements = useElementsStore()
  const library = useLocalComponentsLibraryStore()
  const app = useApp()
  const [open, setOpen] = createSignal(false)
  const [form, setForm] = createSignal({ name: "", description: "", type: "mechanical", tags: "" })
  const [destination, setDestination] = createSignal<"local" | "project">("local")
  const [projectId, setProjectId] = createSignal("")
  const [isPublic, setIsPublic] = createSignal(false)
  const [projects, setProjects] = createSignal<ReadonlyArray<{ readonly id: string; readonly name: string }>>([])
  const [projectsState, setProjectsState] = createSignal<"idle" | "loading" | "failed">("idle")
  const [busy, setBusy] = createSignal(false)
  const [status, setStatus] = createSignal<{ kind: "error" | "ok"; text: string } | undefined>()
  const run = app.runtime.run as Run
  const extractor = (type: string) => elementMetadataExtractors[type] ?? elementMetadataExtractors.default!

  /** The dialog opens once per selection, so the details the user types survive a click on the canvas. */
  const selected = () => elements.selectedElement
  const openDialog = (): void => {
    if (!selected()) {
      setStatus({ kind: "error", text: t("cad.saveElement.selectFirst") })
      return
    }
    setStatus(undefined)
    setOpen(true)
  }

  createEffect(on(open, (isOpen, wasOpen) => {
    if (isOpen === wasOpen) return
    const element = selected()
    if (!element) return
    const { specifications } = extractor(element.type)(element)
    let description = `${humanize(element.type)} element`
    if (element.type === "cube" || element.type === "rectangle") description += ` (${element.width} × ${element.height}${element.depth ? ` × ${element.depth}` : ""})`
    else if (element.type === "circle" || element.type === "sphere") description += ` (radius: ${element.radius})`
    else if (element.type === "cylinder" || element.type === "cone") description += ` (radius: ${element.radius}, height: ${element.height})`
    setForm({
      name: element.name || `${humanize(element.type)}-${Date.now().toString().slice(-6)}`,
      description,
      type: "mechanical",
      tags: generateSuggestedTags(element, element.type, specifications).join(", ")
    })
  }))

  createEffect(on(destination, (value, was) => {
    if (value === "project" && was !== "project") {
      if (projects().length === 0 && projectsState() !== "loading") void loadProjects()
      setStatus(undefined)
    }
  }))

  const loadProjects = async (): Promise<void> => {
    setProjectsState("loading")
    try {
      const list = await run<ReadonlyArray<{ readonly id: string; readonly name: string }>>(app.client.projects.list())
      setProjects(list.map((project) => ({ id: project.id, name: project.name })))
      setProjectsState("idle")
    } catch {
      setProjectsState("failed")
    }
  }

  const name = (): string => form().name.trim()
  const duplicate = createMemo(() => {
    const wanted = name().toLowerCase()
    if (wanted === "") return false
    if (destination() === "local") return library.components.some((component) => component.name.trim().toLowerCase() === wanted)
    return projects().length === 0 ? false : projectId() !== ""
  })

  const canSave = (): boolean => !busy() && name() !== "" && (destination() === "local" || projectId() !== "")

  const saveLocal = (element: Record<string, unknown>): void => {
    const { specifications } = extractor(element.type as string)(element)
    const saved = library.addComponent({
      name: name(),
      description: form().description,
      type: form().type,
      tags: form().tags.split(",").map((tag) => tag.trim()).filter(Boolean),
      data: componentLibraryDocument(element as Element),
      meta: { specifications, elementType: element.type }
    })
    if (!saved) throw new Error(t("cad.saveElement.failedLocal"))
    setStatus({ kind: "ok", text: t("cad.saveElement.saveLocal") })
    setOpen(false)
    props.onSaveComplete?.("local")
  }

  const saveToProject = async (element: Record<string, unknown>): Promise<void> => {
    await run<{ readonly id: string }>(
      app.client.components.createForProject({
        params: { id: projectId() },
        payload: {
          name: name(),
          description: form().description,
          type: form().type,
          isPublic: isPublic(),
          thumbnail: null,
          data: componentLibraryDocument(element as Element)
        }
      })
    )
    setStatus({ kind: "ok", text: t("cad.saveElement.saveProject") })
    setOpen(false)
    props.onSaveComplete?.("project")
  }

  const save = async (): Promise<void> => {
    const element = selected()
    if (!element) return
    if (name() === "") {
      setStatus({ kind: "error", text: t("cad.saveElement.nameRequired") })
      return
    }
    if (destination() === "project" && projectId() === "") {
      setStatus({ kind: "error", text: t("cad.saveElement.projectRequired") })
      return
    }
    setBusy(true)
    try {
      if (destination() === "local") saveLocal(element)
      else await saveToProject(element)
    } catch {
      setStatus({ kind: "error", text: t(destination() === "local" ? "cad.saveElement.failedLocal" : "cad.saveElement.failedProject") })
    } finally {
      setBusy(false)
    }
  }

  const change = (key: "name" | "description" | "type" | "tags", value: string): void => {
    if (key === "name") setForm((previous) => ({ ...previous, name: value }))
    else if (key === "description") setForm((previous) => ({ ...previous, description: value }))
    else if (key === "type") setForm((previous) => ({ ...previous, type: value }))
    else setForm((previous) => ({ ...previous, tags: value }))
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        class="p-1 rounded-full text-blue-600 hover:bg-blue-100 focus:outline-none"
        title={t("cad.saveElement.title")}
        aria-label={t("cad.saveElement.title")}
        disabled={!selected()}
      >
        <Save size={18} />
      </button>

      <Show when={status()?.kind === "error"}>
        <div class="fixed bottom-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded z-50 flex items-center" role="alert">
          <AlertCircle size={16} class="mr-2" />{status()!.text}
        </div>
      </Show>
      <Show when={status()?.kind === "ok"}>
        <div class="fixed bottom-4 right-4 bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded z-50 flex items-center" role="status">
          <Check size={16} class="mr-2" />{status()!.text}
        </div>
      </Show>

      <Modal open={open()} onClose={() => setOpen(false)} title={t("cad.saveElement.title")}>
        <div class="space-y-4">
          <p class="text-xs text-gray-500 dark:text-gray-400">{t("cad.saveElement.subtitle")}</p>

          <Show when={selected()}>
            {(element) => (
              <div class="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/60" data-testid="save-element-preview">
                <p class="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">{t("cad.saveElement.preview")}</p>
                <p class="text-sm font-medium text-gray-800 dark:text-gray-200">{describe(element())}</p>
                <dl class="mt-2 grid grid-cols-2 gap-2 text-xs text-gray-600 dark:text-gray-300">
                  <For each={previewOf(element())}>{([key, value]) => (
                    <div class="flex min-w-0 gap-1">
                      <dt class="text-gray-500 capitalize">{key}:</dt>
                      <dd class="truncate font-medium" title={value}>{value}</dd>
                    </div>
                  )}</For>
                </dl>
              </div>
            )}
          </Show>

          <label class="block">
            <span class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">{t("cad.saveElement.name")}</span>
            <input
              type="text"
              class="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
              value={form().name}
              onInput={(event) => change("name", event.currentTarget.value)}
              placeholder={t("cad.saveElement.namePlaceholder")}
              aria-invalid={name() === "" || duplicate()}
            />
          </label>

          <label class="block">
            <span class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">{t("cad.saveElement.description")}</span>
            <textarea
              rows={3}
              class="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
              value={form().description}
              onInput={(event) => change("description", event.currentTarget.value)}
            />
          </label>

          <div class="grid gap-4 sm:grid-cols-2">
            <label class="block">
              <span class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">{t("cad.saveElement.type")}</span>
              <select
                class="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
                value={form().type}
                onChange={(event) => change("type", event.currentTarget.value)}
              >
                <For each={TYPES}>{(type) => <option value={type}>{humanize(type)}</option>}</For>
              </select>
            </label>
            <label class="block">
              <span class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">{t("cad.saveElement.tags")}</span>
              <input
                type="text"
                class="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
                value={form().tags}
                onInput={(event) => change("tags", event.currentTarget.value)}
                placeholder={t("cad.saveElement.tagsPlaceholder")}
              />
            </label>
          </div>

          <div>
            <span class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">{t("cad.saveElement.destination")}</span>
            <div class="flex flex-wrap gap-2">
              <button
                type="button"
                class="flex-1 rounded-md border px-3 py-2 text-left text-sm"
                classList={{ "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300": destination() === "local", "border-gray-300 dark:border-gray-600": destination() !== "local" }}
                aria-pressed={destination() === "local"}
                onClick={() => setDestination("local")}
              >
                {t("cad.saveElement.destinationLocal")}
              </button>
              <button
                type="button"
                class="flex-1 rounded-md border px-3 py-2 text-left text-sm"
                classList={{ "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300": destination() === "project", "border-gray-300 dark:border-gray-600": destination() !== "project" }}
                aria-pressed={destination() === "project"}
                onClick={() => setDestination("project")}
              >
                {t("cad.saveElement.destinationProject")}
              </button>
            </div>
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {t(destination() === "local" ? "cad.saveElement.destinationHintLocal" : "cad.saveElement.destinationHintProject")}
            </p>
          </div>

          <Show when={destination() === "project"}>
            <div class="space-y-2">
              <label class="block">
                <span class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">{t("cad.saveElement.project")}</span>
                <select
                  class="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
                  value={projectId()}
                  onChange={(event) => setProjectId(event.currentTarget.value)}
                >
                  <option value="">{t("cad.saveElement.pickProject")}</option>
                  <For each={projects()}>{(project) => <option value={project.id}>{project.name}</option>}</For>
                </select>
              </label>
              <Show when={projectsState() === "loading"}><p class="text-xs text-gray-500">{t("cad.saveElement.loadingProjects")}</p></Show>
              <Show when={projectsState() === "failed"}>
                <p class="text-xs text-amber-600 dark:text-amber-400">{t("cad.saveElement.offline")}</p>
              </Show>
              <Show when={projectsState() === "idle" && projects().length === 0}>
                <p class="text-xs text-amber-600 dark:text-amber-400">{t("cad.saveElement.noProjects")}</p>
              </Show>
              <label class="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={isPublic()} onChange={(event) => setIsPublic(event.currentTarget.checked)} />
                {t("cad.saveElement.public")}
              </label>
            </div>
          </Show>

          <Show when={duplicate()}>
            <p class="text-xs text-amber-600 dark:text-amber-400">{t("cad.saveElement.duplicate")}</p>
          </Show>

          <Show when={status()?.kind === "error"}>
            <p class="text-xs text-red-600 dark:text-red-400" role="alert">{status()!.text}</p>
          </Show>

          <div class="flex justify-end gap-2 border-t border-gray-200 pt-3 dark:border-gray-700">
            <button
              type="button"
              class="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              onClick={() => setOpen(false)}
            >
              {t("cad.saveElement.cancel")}
            </button>
            <button
              type="button"
              class="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              disabled={!canSave()}
              onClick={() => void save()}
            >
              {busy() ? t("cad.saveElement.saving") : t("cad.saveElement.save")}
            </button>
          </div>
        </div>
      </Modal>
    </>
  )
}
