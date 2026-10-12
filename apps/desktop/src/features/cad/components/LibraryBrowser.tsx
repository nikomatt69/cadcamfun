import { For, Show, createEffect, createMemo, createSignal, type JSX } from "solid-js"
import { Box, Cpu, Layers, Package, Search, Wrench } from "lucide-solid"
import { useApp } from "../../../shared/state/context.ts"
import { useLocalComponentsLibraryStore } from "../store/localComponentsLibraryStore.ts"
import { predefinedComponents } from "../lib/predefinedLibraries.ts"
import { t } from "../../../i18n/index.ts"

export interface LibraryComponent { readonly id: string; readonly name: string; readonly description?: string | undefined; readonly origin: "built-in" | "local" }

interface Props { onSelectComponent?: (component: LibraryComponent) => void }

/** What the library row is, in the words the assistant uses (`lib_lookup_material`, `lib_lookup_tool`, `lib_lookup_machine_config`). */
type Kind = "components" | "materials" | "tools" | "machines"

const KINDS: ReadonlyArray<{ readonly id: Kind; readonly label: string; readonly icon: typeof Box }> = [
  { id: "components", label: "Components", icon: Package },
  { id: "materials", label: "Materials", icon: Layers },
  { id: "tools", label: "Tools", icon: Wrench },
  { id: "machines", label: "Machines", icon: Cpu }
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
  const local = useLocalComponentsLibraryStore()
  const [kind, setKind] = createSignal<Kind>("components")
  const [query, setQuery] = createSignal("")
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

  const components = createMemo<LibraryComponent[]>(() => [
    ...predefinedComponents.map((component: Row) => ({ id: str(component["name"]), name: str(component["name"]), description: str(component["description"]) || undefined, origin: "built-in" as const })),
    ...local.components.map((component) => ({ id: component.id, name: component.name, description: component.description ?? undefined, origin: "local" as const }))
  ])

  /** Every row of the open kind, as the assistant's lookups return it. */
  const rows = createMemo<ReadonlyArray<Row>>(() => {
    if (kind() === "materials") return materials()
    if (kind() === "tools") return tools()
    if (kind() === "machines") return machines()
    return components().map((component) => ({ id: component.id, name: component.name, description: component.description ?? "", origin: component.origin }))
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
    props.onSelectComponent?.({ id: rowId(row), name: str(row["name"]), description: str(row["description"]) || undefined, origin: str(row["origin"]) === "local" ? "local" : "built-in" })
  }

  return (
    <div class="h-full flex flex-col p-6 gap-4">
      <div class="flex flex-wrap items-center gap-2">
        <For each={KINDS}>{(entry) => {
          const Icon = entry.icon
          return (
            <button
              type="button"
              data-kind={entry.id}
              onClick={() => { setKind(entry.id); setQuery("") }}
              class={`px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors ${kind() === entry.id ? "bg-blue-600 text-white" : "bg-white/70 dark:bg-gray-800/70 text-gray-700 dark:text-gray-200 hover:bg-white dark:hover:bg-gray-700"}`}
            >
              <Icon size={14} />{entry.label}
            </button>
          )
        }}</For>
      </div>

      <div class="relative">
        <Search size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          data-library-search
          placeholder={`Search ${kind()}...`}
          value={query()}
          onInput={(event) => setQuery(event.currentTarget.value)}
          class="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white/80 dark:bg-gray-700/80 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <Show when={error() !== null}>
        <p class="text-sm text-red-600 dark:text-red-400">The library could not be read: {error()}</p>
      </Show>

      <div class="flex-1 overflow-y-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 content-start">
        <For each={filtered()}>{(row) =>
          <button
            type="button"
            disabled={kind() !== "components"}
            onClick={() => selectComponent(row)}
            class={`text-left p-4 rounded-xl border border-white/40 dark:border-gray-600/40 bg-white/70 dark:bg-gray-800/70 shadow-sm transition-colors ${kind() === "components" ? "hover:bg-white dark:hover:bg-gray-700 cursor-pointer" : "cursor-default"}`}
          >
            <div class="flex items-center gap-2 mb-1">
              <Box size={16} class="text-blue-500" />
              <span class="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">{str(row["name"]) || "Unnamed"}</span>
            </div>
            <For each={facts(row)}>{(line) => <p class="text-xs text-gray-500 dark:text-gray-400 truncate">{line}</p>}</For>
            <Show when={kind() === "components"}>
              <span class="mt-2 inline-block text-[10px] uppercase tracking-wide text-gray-400">{str(row["origin"])} · click to place</span>
            </Show>
          </button>}
        </For>
        <Show when={filtered().length === 0}>
          <div class="col-span-full text-center text-sm text-gray-500 py-10">{error() === null ? `No ${kind()} found` : ""}</div>
        </Show>
      </div>

      <p class="text-xs text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-gray-600 pt-3">
        {t("cad.library.note")} Materials, tools, machines and components are the same rows the assistant reads with its `lib_lookup_*` tools; create or edit them on the Resources pages.
      </p>
    </div>
  )
}
