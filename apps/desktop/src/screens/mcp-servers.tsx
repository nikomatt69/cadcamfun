/**
 * The two directory-side MCP pages: `/mcp/directory` and `/mcp/servers/:id`.
 *
 * Ports of `.reference/src/pages/mcp/**`: the gradient page, the frosted cards, the
 * pulsing status dot, and the resources/tools tabs — with `solid-motionone` standing in
 * for framer-motion's variants.
 */
import { For, Show, createEffect, createSignal, type JSX } from "solid-js"
import { A, useNavigate, useParams } from "@solidjs/router"
import { Motion } from "solid-motionone"
import { Activity, ArrowLeft, Database, Layers, Pencil, Plus, Server, Settings, Terminal, Zap } from "lucide-solid"
import { McpServerInfo } from "@cadcamfun/api"
import { useApp } from "../state/context.ts"
import { useKeyedRead, useRead } from "../app/queries.ts"
import { toast } from "../components/ui/feedback.tsx"
import { t } from "../i18n/index.ts"
import { McpLoading, legacyFailure, legacyRead, serversFrom, type McpServerCard } from "../components/mcp.tsx"

/** framer's `ease: [0.25, 0.1, 0.25, 1]`. */
const EASE: [number, number, number, number] = [0.25, 0.1, 0.25, 1]
/** The card spring (stiffness 300, damping 30) approximated with Motion One's tween. */
const CARD_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]
const HOVER_SHADOW = "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)"

const PAGE_BG = "min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900"
const CARD = "rounded-2xl border border-white/20 bg-white/80 shadow-xl backdrop-blur-md dark:border-gray-700/30 dark:bg-gray-900/80"

/** The status dot that pulses while the server is active. */
function McpStatusDot(props: { readonly enabled: boolean; readonly size: "sm" | "md" }): JSX.Element {
  const dot = () => (props.size === "md" ? "mr-2 h-2 w-2 rounded-full" : "mr-3 h-3 w-3 rounded-full")
  return (
    <Show
      when={props.enabled}
      fallback={<div class={`${dot()} bg-gray-400`} />}
    >
      <Motion.div
        class={`${dot()} bg-green-500`}
        animate={{ scale: [1, 1.2, 1] }}
        transition={{ duration: 2, repeat: Infinity }}
      />
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

  return (
    <Show
      when={!config.loading()}
      fallback={
        <div class={`flex items-center justify-center ${PAGE_BG}`}>
          <McpLoading />
        </div>
      }
    >
      <Motion.div
        class={PAGE_BG}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, easing: EASE }}
      >
        <div class="mx-auto max-w-7xl p-4 md:p-6">
          <Motion.div
            class={`mb-8 rounded-2xl border border-white/20 bg-white/80 px-6 py-6 shadow-xl backdrop-blur-md dark:border-gray-700/30 dark:bg-gray-900/80`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2, easing: CARD_EASE }}
          >
            <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div class="flex items-center">
                <Motion.div
                  class="mr-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-r from-blue-500 to-purple-600"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  hover={{ scale: 1.05, rotate: 5 }}
                  transition={{ duration: 0.5, delay: 0.2, easing: CARD_EASE }}
                >
                  <Server size={24} class="text-white" />
                </Motion.div>
                <div>
                  <h1 class="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-3xl font-bold text-transparent">
                    {t("mcp.directory.title")}
                  </h1>
                  <p class="mt-1 text-gray-600 dark:text-gray-400">{countLabel()}</p>
                </div>
              </div>

              <Motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.3, easing: CARD_EASE }}
                hover={{ scale: 1.05, y: -2, boxShadow: HOVER_SHADOW }}
                press={{ scale: 0.95 }}
              >
                <A href="/settings/mcp">
                  <button class="inline-flex items-center rounded-xl bg-gradient-to-r from-blue-500 to-cyan-600 px-6 py-3 text-white shadow-lg shadow-blue-500/25 hover:from-blue-600 hover:to-cyan-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none">
                    <Settings size={18} class="mr-2" />
                    {t("mcp.directory.manage")}
                  </button>
                </A>
              </Motion.div>
            </div>
          </Motion.div>

          <Show when={error() !== undefined}>
            <Motion.div
              class="mb-6 rounded-2xl border border-red-200/50 bg-red-50/80 px-6 py-4 shadow-xl backdrop-blur-md dark:border-red-800/30 dark:bg-red-900/20"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, easing: EASE }}
            >
              <div class="flex items-center text-red-700 dark:text-red-300">
                <Activity size={20} class="mr-2" />
                {error()}
              </div>
            </Motion.div>
          </Show>

          <Show
            when={servers().length === 0}
            fallback={
              <div class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                <For each={servers()}>{(server, index) => {
                  const entry = () => info()[server.id]
                  return (
                    <Motion.div
                      class="overflow-hidden rounded-2xl border border-white/20 bg-white/80 shadow-xl backdrop-blur-md transition-all duration-300 hover:shadow-2xl dark:border-gray-700/30 dark:bg-gray-900/80"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.5, delay: 0.2 + index() * 0.1, easing: CARD_EASE }}
                      hover={{ y: -8 }}
                    >
                      <div class={`p-6 ${server.enabled
                        ? "bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20"
                        : "bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800/50 dark:to-gray-900/50"}`}>
                        <div class="mb-4 flex items-start justify-between">
                          <div class="flex items-center">
                            <McpStatusDot enabled={server.enabled} size="sm" />
                            <div>
                              <h2 class="text-xl font-semibold text-gray-900 dark:text-white">{server.name}</h2>
                              <span class="text-sm text-gray-600 dark:text-gray-400">
                                {server.enabled ? t("mcp.directory.active") : t("mcp.directory.inactive")}
                              </span>
                            </div>
                          </div>

                          <span class="rounded-full bg-gradient-to-r from-blue-100 to-purple-100 px-3 py-1 text-xs text-blue-800 dark:from-blue-900/50 dark:to-purple-900/50 dark:text-blue-300">
                            {server.type === "sse" ? t("mcp.type.sseShort") : t("mcp.type.stdioShort")}
                          </span>
                        </div>

                        <div class="mb-4">
                          <Show
                            when={server.type === "sse"}
                            fallback={
                              <p class="truncate rounded bg-gray-100/50 px-2 py-1 font-mono text-sm text-gray-600 dark:bg-gray-800/50 dark:text-gray-300">
                                {server.command}
                              </p>
                            }
                          >
                            <p class="truncate rounded bg-gray-100/50 px-2 py-1 font-mono text-sm text-gray-600 dark:bg-gray-800/50 dark:text-gray-300">
                              {server.url}
                            </p>
                          </Show>
                        </div>

                        <Show
                          when={entry() !== undefined}
                          fallback={
                            <div class="text-sm text-gray-500 italic dark:text-gray-400">
                              {server.enabled ? t("mcp.directory.infoMissing") : t("mcp.directory.disabledInfo")}
                            </div>
                          }
                        >
                          <div class="space-y-3">
                            <div class="flex items-center justify-between">
                              <span class="text-sm font-medium text-gray-900 dark:text-white">{entry()?.name}</span>
                              <Show when={entry()?.version !== undefined}>
                                <span class="rounded bg-gray-100/50 px-2 py-1 text-xs text-gray-500 dark:bg-gray-800/50 dark:text-gray-400">
                                  v{entry()?.version}
                                </span>
                              </Show>
                            </div>

                            <div class="flex space-x-6 text-sm">
                              <div class="flex items-center text-gray-600 dark:text-gray-400">
                                <Database size={14} class="mr-1" />
                                <span>
                                  {(() => {
                                    const count = entry()?.resources?.length ?? 0
                                    return count === 1
                                      ? t("mcp.directory.resourceOne", { count })
                                      : t("mcp.directory.resourceMany", { count })
                                  })()}
                                </span>
                              </div>
                              <div class="flex items-center text-gray-600 dark:text-gray-400">
                                <Zap size={14} class="mr-1" />
                                <span>
                                  {(() => {
                                    const count = entry()?.tools?.length ?? 0
                                    return count === 1
                                      ? t("mcp.directory.toolOne", { count })
                                      : t("mcp.directory.toolMany", { count })
                                  })()}
                                </span>
                              </div>
                            </div>
                          </div>
                        </Show>
                      </div>

                      <div class="flex justify-between border-t border-gray-100/50 bg-gray-50/50 px-6 py-4 dark:border-gray-700/50 dark:bg-gray-800/50">
                        <Motion.button
                          class={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${server.enabled
                            ? "bg-gradient-to-r from-gray-100 to-gray-200 text-gray-800 hover:from-gray-200 hover:to-gray-300 dark:from-gray-700 dark:to-gray-600 dark:text-gray-200 dark:hover:from-gray-600 dark:hover:to-gray-500"
                            : "bg-gradient-to-r from-green-100 to-emerald-200 text-green-800 hover:from-green-200 hover:to-emerald-300 dark:from-green-900/50 dark:to-emerald-900/50 dark:text-green-300 dark:hover:from-green-800/50 dark:hover:to-emerald-800/50"}`}
                          onClick={() => void toggleServer(server, !server.enabled)}
                          hover={{ scale: 1.05, y: -2, boxShadow: HOVER_SHADOW }}
                          press={{ scale: 0.95 }}
                        >
                          {server.enabled ? t("mcp.settings.disable") : t("mcp.settings.enable")}
                        </Motion.button>

                        <Motion.button
                          class="rounded-lg bg-gradient-to-r from-blue-500 to-cyan-600 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-blue-500/25 hover:from-blue-600 hover:to-cyan-700"
                          onClick={() => navigate(`/mcp/servers/${encodeURIComponent(server.id)}`)}
                          hover={{ scale: 1.05, y: -2, boxShadow: HOVER_SHADOW }}
                          press={{ scale: 0.95 }}
                        >
                          {t("mcp.directory.view")}
                        </Motion.button>
                      </div>
                    </Motion.div>
                  )
                }}</For>
              </div>
            }
          >
            <Motion.div
              class={`p-12 text-center ${CARD}`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2, easing: CARD_EASE }}
            >
              <Motion.div
                class="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-r from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700"
                hover={{ scale: 1.05, rotate: 5 }}
              >
                <Database size={32} class="text-gray-400 dark:text-gray-500" />
              </Motion.div>

              <h3 class="mb-2 text-xl font-semibold text-gray-900 dark:text-white">{t("mcp.directory.emptyTitle")}</h3>
              <p class="mx-auto mb-6 max-w-md text-gray-600 dark:text-gray-400">{t("mcp.directory.emptyBody")}</p>

              <Motion.div hover={{ scale: 1.05, y: -2, boxShadow: HOVER_SHADOW }} press={{ scale: 0.95 }}>
                <A href="/settings/mcp">
                  <button class="inline-flex items-center rounded-xl bg-gradient-to-r from-blue-500 to-cyan-600 px-6 py-3 text-white shadow-lg shadow-blue-500/25 hover:from-blue-600 hover:to-cyan-700">
                    <Plus size={18} class="mr-2" />
                    {t("mcp.settings.add")}
                  </button>
                </A>
              </Motion.div>
            </Motion.div>
          </Show>
        </div>
      </Motion.div>
    </Show>
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

  const backToDirectory = (): JSX.Element => (
    <A href="/mcp/directory">
      <Motion.button
        class="inline-flex items-center rounded-xl border border-gray-200/50 bg-white/70 px-4 py-2 text-gray-600 transition-all hover:bg-white/90 hover:text-gray-800 dark:border-gray-700/50 dark:bg-gray-800/70 dark:text-gray-400 dark:hover:bg-gray-800/90 dark:hover:text-gray-200"
        hover={{ scale: 1.05, y: -2, boxShadow: HOVER_SHADOW }}
        press={{ scale: 0.95 }}
      >
        <ArrowLeft size={16} class="mr-2" />
        {t("mcp.detail.back")}
      </Motion.button>
    </A>
  )

  const notFound = (): JSX.Element => (
    <Motion.div class={PAGE_BG} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5, easing: EASE }}>
      <div class="mx-auto max-w-7xl p-4 md:p-6">
        <Motion.div
          class="rounded-2xl border border-red-200/50 bg-red-50/80 p-8 text-center shadow-xl backdrop-blur-md dark:border-red-800/30 dark:bg-red-900/20"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, easing: CARD_EASE }}
        >
          <div class="mb-4 text-lg text-red-700 dark:text-red-300">{error() ?? t("mcp.detail.notFound")}</div>
          <Motion.div hover={{ scale: 1.05, y: -2, boxShadow: HOVER_SHADOW }} press={{ scale: 0.95 }}>
            <A href="/mcp/directory">
              <button class="inline-flex items-center rounded-xl bg-gradient-to-r from-gray-500 to-gray-600 px-4 py-2.5 text-white shadow-lg shadow-gray-500/25 hover:from-gray-600 hover:to-gray-700">
                <ArrowLeft size={16} class="mr-2" />
                {t("mcp.detail.back")}
              </button>
            </A>
          </Motion.div>
        </Motion.div>
      </div>
    </Motion.div>
  )

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
        <Motion.div class={PAGE_BG} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5, easing: EASE }}>
          <div class="mx-auto max-w-7xl p-4 md:p-6">
            <Motion.div class="mb-6" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, easing: CARD_EASE }}>
              {backToDirectory()}
            </Motion.div>

            <Show when={error() !== undefined}>
              <Motion.div
                class="mb-6 rounded-2xl border border-red-200/50 bg-red-50/80 px-6 py-4 shadow-xl backdrop-blur-md dark:border-red-800/30 dark:bg-red-900/20"
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, easing: EASE }}
              >
                <div class="flex items-center text-red-700 dark:text-red-300">
                  <Activity size={20} class="mr-2" />
                  {error()}
                </div>
              </Motion.div>
            </Show>

            <Motion.div
              class={`mb-8 overflow-hidden rounded-2xl ${CARD}`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, easing: CARD_EASE }}
            >
              <div class="border-b border-gray-100/50 p-6 dark:border-gray-700/50">
                <div class="mb-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div class="flex items-center">
                    <Motion.div
                      class="mr-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-r from-blue-500 to-purple-600"
                      hover={{ scale: 1.05, rotate: 5 }}
                    >
                      <Server size={24} class="text-white" />
                    </Motion.div>
                    <div>
                      <h1 class="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-2xl font-bold text-transparent">
                        {server()?.name}
                      </h1>
                      <span
                        class={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${server()?.enabled
                          ? "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300"
                          : "bg-gray-100 text-gray-800 dark:bg-gray-800/50 dark:text-gray-300"}`}
                      >
                        <McpStatusDot enabled={server()?.enabled === true} size="md" />
                        {server()?.enabled ? t("mcp.directory.active") : t("mcp.directory.inactive")}
                      </span>
                    </div>
                  </div>

                  <div class="flex flex-wrap gap-3">
                    <Motion.button
                      class={`inline-flex items-center rounded-xl px-4 py-2.5 font-medium text-white shadow-lg transition-all ${server()?.enabled
                        ? "bg-gradient-to-r from-red-500 to-pink-600 shadow-red-500/25 hover:from-red-600 hover:to-pink-700"
                        : "bg-gradient-to-r from-green-500 to-emerald-600 shadow-green-500/25 hover:from-green-600 hover:to-emerald-700"}`}
                      onClick={() => void toggleStatus()}
                      hover={{ scale: 1.05, y: -2, boxShadow: HOVER_SHADOW }}
                      press={{ scale: 0.95 }}
                    >
                      <Activity size={16} class="mr-2" />
                      {server()?.enabled ? t("mcp.detail.disableServer") : t("mcp.detail.enableServer")}
                    </Motion.button>

                    <Motion.div hover={{ scale: 1.05, y: -2, boxShadow: HOVER_SHADOW }} press={{ scale: 0.95 }}>
                      <A href={`/settings/mcp/edit/${encodeURIComponent(server()?.id ?? "")}`}>
                        <button class="inline-flex items-center rounded-xl bg-gradient-to-r from-blue-500 to-cyan-600 px-4 py-2.5 text-white shadow-lg shadow-blue-500/25 hover:from-blue-600 hover:to-cyan-700">
                          <Pencil size={16} class="mr-2" />
                          {t("mcp.detail.editConfiguration")}
                        </button>
                      </A>
                    </Motion.div>
                  </div>
                </div>

                <div class="mb-4 flex items-center gap-4">
                  <span class="rounded-full bg-gradient-to-r from-blue-100 to-purple-100 px-3 py-1 text-xs text-blue-800 dark:from-blue-900/50 dark:to-purple-900/50 dark:text-blue-300">
                    {server()?.type === "sse" ? t("mcp.type.sse") : t("mcp.type.stdio")}
                  </span>
                </div>

                <div class="space-y-3">
                  <Show
                    when={server()?.type === "sse"}
                    fallback={
                      <>
                        <div class="rounded-xl bg-gray-50/50 p-3 dark:bg-gray-800/50">
                          <span class="text-sm font-medium text-gray-700 dark:text-gray-300">{t("mcp.settings.command")}</span>
                          <div class="mt-1 font-mono text-sm text-gray-900 dark:text-gray-100">{server()?.command}</div>
                        </div>

                        <Show when={argsPresent(server()?.args)}>
                          <div class="rounded-xl bg-gray-50/50 p-3 dark:bg-gray-800/50">
                            <span class="text-sm font-medium text-gray-700 dark:text-gray-300">{t("mcp.settings.args")}</span>
                            <div class="mt-1 font-mono text-sm text-gray-900 dark:text-gray-100">
                              {Array.isArray(server()?.args)
                                ? (server()?.args as string[]).join(" ")
                                : JSON.stringify(server()?.args)}
                            </div>
                          </div>
                        </Show>

                        <Show when={server()?.workingDirectory !== undefined && server()?.workingDirectory !== null && server()?.workingDirectory !== ""}>
                          <div class="rounded-xl bg-gray-50/50 p-3 dark:bg-gray-800/50">
                            <span class="text-sm font-medium text-gray-700 dark:text-gray-300">{t("mcp.settings.workingDirectory")}</span>
                            <div class="mt-1 font-mono text-sm text-gray-900 dark:text-gray-100">{server()?.workingDirectory}</div>
                          </div>
                        </Show>
                      </>
                    }
                  >
                    <div class="rounded-xl bg-gray-50/50 p-3 dark:bg-gray-800/50">
                      <span class="text-sm font-medium text-gray-700 dark:text-gray-300">{t("mcp.detail.endpoint")}</span>
                      <div class="mt-1 break-all font-mono text-sm text-gray-900 dark:text-gray-100">{server()?.url}</div>
                    </div>
                  </Show>
                </div>
              </div>

              <Show when={details() !== undefined}>
                <div class="p-6">
                  <div class="mb-6">
                    <div class="mb-2 flex items-center gap-3">
                      <Layers size={20} class="text-gray-600 dark:text-gray-400" />
                      <span class="text-lg font-medium text-gray-900 dark:text-white">{t("mcp.detail.infoTitle")}</span>
                    </div>

                    <div class="rounded-xl bg-gradient-to-r from-blue-50 to-purple-50 p-4 dark:from-blue-900/20 dark:to-purple-900/20">
                      <div class="flex items-center justify-between">
                        <span class="text-lg font-medium text-gray-900 dark:text-white">{details()?.name}</span>
                        <Show when={details()?.version !== undefined}>
                          <span class="rounded-full bg-white/50 px-3 py-1 text-sm text-gray-600 dark:bg-gray-800/50 dark:text-gray-400">
                            v{details()?.version}
                          </span>
                        </Show>
                      </div>

                      <Show when={details()?.instructions !== undefined}>
                        <div class="mt-3 rounded-lg bg-white/50 p-3 text-sm text-gray-700 dark:bg-gray-800/50 dark:text-gray-300">
                          {details()?.instructions}
                        </div>
                      </Show>
                    </div>
                  </div>

                  <div class="mb-6 border-b border-gray-200/50 dark:border-gray-700/50">
                    <div class="flex space-x-8">
                      <button
                        class={`flex items-center border-b-2 px-1 py-3 text-sm font-medium focus:outline-none ${selectedTab() === "resources"
                          ? "border-blue-500 text-blue-600 dark:text-blue-400"
                          : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"}`}
                        onClick={() => setSelectedTab("resources")}
                      >
                        <Database size={16} class="mr-2" />
                        {t("mcp.detail.resourcesTab", { count: details()?.resources?.length ?? 0 })}
                      </button>
                      <button
                        class={`flex items-center border-b-2 px-1 py-3 text-sm font-medium focus:outline-none ${selectedTab() === "tools"
                          ? "border-blue-500 text-blue-600 dark:text-blue-400"
                          : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"}`}
                        onClick={() => setSelectedTab("tools")}
                      >
                        <Zap size={16} class="mr-2" />
                        {t("mcp.detail.toolsTab", { count: details()?.tools?.length ?? 0 })}
                      </button>
                    </div>
                  </div>

                  <Show
                    when={selectedTab() === "resources"}
                    fallback={
                      <Motion.div
                        initial={{ opacity: 0, x: 5 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.4, easing: EASE }}
                      >
                        <Show
                          when={(details()?.tools?.length ?? 0) > 0}
                          fallback={
                            <div class="py-12 text-center">
                              <Zap size={48} class="mx-auto mb-4 text-gray-400 dark:text-gray-600" />
                              <p class="text-gray-500 dark:text-gray-400">{t("mcp.detail.noTools")}</p>
                            </div>
                          }
                        >
                          <div class="grid gap-4">
                            <For each={details()?.tools ?? []}>{(tool) =>
                              <Motion.div
                                class="rounded-xl border border-gray-200/50 bg-white/50 p-4 backdrop-blur-sm transition-all hover:bg-white/70 dark:border-gray-700/50 dark:bg-gray-800/50 dark:hover:bg-gray-800/70"
                                initial={{ opacity: 0, x: -5, filter: "blur(5px)" }}
                                animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                                transition={{ duration: 0.4, easing: EASE }}
                                hover={{ scale: 1.02 }}
                              >
                                <div class="mb-2 font-medium text-gray-900 dark:text-white">{tool.name}</div>
                                <Show when={tool.description !== undefined}>
                                  <div class="mb-3 text-sm text-gray-600 dark:text-gray-400">{tool.description}</div>
                                </Show>
                                <Show when={tool.parameters !== undefined && tool.parameters !== null}>
                                  <div>
                                    <div class="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">{t("mcp.detail.parameters")}</div>
                                    <div class="space-y-2 text-sm">
                                      <For each={Object.entries(parametersOf(tool.parameters))}>{([key, value]) =>
                                        <div class="flex items-start space-x-3">
                                          <div class="flex items-center">
                                            <span class="rounded bg-purple-100 px-2 py-1 font-mono text-xs text-purple-800 dark:bg-purple-900/50 dark:text-purple-300">{key}</span>
                                            <Show when={requiredOf(tool.parameters).includes(key)}>
                                              <span class="ml-1 text-xs text-red-500">*</span>
                                            </Show>
                                          </div>
                                          <Show when={value.description !== undefined}>
                                            <span class="flex-1 text-xs text-gray-500">{value.description}</span>
                                          </Show>
                                        </div>
                                      }</For>
                                    </div>
                                  </div>
                                </Show>
                              </Motion.div>
                            }</For>
                          </div>
                        </Show>
                      </Motion.div>
                    }
                  >
                    <Motion.div
                      initial={{ opacity: 0, x: -5 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.4, easing: EASE }}
                    >
                      <Show
                        when={(details()?.resources?.length ?? 0) > 0}
                        fallback={
                          <div class="py-12 text-center">
                            <Database size={48} class="mx-auto mb-4 text-gray-400 dark:text-gray-600" />
                            <p class="text-gray-500 dark:text-gray-400">{t("mcp.detail.noResources")}</p>
                          </div>
                        }
                      >
                        <div class="grid gap-4">
                          <For each={details()?.resources ?? []}>{(resource) =>
                            <Motion.div
                              class="rounded-xl border border-gray-200/50 bg-white/50 p-4 backdrop-blur-sm transition-all hover:bg-white/70 dark:border-gray-700/50 dark:bg-gray-800/50 dark:hover:bg-gray-800/70"
                              initial={{ opacity: 0, x: -5, filter: "blur(5px)" }}
                              animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                              transition={{ duration: 0.4, easing: EASE }}
                              hover={{ scale: 1.02 }}
                            >
                              <div class="mb-2 font-medium text-gray-900 dark:text-white">{resource.name}</div>
                              <div class="mb-2 rounded bg-gray-100/50 px-2 py-1 font-mono text-sm text-gray-600 dark:bg-gray-900/50 dark:text-gray-400">
                                {resource.uriTemplate}
                              </div>
                              <Show when={resource.description !== undefined}>
                                <div class="mb-3 text-sm text-gray-700 dark:text-gray-300">{resource.description}</div>
                              </Show>

                              <Show when={resource.arguments !== undefined && resource.arguments.length > 0}>
                                <div>
                                  <div class="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">{t("mcp.settings.args")}</div>
                                  <div class="grid grid-cols-2 gap-2 text-sm">
                                    <For each={resource.arguments ?? []}>{(argument) =>
                                      <div class="flex items-center">
                                        <span class="rounded bg-blue-100 px-2 py-1 font-mono text-xs text-blue-800 dark:bg-blue-900/50 dark:text-blue-300">
                                          {argument.name}
                                        </span>
                                        <Show when={argument.required === true}>
                                          <span class="ml-1 text-xs text-red-500">*</span>
                                        </Show>
                                      </div>
                                    }</For>
                                  </div>
                                </div>
                              </Show>
                            </Motion.div>
                          }</For>
                        </div>
                      </Show>
                    </Motion.div>
                  </Show>
                </div>
              </Show>

              <Show when={details() === undefined && server()?.enabled === true}>
                <div class="p-6 text-center">
                  <Terminal size={48} class="mx-auto mb-4 text-gray-400 dark:text-gray-600" />
                  <p class="text-gray-500 dark:text-gray-400">{t("mcp.detail.offline")}</p>
                </div>
              </Show>

              <Show when={server()?.enabled === false}>
                <div class="p-6 text-center">
                  <Settings size={48} class="mx-auto mb-4 text-gray-400 dark:text-gray-600" />
                  <p class="text-gray-500 dark:text-gray-400">{t("mcp.detail.disabledNote")}</p>
                </div>
              </Show>
            </Motion.div>
          </div>
        </Motion.div>
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
