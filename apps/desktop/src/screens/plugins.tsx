/**
 * Plugins screens (`/plugins`, `/plugins/:id`): the installed list with enable/disable,
 * zip install, and a detail view with the manifest and the JSON configuration.
 */
import { For, Show, createSignal, createMemo, onCleanup, createEffect, type JSX } from "solid-js"
import { A, useNavigate, useParams } from "@solidjs/router"
import { Effect } from "effect"
import { CheckCircle, ExternalLink, FileText, Info, Puzzle, Search, ToggleLeft, ToggleRight, Trash2, Upload, X } from "lucide-solid"
import { t } from "../i18n/index.ts"
import { useApp } from "../state/context.ts"
import { useRead } from "../app/queries.ts"
import { ErrorState, LoadingState, Toast } from "./screen-parts.tsx"
import { CARD, CardBanner, FIELD, ICON_BUTTON, RAIL_LABEL, StageEmpty, StageLoading, TOOLBAR_BUTTON, TOOLBAR_PRIMARY, WorkspaceDetail, WorkspacePage } from "../components/WorkspacePage.tsx"
import { PluginSettingsDialog } from "../components/plugins/plugin-settings-dialog.tsx"

const describe = (cause: unknown): string => {
  if (typeof cause === "object" && cause !== null) {
    const e = cause as { error?: unknown; message?: unknown }
    if (typeof e.error === "string") return e.error
    if (typeof e.message === "string") return e.message
  }
  return String(cause)
}

export function PluginsScreen(): JSX.Element {
  const app = useApp()
  const navigate = useNavigate()
  const plugins = useRead((c) => c.plugins.list())
  const [notice, setNotice] = createSignal<string>()
  const [error, setError] = createSignal<string>()
  const [pending, setPending] = createSignal(false)
  const [installOpen, setInstallOpen] = createSignal(false)
  const [file, setFile] = createSignal<File>()
  const [dragging, setDragging] = createSignal(false)
  const [removing, setRemoving] = createSignal<string>()
  let picker: HTMLInputElement | undefined
  let dialog: HTMLDivElement | undefined
  let previousFocus: HTMLElement | undefined

  const closeInstall = () => { if (!pending()) { setInstallOpen(false); previousFocus?.focus() } }
  const openInstall = () => {
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined
    setFile(undefined); setError(undefined); setNotice(undefined); setInstallOpen(true)
  }
  createEffect(() => {
    if (!installOpen()) return
    queueMicrotask(() => dialog?.querySelector<HTMLButtonElement>("button")?.focus())
  })
  const keydown = (event: KeyboardEvent) => {
    if (!installOpen()) return
    if (event.key === "Escape") { event.preventDefault(); closeInstall() }
    if (event.key === "Tab" && dialog) {
      const controls = Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]')).filter((el) => !el.hidden)
      const first = controls[0]; const last = controls.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
  }
  document.addEventListener("keydown", keydown)
  onCleanup(() => document.removeEventListener("keydown", keydown))

  const act = async (run: () => Promise<unknown>, done?: string) => {
    if (pending()) return
    setPending(true); setError(undefined); setNotice(undefined)
    try { await run(); if (done) setNotice(done); await plugins.refetch() }
    catch (cause) { setError(describe(cause)) }
    finally { setPending(false) }
  }
  const toggle = (id: string, enabled: boolean) => act(() => app.runtime.run(
    Effect.asVoid(enabled ? app.client.plugins.disable({ params: { id } }) : app.client.plugins.enable({ params: { id } }))))
  const chooseFile = (candidate: File | undefined) => {
    setError(undefined)
    if (!candidate) return
    if (!/\.(zip|vsix)$/i.test(candidate.name)) { setError(t("plugins.invalidPackage")); return }
    if (candidate.size > 10 * 1024 * 1024) { setError(t("plugins.packageTooLarge")); return }
    setFile(candidate)
  }
  const install = async () => {
    const selected = file()
    if (!selected) return
    const form = new FormData()
    form.set("file", selected)
    await act(() => app.runtime.run(app.client.plugins.install({ payload: form })), t("plugins.installed.message"))
    if (!error()) { setInstallOpen(false); previousFocus?.focus() }
  }
  const uninstall = async () => {
    const id = removing(); if (!id) return
    await act(() => app.runtime.run(app.client.plugins.uninstall({ params: { id } })))
    if (!error()) setRemoving(undefined)
  }

  const [search, setSearch] = createSignal("")
  const [status, setStatus] = createSignal("")
  const filtered = createMemo(() => {
    const needle = search().trim().toLowerCase()
    return (plugins.data() ?? [])
      .filter((plugin) => needle === "" || `${plugin.manifest.name ?? ""} ${plugin.id} ${plugin.manifest.description ?? ""}`.toLowerCase().includes(needle))
      .filter((plugin) => status() === "" || (status() === "enabled") === plugin.enabled)
  })
  const hasFilters = () => search() !== "" || status() !== ""
  const clearFilters = () => { setSearch(""); setStatus("") }

  return <WorkspacePage
    title={t("plugins.title")}
    actions={<button type="button" class={TOOLBAR_PRIMARY} onClick={openInstall}><Upload size={16} aria-hidden="true" />{t("plugins.install")}</button>}
    rail={<>
      <label class="block">
        <span class={RAIL_LABEL}>Search</span>
        <div class="relative">
          <Search size={16} aria-hidden="true" class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" name="search" class={`${FIELD} pl-8`} placeholder="Search plugins..." value={search()} onInput={(e) => setSearch(e.currentTarget.value)} />
        </div>
      </label>
      <label class="block">
        <span class={RAIL_LABEL}>Status</span>
        <select name="status" class={FIELD} value={status()} onChange={(e) => setStatus(e.currentTarget.value)}>
          <option value="">All</option>
          <option value="enabled">{t("plugins.enabled")}</option>
          <option value="disabled">{t("plugins.disabled")}</option>
        </select>
      </label>
      <button type="button" class="inline-flex items-center gap-1 self-start text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50 dark:text-gray-400 dark:hover:text-gray-200" onClick={clearFilters} disabled={!hasFilters()}><X size={14} aria-hidden="true" />Clear Filters</button>
      <p class="text-xs text-gray-500 dark:text-gray-400" role="status">{filtered().length} of {plugins.data()?.length ?? 0} plugins</p>
    </>}
    overlays={<>
    <Show when={installOpen()}>
      <div class="fixed inset-0 z-[1050] flex items-center justify-center bg-black/50 p-4" onClick={(e) => { if (e.target === e.currentTarget) closeInstall() }}>
        <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="install-plugin-heading" class="w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-gray-800">
          <div class="mb-4 flex items-center justify-between"><h2 id="install-plugin-heading" class="text-lg font-semibold">{t("plugins.install")}</h2><button onClick={closeInstall} disabled={pending()} aria-label={t("common.close")}><X size={20} /></button></div>
          <div class="mb-4 border-b border-gray-200 dark:border-gray-700"><span class="inline-block border-b-2 border-blue-600 px-4 py-2 text-sm font-medium text-blue-600">{t("plugins.uploadFile")}</span></div>
          <button type="button" class="mb-6 w-full rounded-lg border-2 border-dashed p-6 text-center" classList={{ "border-blue-500 bg-blue-50 dark:bg-blue-900/10": dragging(), "border-green-500 bg-green-50 dark:bg-green-900/10": !!file(), "border-gray-300 dark:border-gray-700": !dragging() && !file() }} disabled={pending()} onClick={() => picker?.click()} onDragOver={(e) => { e.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={(e) => { e.preventDefault(); setDragging(false); chooseFile(e.dataTransfer?.files[0]) }}>
            <Show when={file()} fallback={<><Upload class="mx-auto mb-2 text-gray-400" size={32} /><p class="mb-1 font-medium text-gray-700 dark:text-gray-300">{t("plugins.dropPackage")}</p><p class="text-sm text-gray-500">{t("plugins.browsePackage")}</p></>}>{(selected) => <><CheckCircle class="mx-auto mb-2 text-green-500" size={36} /><p class="font-medium text-green-600">{selected().name}</p><p class="mt-1 text-sm text-gray-500">{(selected().size / 1024).toFixed(1)} KB</p></>}</Show>
          </button>
          <input ref={picker} type="file" accept=".zip,.vsix" class="hidden" onChange={(e) => { chooseFile(e.currentTarget.files?.[0]); e.currentTarget.value = "" }} />
          <Show when={error()}><ErrorState label={t("common.error")} detail={error()} /></Show>
          <div class="flex justify-end gap-3"><button class="rounded-md px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700" disabled={pending()} onClick={closeInstall}>{t("common.cancel")}</button><button class="flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50" disabled={pending() || !file()} onClick={() => void install()}><Upload size={16} class="mr-2" />{pending() ? t("plugins.installing") : t("plugins.install")}</button></div>
        </div>
      </div>
    </Show>
    <Show when={removing()}><div class="fixed inset-0 z-[1050] flex items-center justify-center bg-black/50 p-4"><div role="alertdialog" aria-modal="true" aria-label={t("plugins.confirmUninstall")} class="w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-gray-800"><p class="mb-6">{t("plugins.confirmUninstall")}</p><div class="flex justify-end gap-3"><button class="btn btn-outline" disabled={pending()} onClick={() => setRemoving(undefined)}>{t("common.cancel")}</button><button class="btn btn-danger" disabled={pending()} onClick={() => void uninstall()}>{t("plugins.uninstall")}</button></div></div></div></Show>
    </>}
  >
    <Toast message={notice()} />
    <Show when={error()}><ErrorState label={t("common.error")} detail={error()} /></Show>
    <Show when={plugins.error()}><ErrorState label={t("plugins.error")} detail={plugins.error()} /></Show>
    <Show when={plugins.loading() && !plugins.data()}><StageLoading label={t("common.loading")} /></Show>
    <Show when={!plugins.loading() || plugins.data()}>
      <Show
        when={filtered().length > 0}
        fallback={<StageEmpty icon={<Puzzle size={24} aria-hidden="true" />} title="No plugins found" hint={hasFilters() ? "No plugins match your search criteria." : t("plugins.empty")}>
          <Show when={hasFilters()} fallback={<button type="button" class={TOOLBAR_PRIMARY} onClick={openInstall}>{t("plugins.install")}</button>}><button type="button" class={TOOLBAR_BUTTON} onClick={clearFilters}>Clear filters</button></Show>
        </StageEmpty>}
      >
        <div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <For each={filtered()}>{(plugin) =>
            <div class={`${CARD} cursor-pointer`} role="link" tabIndex={0} onClick={() => navigate(`/plugins/${encodeURIComponent(plugin.id)}`)} onKeyDown={(e) => { if (e.key === "Enter") navigate(`/plugins/${encodeURIComponent(plugin.id)}`) }}>
              <CardBanner icon={<Puzzle size={28} aria-hidden="true" />} badge={`v${plugin.version}`} leftBadge={plugin.enabled ? t("plugins.enabled") : undefined} />
              <div class="flex flex-1 flex-col gap-2 p-4">
                <h2 class="text-base font-semibold text-gray-900 group-hover:text-[#007ACC] dark:text-white dark:group-hover:text-blue-300">{plugin.manifest.name || plugin.id}</h2>
                <p class="line-clamp-2 text-sm text-gray-600 dark:text-gray-400">{plugin.manifest.description || t("plugins.detail.noDescriptionShort")}</p>
                <div class="mt-auto space-y-1.5 text-xs text-gray-500 dark:text-gray-400">
                  <div class="flex justify-between"><span>Status:</span><span class="rounded-full px-2 py-0.5 font-medium" classList={{ "bg-green-100/80 text-green-800 dark:bg-green-900/30 dark:text-green-300": plugin.enabled, "bg-gray-200/80 text-gray-700 dark:bg-gray-700/50 dark:text-gray-300": !plugin.enabled }}>{plugin.enabled ? t("plugins.enabled") : t("plugins.disabled")}</span></div>
                  <div class="flex justify-between"><span>ID:</span><code class="font-mono text-[#007ACC] dark:text-blue-400">{plugin.id.substring(0, 8)}...</code></div>
                </div>
              </div>
              <div class="flex items-center justify-end gap-1 border-t border-gray-200/50 bg-gray-50/50 px-4 py-2.5 dark:border-gray-600/50 dark:bg-gray-700/30" onClick={(e) => e.stopPropagation()}>
                <button type="button" class={ICON_BUTTON} classList={{ "!text-green-600": plugin.enabled }} title={plugin.enabled ? t("plugins.disable") : t("plugins.enable")} aria-label={`${plugin.enabled ? t("plugins.disable") : t("plugins.enable")}: ${plugin.manifest.name || plugin.id}`} aria-pressed={plugin.enabled} disabled={pending()} onClick={() => void toggle(plugin.id, plugin.enabled)}>
                  <Show when={plugin.enabled} fallback={<ToggleLeft size={18} aria-hidden="true" />}><ToggleRight size={18} aria-hidden="true" /></Show>
                </button>
                <A class={ICON_BUTTON} href={`/plugins/${encodeURIComponent(plugin.id)}`} title={t("plugins.info")} aria-label={`${t("plugins.info")}: ${plugin.manifest.name}`}><Info size={16} aria-hidden="true" /></A>
                <button type="button" class={ICON_BUTTON} title={t("plugins.uninstall")} aria-label={`${t("plugins.uninstall")}: ${plugin.manifest.name}`} disabled={pending()} onClick={() => setRemoving(plugin.id)}><Trash2 size={16} aria-hidden="true" /></button>
              </div>
            </div>}</For>
        </div>
      </Show>
    </Show>
  </WorkspacePage>
}

/** `DetailSection` — the legacy card with the `<h2>` rule under the title. */
const DetailSection = (props: { readonly title: string; readonly children: JSX.Element; readonly class?: string }): JSX.Element => (
  <div class={`mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm md:p-6 dark:border-gray-700 dark:bg-gray-800 ${props.class ?? ""}`}>
    <h2 class="mb-3 border-b border-gray-200 pb-2 text-lg font-semibold text-gray-700 dark:border-gray-700 dark:text-gray-200">
      {props.title}
    </h2>
    <div class="prose prose-sm max-w-none text-gray-600 dark:text-gray-400">{props.children}</div>
  </div>
)

const CodeBlock = (props: { readonly children: JSX.Element }): JSX.Element => (
  <pre class="overflow-x-auto rounded-md bg-gray-100 p-3 text-xs text-gray-800 dark:bg-gray-900 dark:text-gray-300">
    <code>{props.children}</code>
  </pre>
)

/** The legacy inline spinner SVG, verbatim. */
const LoadingSpinner = (): JSX.Element => (
  <svg
    class="mr-3 -ml-1 inline-block h-5 w-5 animate-spin text-white"
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
  >
    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
    <path
      class="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    />
  </svg>
)

const BADGE_COLORS: Readonly<Record<"success" | "warning" | "error" | "info", string>> = {
  success: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
  warning: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
  error: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
  info: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300"
}

const StatusBadge = (props: { readonly label: string; readonly type: keyof typeof BADGE_COLORS }): JSX.Element => (
  <span class={`rounded-full px-2.5 py-0.5 text-xs font-medium ${BADGE_COLORS[props.type]}`}>{props.label}</span>
)

/**
 * `/plugins/:id` — `.reference/src/pages/plugins/[id].tsx`.
 *
 * The legacy page loads the plugin in `getServerSideProps`; here the same
 * `GET /api/plugins/:id` runs through `useRead`, and every action (install excluded — the
 * registry install lives on the list screen) goes through the typed client:
 * `enable` / `disable` / `uninstall`, `PUT …/config` inside the settings dialog, and
 * `POST /api/ai/completion` for the README generator (legacy read `result.response`; the
 * contract answers with `text`).
 *
 * Two legacy concepts have no v6 counterpart and render their honest fallbacks:
 * the client-side plugin host ("Client Host: Inactive") and the ReactMarkdown preview
 * (raw Markdown — no renderer ships with the desktop build).
 */
export function PluginDetailScreen(): JSX.Element {
  const app = useApp()
  const params = useParams<{ id: string }>()
  const navigate = useNavigate()
  const plugin = useRead((c) => c.plugins.get({ params: { id: params.id } }))
  const stored = useRead((c) => c.plugins.getConfig({ params: { id: params.id } }))
  const [pending, setPending] = createSignal(false)
  const [actionError, setActionError] = createSignal<string>()
  const [showSettings, setShowSettings] = createSignal(false)
  const [generating, setGenerating] = createSignal(false)
  const [readmeError, setReadmeError] = createSignal<string>()
  const [readme, setReadme] = createSignal<string>()
  const [showReadme, setShowReadme] = createSignal(false)

  const run = async (work: () => Promise<unknown>): Promise<void> => {
    if (pending()) return
    setPending(true)
    setActionError(undefined)
    try {
      await work()
      await plugin.refetch()
    } catch (cause) {
      setActionError(describe(cause))
      await plugin.refetch().catch(() => undefined)
    } finally {
      setPending(false)
    }
  }

  const uninstall = (): Promise<void> => run(async () => {
    const current = plugin.data()
    if (!current) throw new Error(t("plugins.detail.dataMissing"))
    const question = t("plugins.detail.uninstallConfirm", { name: current.manifest.name })
    if (typeof window !== "undefined" && typeof window.confirm === "function" && !window.confirm(question)) {
      throw new Error(t("plugins.detail.uninstallCancelled"))
    }
    await app.runtime.run(Effect.asVoid(app.client.plugins.uninstall({ params: { id: current.id } })))
    navigate("/plugins")
  })

  const toggleEnabled = (enable: boolean): Promise<void> => run(() =>
    app.runtime.run(Effect.asVoid(
      enable
        ? app.client.plugins.enable({ params: { id: params.id } })
        : app.client.plugins.disable({ params: { id: params.id } })
    )))

  /** The legacy README prompt, verbatim; only the manifest interpolation is dynamic. */
  const buildPrompt = (current: NonNullable<ReturnType<typeof plugin.data>>): string => {
    const manifest = current.manifest
    const configurationKeys = Object.keys(manifest.configuration?.properties ?? {})
    const contributesKeys = Object.keys(manifest.contributes ?? {})
    return `
            Generate a README.md file content in Markdown format for a web application plugin with the following details:

            **Name:** ${manifest.name || "N/A"}
            **Version:** ${manifest.version || "N/A"}
            **Author:** ${manifest.author || "N/A"}
            **Description:** ${manifest.description || "No description provided."}
            ${manifest.repository ? `**Repository:** ${manifest.repository}` : ""}
            ${manifest.permissions.length > 0 ? `**Permissions Required:**\n${manifest.permissions.map((permission) => `- \`${permission}\``).join("\n")}` : ""}
            ${configurationKeys.length > 0 ? `**Configuration Options:** (Provides options like: ${configurationKeys.join(", ")})` : ""}
            ${contributesKeys.length > 0 ? `**Features/Contributions:** (Provides features related to: ${contributesKeys.join(", ")})` : ""}

            Please include the following sections:
            - Overview/Description (expand on the provided description)
            - Features (elaborate based on contributions)
            - Installation (Generic steps: Use 'Install Plugin' button in the app)
            - Usage (Provide a placeholder if unknown)
            - Configuration (Mention if configurable and where - e.g., Settings dialog)
            - Permissions (List required permissions)
            - Dependencies (if any)
            - Contributing (Placeholder text)
            - License (Mention ${manifest.license || "the specified license"})

            Format the output *only* as Markdown content suitable for a README.md file. Start directly with the Markdown, do not include introductory phrases like "Here is the README...".
        `
  }

  const generateReadme = async (): Promise<void> => {
    const current = plugin.data()
    if (!current) return
    setGenerating(true)
    setReadmeError(undefined)
    setReadme(undefined)
    setShowReadme(true)
    try {
      const reply = await app.runtime.run(app.client.ai.completion({
        payload: { prompt: buildPrompt(current), model: "claude-3-7-sonnet-20250219" }
      }))
      const content = reply.text
      if (!content) throw new Error(t("plugins.detail.readmeEmpty"))
      setReadme(content)
    } catch (cause) {
      setReadmeError(describe(cause))
    } finally {
      setGenerating(false)
    }
  }

  /** Legacy points the `<img>` at `/api/plugins/serve/…`; v6 serves that file through the
   * typed client as a byte stream, so only the absolute-URL case renders an image — the
   * legacy `onError` hides a bundled icon that fails to load anyway. */
  const iconSource = (): string | undefined => {
    const icon = plugin.data()?.manifest.icon
    return icon !== undefined && icon.startsWith("http") ? icon : undefined
  }

  return <WorkspaceDetail title={plugin.data()?.manifest.name || t("plugins.title")} subtitle="Plugin" backHref="/plugins" backLabel={t("plugins.detail.backToPlugins")}>
    <Show when={plugin.data() !== undefined || !plugin.loading()} fallback={
      <div class="mx-auto p-8 text-center">{t("plugins.detail.loading")}</div>
    }>
      <Show when={!plugin.error()} fallback={
        <div class="mx-auto max-w-4xl p-4 md:p-8">
          <div class="relative mb-4 rounded border border-red-400 bg-red-100 px-4 py-3 text-red-700" role="alert">
            <strong class="font-bold">{t("plugins.detail.errorLoading")} </strong>
            <span class="block sm:inline">{describe(plugin.error())}</span>
          </div>
          <A href="/plugins" class="mt-4 inline-block text-blue-600 hover:underline dark:text-blue-400">{t("plugins.detail.backToPlugins")}</A>
        </div>
      }>
        <Show when={plugin.data()} fallback={
          <div class="mx-auto max-w-4xl p-4 md:p-8">
            <div class="mb-4 rounded border border-yellow-400 bg-yellow-100 px-4 py-3 text-yellow-700" role="alert">
              <strong class="font-bold">{t("plugins.detail.notFoundTitle")}</strong>
            </div>
            <A href="/plugins" class="mt-4 inline-block text-blue-600 hover:underline dark:text-blue-400">{t("plugins.detail.backToPlugins")}</A>
          </div>
        }>{(current) => <>
          {/* Back Link */}
          <div class="mb-4">
            <A href="/plugins" class="text-sm text-blue-600 hover:underline dark:text-blue-400">{t("plugins.detail.backToList")}</A>
          </div>

          {/* Header */}
          <div class="mb-6 flex flex-col items-start justify-between gap-4 md:flex-row">
            <div class="flex min-w-0 items-center gap-4">
              <Show when={iconSource()}>
                {(src) => <img
                  src={src()}
                  alt={t("plugins.detail.iconAlt", { name: current().manifest.name })}
                  class="h-12 w-12 flex-shrink-0 rounded-lg bg-gray-100 p-1 object-contain md:h-16 md:w-16"
                  onError={(event) => { event.currentTarget.style.display = "none" }}
                />}
              </Show>
              <div class="min-w-0">
                <h2 class="truncate text-2xl font-semibold tracking-[-0.015em] text-gray-900 dark:text-gray-50" title={current().manifest.name}>
                  {current().manifest.name}
                </h2>
                <p class="text-sm text-gray-500 dark:text-gray-400">
                  {t("plugins.version")} {current().manifest.version}
                  <Show when={current().manifest.author !== undefined && current().manifest.author.length > 0}>
                    {t("plugins.detail.byAuthor", { author: current().manifest.author })}
                  </Show>
                  <Show when={current().manifest.license !== undefined}>
                    <span class="ml-2 rounded bg-gray-200 px-2 py-0.5 text-xs text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                      {current().manifest.license}
                    </span>
                  </Show>
                </p>
                <p class="mt-1 truncate text-xs text-gray-400">
                  {t("plugins.detail.idLabel")}<code class="rounded bg-gray-100 p-0.5 dark:bg-gray-800">{current().id}</code>
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            <div class="flex w-full flex-shrink-0 flex-wrap justify-start gap-2 md:w-auto md:justify-end">
              <button
                type="button"
                disabled={pending()}
                onClick={() => void uninstall()}
                class="flex min-w-[100px] items-center justify-center whitespace-nowrap rounded bg-red-600 px-4 py-2 font-bold text-white transition-[background-color,border-color,color,box-shadow,opacity] duration-150 ease-out hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Show when={!pending()} fallback={<><LoadingSpinner /> {t("plugins.detail.uninstalling")}</>}>
                  {t("plugins.uninstall")}
                </Show>
              </button>

              <Show
                when={current().enabled}
                fallback={
                  <button
                    type="button"
                    disabled={pending()}
                    onClick={() => void toggleEnabled(true)}
                    class="flex min-w-[100px] items-center justify-center whitespace-nowrap rounded bg-green-500 px-4 py-2 font-bold text-white transition-[background-color,border-color,color,box-shadow,opacity] duration-150 ease-out hover:bg-green-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Show when={!pending()} fallback={<><LoadingSpinner /> {t("plugins.detail.activating")}</>}>
                      {t("plugins.detail.activate")}
                    </Show>
                  </button>
                }
              >
                <button
                  type="button"
                  disabled={pending()}
                  onClick={() => void toggleEnabled(false)}
                  class="flex min-w-[100px] items-center justify-center whitespace-nowrap rounded bg-yellow-500 px-4 py-2 font-bold text-white transition-[background-color,border-color,color,box-shadow,opacity] duration-150 ease-out hover:bg-yellow-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Show when={!pending()} fallback={<><LoadingSpinner /> {t("plugins.detail.deactivating")}</>}>
                    {t("plugins.detail.deactivate")}
                  </Show>
                </button>
              </Show>

              <Show when={current().manifest.configuration !== undefined}>
                <button
                  type="button"
                  disabled={pending()}
                  onClick={() => setShowSettings(true)}
                  class="whitespace-nowrap rounded bg-gray-500 px-4 py-2 font-bold text-white transition-[background-color,border-color,color,box-shadow,opacity] duration-150 ease-out hover:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {t("plugins.detail.configure")}
                </button>
              </Show>
            </div>
          </div>

          {/* Generate README */}
          <div class="mb-6 flex justify-end">
            <button
              type="button"
              disabled={pending() || generating()}
              onClick={() => void generateReadme()}
              class="flex items-center rounded-md bg-indigo-600 px-4 py-2 text-sm text-white shadow-sm transition-colors duration-150 ease-out hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <FileText size={16} class="mr-2" />
              {t(generating() ? "plugins.detail.generating" : "plugins.detail.generateReadme")}
            </button>
          </div>

          {/* README Generation Area */}
          <Show when={showReadme()}>
            <div class="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm md:p-6 dark:border-gray-700 dark:bg-gray-800">
              <h2 class="mb-3 text-lg font-semibold text-gray-700 dark:text-gray-200">{t("plugins.detail.readmeHeading")}</h2>
              <Show when={generating()}>
                <div class="flex items-center justify-center py-10">
                  <LoadingSpinner /> <span class="ml-2 text-gray-500">{t("plugins.detail.generating")}</span>
                </div>
              </Show>
              <Show when={readmeError()}>
                <div class="relative mb-4 rounded border border-red-400 bg-red-100 px-4 py-3 text-red-700" role="alert">
                  <strong class="mr-2 font-bold">{t("plugins.detail.readmeError")}</strong>
                  <span class="block sm:inline">{readmeError()}</span>
                </div>
              </Show>
              <Show when={readme() !== undefined && !generating()}>
                <div>
                  <p class="mb-3 text-sm text-gray-500 dark:text-gray-400">
                    {t("plugins.detail.readmeHelp1")} <code class="rounded bg-gray-100 p-1 text-xs dark:bg-gray-800">README.md</code> {t("plugins.detail.readmeHelp2")}
                  </p>
                  <textarea
                    readOnly
                    value={readme()}
                    aria-label={t("plugins.detail.readmeAria")}
                    class="h-96 w-full rounded-md border border-gray-300 bg-gray-50 p-3 font-mono text-xs text-gray-800 focus:border-indigo-500 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200"
                  />
                  {/* No markdown renderer ships with the desktop build, so the preview shows the raw Markdown. */}
                  <h3 class="mb-2 mt-4 border-t pt-4 text-md font-semibold">{t("plugins.detail.preview")}</h3>
                  <div class="prose prose-sm max-w-none rounded border p-4 dark:prose-invert">
                    <pre class="whitespace-pre-wrap font-sans text-sm">{readme()}</pre>
                  </div>
                </div>
              </Show>
              <Show when={!generating()}>
                <button
                  type="button"
                  class="mt-2 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                  onClick={() => setShowReadme(false)}
                >
                  {t("plugins.detail.hide")}
                </button>
              </Show>
            </div>
          </Show>

          {/* Action Error Display */}
          <Show when={actionError()}>
            <div class="relative mb-6 rounded border border-red-400 bg-red-100 px-4 py-3 text-red-700" role="alert">
              <strong class="font-bold">{t("plugins.detail.actionFailed")} </strong>
              <span class="block sm:inline">{actionError()}</span>
              <button
                type="button"
                class="absolute inset-y-0 right-0 px-4 py-3"
                aria-label={t("common.close")}
                onClick={() => setActionError(undefined)}
              >
                <span class="text-xl" aria-hidden="true">×</span>
              </button>
            </div>
          </Show>

          {/* Details Sections */}
          <div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div class="space-y-6 lg:col-span-2">
              <DetailSection title={t("plugins.detail.description")}>
                <Show
                  when={current().manifest.description !== undefined && current().manifest.description.length > 0}
                  fallback={<p class="italic text-gray-400">{t("plugins.detail.noDescription")}</p>}
                >
                  <p>{current().manifest.description}</p>
                </Show>
              </DetailSection>

              <Show when={current().manifest.contributes !== undefined && Object.keys(current().manifest.contributes ?? {}).length > 0}>
                <DetailSection title={t("plugins.detail.features")}>
                  <CodeBlock>{JSON.stringify(current().manifest.contributes, null, 2)}</CodeBlock>
                </DetailSection>
              </Show>

              <DetailSection title={t("plugins.detail.logs")}>
                <p class="italic text-gray-400">{t("plugins.detail.logsBody")}</p>
              </DetailSection>
            </div>

            <div class="space-y-6 lg:col-span-1">
              <DetailSection title={t("plugins.detail.statusDetails")}>
                <dl class="space-y-2">
                  <div class="flex justify-between">
                    <dt class="font-medium text-gray-600 dark:text-gray-300">{t("plugins.detail.statusLabel")}</dt>
                    <dd>
                      <Show when={current().enabled} fallback={<StatusBadge label={t("plugins.disabled")} type="warning" />}>
                        <StatusBadge label={t("plugins.enabled")} type="success" />
                      </Show>
                    </dd>
                  </div>
                  <div class="flex justify-between">
                    <dt class="font-medium text-gray-600 dark:text-gray-300">{t("plugins.detail.clientHost")}</dt>
                    {/* v6 has no client-side plugin host, so the badge is always "Inactive". */}
                    <dd><StatusBadge label={t("plugins.detail.inactive")} type="info" /></dd>
                  </div>
                  <Show when={current().state === "error"}>
                    <div class="flex justify-between">
                      <dt class="font-medium text-red-600 dark:text-red-400">{t("plugins.detail.lastError")}</dt>
                      <dd class="text-right text-xs text-red-600 dark:text-red-400">
                        {current().lastError ?? t("plugins.detail.unknownError")}
                      </dd>
                    </div>
                  </Show>
                  <div class="flex justify-between">
                    <dt class="font-medium text-gray-600 dark:text-gray-300">{t("plugins.version")}:</dt>
                    <dd>{current().manifest.version}</dd>
                  </div>
                  <Show when={current().manifest.author !== undefined && current().manifest.author.length > 0}>
                    <div class="flex justify-between">
                      <dt class="font-medium text-gray-600 dark:text-gray-300">{t("plugins.author")}:</dt>
                      <dd>{current().manifest.author}</dd>
                    </div>
                  </Show>
                  <Show when={current().manifest.license !== undefined}>
                    <div class="flex justify-between">
                      <dt class="font-medium text-gray-600 dark:text-gray-300">{t("plugins.detail.licenseLabel")}</dt>
                      <dd>{current().manifest.license}</dd>
                    </div>
                  </Show>
                  <Show when={current().manifest.repository !== undefined}>
                    <div class="flex items-center justify-between">
                      <dt class="font-medium text-gray-600 dark:text-gray-300">{t("plugins.detail.repositoryLabel")}</dt>
                      <dd>
                        <a
                          href={current().manifest.repository}
                          target="_blank"
                          rel="noopener noreferrer"
                          class="inline-flex items-center text-sm text-blue-600 hover:underline dark:text-blue-400"
                        >
                          {t("plugins.detail.view")} <ExternalLink size={14} class="ml-1" />
                        </a>
                      </dd>
                    </div>
                  </Show>
                  <div class="flex justify-between">
                    <dt class="font-medium text-gray-600 dark:text-gray-300">{t("plugins.detail.installedLabel")}</dt>
                    <dd title={new Date(current().installedAt).toLocaleString()}>
                      {new Date(current().installedAt).toLocaleDateString()}
                    </dd>
                  </div>
                  <div class="flex justify-between">
                    <dt class="font-medium text-gray-600 dark:text-gray-300">{t("plugins.detail.updatedLabel")}</dt>
                    <dd title={new Date(current().updatedAt).toLocaleString()}>
                      {new Date(current().updatedAt).toLocaleDateString()}
                    </dd>
                  </div>
                </dl>
              </DetailSection>

              <Show when={current().manifest.permissions.length > 0}>
                <DetailSection title={t("plugins.detail.permissionsRequired")}>
                  <ul class="list-inside list-disc space-y-1">
                    <For each={current().manifest.permissions}>{(permission) =>
                      <li><code class="break-all rounded bg-gray-100 p-0.5 text-xs dark:bg-gray-800">{permission}</code></li>
                    }</For>
                  </ul>
                </DetailSection>
              </Show>

              <Show when={current().manifest.dependencies !== undefined && Object.keys(current().manifest.dependencies ?? {}).length > 0}>
                <DetailSection title={t("plugins.detail.dependencies")}>
                  <ul class="list-inside list-disc space-y-1">
                    <For each={Object.entries(current().manifest.dependencies ?? {})}>{([dependency, version]) =>
                      <li>
                        <A href={`/plugins/${encodeURIComponent(dependency)}`} class="text-blue-600 hover:underline dark:text-blue-400">
                          <code class="break-all rounded bg-gray-100 p-0.5 text-xs dark:bg-gray-800">{dependency}</code>
                        </A>
                        <span class="ml-1 text-xs text-gray-500 dark:text-gray-400">({version})</span>
                      </li>
                    }</For>
                  </ul>
                </DetailSection>
              </Show>

              <Show when={current().manifest.configuration !== undefined && Object.keys(current().manifest.configuration?.properties ?? {}).length > 0}>
                <DetailSection title={t("plugins.detail.configSchema")}>
                  <CodeBlock>{JSON.stringify(current().manifest.configuration, null, 2)}</CodeBlock>
                </DetailSection>
              </Show>
            </div>
          </div>

          <PluginSettingsDialog
            open={showSettings()}
            onClose={() => setShowSettings(false)}
            pluginId={current().id}
            pluginName={current().manifest.name}
            initialSettings={stored.data() ?? current().config}
            configSchema={current().manifest.configuration}
          />
        </>}</Show>
      </Show>
    </Show>
  </WorkspaceDetail>
}
