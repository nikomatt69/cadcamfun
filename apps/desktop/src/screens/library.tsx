import { For, Show, createMemo, createSignal } from "solid-js"
import { useApp } from "../state/context.ts"
import { useRead } from "../app/queries.ts"
import { Effect, Schema } from "effect"
import { CreateMachineConfig, LibraryItemBody, ToolBody } from "@cadcamfun/api"
import { t } from "../i18n/index.ts"
import { LibraryFields } from "./library-fields.tsx"

type Tab = "materials" | "tools" | "machines" | "components"
const object = (value: unknown): Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value) ? Object.fromEntries(Object.entries(value)) : {}
export function LibraryScreen() {
  const app = useApp()
  const [tab, setTab] = createSignal<Tab>("materials")
  const [name, setName] = createSignal("")
  const [details, setDetails] = createSignal("{}")
  const [editing, setEditing] = createSignal<string>()
  const [deleting, setDeleting] = createSignal<string>()
  const [error, setError] = createSignal<string>()
  const [pending, setPending] = createSignal(false)
  const [search, setSearch] = createSignal("")
  const [view, setView] = createSignal<"grid" | "list">("grid")
  const [reverse, setReverse] = createSignal(false)
  const [formOpen, setFormOpen] = createSignal(false)
  const [selected, setSelected] = createSignal<Record<string, unknown>>()
  const [status, setStatus] = createSignal("")
  const materials = useRead((c) => c.materials.list({ query: {} }))
  const tools = useRead((c) => c.tools.list({ query: {} }))
  const machines = useRead((c) => c.machineConfigs.list({ query: {} }))
  const components = useRead((c) => c.library.list({ query: { category: "components" } }))
  const machineRows = () => {
    const data = machines.data()?.data
    const rows: unknown = Array.isArray(data) ? data : object(data)["configs"]
    return Array.isArray(rows) ? rows.map((row: unknown) => object(row)).filter((row) => typeof row["id"] === "string" && typeof row["name"] === "string") : []
  }
  const rows = () => tab() === "materials" ? materials.data() ?? [] : tab() === "tools" ? tools.data() ?? [] : tab() === "components" ? components.data() ?? [] : machineRows()
  const filtered = createMemo(() => rows().map(object).filter((row) => `${row["name"] ?? ""} ${row["type"] ?? ""} ${row["material"] ?? ""}`.toLowerCase().includes(search().toLowerCase())).sort((a, b) => String(a["name"]).localeCompare(String(b["name"])) * (reverse() ? -1 : 1)))
  const reset = () => { setEditing(undefined); setName(""); setError(undefined); setDeleting(undefined); setDetails(tab() === "tools" ? '{"type":"endmill","diameter":6,"material":"carbide","numberOfFlutes":3}' : tab() === "machines" ? '{"type":"mill","config":{"workVolume":{"x":300,"y":180,"z":60},"maxSpindleSpeed":18000,"maxFeedRate":2000,"controller":"grbl"}}' : tab() === "components" ? '{"type":"mechanical","data":{},"properties":{}}' : '{"density":2700,"costPerUnit":4.2}') }
  const refresh = () => tab() === "materials" ? materials.refetch() : tab() === "tools" ? tools.refetch() : tab() === "components" ? components.refetch() : machines.refetch()
  const save = async (event: Event) => {
    event.preventDefault(); if (pending()) return
    setPending(true); setError(undefined)
    try {
      const raw: unknown = JSON.parse(details())
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(t("library.invalidJson"))
      const id = editing()
      if (tab() === "materials") {
        const payload = { name: name().trim(), properties: raw }
        await app.runtime.run(id ? app.client.materials.update({ params: { id }, payload }) : app.client.materials.create({ payload }))
      } else if (tab() === "tools") {
        const payload = Schema.decodeUnknownSync(ToolBody)({ ...object(raw), name: name().trim() })
        if (!payload.type || !payload.material || !payload.diameter || payload.diameter <= 0) throw new Error(t("library.invalidTool"))
        await app.runtime.run(id ? app.client.tools.update({ params: { id }, payload }) : app.client.tools.create({ payload }))
      } else if (tab() === "components") {
        const payload = Schema.decodeUnknownSync(LibraryItemBody)({ ...object(raw), name: name().trim(), category: "components" })
        await app.runtime.run(id ? app.client.library.update({ params: { id }, payload }) : app.client.library.create({ payload }))
      } else {
        const payload = Schema.decodeUnknownSync(CreateMachineConfig)({ ...object(raw), name: name().trim() })
        await app.runtime.run(id ? app.client.machineConfigs.update({ params: { id }, payload }) : app.client.machineConfigs.create({ payload }))
      }
      reset(); setFormOpen(false); setSelected(undefined); setStatus(t("library.saved")); await refresh()
    } catch (cause) { setError(String(cause)) }
    finally { setPending(false) }
  }
  const remove = async () => {
    const id = deleting(); if (!id || pending()) return
    setPending(true)
    try {
      // Each remove answers a different payload (plain message vs. envelope) and a
      // different error set, so the three effects are run in their own branches rather
      // than unioned into a single `run` argument.
      const client = app.client
      if (tab() === "materials") await app.runtime.run(Effect.asVoid(client.materials.remove({ params: { id } })))
      else if (tab() === "tools") await app.runtime.run(Effect.asVoid(client.tools.remove({ params: { id } })))
       else if (tab() === "components") await app.runtime.run(Effect.asVoid(client.library.remove({ params: { id } })))
       else await app.runtime.run(Effect.asVoid(client.machineConfigs.remove({ params: { id } })))
       setDeleting(undefined); setSelected(undefined); await refresh()
    } catch (cause) { setError(String(cause)) }
    finally { setPending(false) }
  }
  reset()
  const edit = (row: Record<string, unknown>) => { setEditing(String(row["id"])); setName(String(row["name"])); setDetails(JSON.stringify(tab() === "materials" ? row["properties"] ?? {} : row, null, 2)); setError(undefined); setFormOpen(true) }
  const exportRows = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(filtered(), null, 2)], { type: "application/json" }))
    const link = document.createElement("a"); link.href = url; link.download = `${tab()}-library.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return <section class="min-h-full p-4 sm:p-8"><div class="mx-auto max-w-7xl">
    <header class="mb-6 flex flex-wrap items-center justify-between gap-4"><h1 class="text-2xl font-bold">{t("library.title")}</h1><div class="flex gap-2"><button class="btn btn-primary" disabled={!filtered().length} title={t("library.exportHint")} onClick={exportRows}>{t("library.export")}</button><button class="btn btn-outline" onClick={() => { reset(); setFormOpen(true) }}>{t("library.add")}</button></div></header>
    <div class="overflow-hidden rounded-2xl border border-gray-200/50 bg-white/80 shadow-xl dark:border-gray-700/50 dark:bg-gray-800/80">
      <nav class="flex overflow-x-auto border-b border-gray-200/50 bg-gradient-to-r from-blue-50/50 via-purple-50/50 to-pink-50/50 p-3 dark:border-gray-700/50 dark:from-blue-900/20 dark:via-purple-900/20 dark:to-pink-900/20" aria-label={t("library.title")}><For each={["components", "materials", "tools", "machines"] as const}>{(item) => <button class="flex-1 rounded-xl px-5 py-3 text-sm font-medium active:scale-[0.98]" classList={{ "bg-blue-600 text-white shadow-md": tab() === item, "text-gray-600 dark:text-gray-300": tab() !== item }} aria-pressed={tab() === item} onClick={() => { setTab(item); reset(); setFormOpen(false); setSelected(undefined); setSearch(""); setStatus("") }}>{t(`library.tab.${item}`)}<span class="ml-2 rounded-full bg-white/20 px-2 py-0.5 text-xs">{item === "materials" ? materials.data()?.length ?? 0 : item === "tools" ? tools.data()?.length ?? 0 : item === "components" ? components.data()?.length ?? 0 : machineRows().length}</span></button>}</For></nav>
      <div class="border-b border-gray-200/50 bg-gradient-to-r from-blue-50/50 via-purple-50/50 to-pink-50/50 p-6 dark:border-gray-700/50 dark:from-blue-900/20 dark:via-purple-900/20 dark:to-pink-900/20">
        <div class="mb-6 flex flex-wrap items-center justify-between gap-3"><div class="flex items-center gap-3"><div class="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 text-xl text-white shadow-lg" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5"/></svg></div><div><h2 class="text-2xl font-bold">{t(`library.tab.${tab()}`)}</h2><p class="text-sm text-gray-500">{t("library.description", { type: t(`library.tab.${tab()}`).toLowerCase() })}</p></div></div><span class="rounded-full bg-green-100/80 px-3 py-1 text-xs font-medium text-green-700 dark:bg-green-900/40 dark:text-green-300">{t("library.items", { count: filtered().length })}</span></div>
        <div class="flex flex-wrap items-center gap-3"><input class="form-input min-w-40 flex-1 rounded-xl" type="search" aria-label={t("library.search")} placeholder={t("library.search")} value={search()} onInput={(e) => setSearch(e.currentTarget.value)} /><label class="sr-only" for="library-sort">{t("library.sort")}</label><select id="library-sort" class="form-select w-auto" value={reverse() ? "desc" : "asc"} onChange={(e) => setReverse(e.currentTarget.value === "desc")}><option value="asc">{t("library.sortName")}</option><option value="desc">{t("library.sortReverse")}</option></select><button class="btn btn-outline" aria-pressed={view() === "grid"} onClick={() => setView("grid")}>{t("library.grid")}</button><button class="btn btn-outline" aria-pressed={view() === "list"} onClick={() => setView("list")}>{t("library.list")}</button><button class="btn btn-outline" disabled={pending()} onClick={() => void refresh()}>{t("library.refresh")}</button></div>
        <p class="mt-4 text-sm font-medium text-blue-600 dark:text-blue-400">{t("library.main")}</p>
      </div>
      <Show when={materials.error() || tools.error() || machines.error() || components.error()}><p class="p-4 text-red-600" role="alert">{materials.error() || tools.error() || machines.error() || components.error()}<button class="btn" onClick={() => void refresh()}>{t("common.retry")}</button></p></Show>
      <Show when={tab() === "materials" ? materials.loading() : tab() === "tools" ? tools.loading() : tab() === "components" ? components.loading() : machines.loading()}><p class="p-6" role="status">{t("common.loading")}</p></Show>
      <div class="p-6"><div class="grid content-start gap-4" classList={{ "md:grid-cols-2 xl:grid-cols-3": view() === "grid" }}><For each={filtered()}>{(row) => <article class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800" classList={{ "sm:flex sm:items-center sm:justify-between sm:gap-4": view() === "list" }}>
        <div><h3 class="font-semibold">{String(row["name"])}</h3><p class="mt-1 text-xs text-gray-500">{tab() === "tools" ? `${String(row["type"])} / ${String(row["material"])} / ${String(row["diameter"])} mm` : tab() === "machines" || tab() === "components" ? String(row["type"] ?? "") : t("library.density") + ": " + String(object(row["properties"])["density"] ?? "-")}</p></div>
        <div class="mt-4 flex flex-wrap gap-2"><button class="btn btn-outline" onClick={() => { setSelected(row); setFormOpen(false) }}>{t("library.select")}</button><button class="btn btn-outline" onClick={() => edit(row)}>{t("library.edit")}</button><button class="btn btn-danger" disabled={pending()} onClick={() => setDeleting(String(row["id"]))}>{t("common.delete")}</button></div>
      </article>}</For></div><Show when={!filtered().length}><div class="py-12 text-center"><h3 class="text-lg font-medium">{t("library.noResults")}</h3><p class="mt-2 text-sm text-gray-500">{t("library.noResultsHint")}</p><Show when={search()}><button class="btn btn-outline mt-4" onClick={() => setSearch("")}>{t("library.clear")}</button></Show></div></Show></div>
    </div>
    <Show when={selected()}>{(row) => <aside class="card mt-6 p-6"><div class="flex items-center justify-between"><h2 class="text-lg font-medium">{String(row()["name"])}</h2><button class="btn btn-outline" onClick={() => setSelected(undefined)}>{t("common.close")}</button></div><pre class="my-4 max-h-80 overflow-auto text-xs">{JSON.stringify(tab() === "materials" ? row()["properties"] : row(), null, 2)}</pre><button class="btn btn-primary" onClick={() => edit(row())}>{t("library.edit")}</button></aside>}</Show>
    <Show when={formOpen()}><form class="card mt-6 space-y-5 p-6" onSubmit={(e) => void save(e)}><h2 class="text-lg font-medium">{t(editing() ? "library.edit" : "library.add")}</h2><fieldset class="space-y-5" disabled={pending()}><label class="form-label">{t("library.column.name")}<input class="form-input" required value={name()} onInput={(e) => setName(e.currentTarget.value)} /></label><LibraryFields tab={tab()} details={details()} onChange={setDetails}/><details open={tab() === "machines" || tab() === "components"}><summary class="cursor-pointer text-sm font-medium">{t("library.advanced")}</summary><label class="form-label mt-3">{t("library.details")}<textarea class="form-textarea h-64 font-mono text-xs" value={details()} onInput={(e) => setDetails(e.currentTarget.value)} /></label></details><div class="flex gap-2"><button class="btn btn-primary" disabled={!name().trim()}>{t(editing() ? "common.save" : "library.create")}</button><button class="btn btn-outline" type="button" onClick={() => { reset(); setFormOpen(false) }}>{t("common.cancel")}</button></div></fieldset></form></Show>
    <Show when={deleting()}><div role="alertdialog" aria-label={t("library.confirmDelete")} class="card mt-4 p-4"><p class="mb-3">{t("library.confirmDelete")}</p><button class="btn btn-danger" disabled={pending()} onClick={() => void remove()}>{t("common.delete")}</button><button class="btn btn-outline" onClick={() => setDeleting(undefined)}>{t("common.cancel")}</button></div></Show><Show when={error()}><p role="alert" class="mt-3 text-red-600">{error()}</p></Show><p class="mt-3 text-sm text-green-700 dark:text-green-300" role="status">{status()}</p>
  </div></section>
}
