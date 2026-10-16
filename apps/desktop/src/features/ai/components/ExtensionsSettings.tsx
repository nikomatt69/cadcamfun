import { For, Show, createEffect, createMemo, createResource, createSignal, onCleanup, type JSX } from "solid-js"
import { A } from "@solidjs/router"
import RefreshCw from "lucide-solid/icons/refresh-cw"
import Power from "lucide-solid/icons/power"
import Trash2 from "lucide-solid/icons/trash-2"
import { Schema } from "effect"
import { AiMcpConfig } from "@cadcamfun/api"
import { t } from "../../../i18n/index.ts"
import { useApp } from "../../../shared/state/context.ts"
import { useAiStore } from "../store/context.tsx"

const REMOTE = '{\n  "type": "remote",\n  "url": "https://example.com/mcp",\n  "enabled": true\n}'
const LOCAL = '{\n  "type": "local",\n  "command": ["my-mcp-server", "--stdio"],\n  "enabled": true\n}'
const MANIFEST = '{\n  "id": "com.example.tools",\n  "name": "My CAD tools",\n  "version": "1.0.0",\n  "apiVersion": "1",\n  "entry": "index.js",\n  "capabilities": ["ai:tool"],\n  "contributes": {\n    "aiTools": [{\n      "id": "circle_area",\n      "description": "Calculate a circle area in square millimetres",\n      "kind": "read",\n      "entry": "circleArea",\n      "parameters": {\n        "type": "object",\n        "properties": {"radius": {"type": "number", "minimum": 0}},\n        "required": ["radius"],\n        "additionalProperties": false\n      }\n    }]\n  }\n}'
const SOURCE = 'export const aiTools = {\n  circleArea: ({ radius }) => ({ area: Math.PI * radius * radius })\n}\n'

export function ExtensionsSettings(): JSX.Element {
  const app = useApp()
  const ai = useAiStore()
  const [name, setName] = createSignal("")
  const [config, setConfig] = createSignal(REMOTE)
  const [manifest, setManifest] = createSignal(MANIFEST)
  const [source, setSource] = createSignal(SOURCE)
  const [busy, setBusy] = createSignal(false)
  const [problem, setProblem] = createSignal<string>()
  const [serverProblem, setServerProblem] = createSignal<string>()
  const [pluginProblem, setPluginProblem] = createSignal<string>()
  const [modProblem, setModProblem] = createSignal<string>()
  // The mod modules the pasted manifest declares (`contributes.mods[].entry` → source); an upload must carry one for each.
  const [modSources, setModSources] = createSignal<Record<string, string>>({})
  const controller = new AbortController()
  onCleanup(() => controller.abort())
  const run = <A, E>(effect: import("effect").Effect.Effect<A, E>) => app.runtime.run(effect, { signal: controller.signal })
  const [servers, serverActions] = createResource(() => ai.projectId() || false, async (projectId) => {
    setServerProblem(undefined)
    try { return { projectId, ...await run(app.client.ai.mcpServers({ query: { projectId } })) } } catch {
      if (!controller.signal.aborted && ai.projectId() === projectId) setServerProblem(t("ai.extensions.failed"))
      return { projectId, servers: [] }
    }
  })
  const [plugins, pluginActions] = createResource(async () => {
    setPluginProblem(undefined)
    try { return await run(app.client.ai.extensionPlugins()) } catch {
      if (!controller.signal.aborted) setPluginProblem(t("ai.extensions.failed"))
      return { plugins: [] }
    }
  })
  const [mods, modActions] = createResource(async () => {
    setModProblem(undefined)
    try { return await run(app.client.ai.extensionMods()) } catch {
      if (!controller.signal.aborted) setModProblem(t("ai.extensions.failed"))
      return { mods: [] }
    }
  })
  const declaredModEntries = createMemo<ReadonlyArray<string>>(() => {
    try {
      const parsed: unknown = JSON.parse(manifest())
      const entries = (parsed as { contributes?: { mods?: unknown } } | null)?.contributes?.mods
      if (!Array.isArray(entries)) return []
      return entries.flatMap((entry) => {
        const file = (entry as { entry?: unknown } | undefined)?.entry
        return typeof file === "string" && file.length > 0 ? [file] : []
      })
    } catch { return [] }
  })
  createEffect(() => { ai.projectId(); setName(""); setConfig(REMOTE); setProblem(undefined) })
  const mutate = async (work: () => Promise<unknown>): Promise<void> => {
    if (busy()) return
    setBusy(true)
    setProblem(undefined)
    try { await work() } catch (cause) {
      if (!controller.signal.aborted) setProblem(cause instanceof Error ? cause.message : t("ai.extensions.failed"))
    } finally { if (!controller.signal.aborted) setBusy(false) }
  }
  const refreshServers = () => serverActions.refetch()
  const save = (serverName: string, serverConfig: typeof AiMcpConfig.Type) => {
    const projectId = ai.projectId()
    if (!projectId) return Promise.resolve()
    return mutate(async () => {
      await run(app.client.ai.saveMcpServer({ payload: { projectId, name: serverName, config: serverConfig } }))
      await refreshServers()
    })
  }
  const error = () => problem() ?? serverProblem() ?? pluginProblem() ?? modProblem()
  return (
    <div class="space-y-4" data-testid="ai-extensions">
      <Show when={error()}>{(message) => <p class="assistant-attachment-problem" role="alert">{message()}</p>}</Show>
      <section class="space-y-2">
        <div class="flex items-center justify-between gap-2">
          <h3 class="text-sm font-medium">{t("ai.extensions.mcp")}</h3>
          <button type="button" class="assistant-icon-action" disabled={busy() || servers.loading || !ai.projectId()} aria-label={t("ai.extensions.refresh")} onClick={() => void mutate(async () => { await refreshServers() })}><RefreshCw size={13} aria-hidden="true" /></button>
        </div>
        <p class="text-xs assistant-meta-text">{t("ai.extensions.mcpHint")}</p>
        <Show when={ai.projectId()} fallback={<p class="text-xs assistant-meta-text">{t("ai.extensions.projectRequired")}</p>}>
          <Show when={servers.loading}><p class="text-xs assistant-meta-text" role="status">{t("ai.extensions.loading")}</p></Show>
          <ul class="space-y-1">
            <For each={servers()?.projectId === ai.projectId() ? servers()?.servers : []}>{(server) => (
              <li class="assistant-list-card gap-2">
                <button type="button" class="min-w-0 flex-1 text-left" title={server.name} onClick={() => { setName(server.name); setConfig(JSON.stringify(server.config, null, 2)) }}>
                  <strong class="block truncate">{server.name}</strong><span class="text-xs assistant-meta-text">{server.config.type} · {server.status}</span>
                </button>
                <button type="button" class="assistant-icon-action" disabled={busy() || ai.status() === "streaming" || ai.status() === "connecting"} aria-label={t(server.config.enabled ? "ai.extensions.disable" : "ai.extensions.enable", { name: server.name })} aria-pressed={server.config.enabled} onClick={() => void save(server.name, { ...server.config, enabled: !server.config.enabled })}><Power size={13} aria-hidden="true" /></button>
                <button type="button" class="assistant-icon-action is-danger" disabled={busy() || ai.status() === "streaming" || ai.status() === "connecting"} aria-label={t("ai.extensions.remove", { name: server.name })} onClick={() => { const projectId = ai.projectId(); if (projectId) void mutate(async () => { await run(app.client.ai.deleteMcpServer({ params: { name: server.name }, query: { projectId } })); await refreshServers() }) }}><Trash2 size={13} aria-hidden="true" /></button>
              </li>
            )}</For>
          </ul>
          <details class="space-y-2">
            <summary class="cursor-pointer text-xs">{t("ai.extensions.configure")}</summary>
            <label class="block text-xs">{t("ai.extensions.serverName")}<input class="assistant-field mt-1" value={name()} maxLength={64} onInput={(event) => setName(event.currentTarget.value)} /></label>
            <div class="flex gap-2"><button type="button" class="assistant-btn assistant-btn-secondary" onClick={() => setConfig(REMOTE)}>{t("ai.extensions.remote")}</button><button type="button" class="assistant-btn assistant-btn-secondary" onClick={() => setConfig(LOCAL)}>{t("ai.extensions.local")}</button></div>
            <label class="block text-xs">{t("ai.extensions.configuration")}<textarea class="assistant-field mt-1 font-mono text-xs" rows={7} value={config()} maxLength={32000} spellcheck={false} onInput={(event) => setConfig(event.currentTarget.value)} /></label>
            <button type="button" class="assistant-btn assistant-btn-primary" disabled={busy() || !name().trim() || ai.status() === "streaming" || ai.status() === "connecting"} onClick={() => void mutate(async () => {
              const projectId = ai.projectId()
              if (!projectId) return
              const parsed: unknown = JSON.parse(config())
              // The API decodes and validates the full native configuration before any connection is started.
              await run(app.client.ai.saveMcpServer({ payload: { projectId, name: name().trim(), config: Schema.decodeUnknownSync(AiMcpConfig)(parsed, { onExcessProperty: "error" }) } }))
              await refreshServers()
            })}>{t("ai.extensions.save")}</button>
          </details>
        </Show>
      </section>
      <section class="space-y-2">
        <h3 class="text-sm font-medium">{t("ai.extensions.plugins")}</h3>
        <p class="text-xs assistant-meta-text">{t("ai.extensions.pluginsHint")}</p>
        <Show when={plugins.loading}><p class="text-xs assistant-meta-text" role="status">{t("ai.extensions.loading")}</p></Show>
        <ul class="space-y-1"><For each={plugins()?.plugins}>{(plugin) => <li class="assistant-list-card gap-2">
          <div class="min-w-0 flex-1"><strong class="block truncate">{plugin.name}</strong><span class="text-xs assistant-meta-text">{plugin.version} · {t("ai.extensions.toolCount", { count: plugin.tools })}{plugin.mods > 0 ? ` · ${t("ai.extensions.modCount", { count: plugin.mods })}` : ""}{plugin.modes > 0 ? ` · ${t("ai.extensions.modeCount", { count: plugin.modes })}` : ""}</span></div>
          <button type="button" class="assistant-icon-action" disabled={busy() || ai.status() === "streaming" || ai.status() === "connecting"} aria-label={t(plugin.enabled ? "ai.extensions.disable" : "ai.extensions.enable", { name: plugin.name })} aria-pressed={plugin.enabled} onClick={() => void mutate(async () => { await run(app.client.ai.toggleExtensionPlugin({ params: { id: plugin.id }, payload: { enabled: !plugin.enabled } })); await pluginActions.refetch(); await modActions.refetch(); ai.refresh(); ai.refreshModes() })}><Power size={13} aria-hidden="true" /></button>
          <button type="button" class="assistant-icon-action is-danger" disabled={busy() || ai.status() === "streaming" || ai.status() === "connecting"} aria-label={t("ai.extensions.remove", { name: plugin.name })} onClick={() => void mutate(async () => { await run(app.client.ai.removeExtensionPlugin({ params: { id: plugin.id } })); await pluginActions.refetch(); await modActions.refetch(); ai.refresh(); ai.refreshModes() })}><Trash2 size={13} aria-hidden="true" /></button>
        </li>}</For></ul>
        <details class="space-y-2">
          <summary class="cursor-pointer text-xs">{t("ai.extensions.install")}</summary>
          <p class="text-xs assistant-meta-text">{t("ai.extensions.trust")}</p>
          <label class="block text-xs">plugin.json<textarea class="assistant-field mt-1 font-mono text-xs" rows={8} maxLength={64000} value={manifest()} spellcheck={false} onInput={(event) => setManifest(event.currentTarget.value)} /></label>
          <label class="block text-xs">index.js<textarea class="assistant-field mt-1 font-mono text-xs" rows={5} maxLength={500000} value={source()} spellcheck={false} onInput={(event) => setSource(event.currentTarget.value)} /></label>
          <For each={declaredModEntries()}>{(entry) => <label class="block text-xs">{t("ai.extensions.modModule", { entry })}
            <textarea class="assistant-field mt-1 font-mono text-xs" rows={5} maxLength={500000} value={modSources()[entry] ?? ""} spellcheck={false} onInput={(event) => setModSources((current) => ({ ...current, [entry]: event.currentTarget.value }))} />
          </label>}</For>
          <button type="button" class="assistant-btn assistant-btn-secondary" disabled={busy() || !manifest().trim() || !source().trim() || declaredModEntries().some((entry) => !(modSources()[entry] ?? "").trim())} onClick={() => void mutate(async () => { await run(app.client.ai.installExtensionPlugin({ payload: { manifest: manifest(), source: source(), files: Object.fromEntries(declaredModEntries().map((entry) => [entry, modSources()[entry] ?? ""])) } })); await pluginActions.refetch() })}>{t("ai.extensions.install")}</button>
        </details>
        <A href="/plugins" class="assistant-link-btn text-xs">{t("ai.extensions.manageCadPlugins")}</A>
      </section>
      <section class="space-y-2">
        <div class="flex items-center justify-between gap-2">
          <h3 class="text-sm font-medium">{t("ai.extensions.mods")}</h3>
          <button type="button" class="assistant-icon-action" disabled={busy() || mods.loading} aria-label={t("ai.extensions.refresh")} onClick={() => void mutate(async () => { await modActions.refetch() })}><RefreshCw size={13} aria-hidden="true" /></button>
        </div>
        <p class="text-xs assistant-meta-text">{t("ai.extensions.modsHint")}</p>
        <Show when={mods.loading}><p class="text-xs assistant-meta-text" role="status">{t("ai.extensions.loading")}</p></Show>
        <ul class="space-y-1"><For each={mods()?.mods}>{(mod) => <li class="assistant-list-card gap-2">
          <div class="min-w-0 flex-1"><strong class="block truncate">{mod.name}</strong><span class="text-xs assistant-meta-text">{mod.description} · {mod.origin === "plugin" ? t("ai.extensions.modFromPlugin", { name: mod.pluginId ?? "" }) : t("ai.extensions.modWrittenBy", { origin: mod.origin })}</span></div>
          <Show when={mod.origin !== "plugin"}>
            <button type="button" class="assistant-icon-action" disabled={busy() || ai.status() === "streaming" || ai.status() === "connecting"} aria-label={t(mod.enabled ? "ai.extensions.disable" : "ai.extensions.enable", { name: mod.name })} aria-pressed={mod.enabled} onClick={() => void mutate(async () => { await run(app.client.ai.toggleExtensionMod({ params: { id: mod.id }, payload: { enabled: !mod.enabled } })); await modActions.refetch() })}><Power size={13} aria-hidden="true" /></button>
            <button type="button" class="assistant-icon-action is-danger" disabled={busy() || ai.status() === "streaming" || ai.status() === "connecting"} aria-label={t("ai.extensions.remove", { name: mod.name })} onClick={() => void mutate(async () => { await run(app.client.ai.removeExtensionMod({ params: { id: mod.id } })); await modActions.refetch() })}><Trash2 size={13} aria-hidden="true" /></button>
          </Show>
        </li>}</For></ul>
        <p class="text-xs assistant-meta-text">{t("ai.extensions.modsAssistant")}</p>
      </section>
    </div>
  )
}
