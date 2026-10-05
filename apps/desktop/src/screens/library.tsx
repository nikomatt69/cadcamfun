import { For, Show, createSignal } from "solid-js"
import { useApp } from "../state/context.ts"
import { useRead } from "../app/queries.ts"
import { Effect, Schema } from "effect"
import { CreateMachineConfig, ToolBody } from "@cadcamfun/api"
import { t } from "../i18n/index.ts"
import { ScreenHeader } from "./screen-parts.tsx"

type Tab = "materials" | "tools" | "machines"
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
  const materials = useRead((c) => c.materials.list({ query: {} }))
  const tools = useRead((c) => c.tools.list({ query: {} }))
  const machines = useRead((c) => c.machineConfigs.list({ query: {} }))
  const machineRows = () => {
    const data = machines.data()?.data
    const rows: unknown = Array.isArray(data) ? data : object(data)["configs"]
    return Array.isArray(rows) ? rows.map((row: unknown) => object(row)).filter((row) => typeof row["id"] === "string" && typeof row["name"] === "string") : []
  }
  const rows = () => tab() === "materials" ? materials.data() ?? [] : tab() === "tools" ? tools.data() ?? [] : machineRows()
  const reset = () => { setEditing(undefined); setName(""); setError(undefined); setDeleting(undefined); setDetails(tab() === "tools" ? '{"type":"endmill","diameter":6,"material":"carbide","numberOfFlutes":3}' : tab() === "machines" ? '{"type":"mill","config":{"workVolume":{"x":300,"y":180,"z":60},"maxSpindleSpeed":18000,"maxFeedRate":2000,"controller":"grbl"}}' : '{"density":2700,"costPerUnit":4.2}') }
  const refresh = () => tab() === "materials" ? materials.refetch() : tab() === "tools" ? tools.refetch() : machines.refetch()
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
      } else {
        const payload = Schema.decodeUnknownSync(CreateMachineConfig)({ ...object(raw), name: name().trim() })
        await app.runtime.run(id ? app.client.machineConfigs.update({ params: { id }, payload }) : app.client.machineConfigs.create({ payload }))
      }
      reset(); await refresh()
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
      else await app.runtime.run(Effect.asVoid(client.machineConfigs.remove({ params: { id } })))
      setDeleting(undefined); await refresh()
    } catch (cause) { setError(String(cause)) }
    finally { setPending(false) }
  }
  reset()
  return <section><ScreenHeader title={t("library.title")} subtitle={t("library.subtitle")} /><div class="p-5"><nav class="mb-5 flex gap-2" aria-label={t("library.title")}><For each={["materials", "tools", "machines"] as const}>{(item) => <button class="btn btn-outline" aria-pressed={tab() === item} onClick={() => { setTab(item); reset() }}>{t(`library.tab.${item}`)}</button>}</For></nav>
    <Show when={materials.error() || tools.error() || machines.error()}><p role="alert">{materials.error() || tools.error() || machines.error()}<button class="btn" onClick={() => void refresh()}>{t("common.retry")}</button></p></Show>
    <div class="grid gap-6 lg:grid-cols-[1fr_340px]"><div class="grid content-start gap-3 md:grid-cols-2"><For each={rows()}>{(value) => { const row = object(value); return <article class="card p-4"><h2 class="font-semibold">{String(row["name"])}</h2><pre class="my-2 max-h-36 overflow-auto text-xs">{JSON.stringify(tab() === "materials" ? row["properties"] : tab() === "machines" ? row["config"] : { type: row["type"], diameter: row["diameter"] }, null, 2)}</pre><button class="btn btn-outline" onClick={() => { setEditing(String(row["id"])); setName(String(row["name"])); setDetails(JSON.stringify(tab() === "materials" ? row["properties"] : row, null, 2)) }}>{t("projects.rename")}</button><button class="btn btn-danger" onClick={() => setDeleting(String(row["id"]))}>{t("common.delete")}</button></article> }}</For></div>
    <form class="card p-4" onSubmit={(e) => void save(e)}><label class="form-label">{t("library.column.name")}<input class="form-input" required value={name()} onInput={(e) => setName(e.currentTarget.value)} /></label><label class="form-label mt-3">{t("library.details")}<textarea class="form-textarea h-64 font-mono text-xs" value={details()} onInput={(e) => setDetails(e.currentTarget.value)} /></label><button class="btn btn-primary mt-3" disabled={pending() || !name().trim()}>{t(editing() ? "common.save" : "library.create")}</button><button class="btn btn-outline" type="button" onClick={reset}>{t("common.cancel")}</button></form></div>
    <Show when={deleting()}><div role="alertdialog" aria-label={t("library.confirmDelete")} class="card mt-4 p-4"><p>{t("library.confirmDelete")}</p><button class="btn btn-danger" disabled={pending()} onClick={() => void remove()}>{t("common.delete")}</button><button class="btn btn-outline" onClick={() => setDeleting(undefined)}>{t("common.cancel")}</button></div></Show><Show when={error()}><p role="alert" class="mt-3 text-red-600">{error()}</p></Show>
  </div></section>
}
