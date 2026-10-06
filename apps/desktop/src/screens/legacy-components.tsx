import { For, Show, createSignal, type JSX } from "solid-js"
import { A, useParams, useSearchParams } from "@solidjs/router"
import { useApp } from "../state/context.ts"
import { useKeyedRead, useRead } from "../app/queries.ts"
import { EmptyState, ErrorState, ScreenHeader, Toast } from "./screen-parts.tsx"
import { LegacyNotice, LegacyReadState, lt } from "./legacy-parts.tsx"

export function LegacyComponents(): JSX.Element {
  const app = useApp()
  const [search, setSearch] = useSearchParams<{ projectId?: string }>()
  const projects = useRead((c) => c.projects.list())
  const components = useKeyedRead(
    () => search.projectId,
    (c, id) => c.components.listForProject({ params: { id } })
  )
  const refetch = components.refetch
  const [filter, setFilter] = createSignal("")
  const [name, setName] = createSignal("")
  const [pending, setPending] = createSignal(false)
  const [error, setError] = createSignal<string>()
  const [message, setMessage] = createSignal<string>()
  const create = async (event: Event) => {
    event.preventDefault()
    const id = search.projectId
    if (!id || pending() || !name().trim()) return
    setPending(true); setError(undefined); setMessage(undefined)
    try {
      await app.runtime.run(app.client.components.createForProject({ params: { id }, payload: { name: name().trim() } }))
      setName(""); setMessage(lt("legacy.created")); await refetch()
    } catch (cause) { setError(String(cause)) } finally { setPending(false) }
  }
  return <section>
    <ScreenHeader title={lt("legacy.components")} actions={<A class="btn btn-outline" href="/library">{lt("legacy.library")}</A>} />
    <div class="space-y-5 p-4 sm:p-6">
      <LegacyReadState loading={projects.loading()} error={projects.error()} retry={projects.refetch} />
      <div class="grid gap-4 sm:grid-cols-2">
        <label class="form-label">{lt("legacy.projects")}<select class="form-select" value={search.projectId ?? ""} disabled={pending()} onChange={(e) => { setSearch({ projectId: e.currentTarget.value || undefined }); setMessage(undefined); setError(undefined) }}><option value="">{lt("legacy.selectProject")}</option><For each={projects.data() ?? []}>{(project) => <option value={project.id}>{project.name}</option>}</For></select></label>
        <label class="form-label">{lt("legacy.search")}<input class="form-input" type="search" value={filter()} onInput={(e) => setFilter(e.currentTarget.value)} /></label>
      </div>
      <Show when={!search.projectId}><EmptyState label={lt("legacy.componentSelect")} /></Show>
      <LegacyReadState loading={components.loading()} error={components.error()} retry={refetch} />
      <Show when={error()}><ErrorState label={lt("legacy.error")} detail={error()} /></Show>
      <Toast message={message()} />
      <Show when={search.projectId && !components.loading() && !components.error() && components.data()}>
        <form class="card flex flex-wrap items-end gap-3 rounded-2xl p-4" onSubmit={(e) => void create(e)}>
          <label class="form-label flex-1">{lt("legacy.name")}<input class="form-input" required value={name()} disabled={pending()} onInput={(e) => setName(e.currentTarget.value)} /></label>
          <button class="btn btn-primary" disabled={pending() || !name().trim()}>{lt("legacy.createComponent")}</button>
        </form>
        <Show when={components.data()?.length === 0}><EmptyState label={lt("legacy.emptyComponents")} /></Show>
        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"><For each={components.data()?.filter((item) => `${item.name} ${item.description ?? ""}`.toLowerCase().includes(filter().toLowerCase())) ?? []}>{(component) => <article class="card space-y-2 rounded-2xl p-5">
          <h2 class="font-semibold"><A href={`/components/${encodeURIComponent(component.id)}`}>{component.name}</A></h2>
          <p class="text-sm text-gray-600 dark:text-gray-300">{component.description}</p>
          <p class="text-xs text-gray-500">{component.type}</p>
        </article>}</For></div>
      </Show>
    </div>
  </section>
}

export function LegacyComponentDetail(): JSX.Element {
  const app = useApp()
  const params = useParams<{ id: string }>()
  const component = useKeyedRead(
    () => params.id,
    (c, id) => c.components.get({ params: { id } })
  )
  const refetch = component.refetch
  const row = component.data
  const [pending, setPending] = createSignal(false)
  const [error, setError] = createSignal<string>()
  const [message, setMessage] = createSignal<string>()
  const save = async (event: SubmitEvent & { currentTarget: HTMLFormElement }) => {
    event.preventDefault()
    if (pending()) return
    const form = new FormData(event.currentTarget)
    const name = String(form.get("name") ?? "").trim()
    if (!name) return
    setPending(true); setError(undefined); setMessage(undefined)
    try {
      await app.runtime.run(app.client.components.update({ params: { id: params.id }, payload: {
        name, description: String(form.get("description") ?? "").trim() || null,
        type: String(form.get("type") ?? "").trim() || null, isPublic: form.has("isPublic")
      } }))
      await refetch(); setMessage(lt("legacy.saved"))
    } catch (cause) { setError(String(cause)) } finally { setPending(false) }
  }
  return <section>
    <ScreenHeader title={row()?.name ?? lt("legacy.components")} actions={<A class="btn btn-outline" href={`/components${row() ? `?projectId=${encodeURIComponent(row()!.projectId)}` : ""}`}>{lt("legacy.backComponents")}</A>} />
    <div class="space-y-4 p-4 sm:p-6">
      <LegacyReadState loading={component.loading()} error={component.error()} retry={refetch} />
      <Show when={error()}><ErrorState label={lt("legacy.error")} detail={error()} /></Show>
      <Toast message={message()} />
      <Show when={row()} keyed>{(item) => <>
        <LegacyNotice message={lt("legacy.componentGap")} />
        <div class="grid gap-5 lg:grid-cols-2">
          <form class="card grid content-start gap-4 rounded-2xl p-5" onSubmit={(e) => void save(e)}>
            <A class="text-sm text-blue-600 dark:text-blue-400" href={`/projects/${encodeURIComponent(item.projectId)}`}>{item.project.name}</A>
            <label class="form-label">{lt("legacy.name")}<input class="form-input" name="name" value={item.name} required disabled={pending()} /></label>
            <label class="form-label">{lt("legacy.description")}<textarea class="form-textarea" name="description" value={item.description ?? ""} disabled={pending()} /></label>
            <label class="form-label">{lt("legacy.type")}<input class="form-input" name="type" value={item.type ?? ""} disabled={pending()} /></label>
            <label class="flex items-center gap-2 text-sm"><input type="checkbox" name="isPublic" checked={item.isPublic} disabled={pending()} />{lt("legacy.public")}</label>
            <button class="btn btn-primary justify-self-start" disabled={pending()}>{lt("legacy.save")}</button>
          </form>
          <article class="card min-w-0 rounded-2xl p-5"><h2 class="mb-4 font-semibold">{lt("legacy.componentData")}</h2><pre class="max-h-96 overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(item.data, null, 2)}</pre></article>
        </div>
      </>}</Show>
    </div>
  </section>
}
