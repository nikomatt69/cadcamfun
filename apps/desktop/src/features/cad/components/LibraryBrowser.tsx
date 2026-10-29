import { For, Show, createEffect, createMemo, createSignal, createUniqueId, onCleanup, type JSX } from "solid-js"
import { Cpu, Layers, Package, Search, Wrench, X } from "lucide-solid"
import { useApp } from "../../../shared/state/context.ts"
import { useLocalComponentsLibraryStore } from "../store/localComponentsLibraryStore.ts"
import { predefinedComponents } from "../lib/predefinedLibraries.ts"
import { loadComponentCatalogue } from "../lib/component-catalogue.ts"
import { t, type Key } from "../../../i18n/index.ts"

export interface LibraryComponent extends Record<string, unknown> { readonly data?: unknown; readonly id: string; readonly name: string; readonly description?: string | undefined; readonly origin: "built-in" | "local" | "project" }

interface Props { onSelectComponent?: (component: LibraryComponent) => void }

/** What the library row is, in the words the assistant uses (`lib_lookup_material`, `lib_lookup_tool`, `lib_lookup_machine_config`). */
type Kind = "components" | "materials" | "tools" | "machines"

const KINDS: ReadonlyArray<{ readonly id: Kind; readonly label: Key; readonly icon: typeof Package }> = [
  { id: "components", label: "cad.lib.components", icon: Package },
  { id: "materials", label: "cad.lib.materials", icon: Layers },
  { id: "tools", label: "cad.lib.tools", icon: Wrench },
  { id: "machines", label: "cad.lib.machines", icon: Cpu }
]

type Row = Record<string, unknown>
const str = (value: unknown): string => (typeof value === "string" ? value : typeof value === "number" ? String(value) : "")
const num = (value: unknown): string => (typeof value === "number" && Number.isFinite(value) ? String(value) : "")

/** Machines answer the envelope `{ data: { data: rows } }`; older answers carried `{ data: rows }` or `{ configs }`. */
const machineRows = (value: unknown, depth = 0): ReadonlyArray<Row> => {
  if (Array.isArray(value)) return value as ReadonlyArray<Row>
  if (depth > 2) return []
  const record = (value ?? {}) as Row
  return machineRows(record["data"] ?? record["configs"], depth + 1)
}

/** The one field of a library row that identifies it to the assistant (and to the Resources pages). */
const rowId = (row: Row): string => str(row["id"])

/**
 * The whole library, as the assistant sees it: the components the editor can place, and the materials, tools and
 * machine configurations `lib_lookup_*` reads. Search spans every row of the open kind, so a missing cutter is found
 * the same way the model finds it. Creating and editing stay on the Resources pages (`/materials`, `/tools`,
 * `/machine`, `/components`): this dialog is the read side both the user and the assistant share.
 */
export default function LibraryBrowser(props: Props): JSX.Element {
  const app = useApp()
  const id = createUniqueId()
  const local = useLocalComponentsLibraryStore()
  const [kind, setKind] = createSignal<Kind>("components")
  const [query, setQuery] = createSignal("")
  const [projectComponents, setProjectComponents] = createSignal<LibraryComponent[]>([])
  const [materials, setMaterials] = createSignal<ReadonlyArray<Row>>([])
  const [tools, setTools] = createSignal<ReadonlyArray<Row>>([])
  const [machines, setMachines] = createSignal<ReadonlyArray<Row>>([])
  const [error, setError] = createSignal<string | null>(null)

  // The library rows load once per open dialog, not on every keystroke of the search box.
  createEffect(() => {
    setError(null)
    void (async () => {
      try {
        const [materialRows, toolRows, machineRowsResult] = await Promise.all([
          app.runtime.run(app.client.materials.list({ query: {} })),
          app.runtime.run(app.client.tools.list({ query: {} })),
          app.runtime.run(app.client.machineConfigs.list({ query: {} }))
        ])
        setMaterials((materialRows as ReadonlyArray<Row>).map((row) => row as Row))
        setTools((toolRows as ReadonlyArray<Row>).map((row) => row as Row))
        setMachines(machineRows(machineRowsResult))
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause))
      }
    })()
  })

  createEffect(() => {
    let disposed = false
    const refresh = async (): Promise<void> => {
      try {
        const rows = await loadComponentCatalogue(app)
        if (!disposed) setProjectComponents(rows.map((row) => ({ ...row, description: row.description ?? undefined, origin: "project" as const })))
      } catch (cause) { if (!disposed) setError(cause instanceof Error ? cause.message : String(cause)) }
    }
    void refresh()
    window.addEventListener("component-library-updated", refresh)
    onCleanup(() => { disposed = true; window.removeEventListener("component-library-updated", refresh) })
  })

  const components = createMemo<LibraryComponent[]>(() => [
    ...predefinedComponents.map((component: Row) => ({ ...component, id: str(component["name"]), name: str(component["name"]), description: str(component["description"]) || undefined, origin: "built-in" as const })),
    ...local.components.map((component) => ({ ...component, description: component.description ?? undefined, origin: "local" as const })),
    ...projectComponents()
  ])

  /** Every row of the open kind, as the assistant's lookups return it. */
  const rows = createMemo<ReadonlyArray<Row>>(() => {
    if (kind() === "materials") return materials()
    if (kind() === "tools") return tools()
    if (kind() === "machines") return machines()
    return components()
  })

  const filtered = createMemo<ReadonlyArray<Row>>(() => {
    const needle = query().trim().toLowerCase()
    const all = rows()
    if (needle === "") return all
    return all.filter((row) => `${str(row["name"])} ${str(row["description"])} ${str(row["type"])} ${str(row["material"])} ${str(row["postProcessor"])}`.toLowerCase().includes(needle))
  })

  /** The lines of a row that matter when machining with it; every number is millimetres or rpm. */
  const facts = (row: Row): ReadonlyArray<string> => {
    const pick = (...values: ReadonlyArray<unknown>): unknown => values.find((value) => value !== undefined && value !== null && value !== "")
    if (kind() === "tools") {
      return [
        num(row["diameter"]) ? `Ø ${num(row["diameter"])} mm` : "",
        str(row["type"]),
        str(row["material"]),
        num(row["numberOfFlutes"]) ? `${num(row["numberOfFlutes"])} flutes` : "",
        num(row["maxRPM"]) ? `max ${num(row["maxRPM"])} rpm` : "",
        num(row["cuttingLength"]) ? `flutes ${num(row["cuttingLength"])} mm` : "",
        num(row["shankDiameter"]) ? `shank Ø ${num(row["shankDiameter"])} mm` : ""
      ].filter((line) => line !== "")
    }
    if (kind() === "machines") {
      // The Resources pages store `{workVolume, maxSpindleSpeed, maxFeedRate, controller}`; the assistant's
      // `lib_upsert_machine_config` writes `{kinematics, postProcessor, workOffsets, maxRPM, maxFeed}`. Both are read.
      const config = (row["config"] ?? {}) as Row
      const volume = (pick(config["workVolume"], config["kinematics"]) ?? {}) as Row
      const envelope = num(volume["x"]) ? `envelope ${num(volume["x"])}×${num(volume["y"])}×${num(volume["z"])} mm` : ""
      const offsets = config["workOffsets"]
      return [
        str(pick(config["type"], row["type"])),
        str(config["postProcessor"]) ? `post ${str(config["postProcessor"])}` : str(config["controller"]) ? `controller ${str(config["controller"])}` : "",
        num(pick(config["maxRPM"], config["maxSpindleSpeed"])) ? `max ${num(pick(config["maxRPM"], config["maxSpindleSpeed"]))} rpm` : "",
        num(pick(config["maxFeed"], config["maxFeedRate"])) ? `max ${num(pick(config["maxFeed"], config["maxFeedRate"]))} mm/min` : "",
        envelope,
        Array.isArray(offsets) ? `offsets ${(offsets as ReadonlyArray<unknown>).map(str).filter((o) => o !== "").slice(0, 6).join(" ")}` : ""
      ].filter((line) => line !== "")
    }
    if (kind() === "materials") {
      const properties = (row["properties"] ?? {}) as Row
      const entries = Object.entries(properties).filter(([, value]) => typeof value === "string" || typeof value === "number").slice(0, 5)
      return [str(row["description"]), ...entries.map(([key, value]) => `${key}: ${str(value)}`)].filter((line) => line !== "")
    }
    return [str(row["origin"])]
  }

  const selectComponent = (row: Row) => {
    if (kind() !== "components") return
    const component = components().find((candidate) => candidate.id === rowId(row) && candidate.origin === row["origin"])
    if (component) props.onSelectComponent?.(component)
  }

  const count = (entry: Kind): number => entry === "components" ? components().length : entry === "materials" ? materials().length : entry === "tools" ? tools().length : machines().length
  const ActiveIcon = (): JSX.Element => {
    const Icon = KINDS.find((entry) => entry.id === kind())!.icon
    return <Icon size={20} aria-hidden="true" />
  }

  return (
    <div class="library-browser flex flex-col">
      <div class="library-navigation">
        <div class="library-kind-tabs" role="tablist" aria-label={t("library.categories")} onKeyDown={(event) => {
          const index = KINDS.findIndex((entry) => entry.id === kind())
          const next = event.key === "ArrowRight" ? (index + 1) % KINDS.length : event.key === "ArrowLeft" ? (index + KINDS.length - 1) % KINDS.length : event.key === "Home" ? 0 : event.key === "End" ? KINDS.length - 1 : -1
          if (next < 0) return
          event.preventDefault()
          setKind(KINDS[next]!.id); setQuery("")
          event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus()
        }}>
          <For each={KINDS}>{(entry) => {
            const Icon = entry.icon
            return <button type="button" role="tab" id={`${id}-${entry.id}`} aria-controls={`${id}-panel`} aria-selected={kind() === entry.id} tabIndex={kind() === entry.id ? 0 : -1} data-kind={entry.id} onClick={() => { setKind(entry.id); setQuery("") }}><Icon size={16} aria-hidden="true" />{t(`library.tab.${entry.id}`)}<span class="library-count">{count(entry.id)}</span></button>
          }}</For>
        </div>
      </div>
      <div class="library-browser-toolbar">
        <div class="library-controls">
          <div class="library-search-field">
            <Search size={16} aria-hidden="true" />
            <input type="search" data-library-search aria-label={t("library.searchKind", { type: kind() })} placeholder={t("library.searchKind", { type: kind() })} value={query()} onInput={(event) => setQuery(event.currentTarget.value)} />
            <Show when={query()}><button type="button" class="library-icon-button" aria-label={t("library.clear")} onClick={() => setQuery("")}><X size={14} /></button></Show>
          </div>
          <span class="library-result-count" role="status">{t("library.items", { count: filtered().length })}</span>
        </div>
      </div>
      <Show when={error() !== null}><p class="library-error" role="alert">{t("library.readError", { error: error() ?? "" })}</p></Show>
      <div class="library-results" role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${kind()}`}>
        <div class="library-item-grid library-catalogue-grid">
          <For each={filtered()}>{(row) =>
            <button type="button" disabled={kind() !== "components"} onClick={() => selectComponent(row)} class="library-catalogue-card">
              <div class="library-catalogue-card-heading"><span class="library-catalogue-icon"><ActiveIcon /></span><h3>{str(row["name"]) || t("library.unnamed")}</h3></div>
              <div class="library-catalogue-facts"><For each={facts(row)}>{(line) => <p>{line}</p>}</For></div>
              <Show when={kind() === "components"}><div class="library-catalogue-card-footer"><span class="library-count">{str(row["origin"])}</span><span>{t("library.place")}</span></div></Show>
            </button>}
          </For>
        </div>
        <Show when={filtered().length === 0 && error() === null}><div class="library-state"><div class="library-state-icon"><ActiveIcon /></div><h3>{t("library.emptyKind", { type: kind() })}</h3><p>{query() ? t("library.emptySearch") : t("library.emptySource")}</p><Show when={query()}><button type="button" class="library-control-button" onClick={() => setQuery("")}>{t("library.clear")}</button></Show></div></Show>
      </div>
      <footer class="library-browser-footer">{t("library.catalogueNote")}</footer>
    </div>
  )
}
