/**
 * The two directory-side MCP pages: `/mcp/directory` and `/mcp/servers/:id`.
 *
 * Ports of `.reference/src/pages/mcp/**`: the neutral workspace pages, the
 * status dot, and the resources/tools tabs — with `solid-motionone` standing in
 * for framer-motion's variants.
 */
import { For, Show, createEffect, createMemo, createSignal, type JSX } from "solid-js"
import { A, useNavigate, useParams } from "@solidjs/router"
import { Motion } from "solid-motionone"
import { Activity, ArrowLeft, Database, Layers, Pencil, Plus, Search, Server, Settings, Terminal, X, Zap } from "lucide-solid"
import { McpServerInfo } from "@cadcamfun/api"
import { useApp } from "../../../shared/state/context.ts"
import { useKeyedRead, useRead } from "../../../app/queries.ts"
import { toast } from "../../../shared/ui/feedback.tsx"
import { t } from "../../../i18n/index.ts"
import {
  CARD as ITEM_CARD, CardBanner, FIELD, RAIL_LABEL, StageEmpty, StageError, TOOLBAR_BUTTON, TOOLBAR_PRIMARY, WorkspaceDetail, WorkspacePage, WorkspaceTabs,
  type WorkspaceTabItem
} from "../../../shared/components/WorkspacePage.tsx"
import { McpLoading, legacyFailure, legacyRead, serversFrom, type McpServerCard } from "../components/mcp.tsx"

/** framer's `ease: [0.25, 0.1, 0.25, 1]`. */
const EASE: [number, number, number, number] = [0.25, 0.1, 0.25, 1]

const PAGE_BG = "min-h-full"

/** The status dot: green while the server is active. */
function McpStatusDot(props: { readonly enabled: boolean; readonly size: "sm" | "md" }): JSX.Element {
  const dot = () => (props.size === "md" ? "mr-2 h-2 w-2 rounded-full" : "mr-3 h-3 w-3 rounded-full")
  return (
    <Show
      when={props.enabled}
      fallback={<div class={`${dot()} bg-gray-400`} />}
    >
      <div class={`${dot()} bg-green-500`} />
    </Show>
  )
}

export function McpDirectoryScreen(): JSX.Element {
  const app = useApp()
  const navigate = useNavigate()
  const config = useRead((c) => legacyRead(c.mcp.listConfig({ query: {} }), t("mcp.directory.loadError")))
  const [servers, setServers] = createSignal<McpServerCard[]>([])
  const [info, setInfo] = createSignal<Record<string, typeof McpServerInfo.Type>>({})
  const [error, setError] = createSignal<string>()

  createEffect(() => {
    const data = config.data()
    if (data !== undefined) setServers(serversFrom(data))
  })
  createEffect(() => {
    const message = config.error()
    if (message === undefined) return
    setError(message)
    toast.error(message)
  })

  // Legacy loaded the info of every enabled server once, right after the list.
  createEffect(() => {
    for (const server of servers()) {
      if (!server.enabled) continue
      void app.runtime
        .run(app.client.mcp.serverInfo({ payload: { serverId: server.id } }))
        .then((value) => setInfo((current) => ({ ...current, [server.id]: value })))
        .catch(() => undefined)
    }
  })

  const toggleServer = async (server: McpServerCard, enabled: boolean): Promise<void> => {
    try {
      await app.runtime.run(app.client.mcp.updateConfigById({ params: { id: server.id }, payload: { enabled } }))
      setServers(servers().map((row) => (row.id === server.id ? { ...row, enabled } : row)))
      toast.success(enabled ? t("mcp.toast.enabled") : t("mcp.toast.disabled"))
    } catch (cause) {
      setError(await legacyFailure(cause, t("mcp.directory.updateError")))
      toast.error(t("mcp.directory.updateError"))
    }
  }

  const countLabel = (): string =>
    servers().length === 1 ? t("mcp.directory.countOne", { count: servers().length }) : t("mcp.directory.countMany", { count: servers().length })

  const [search, setSearch] = createSignal("")
  const visible = createMemo(() => {
    const needle = search().trim().toLowerCase()
    return servers().filter((server) => needle === "" || `${server.name} ${server.url ?? ""} ${server.command ?? ""}`.toLowerCase().includes(needle))
  })

  return (
    <WorkspacePage
      title={t("mcp.directory.title")}
      actions={<A href="/settings/mcp" class={TOOLBAR_PRIMARY}><Settings size={14} aria-hidden="true" />{t("mcp.directory.manage")}</A>}
      rail={<>
        <label class="block">
          <span class={RAIL_LABEL}>{t("legacy.search")}</span>
          <div class="relative">
            <Search size={14} aria-hidden="true" class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" name="search" class={`${FIELD} pl-9`} placeholder={t("mcp.directory.search")} value={search()} onInput={(event) => setSearch(event.currentTarget.value)} />
          </div>
        </label>
        <button type="button" class="inline-flex items-center gap-2 self-start text-xs text-gray-500 hover:text-gray-700 disabled:opacity-50 dark:text-gray-400 dark:hover:text-gray-200" onClick={() => setSearch("")} disabled={search() === ""}><X size={14} aria-hidden="true" />{t("pages.clear.filters")}</button>
        <p class="text-xs tabular-nums text-gray-500 dark:text-gray-400" role="status">{countLabel()}</p>
      </>}
    >
      <Show when={!config.loading()} fallback={<div class="flex items-center justify-center p-8"><McpLoading /></div>}>
        <Show when={error() !== undefined}><div class="mb-4"><StageError message={error() ?? ""} /></div></Show>
        <Show
          when={visible().length > 0}
          fallback={
            <StageEmpty icon={<Database size={24} aria-hidden="true" />} preview={servers().length === 0 ? "connect" : undefined} title={servers().length === 0 ? t("mcp.directory.emptyTitle") : "No servers found"} hint={servers().length === 0 ? t("mcp.directory.emptyBody") : "No servers match your search criteria."}>
              <Show when={servers().length === 0} fallback={<button type="button" class={TOOLBAR_BUTTON} onClick={() => setSearch("")}>{t("manuals.clear")}</button>}>
                <A href="/settings/mcp" class={TOOLBAR_PRIMARY}><Plus size={14} aria-hidden="true" />{t("mcp.settings.add")}</A>
              </Show>
            </StageEmpty>
          }
        >
          <div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <For each={visible()}>{(server) => {
              const entry = () => info()[server.id]
              const view = (): void => navigate(`/mcp/servers/${encodeURIComponent(server.id)}`)
              return (
                <div class={`${ITEM_CARD} cursor-pointer`} role="link" tabIndex={0} onClick={view} onKeyDown={(event) => { if (event.key === "Enter") view() }}>
                  <CardBanner icon={<Server size={28} aria-hidden="true" />} badge={server.type === "sse" ? t("mcp.type.sseShort") : t("mcp.type.stdioShort")} leftBadge={server.enabled ? t("mcp.directory.active") : undefined} />
                  <div class="flex flex-1 flex-col gap-2 p-4">
                    <h2 class="flex items-center text-base font-semibold text-gray-900 group-hover:text-[#007ACC] dark:text-white dark:group-hover:text-blue-300"><McpStatusDot enabled={server.enabled} size="md" />{server.name}</h2>
                    <p class="truncate rounded bg-gray-100 px-2 py-1 font-mono text-xs text-gray-600 dark:bg-gray-900 dark:text-gray-300">{server.type === "sse" ? server.url : server.command}</p>
                    <Show when={entry() !== undefined} fallback={<p class="text-xs italic text-gray-500 dark:text-gray-400">{server.enabled ? t("mcp.directory.infoMissing") : t("mcp.directory.disabledInfo")}</p>}>
                      <div class="mt-auto space-y-1.5 text-xs text-gray-500 dark:text-gray-400">
                        <div class="flex justify-between gap-3"><span>{entry()?.name}</span><Show when={entry()?.version !== undefined}><span>v{entry()?.version}</span></Show></div>
                        <div class="flex justify-between gap-3"><span class="inline-flex items-center gap-2"><Database size={14} aria-hidden="true" />{(entry()?.resources?.length ?? 0) === 1 ? t("mcp.directory.resourceOne", { count: 1 }) : t("mcp.directory.resourceMany", { count: entry()?.resources?.length ?? 0 })}</span></div>
                        <div class="flex justify-between gap-3"><span class="inline-flex items-center gap-2"><Zap size={14} aria-hidden="true" />{(entry()?.tools?.length ?? 0) === 1 ? t("mcp.directory.toolOne", { count: 1 }) : t("mcp.directory.toolMany", { count: entry()?.tools?.length ?? 0 })}</span></div>
                      </div>
                    </Show>
                  </div>
                  <div class="flex items-center justify-between gap-2 border-t border-gray-200 bg-gray-50 px-4 py-2.5 dark:border-gray-600 dark:bg-gray-700" onClick={(event) => event.stopPropagation()}>
                    <button type="button" class={TOOLBAR_BUTTON} onClick={() => void toggleServer(server, !server.enabled)}>{server.enabled ? t("mcp.settings.disable") : t("mcp.settings.enable")}</button>
                    <button type="button" class={TOOLBAR_PRIMARY} onClick={view}>{t("mcp.directory.view")}</button>
                  </div>
                </div>
              )
            }}</For>
          </div>
        </Show>
      </Show>
    </WorkspacePage>
  )
}

export function McpServerDetailsScreen(): JSX.Element {
  const app = useApp()
  const params = useParams<{ id: string }>()
  const read = useKeyedRead(
    () => params.id,
    (c, id) => legacyRead(c.mcp.getConfig({ params: { id } }), t("mcp.detail.loadError"))
  )
  const info = useKeyedRead(
    () => (read.data()?.enabled === true ? params.id : false),
    (c, id) => legacyRead(c.mcp.serverInfo({ payload: { serverId: id } }), t("mcp.toast.infoUnavailable"))
  )
  const [selectedTab, setSelectedTab] = createSignal<"resources" | "tools">("resources")
  const [error, setError] = createSignal<string>()

  createEffect(() => {
    const message = read.error()
    if (message === undefined) return
    setError(message)
    toast.error(t("mcp.detail.loadError"))
  })
  createEffect(() => {
    if (info.error() !== undefined) toast.error(t("mcp.toast.infoUnavailable"))
  })

  const toggleStatus = async (): Promise<void> => {
    const server = read.data()
    if (server === undefined) return
    try {
      const updated = await app.runtime.run(
        app.client.mcp.updateConfigById({ params: { id: server.id }, payload: { enabled: !server.enabled } })
      )
      await read.refetch()
      toast.success(updated.enabled ? t("mcp.toast.enabled") : t("mcp.toast.disabled"))
    } catch (cause) {
      const message = await legacyFailure(cause, t("mcp.settings.statusError"))
      setError(message)
      toast.error(t("mcp.settings.statusError"))
    }
  }

  const server = () => read.data()
  const details = () => info.data()
  const spinner = () => read.loading() && server() === undefined

  const notFound = (): JSX.Element => (
    <WorkspaceDetail title={t("mcp.directory.title")} backHref="/mcp/directory" backLabel={t("mcp.directory.title")}>
      <StageEmpty icon={<Server size={24} aria-hidden="true" />} preview="lost" title={t("mcp.detail.notFound")} hint={error() ?? ""}>
        <A href="/mcp/directory" class={TOOLBAR_BUTTON}><ArrowLeft size={14} aria-hidden="true" />{t("mcp.detail.back")}</A>
      </StageEmpty>
    </WorkspaceDetail>
  )

  /** One configuration value: a quiet label over an inset mono value. */
  const fact = (label: string, value: JSX.Element, breakAll = false): JSX.Element => (
    <div class="rounded-[5px] bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
      <span class="block text-[11px] font-medium text-slate-500 dark:text-slate-400">{label}</span>
      <div class={`mt-1 font-mono text-xs text-slate-900 dark:text-slate-100${breakAll ? " break-all" : ""}`}>{value}</div>
    </div>
  )

  /** The empty note of a tab or of a server that is off: one icon, one line. */
  const note = (icon: JSX.Element, text: string): JSX.Element => (
    <div class="flex flex-col items-center gap-2 px-4 py-8 text-center text-xs text-slate-500 dark:text-slate-400">
      {icon}
      <p>{text}</p>
    </div>
  )

  const tabItems = (): ReadonlyArray<WorkspaceTabItem<"resources" | "tools">> => [
    { id: "resources", label: t("mcp.detail.resourcesTab", { count: details()?.resources?.length ?? 0 }), icon: <Database size={14} aria-hidden="true" /> },
    { id: "tools", label: t("mcp.detail.toolsTab", { count: details()?.tools?.length ?? 0 }), icon: <Zap size={14} aria-hidden="true" /> }
  ]

  const itemCard = "rounded-[5px] border border-slate-200 p-3 dark:border-slate-700"

  return (
    <Show
      when={!spinner()}
      fallback={
        <div class={`flex items-center justify-center ${PAGE_BG}`}>
          <McpLoading />
        </div>
      }
    >
      <Show when={server() !== undefined} fallback={notFound()}>
        <WorkspaceDetail
          title={server()?.name ?? ""}
          subtitle="MCP server"
          backHref="/mcp/directory"
          backLabel={t("mcp.directory.title")}
          actions={<>
            <button type="button" class={TOOLBAR_BUTTON} onClick={() => void toggleStatus()}>
              <Activity size={14} aria-hidden="true" />
              {server()?.enabled ? t("mcp.detail.disableServer") : t("mcp.detail.enableServer")}
            </button>
            <A href={`/settings/mcp/edit/${encodeURIComponent(server()?.id ?? "")}`} class={TOOLBAR_PRIMARY}>
              <Pencil size={14} aria-hidden="true" />
              {t("mcp.detail.editConfiguration")}
            </A>
          </>}
        >
          <div class="mx-auto w-full max-w-7xl space-y-3">
            <Show when={error() !== undefined}><StageError message={error() ?? ""} /></Show>

            <section class="workspace-panel ui-card space-y-3">
              <div class="flex flex-wrap items-center gap-2">
                <span class={`workspace-badge ${server()?.enabled ? "workspace-badge--ok" : ""}`}>
                  <McpStatusDot enabled={server()?.enabled === true} size="md" />
                  {server()?.enabled ? t("mcp.directory.active") : t("mcp.directory.inactive")}
                </span>
                <span class="workspace-badge">{server()?.type === "sse" ? t("mcp.type.sse") : t("mcp.type.stdio")}</span>
              </div>

              <Show
                when={server()?.type === "sse"}
                fallback={
                  <div class="grid gap-2">
                    {fact(t("mcp.settings.command"), server()?.command)}
                    <Show when={argsPresent(server()?.args)}>
                      {fact(t("mcp.settings.args"), Array.isArray(server()?.args) ? (server()?.args as string[]).join(" ") : JSON.stringify(server()?.args))}
                    </Show>
                    <Show when={server()?.workingDirectory !== undefined && server()?.workingDirectory !== null && server()?.workingDirectory !== ""}>
                      {fact(t("mcp.settings.workingDirectory"), server()?.workingDirectory)}
                    </Show>
                  </div>
                }
              >
                {fact(t("mcp.detail.endpoint"), server()?.url, true)}
              </Show>
            </section>

            <Show when={details() !== undefined}>
              <section class="workspace-panel ui-card space-y-3">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <div class="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-white">
                    <Layers size={14} aria-hidden="true" class="text-slate-500 dark:text-slate-400" />
                    {t("mcp.detail.infoTitle")}
                  </div>
                  <div class="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                    <span class="font-medium">{details()?.name}</span>
                    <Show when={details()?.version !== undefined}><span class="workspace-badge">v{details()?.version}</span></Show>
                  </div>
                </div>
                <Show when={details()?.instructions !== undefined}>
                  <p class="rounded-[5px] bg-slate-50 px-3 py-2 text-xs text-slate-700 dark:bg-slate-800/60 dark:text-slate-300">{details()?.instructions}</p>
                </Show>

                <WorkspaceTabs label={t("mcp.detail.infoTitle")} tabs={tabItems()} value={selectedTab()} onChange={setSelectedTab} />

                <Show
                  when={selectedTab() === "resources"}
                  fallback={
                    <Motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2, easing: EASE }}>
                      <Show when={(details()?.tools?.length ?? 0) > 0} fallback={note(<Zap size={24} aria-hidden="true" />, t("mcp.detail.noTools"))}>
                        <div class="grid gap-2">
                          <For each={details()?.tools ?? []}>{(tool) =>
                            <div class={itemCard}>
                              <div class="text-xs font-medium text-slate-900 dark:text-white">{tool.name}</div>
                              <Show when={tool.description !== undefined}>
                                <div class="mt-1 text-xs text-slate-600 dark:text-slate-400">{tool.description}</div>
                              </Show>
                              <Show when={tool.parameters !== undefined && tool.parameters !== null}>
                                <div class="mt-3">
                                  <div class="mb-2 text-[11px] font-medium text-slate-500 dark:text-slate-400">{t("mcp.detail.parameters")}</div>
                                  <div class="space-y-2">
                                    <For each={Object.entries(parametersOf(tool.parameters))}>{([key, value]) =>
                                      <div class="flex items-start gap-3">
                                        <div class="flex items-center gap-1">
                                          <span class="rounded-[4px] bg-slate-100 px-2 py-1 font-mono text-[11px] text-slate-800 dark:bg-slate-800 dark:text-slate-200">{key}</span>
                                          <Show when={requiredOf(tool.parameters).includes(key)}>
                                            <span class="text-xs text-red-600 dark:text-red-400">*</span>
                                          </Show>
                                        </div>
                                        <Show when={value.description !== undefined}>
                                          <span class="flex-1 text-xs text-slate-500 dark:text-slate-400">{value.description}</span>
                                        </Show>
                                      </div>
                                    }</For>
                                  </div>
                                </div>
                              </Show>
                            </div>
                          }</For>
                        </div>
                      </Show>
                    </Motion.div>
                  }
                >
                  <Motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2, easing: EASE }}>
                    <Show when={(details()?.resources?.length ?? 0) > 0} fallback={note(<Database size={24} aria-hidden="true" />, t("mcp.detail.noResources"))}>
                      <div class="grid gap-2">
                        <For each={details()?.resources ?? []}>{(resource) =>
                          <div class={itemCard}>
                            <div class="text-xs font-medium text-slate-900 dark:text-white">{resource.name}</div>
                            <div class="mt-2 rounded-[4px] bg-slate-100 px-2 py-1 font-mono text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                              {resource.uriTemplate}
                            </div>
                            <Show when={resource.description !== undefined}>
                              <div class="mt-2 text-xs text-slate-700 dark:text-slate-300">{resource.description}</div>
                            </Show>
                            <Show when={resource.arguments !== undefined && resource.arguments.length > 0}>
                              <div class="mt-3">
                                <div class="mb-2 text-[11px] font-medium text-slate-500 dark:text-slate-400">{t("mcp.settings.args")}</div>
                                <div class="flex flex-wrap gap-2">
                                  <For each={resource.arguments ?? []}>{(argument) =>
                                    <div class="flex items-center gap-1">
                                      <span class="rounded-[4px] bg-slate-100 px-2 py-1 font-mono text-[11px] text-slate-800 dark:bg-slate-800 dark:text-slate-200">
                                        {argument.name}
                                      </span>
                                      <Show when={argument.required === true}>
                                        <span class="text-xs text-red-600 dark:text-red-400">*</span>
                                      </Show>
                                    </div>
                                  }</For>
                                </div>
                              </div>
                            </Show>
                          </div>
                        }</For>
                      </div>
                    </Show>
                  </Motion.div>
                </Show>
              </section>
            </Show>

            <Show when={details() === undefined && server()?.enabled === true}>
              <section class="workspace-panel ui-card">{note(<Terminal size={24} aria-hidden="true" />, t("mcp.detail.offline"))}</section>
            </Show>

            <Show when={server()?.enabled === false}>
              <section class="workspace-panel ui-card">{note(<Settings size={24} aria-hidden="true" />, t("mcp.detail.disabledNote"))}</section>
            </Show>
          </div>
        </WorkspaceDetail>
      </Show>
    </Show>
  )
}

/** Legacy's `args && args.length > 0` guard, typed. */
const argsPresent = (args: unknown): boolean => {
  if (args === undefined || args === null) return false
  if (typeof args === "string") return args.length > 0
  if (typeof args !== "object") return false
  const length = (args as { length?: unknown }).length
  return typeof length === "number" && length > 0
}

/** `tool.parameters.properties`, whatever shape the server sent. */
const parametersOf = (parameters: unknown): Record<string, { description?: string }> => {
  if (typeof parameters !== "object" || parameters === null) return {}
  const properties = (parameters as { properties?: unknown }).properties
  if (typeof properties !== "object" || properties === null) return {}
  return properties as Record<string, { description?: string }>
}

/** `tool.parameters.required`, guarded the same way legacy was not. */
const requiredOf = (parameters: unknown): readonly string[] => {
  if (typeof parameters !== "object" || parameters === null) return []
  const required = (parameters as { required?: unknown }).required
  return Array.isArray(required) ? (required as string[]) : []
}
