import { useAtomSet, useAtomValue } from "@effect/atom-solid"
import { useSearchParams } from "@solidjs/router"
import { Cause, Exit } from "effect"
import { AsyncResult } from "effect/reactivity"
import { For, Show, createEffect, createSignal } from "solid-js"
import { createStore, reconcile, unwrap } from "solid-js/store"
import { Button } from "../components/ui"
import { libraryKeys, libraryListAtom, libraryMutations, type LibraryKind } from "../lib/atoms"
import { download } from "../lib/download"

type Item = { id: string; name: string } & Record<string, unknown>
interface Entry {
  readonly item: Item
  readonly builtin: boolean
  readonly updatedAt: string
}

type FieldSpec =
  | { key: string; label: string; type: "text" | "textarea"; optional?: boolean }
  | { key: string; label: string; type: "number"; optional?: boolean; int?: boolean }
  | { key: string; label: string; type: "select"; options: ReadonlyArray<string>; optional?: boolean }
  | { key: string; label: string; type: "bool"; optional?: boolean }
  | { key: string; label: string; type: "vec3" }

const controllers = ["grbl", "fanuc", "linuxcnc", "heidenhain", "marlin"]

/** Form layout per kind; the server schema stays the source of truth and rejects bad values. */
const fields: Record<LibraryKind, ReadonlyArray<FieldSpec>> = {
  tools: [
    { key: "name", label: "Name", type: "text" },
    {
      key: "kind",
      label: "Type",
      type: "select",
      options: ["flat-endmill", "ball-endmill", "v-bit", "drill", "chamfer"],
    },
    { key: "number", label: "Tool number (T)", type: "number", int: true },
    { key: "diameter", label: "Diameter (mm)", type: "number" },
    { key: "flutes", label: "Flutes", type: "number", int: true },
    { key: "fluteLength", label: "Flute length (mm)", type: "number" },
    { key: "material", label: "Tool material", type: "select", options: ["carbide", "hss"] },
    { key: "angle", label: "Angle (°)", type: "number", optional: true },
    { key: "maxRpm", label: "Max RPM", type: "number", optional: true },
    { key: "coolant", label: "Coolant", type: "select", options: ["none", "flood", "mist"], optional: true },
    { key: "shankDiameter", label: "Shank Ø (mm)", type: "number", optional: true },
    { key: "totalLength", label: "Total length (mm)", type: "number", optional: true },
    { key: "notes", label: "Notes", type: "textarea", optional: true },
  ],
  materials: [
    { key: "name", label: "Name", type: "text" },
    {
      key: "kind",
      label: "Type",
      type: "select",
      options: ["softwood", "hardwood", "mdf", "plastic", "aluminum", "brass", "steel"],
    },
    { key: "cuttingSpeed", label: "Cutting speed Vc (m/min)", type: "number" },
    { key: "chipLoad", label: "Chip load @6 mm (mm)", type: "number" },
    { key: "maxDepthRatio", label: "Max depth (×D)", type: "number" },
    { key: "density", label: "Density (g/cm³)", type: "number", optional: true },
    { key: "hardness", label: "Hardness (HB)", type: "number", optional: true },
    { key: "description", label: "Description", type: "textarea", optional: true },
  ],
  machines: [
    { key: "name", label: "Name", type: "text" },
    {
      key: "kind",
      label: "Type",
      type: "select",
      options: ["mill", "router", "lathe", "laser", "printer"],
      optional: true,
    },
    { key: "controller", label: "Controller", type: "select", options: controllers },
    { key: "minRpm", label: "Min RPM", type: "number" },
    { key: "maxRpm", label: "Max RPM", type: "number" },
    { key: "maxFeed", label: "Max feed (mm/min)", type: "number" },
    { key: "rapidFeed", label: "Rapid (mm/min)", type: "number" },
    { key: "workArea", label: "Work area X/Y/Z (mm)", type: "vec3" },
    { key: "toolChanger", label: "Tool changer", type: "bool" },
    { key: "coolant", label: "Coolant", type: "bool", optional: true },
    { key: "description", label: "Description", type: "textarea", optional: true },
  ],
}

const blank: Record<LibraryKind, Item> = {
  tools: {
    id: "",
    name: "New tool",
    kind: "flat-endmill",
    number: 1,
    diameter: 6,
    flutes: 2,
    fluteLength: 20,
    material: "carbide",
  },
  materials: { id: "", name: "New material", kind: "softwood", cuttingSpeed: 400, chipLoad: 0.06, maxDepthRatio: 1 },
  machines: {
    id: "",
    name: "New machine",
    controller: "grbl",
    minRpm: 0,
    maxRpm: 24000,
    maxFeed: 3000,
    rapidFeed: 5000,
    workArea: { x: 600, y: 400, z: 100 },
    toolChanger: false,
  },
}

const titles: Record<LibraryKind, string> = { tools: "Tools", materials: "Materials", machines: "Machines" }

const summary = (kind: LibraryKind, i: Item): string => {
  if (kind === "tools") return `T${i.number} · Ø${i.diameter} · ${i.kind} · ${i.flutes}F ${i.material}`
  if (kind === "materials") return `${i.kind} · Vc ${i.cuttingSpeed} · fz ${i.chipLoad}`
  const w = i.workArea as { x: number; y: number; z: number }
  return `${i.controller} · ${w.x}×${w.y}×${w.z} · ${i.maxRpm} rpm`
}

const errorText = (cause: Cause.Cause<unknown>) => {
  const e = Cause.squash(cause) as { _tag?: string; message?: string }
  if (e?._tag === "ItemReadOnly") return "Built-in items are read-only: clone it to customise."
  return e?.message ?? "Request failed"
}

export default function Library() {
  const [params, setParams] = useSearchParams<{ kind?: string }>()
  const kind = (): LibraryKind => (params.kind === "materials" || params.kind === "machines" ? params.kind : "tools")
  return (
    <main class="mx-auto max-w-5xl p-6">
      <header class="mb-6 flex items-baseline gap-4">
        <a href="/" class="text-2xl font-bold tracking-tight text-zinc-100">
          CADCAM<span class="text-[var(--accent)]">FUN</span>
        </a>
        <h1 class="text-lg text-zinc-400">Library</h1>
      </header>
      <nav class="mb-4 flex gap-2">
        <For each={["tools", "materials", "machines"] as const}>
          {(k) => (
            <Button active={kind() === k} onClick={() => setParams({ kind: k })}>
              {titles[k]}
            </Button>
          )}
        </For>
      </nav>
      <Show when={kind()} keyed>
        {(k) => <KindView kind={k} />}
      </Show>
    </main>
  )
}

function KindView(props: { kind: LibraryKind }) {
  const kind = props.kind
  const list = useAtomValue(() => libraryListAtom[kind] as typeof libraryListAtom.tools)
  // The three kinds share one contract; type them as tools and let the server schema validate.
  const m = libraryMutations[kind] as typeof libraryMutations.tools
  const opts = { mode: "promiseExit" } as const
  const create = useAtomSet(() => m.create, opts) as unknown as (a: unknown) => Promise<Exit.Exit<Entry, unknown>>
  const update = useAtomSet(() => m.update, opts) as unknown as (a: unknown) => Promise<Exit.Exit<Entry, unknown>>
  const remove = useAtomSet(() => m.remove, opts) as unknown as (a: unknown) => Promise<Exit.Exit<void, unknown>>
  const clone = useAtomSet(() => m.clone, opts) as unknown as (a: unknown) => Promise<Exit.Exit<Entry, unknown>>
  const importItems = useAtomSet(() => m.import, opts) as unknown as (
    a: unknown,
  ) => Promise<Exit.Exit<{ imported: number }, unknown>>
  const reactivityKeys = libraryKeys(kind)

  const [selected, setSelected] = createSignal<string | "new" | undefined>()
  const [draft, setDraft] = createStore<{ item: Item }>({ item: blank[kind] })
  const [message, setMessage] = createSignal<{ kind: "error" | "info"; text: string }>()
  const [filter, setFilter] = createSignal("")

  const entries = (): ReadonlyArray<Entry> => {
    const r = list()
    return AsyncResult.isSuccess(r) ? (r.value as unknown as ReadonlyArray<Entry>) : []
  }
  const current = () => entries().find((e) => e.item.id === selected())
  const readOnly = () => current()?.builtin === true
  const shown = () => {
    const q = filter().trim().toLowerCase()
    return q ? entries().filter((e) => `${e.item.name} ${e.item.id}`.toLowerCase().includes(q)) : entries()
  }

  createEffect(() => {
    const e = current()
    if (e) setDraft("item", reconcile(structuredClone(e.item) as Item))
  })

  const report = <A,>(exit: Exit.Exit<A, unknown>, ok: string) => {
    if (Exit.isSuccess(exit)) setMessage({ kind: "info", text: ok })
    else setMessage({ kind: "error", text: errorText(exit.cause) })
    return Exit.isSuccess(exit) ? exit.value : undefined
  }

  const save = async () => {
    const item = clean(draft.item)
    if (selected() === "new") {
      const entry = report(await create({ payload: item, reactivityKeys }), "Created")
      if (entry) setSelected(entry.item.id)
    } else if (selected()) {
      report(await update({ params: { id: selected() }, payload: item, reactivityKeys }), "Saved")
    }
  }

  const doClone = async (id: string) => {
    const entry = report(await clone({ params: { id }, reactivityKeys }), "Cloned")
    if (entry) setSelected(entry.item.id)
  }

  const doRemove = async (id: string) => {
    if (!confirm("Delete this item?")) return
    const exit = await remove({ params: { id }, reactivityKeys })
    report(exit, "Deleted")
    if (Exit.isSuccess(exit) && selected() === id) setSelected(undefined)
  }

  const exportAll = () =>
    download(
      `cadcamfun-${kind}.json`,
      JSON.stringify({ kind, items: entries().map((e) => e.item) }, null, 2),
      "application/json",
    )

  const importFile = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as { items?: unknown } | Array<unknown>
      const items = Array.isArray(parsed) ? parsed : parsed.items
      if (!Array.isArray(items)) return setMessage({ kind: "error", text: "Expected { items: [...] } or an array" })
      const r = report(await importItems({ payload: { items }, reactivityKeys }), "Imported")
      if (r) setMessage({ kind: "info", text: `Imported ${r.imported} items` })
    } catch {
      setMessage({ kind: "error", text: "Not a valid JSON file" })
    }
  }

  return (
    <div class="grid grid-cols-[1fr_380px] gap-4">
      <section class="min-w-0">
        <div class="mb-2 flex items-center gap-2">
          <input
            class="flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-[var(--accent)]"
            placeholder={`Search ${titles[kind].toLowerCase()}`}
            value={filter()}
            onInput={(e) => setFilter(e.currentTarget.value)}
          />
          <Button
            variant="primary"
            onClick={() => {
              setDraft("item", reconcile(structuredClone(blank[kind])))
              setSelected("new")
            }}
          >
            New
          </Button>
          <label class="inline-flex cursor-pointer items-center rounded-md bg-zinc-800 px-2.5 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-700">
            Import
            <input
              type="file"
              accept="application/json,.json"
              class="hidden"
              onChange={(e) => {
                const f = e.currentTarget.files?.[0]
                if (f) void importFile(f)
                e.currentTarget.value = ""
              }}
            />
          </label>
          <Button onClick={exportAll}>Export</Button>
        </div>
        <Show when={message()}>
          {(msg) => (
            <p
              class="mb-2 rounded px-2 py-1 text-xs"
              classList={{
                "bg-red-500/20 text-red-300": msg().kind === "error",
                "bg-zinc-800 text-zinc-300": msg().kind === "info",
              }}
            >
              {msg().text}
            </p>
          )}
        </Show>
        <Show
          when={!AsyncResult.isFailure(list())}
          fallback={<p class="text-sm text-zinc-500">Cannot reach the server.</p>}
        >
          <ul class="divide-y divide-zinc-800 rounded-md border border-zinc-800" data-testid="library-list">
            <For each={shown()} fallback={<li class="p-3 text-sm text-zinc-500">Nothing here.</li>}>
              {(e) => (
                <li
                  class="flex cursor-pointer items-center gap-2 p-2.5 hover:bg-zinc-900"
                  classList={{ "bg-zinc-900": selected() === e.item.id }}
                  onClick={() => setSelected(e.item.id)}
                >
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2 text-sm text-zinc-100">
                      {e.item.name}
                      <Show when={e.builtin}>
                        <span class="rounded bg-zinc-800 px-1.5 text-[10px] text-zinc-400 uppercase">built-in</span>
                      </Show>
                    </div>
                    <div class="truncate font-mono text-[11px] text-zinc-500">{summary(kind, e.item)}</div>
                  </div>
                  <Button
                    variant="ghost"
                    onClick={(ev) => {
                      ev.stopPropagation()
                      void doClone(e.item.id)
                    }}
                  >
                    Clone
                  </Button>
                  <Show when={!e.builtin}>
                    <Button
                      variant="ghost"
                      onClick={(ev) => {
                        ev.stopPropagation()
                        void doRemove(e.item.id)
                      }}
                    >
                      Delete
                    </Button>
                  </Show>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </section>

      <Show when={selected()}>
        <section class="rounded-md border border-zinc-800 p-3">
          <header class="mb-3 flex items-center justify-between">
            <h2 class="text-sm font-semibold text-zinc-200">
              {selected() === "new" ? `New ${titles[kind].toLowerCase().slice(0, -1)}` : draft.item.name}
            </h2>
            <span class="font-mono text-[11px] text-zinc-500">{selected() === "new" ? "" : selected()}</span>
          </header>
          <Show when={readOnly()}>
            <p class="mb-3 rounded bg-zinc-900 px-2 py-1 text-xs text-zinc-400">
              Built-in preset, read-only.{" "}
              <button class="text-[var(--accent)] hover:underline" onClick={() => void doClone(selected()!)}>
                Clone to edit
              </button>
            </p>
          </Show>
          <fieldset class="flex flex-col gap-2" disabled={readOnly()}>
            <For each={fields[kind]}>
              {(f) => <FieldEditor spec={f} item={draft.item} set={(k, v) => setDraft("item", k, v as never)} />}
            </For>
          </fieldset>
          <Show when={!readOnly()}>
            <div class="mt-4 flex gap-2">
              <Button variant="primary" class="flex-1" onClick={save}>
                {selected() === "new" ? "Create" : "Save"}
              </Button>
              <Button variant="ghost" onClick={() => setSelected(undefined)}>
                Close
              </Button>
            </div>
          </Show>
        </section>
      </Show>
    </div>
  )
}

/** Drop empty optional fields so they are omitted rather than sent as `undefined`/`""`. */
const clean = (item: Item): Item =>
  Object.fromEntries(
    Object.entries(structuredClone(unwrap(item))).filter(([, v]) => v !== undefined && v !== "" && !Number.isNaN(v)),
  ) as Item

const inputClass =
  "rounded border border-zinc-700 bg-zinc-900 px-1.5 py-1 text-xs text-zinc-100 outline-none focus:border-[var(--accent)] disabled:opacity-60"

function FieldEditor(props: { spec: FieldSpec; item: Item; set: (key: string, value: unknown) => void }) {
  const s = props.spec
  const value = () => props.item[s.key]
  const label = <span class="text-xs text-zinc-400">{s.label}</span>
  switch (s.type) {
    case "text":
      return (
        <label class="flex items-center justify-between gap-2">
          {label}
          <input
            class={`${inputClass} w-48`}
            value={(value() as string) ?? ""}
            onInput={(e) => props.set(s.key, e.currentTarget.value)}
          />
        </label>
      )
    case "textarea":
      return (
        <label class="flex flex-col gap-1">
          {label}
          <textarea
            class={`${inputClass} h-16`}
            value={(value() as string) ?? ""}
            onInput={(e) => props.set(s.key, e.currentTarget.value || undefined)}
          />
        </label>
      )
    case "number":
      return (
        <label class="flex items-center justify-between gap-2">
          {label}
          <input
            type="number"
            step={s.int ? 1 : "any"}
            class={`${inputClass} w-28 text-right font-mono`}
            value={(value() as number | undefined) ?? ""}
            placeholder={s.optional ? "—" : ""}
            onChange={(e) => {
              const raw = e.currentTarget.value
              props.set(s.key, raw === "" && s.optional ? undefined : Number(raw))
            }}
          />
        </label>
      )
    case "select":
      return (
        <label class="flex items-center justify-between gap-2">
          {label}
          <select
            class={`${inputClass} w-40`}
            value={(value() as string) ?? ""}
            onChange={(e) => props.set(s.key, e.currentTarget.value || undefined)}
          >
            <Show when={s.optional}>
              <option value="">—</option>
            </Show>
            <For each={s.options}>{(o) => <option value={o}>{o}</option>}</For>
          </select>
        </label>
      )
    case "bool":
      return (
        <label class="flex items-center justify-between gap-2">
          {label}
          <input
            type="checkbox"
            checked={value() === true}
            onChange={(e) => props.set(s.key, e.currentTarget.checked)}
          />
        </label>
      )
    case "vec3": {
      const v = () => (value() as { x: number; y: number; z: number }) ?? { x: 0, y: 0, z: 0 }
      return (
        <label class="flex items-center justify-between gap-2">
          {label}
          <span class="flex gap-1">
            <For each={["x", "y", "z"] as const}>
              {(axis) => (
                <input
                  type="number"
                  class={`${inputClass} w-16 text-right font-mono`}
                  value={v()[axis]}
                  onChange={(e) => props.set(s.key, { ...v(), [axis]: Number(e.currentTarget.value) })}
                />
              )}
            </For>
          </span>
        </label>
      )
    }
  }
}
