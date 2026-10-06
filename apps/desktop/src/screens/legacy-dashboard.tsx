import { For, Show, createSignal, type JSX } from "solid-js"
import { A } from "@solidjs/router"
import { useRead } from "../app/queries.ts"
import { useApp } from "../state/context.ts"
import { EmptyState, ErrorState, ScreenHeader, formatDate } from "./screen-parts.tsx"
import { LegacyReadState, lt } from "./legacy-parts.tsx"

export function LegacyDashboard(): JSX.Element {
  const projects = useRead((c) => c.projects.list())
  const tools = useRead((c) => c.tools.list({ query: {} }))
  const metrics = () => [
    { label: lt("legacy.projects"), value: projects.data()?.length, href: "/projects" },
    { label: lt("legacy.drawings"), value: projects.data()?.reduce((n, p) => n + p._count.drawings, 0), href: "/projects" },
    { label: lt("legacy.components"), value: projects.data()?.reduce((n, p) => n + p._count.components, 0), href: "/components" },
    { label: lt("legacy.tools"), value: tools.data()?.length, href: "/tools" }
  ]
  return <section class="min-h-full">
    <ScreenHeader title={lt("legacy.dashboard")} actions={<A class="btn btn-primary" href="/projects/create">{lt("legacy.createProject")}</A>} />
    <div class="space-y-6 p-4 sm:p-6">
      <div class="rounded-3xl border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-cyan-50 p-6 dark:border-gray-700 dark:from-gray-800 dark:via-gray-900 dark:to-gray-800">
        <h2 class="text-3xl font-bold tracking-tight">{lt("legacy.welcome")}</h2>
        <p class="mt-2 text-sm text-gray-600 dark:text-gray-300">{lt("legacy.welcomeDetail")}</p>
      </div>
      <div class="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <For each={metrics()}>{(metric) => <A class="card rounded-2xl p-5 focus-visible:ring-2 focus-visible:ring-blue-500" href={metric.href}>
          <span class="text-sm text-gray-600 dark:text-gray-300">{metric.label}</span>
          <strong class="mt-3 block text-3xl tabular-nums">{metric.value ?? lt("legacy.unavailable")}</strong>
        </A>}</For>
      </div>
      <LegacyReadState loading={projects.loading()} error={projects.error()} retry={projects.refetch} />
      <LegacyReadState loading={tools.loading()} error={tools.error()} retry={tools.refetch} />
      <div class="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <article class="card rounded-2xl p-5">
          <h2 class="mb-4 text-lg font-semibold">{lt("legacy.recent")}</h2>
          <Show when={projects.data()?.length === 0}><EmptyState label={lt("legacy.emptyProjects")} /></Show>
          <ul class="divide-y divide-gray-200 dark:divide-gray-700">
            <For each={[...(projects.data() ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 6)}>{(project) => <li>
              <A class="flex flex-wrap items-center justify-between gap-2 py-3" href={`/projects/${encodeURIComponent(project.id)}`}>
                <div><h3 class="font-medium">{project.name}</h3><p class="text-sm text-gray-500 dark:text-gray-400">{project.description}</p></div>
                <time class="text-xs text-gray-500" dateTime={project.updatedAt}>{formatDate(project.updatedAt)}</time>
              </A>
            </li>}</For>
          </ul>
        </article>
        <article class="card grid content-start gap-3 rounded-2xl p-5">
          <h2 class="text-lg font-semibold">{lt("legacy.quick")}</h2>
          <A class="btn btn-outline" href="/cad">{lt("legacy.openCad")}</A>
          <A class="btn btn-outline" href="/cam">{lt("legacy.openCam")}</A>
          <A class="btn btn-outline" href="/library">{lt("legacy.library")}</A>
          <A class="btn btn-outline" href="/marketplace">{lt("legacy.marketplace")}</A>
          <A class="btn btn-outline" href="/ai">{lt("legacy.ai")}</A>
        </article>
      </div>
      <LegacyNotifications />
    </div>
  </section>
}

export function LegacyNotifications(): JSX.Element {
  const app = useApp()
  const [unread, setUnread] = createSignal(false)
  const [page, setPage] = createSignal(0)
  const notifications = useRead((c) => c.notifications.list({ query: {
    limit: "20", offset: String(page() * 20), onlyUnread: String(unread())
  } }))
  const [pending, setPending] = createSignal(false)
  const [error, setError] = createSignal<string>()
  const update = async (id?: string, isRead = true) => {
    if (pending()) return
    setPending(true); setError(undefined)
    try {
      if (id) await app.runtime.run(app.client.notifications.update({ params: { id }, payload: { isRead } }))
      else await app.runtime.run(app.client.notifications.markAllRead())
      await notifications.refetch()
    } catch (cause) { setError(String(cause)) } finally { setPending(false) }
  }
  return <article class="card space-y-4 rounded-2xl p-5">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h2 class="text-lg font-semibold">{lt("legacy.notifications")} <Show when={notifications.data()}><span class="text-sm text-gray-500">({notifications.data()?.unreadCount})</span></Show></h2>
      <button class="btn btn-outline" disabled={pending() || !notifications.data()?.unreadCount} onClick={() => void update()}>{lt("legacy.markAllRead")}</button>
    </div>
    <div class="flex gap-2" aria-label={lt("legacy.notifications")}>
      <For each={[false, true]}>{(value) => <button class="btn btn-outline" aria-pressed={unread() === value} disabled={notifications.loading() || pending()} onClick={() => { setUnread(value); setPage(0); void notifications.refetch() }}>{lt(value ? "legacy.unread" : "legacy.all")}</button>}</For>
    </div>
    <LegacyReadState loading={notifications.loading()} error={notifications.error()} retry={notifications.refetch} />
    <Show when={error()}><ErrorState label={lt("legacy.error")} detail={error()} /></Show>
    <Show when={!notifications.loading() && notifications.data()?.notifications.length === 0}><EmptyState label={lt("legacy.emptyNotifications")} /></Show>
    <ul class="divide-y divide-gray-200 dark:divide-gray-700">
      <For each={notifications.data()?.notifications ?? []}>{(notification) => <li class="flex flex-wrap items-start gap-3 py-3">
        <div class="min-w-0 flex-1"><h3 classList={{ "font-semibold": !notification.isRead }}>{notification.title}</h3><p class="whitespace-pre-wrap break-words text-sm text-gray-600 dark:text-gray-300">{notification.content}</p><time class="text-xs text-gray-500" dateTime={notification.createdAt}>{formatDate(notification.createdAt)}</time></div>
        <button class="btn btn-outline" disabled={pending() || notifications.loading()} onClick={() => void update(notification.id, !notification.isRead)}>{lt(notification.isRead ? "legacy.markUnread" : "legacy.markRead")}</button>
      </li>}</For>
    </ul>
    <div class="flex items-center gap-3">
      <button class="btn btn-outline" disabled={page() === 0 || notifications.loading() || pending()} onClick={() => { setPage((p) => p - 1); void notifications.refetch() }}>{lt("legacy.previous")}</button>
      <span class="text-sm">{lt("legacy.page", { page: page() + 1 })}</span>
      <button class="btn btn-outline" disabled={notifications.loading() || pending() || (notifications.data()?.notifications.length ?? 0) < 20} onClick={() => { setPage((p) => p + 1); void notifications.refetch() }}>{lt("legacy.next")}</button>
    </div>
  </article>
}
