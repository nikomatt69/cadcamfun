/**
 * The three settings-side MCP pages: `/settings/mcp`, `/settings/mcp/config-editor`
 * and `/settings/mcp/edit/:id`.
 *
 * Ports of `.reference/src/pages/settings/mcp/**` — same markup, same class names, and
 * the same quirks (the envelope that never becomes a list, the URL field seeded from the
 * id, the config editor that saves the whole envelope back).
 */
import { For, Show, createEffect, createSignal, type JSX } from "solid-js"
import { A, useNavigate, useParams } from "@solidjs/router"
import type { McpServerPatch } from "@cadcamfun/api"
import { useApp } from "../state/context.ts"
import { useKeyedRead, useRead } from "../app/queries.ts"
import { t } from "../i18n/index.ts"
import { McpLoading, McpServerForm, legacyFailure, legacyRead, serversFrom, type McpServerCard } from "../components/mcp.tsx"
import { TOOLBAR_BUTTON, TOOLBAR_PRIMARY, WorkspaceDetail, WorkspacePage } from "../components/WorkspacePage.tsx"

/** Legacy red banner with the dismiss button. */
function McpErrorBanner(props: { readonly message: string; readonly onDismiss: () => void }): JSX.Element {
  return (
    <div class="mb-4 rounded border border-red-400 bg-red-100 px-4 py-3 text-red-700">
      {props.message}
      <button class="float-right font-bold" onClick={props.onDismiss}>&times;</button>
    </div>
  )
}

export function McpSettingsScreen(): JSX.Element {
  const app = useApp()
  const config = useRead((c) => legacyRead(c.mcp.listConfig({ query: {} }), t("mcp.settings.loadError")))
  const [servers, setServers] = createSignal<McpServerCard[]>([])
  const [error, setError] = createSignal<string>()
  const [showAddForm, setShowAddForm] = createSignal(false)
  const [submitting, setSubmitting] = createSignal(false)

  createEffect(() => {
    const data = config.data()
    if (data !== undefined) setServers(serversFrom(data))
  })
  // Legacy kept the load failure in the same `error` state the banner renders.
  createEffect(() => {
    const message = config.error()
    if (message !== undefined) setError(message)
  })

  const addServer = async (values: McpServerPatch): Promise<void> => {
    setSubmitting(true)
    try {
      const created = await app.runtime.run(app.client.mcp.createConfig({ query: {}, payload: values }))
      // The endpoint answers the `McpConfigCreated` envelope; the legacy code pushed the
      // whole envelope into the list, so the new card rendered with an empty name and no id.
      const server = (created as { server?: McpServerCard }).server
      if (server !== undefined) setServers([...servers(), server])
      setShowAddForm(false)
    } catch (cause) {
      setError(await legacyFailure(cause, t("mcp.settings.addError")))
    } finally {
      setSubmitting(false)
    }
  }

  const toggleStatus = async (server: McpServerCard, enabled: boolean): Promise<void> => {
    try {
      await app.runtime.run(app.client.mcp.updateConfigById({ params: { id: server.id }, payload: { enabled } }))
      setServers(servers().map((row) => (row.id === server.id ? { ...row, enabled } : row)))
    } catch (cause) {
      setError(await legacyFailure(cause, t("mcp.settings.statusError")))
    }
  }

  const deleteServer = async (server: McpServerCard): Promise<void> => {
    if (
      typeof window !== "undefined" &&
      typeof window.confirm === "function" &&
      !window.confirm(t("mcp.settings.confirmDelete"))
    ) return
    try {
      await app.runtime.run(app.client.mcp.removeConfigById({ params: { id: server.id } }))
      setServers(servers().filter((row) => row.id !== server.id))
    } catch (cause) {
      setError(await legacyFailure(cause, t("mcp.settings.deleteError")))
    }
  }

  return (
    <WorkspacePage
      title={t("mcp.settings.title")}
      actions={<>
        <A href="/mcp/directory" class={TOOLBAR_BUTTON}>{t("mcp.settings.directory")}</A>
        <A href="/settings/mcp/config-editor" class={TOOLBAR_BUTTON}>{t("mcp.settings.editor")}</A>
        <Show when={!showAddForm()}>
          <button type="button" class={TOOLBAR_PRIMARY} onClick={() => setShowAddForm(true)}>{t("mcp.settings.add")}</button>
        </Show>
      </>}
    >
    <Show when={!config.loading()} fallback={<div class="p-8 text-center"><McpLoading /></div>}>
      <div class="mx-auto max-w-5xl">

        <Show when={error() !== undefined}>
          <McpErrorBanner message={error() ?? ""} onDismiss={() => setError(undefined)} />
        </Show>

        <Show when={showAddForm()}>
          <div class="mb-8 rounded-lg border bg-slate-50 p-4">
            <h2 class="mb-4 text-xl font-semibold">{t("mcp.settings.addNew")}</h2>
            <McpServerForm
              onSubmit={addServer}
              onCancel={() => setShowAddForm(false)}
              isSubmitting={submitting()}
            />
          </div>
        </Show>

        <Show
          when={servers().length === 0}
          fallback={
            <div class="grid gap-6 md:grid-cols-1">
              <For each={servers()}>{(server) =>
                <div class="overflow-hidden rounded-lg border shadow-sm">
                  <div class={`p-4 ${server.enabled ? "bg-green-50" : "bg-slate-50"}`}>
                    <div class="flex items-center justify-between">
                      <h2 class="text-xl font-semibold">{server.name}</h2>
                      <div class="flex items-center">
                        <div class={`mr-2 h-3 w-3 rounded-full ${server.enabled ? "bg-green-500" : "bg-gray-400"}`} />
                        <span class="text-sm text-slate-600">
                          {server.enabled ? t("mcp.settings.enabled") : t("mcp.settings.disabled")}
                        </span>
                      </div>
                    </div>

                    <div class="mt-2 text-sm text-slate-600">
                      <div class="mb-1">
                        <span class="font-medium">{t("mcp.settings.type")}</span>{" "}
                        {server.type === "sse" ? t("mcp.type.sse") : t("mcp.type.stdio")}
                      </div>

                      <Show when={server.type === "sse"}>
                        <div class="mb-1">
                          <span class="font-medium">{t("mcp.settings.url")}</span>{" "}
                          <span class="rounded bg-slate-100 px-1 font-mono text-xs">{server.url}</span>
                        </div>
                      </Show>

                      <Show when={server.type === "stdio"}>
                        <>
                          <div class="mb-1">
                            <span class="font-medium">{t("mcp.settings.command")}</span>{" "}
                            <span class="rounded bg-slate-100 px-1 font-mono text-xs">{server.command}</span>
                          </div>

                          <Show when={Array.isArray(server.args) && server.args.length > 0}>
                            <div class="mb-1">
                              <span class="font-medium">{t("mcp.settings.args")}</span>{" "}
                              <span class="rounded bg-slate-100 px-1 font-mono text-xs">
                                {(server.args as string[]).join(" ")}
                              </span>
                            </div>
                          </Show>

                          <Show when={server.workingDirectory !== undefined && server.workingDirectory !== null && server.workingDirectory !== ""}>
                            <div class="mb-1">
                              <span class="font-medium">{t("mcp.settings.workingDirectory")}</span>{" "}
                              <span class="rounded bg-slate-100 px-1 font-mono text-xs">{server.workingDirectory}</span>
                            </div>
                          </Show>

                          <Show when={server.defaultWorkingDirectory !== undefined && server.defaultWorkingDirectory !== null && server.defaultWorkingDirectory !== ""}>
                            <div class="mb-1">
                              <span class="font-medium">{t("mcp.settings.defaultWorkingDirectory")}</span>{" "}
                              <span class="rounded bg-slate-100 px-1 font-mono text-xs">{server.defaultWorkingDirectory}</span>
                            </div>
                          </Show>
                        </>
                      </Show>
                    </div>
                  </div>

                  {/* flex-wrap: Enable/Disable + Delete + Edit stay fully visible in narrow cards. */}
                  <div class="flex flex-wrap items-center justify-between gap-2 border-t bg-slate-50 p-3">
                    <div class="flex flex-wrap gap-2">
                      <button
                        class={`rounded px-3 py-1 text-sm ${server.enabled
                          ? "bg-slate-200 text-slate-800 hover:bg-gray-300"
                          : "bg-green-100 text-green-800 hover:bg-green-200"}`}
                        onClick={() => void toggleStatus(server, !server.enabled)}
                      >
                        {server.enabled ? t("mcp.settings.disable") : t("mcp.settings.enable")}
                      </button>

                      <button
                        class="rounded bg-red-100 px-3 py-1 text-sm text-red-800 hover:bg-red-200"
                        onClick={() => void deleteServer(server)}
                      >
                        {t("mcp.settings.delete")}
                      </button>
                    </div>

                    <A href={`/settings/mcp/edit/${encodeURIComponent(server.id)}`}>
                      <button class="rounded bg-blue-500 px-3 py-1 text-sm text-white hover:bg-blue-600">
                        {t("mcp.settings.edit")}
                      </button>
                    </A>
                  </div>
                </div>
              }</For>
            </div>
          }
        >
          <div class="rounded bg-slate-100 p-8 text-center">
            <p class="mb-4">{t("mcp.settings.empty")}</p>
            <Show when={!showAddForm()}>
              <button
                class="rounded bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-700"
                onClick={() => setShowAddForm(true)}
              >
                {t("mcp.settings.addFirst")}
              </button>
            </Show>
          </div>
        </Show>
      </div>
    </Show>
    </WorkspacePage>
  )
}

export function McpConfigEditorScreen(): JSX.Element {
  const app = useApp()
  const file = useRead((c) =>
    legacyRead(c.mcp.listConfig({ query: { source: "file" } }), t("mcp.editor.loadError"))
  )
  const [configJson, setConfigJson] = createSignal("")
  const [saving, setSaving] = createSignal(false)
  const [error, setError] = createSignal<string>()
  const [success, setSuccess] = createSignal<string>()

  // Legacy stringified the whole response — envelope included — into the textarea.
  createEffect(() => {
    const data = file.data()
    if (data !== undefined) setConfigJson(JSON.stringify(data, null, 2))
  })

  const formatJson = (): void => {
    try {
      setConfigJson(JSON.stringify(JSON.parse(configJson()), null, 2))
      setError(undefined)
    } catch {
      setError(t("mcp.editor.formatInvalid"))
    }
  }

  const saveConfig = async (): Promise<void> => {
    setError(undefined)
    setSuccess(undefined)
    setSaving(true)
    try {
      let parsed: unknown
      try {
        parsed = JSON.parse(configJson())
      } catch {
        throw new Error(t("mcp.editor.invalidJson"))
      }
      await app.runtime.run(
        app.client.mcp.createConfig({ query: { source: "file" }, payload: parsed as McpServerPatch })
      )
      setSuccess(t("mcp.editor.saved"))
    } catch (cause) {
      setError(await legacyFailure(cause, t("mcp.editor.saveFailed")))
    } finally {
      setSaving(false)
    }
  }

  return (
    <WorkspaceDetail title={t("mcp.editor.title")} backHref="/settings/mcp" backLabel={t("mcp.editor.back")}>
      <div class="mx-auto w-full max-w-5xl">
      <Show when={error() !== undefined}>
        <div class="mb-4 rounded border border-red-400 bg-red-100 px-4 py-3 text-red-700">{error()}</div>
      </Show>

      <Show when={success() !== undefined}>
        <div class="mb-4 rounded border border-green-400 bg-green-100 px-4 py-3 text-green-700">{success()}</div>
      </Show>

      <div class="mb-4">
        <p class="mb-2 text-slate-600">{t("mcp.editor.intro")}</p>

        <div class="mb-2 flex space-x-2">
          <button
            class="rounded bg-slate-500 px-3 py-1 text-sm text-white hover:bg-gray-600"
            onClick={formatJson}
          >
            {t("mcp.editor.format")}
          </button>

          <button
            class={`rounded bg-blue-500 px-3 py-1 text-sm text-white hover:bg-blue-600 ${file.loading() || saving() ? "cursor-not-allowed opacity-50" : ""}`}
            disabled={file.loading() || saving()}
            onClick={() => void saveConfig()}
          >
            {saving() ? t("mcp.editor.saving") : t("mcp.editor.save")}
          </button>
        </div>
      </div>

      <Show
        when={file.loading()}
        fallback={
          <div class="overflow-hidden rounded-lg border">
            <textarea
              value={configJson()}
              onInput={(event) => setConfigJson(event.currentTarget.value)}
              class="h-96 w-full p-4 font-mono text-sm focus:outline-none"
              spellcheck={false}
            />
          </div>
        }
      >
        <div class="p-8 text-center">{t("mcp.editor.loading")}</div>
      </Show>

      <div class="mt-4 text-sm text-slate-600">
        <h2 class="mb-1 font-semibold">{t("mcp.editor.infoTitle")}</h2>
        <p class="mb-2">
          {t("mcp.editor.infoIntro")}
          <code>mcpServers</code>
          {t("mcp.editor.infoIntroTail")}
        </p>
        <p class="mb-2">{t("mcp.editor.infoList")}</p>
        <ul class="mb-2 list-disc pl-5">
          <li><code>id</code>: {t("mcp.editor.infoId")}</li>
          <li><code>name</code>: {t("mcp.editor.infoName")}</li>
          <li><code>type</code>: {t("mcp.editor.infoType")}</li>
          <li><code>url</code>: {t("mcp.editor.infoUrl")}</li>
          <li><code>enabled</code>: {t("mcp.editor.infoEnabled")}</li>
        </ul>
      </div>
      </div>
    </WorkspaceDetail>
  )
}

export function McpEditServerScreen(): JSX.Element {
  const app = useApp()
  const navigate = useNavigate()
  const params = useParams<{ id: string }>()
  const read = useKeyedRead(
    () => params.id,
    (c, id) => legacyRead(c.mcp.getConfig({ params: { id } }), t("mcp.edit.loadError"))
  )
  const [error, setError] = createSignal<string>()
  const [submitting, setSubmitting] = createSignal(false)

  const updateServer = async (values: McpServerPatch): Promise<void> => {
    if (read.data() === undefined || submitting()) return
    setSubmitting(true)
    try {
      await app.runtime.run(app.client.mcp.updateConfigById({ params: { id: params.id }, payload: values }))
      navigate("/settings/mcp")
    } catch (cause) {
      setError(await legacyFailure(cause, t("mcp.edit.updateError")))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <WorkspaceDetail title={t("mcp.edit.title")} backHref="/settings/mcp" backLabel={t("mcp.edit.back")}>
      <Show
        when={!read.loading()}
        fallback={
          <div class="p-8 text-center">
            <McpLoading />
          </div>
        }
      >
        <Show
          when={read.data() !== undefined}
          fallback={
            <>
              <div class="mb-4 rounded border border-red-400 bg-red-100 px-4 py-3 text-red-700">
                {error() ?? read.error() ?? t("mcp.edit.notFound")}
              </div>
              <div class="mt-4">
                <A href="/settings/mcp">
                  <button class="rounded bg-gray-300 px-4 py-2 font-bold text-slate-800 hover:bg-gray-400">
                    {t("mcp.edit.backToSettings")}
                  </button>
                </A>
              </div>
            </>
          }
        >
          <Show when={error() !== undefined}>
            <McpErrorBanner message={error() ?? ""} onDismiss={() => setError(undefined)} />
          </Show>

          <div class="rounded-lg border bg-slate-50 p-4">
            <McpServerForm
              initialValues={read.data()}
              onSubmit={updateServer}
              onCancel={() => navigate("/settings/mcp")}
              isSubmitting={submitting()}
            />
          </div>
        </Show>
      </Show>
    </WorkspaceDetail>
  )
}
