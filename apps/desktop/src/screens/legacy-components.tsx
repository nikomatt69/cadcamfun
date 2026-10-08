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
  return <section class="min-h-full min-w-0 text-gray-900 dark:text-gray-50">
    <ScreenHeader title={lt("legacy.components")} actions={<A class="btn btn-outline" href="/library">{lt("legacy.library")}</A>} />
    <div class="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <LegacyReadState loading={projects.loading()} error={projects.error()} retry={projects.refetch} />
      <div class="card grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
        <label class="form-label">{lt("legacy.projects")}<select class="form-select" value={search.projectId ?? ""} disabled={pending()} onChange={(e) => { setSearch({ projectId: e.currentTarget.value || undefined }); setMessage(undefined); setError(undefined) }}><option value="">{lt("legacy.selectProject")}</option><For each={projects.data() ?? []}>{(project) => <option value={project.id}>{project.name}</option>}</For></select></label>
        <label class="form-label">{lt("legacy.search")}<input class="form-input" type="search" value={filter()} onInput={(e) => setFilter(e.currentTarget.value)} /></label>
      </div>
      <Show when={!search.projectId}><EmptyState label={lt("legacy.componentSelect")} /></Show>
      <LegacyReadState loading={components.loading()} error={components.error()} retry={refetch} />
      <Show when={error()}><ErrorState label={lt("legacy.error")} detail={error()} /></Show>
      <Toast message={message()} />
      <Show when={search.projectId && !components.loading() && !components.error() && components.data()}>
        <form class="card flex flex-wrap items-end gap-4 p-4 sm:p-5" onSubmit={(e) => void create(e)}>
          <label class="form-label min-w-0 flex-[1_1_16rem]">{lt("legacy.name")}<input class="form-input" required value={name()} disabled={pending()} onInput={(e) => setName(e.currentTarget.value)} /></label>
          <button class="btn btn-primary w-full sm:w-auto" disabled={pending() || !name().trim()}>{lt("legacy.createComponent")}</button>
        </form>
        <Show when={components.data()?.length === 0}><EmptyState label={lt("legacy.emptyComponents")} /></Show>
        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"><For each={components.data()?.filter((item) => `${item.name} ${item.description ?? ""}`.toLowerCase().includes(filter().toLowerCase())) ?? []}>{(component) => <article class="card flex min-w-0 flex-col gap-3 p-5">
          <h2 class="break-words text-base font-semibold leading-snug"><A class="rounded-sm text-brand-600 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-brand-400" href={`/components/${encodeURIComponent(component.id)}`}>{component.name}</A></h2>
          <p class="break-words text-sm leading-relaxed text-gray-600 dark:text-gray-300">{component.description}</p>
          <p class="mt-auto border-t border-gray-200 pt-3 text-xs font-medium text-gray-500 dark:border-gray-700 dark:text-gray-400">{component.type}</p>
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
  return <section class="min-h-full min-w-0 text-gray-900 dark:text-gray-50">
    <ScreenHeader title={row()?.name ?? lt("legacy.components")} actions={<A class="btn btn-outline" href={`/components${row() ? `?projectId=${encodeURIComponent(row()!.projectId)}` : ""}`}>{lt("legacy.backComponents")}</A>} />
    <div class="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <LegacyReadState loading={component.loading()} error={component.error()} retry={refetch} />
      <Show when={error()}><ErrorState label={lt("legacy.error")} detail={error()} /></Show>
      <Toast message={message()} />
      <Show when={row()} keyed>{(item) => <>
        <LegacyNotice message={lt("legacy.componentGap")} />
        <div class="grid items-start gap-6 lg:grid-cols-2">
          <form class="card grid min-w-0 content-start gap-5 p-4 sm:p-6" onSubmit={(e) => void save(e)}>
            <A class="break-words rounded-sm border-b border-gray-200 pb-4 text-sm font-medium text-brand-600 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-gray-700 dark:text-brand-400" href={`/projects/${encodeURIComponent(item.projectId)}`}>{item.project.name}</A>
            <label class="form-label">{lt("legacy.name")}<input class="form-input" name="name" value={item.name} required disabled={pending()} /></label>
            <label class="form-label">{lt("legacy.description")}<textarea class="form-textarea min-h-32 resize-y" name="description" value={item.description ?? ""} disabled={pending()} /></label>
            <label class="form-label">{lt("legacy.type")}<input class="form-input" name="type" value={item.type ?? ""} disabled={pending()} /></label>
            <label class="flex items-center gap-3 text-sm text-gray-700 dark:text-gray-300"><input class="h-4 w-4 rounded border-gray-300 accent-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-gray-600" type="checkbox" name="isPublic" checked={item.isPublic} disabled={pending()} />{lt("legacy.public")}</label>
            <div class="border-t border-gray-200 pt-4 dark:border-gray-700"><button class="btn btn-primary w-full sm:w-auto" disabled={pending()}>{lt("legacy.save")}</button></div>
          </form>
          <article class="card min-w-0 overflow-hidden"><h2 class="border-b border-gray-200 px-4 py-4 text-base font-semibold dark:border-gray-700 sm:px-6">{lt("legacy.componentData")}</h2><pre class="max-h-96 overflow-auto whitespace-pre-wrap break-all bg-gray-50 p-4 font-mono text-xs leading-relaxed text-gray-700 dark:bg-gray-900/50 dark:text-gray-300 sm:p-6">{JSON.stringify(item.data, null, 2)}</pre></article>
        </div>
      </>}</Show>
    </div>
  </section>
}
