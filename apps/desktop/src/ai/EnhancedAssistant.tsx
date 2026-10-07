/**
 * The full AI assistant UI (spec 06-desktop-ui.md §1 + spec 08-ai.md §3).
 *
 * Mirrors the reference `EnhancedCADAssistant` look: header with project info
 * and nikcli status pill, statistics panel, thinking visualisation, proactive
 * suggestions, message list (with inline tool calls and permission prompts),
 * and an input area with character counter and Enter/Shift+Enter handling.
 *
 * nikcli is the AI base — the sidecar's `chatStream` endpoint streams the
 * events this component renders. `cadcamfun/AiCatalog` (Effect v4 service)
 * owns the typed client calls for status, models, and credentials.
 */
import { For, Show, batch, createMemo, createSignal, type JSX } from "solid-js"
import LoaderCircle from "lucide-solid/icons/loader-circle"
import Send from "lucide-solid/icons/send"
import Sparkles from "lucide-solid/icons/sparkles"
import Trash2 from "lucide-solid/icons/trash-2"
import X from "lucide-solid/icons/x"
import BarChart3 from "lucide-solid/icons/chart-column"
import RefreshCw from "lucide-solid/icons/refresh-cw"
import Brain from "lucide-solid/icons/brain"
import Wrench from "lucide-solid/icons/wrench"
import ChevronDown from "lucide-solid/icons/chevron-down"
import KeyRound from "lucide-solid/icons/key-round"
import ChevronUp from "lucide-solid/icons/chevron-up"
import ChevronRight from "lucide-solid/icons/chevron-right"
import Copy from "lucide-solid/icons/copy"
import Plus from "lucide-solid/icons/plus"
import { t } from "../i18n/index.ts"
import { useAiStore } from "./context.tsx"
import { useApp } from "../state/context.ts"
import { ProviderBadge } from "./ProviderBadge.tsx"
import { ProviderSettings } from "./ProviderSettings.tsx"
import { TOOL_IDS } from "./tools.ts"
import type { AiEvent as StreamEvent, AiMessage } from "./types.ts"

interface Props {
  readonly className?: string
  readonly onClose?: () => void
}

let copyCounter = 0
const nextId = (): string => `cp-${(copyCounter += 1).toString(36)}`

const formatTimestamp = (iso: string): string => {
  try {
    const date = new Date(iso)
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  } catch {
    return ""
  }
}

const countToolCalls = (events: ReadonlyArray<StreamEvent>): number =>
  events.reduce((n, e) => (e.type === "tool_call" ? n + 1 : n), 0)

const formatTokens = (input: number, output: number): string => {
  const total = input + output
  if (total < 1000) return `${total}`
  if (total < 1000000) return `${(total / 1000).toFixed(1)}k`
  return `${(total / 1000000).toFixed(2)}M`
}

export function EnhancedAssistant(props: Props): JSX.Element {
  const ai = useAiStore()
  const app = useApp()
  const [draft, setDraft] = createSignal("")
  const [showStats, setShowStats] = createSignal(false)
  const [showTools, setShowTools] = createSignal(false)
  const [copiedId, setCopiedId] = createSignal<string | undefined>()
  let transcript: HTMLDivElement | undefined

  const running = (): boolean => ai.status() === "streaming" || ai.status() === "connecting"
  const toolCallCount = (): number => {
    let total = 0
    for (const message of ai.messages()) total += countToolCalls(message.events)
    return total
  }
  const thinkingSteps = (): number => ai.stats().thinkingSteps
  const sessionsCount = (): number => ai.sessions().length
  const headerSubtitle = (): string => {
    const drawing = app.drawing()
    const entities = drawing ? drawing.entities.length : 0
    const status = ai.aiStatus()
    const host = status?.host ?? "direct"
    if (drawing) {
      return t("ai.header.subtitle", { name: drawing.name, count: entities }).replace("nikcli {host}", `nikcli ${host}`)
    }
    return t("ai.header.noProject")
  }

  const handleCopy = async (text: string, id: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId(id)
      setTimeout(() => setCopiedId((current) => (current === id ? undefined : current)), 1500)
    } catch {
      setCopiedId(undefined)
    }
  }

  const handleSend = async (): Promise<void> => {
    const text = draft().trim()
    if (text.length === 0 || running()) return
    setDraft("")
    await ai.send(text)
  }

  const handleKeyDown = (event: KeyboardEvent & { currentTarget: HTMLTextAreaElement }): void => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      void handleSend()
    }
  }

  // Auto-scroll: keep the latest assistant message in view while streaming.
  createMemo(() => {
    const last = ai.messages().at(-1)
    if (last && running() && transcript !== undefined) {
      transcript.scrollTop = transcript.scrollHeight
    }
    return last?.id ?? ""
  })

  return (
    <div
      class={`enhanced-assistant flex flex-col h-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden ${props.className ?? ""}`}
      data-testid="ai-assistant"
    >
      <header class="flex items-center gap-3 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950 dark:to-indigo-950 px-4 py-3">
        <Sparkles size={18} aria-hidden="true" class="text-blue-600 dark:text-blue-400" />
        <div class="flex-1 min-w-0">
          <h2 class="text-sm font-semibold text-gray-900 dark:text-gray-100">{t("ai.title")}</h2>
          <p class="text-xs text-gray-600 dark:text-gray-400 truncate">{headerSubtitle()}</p>
        </div>
        <ProviderBadge />
        <Show when={props.onClose}>
          <button
            type="button"
            class="rounded p-1 hover:bg-gray-200 dark:hover:bg-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            aria-label={t("ai.close")}
            onClick={() => props.onClose?.()}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </Show>
      </header>

      <Show when={showStats()}>
        <section class="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-2">
          <p class="text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-1">{t("ai.stats.title")}</p>
          <div class="grid grid-cols-4 gap-2 text-center text-xs">
            <div>
              <p class="font-medium text-gray-900 dark:text-gray-100">{ai.stats().exchanges}</p>
              <p class="text-gray-500">{t("ai.stats.exchanges")}</p>
            </div>
            <div>
              <p class="font-medium text-gray-900 dark:text-gray-100">{toolCallCount()}</p>
              <p class="text-gray-500">{t("ai.stats.toolCalls")}</p>
            </div>
            <div>
              <p class="font-medium text-gray-900 dark:text-gray-100">{thinkingSteps()}</p>
              <p class="text-gray-500">{t("ai.stats.thinking")}</p>
            </div>
            <div>
              <p class="font-medium text-gray-900 dark:text-gray-100">{formatTokens(ai.stats().totalInputTokens, ai.stats().totalOutputTokens)}</p>
              <p class="text-gray-500">{t("ai.stats.usage")}</p>
            </div>
          </div>
        </section>
      </Show>

      <Show when={running()}>
        <div class="flex items-center gap-2 border-b border-blue-100 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/30 px-4 py-2 text-xs text-blue-700 dark:text-blue-300">
          <LoaderCircle size={14} aria-hidden="true" class="animate-spin" />
          <span>{t("ai.thinking.processing")}</span>
        </div>
      </Show>

      <Show when={ai.suggestions().length > 0}>
        <section class="border-b border-gray-200 dark:border-gray-700 px-4 py-2" data-testid="proactive-suggestions">
          <p class="text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-1 flex items-center gap-1">
            <Brain size={10} aria-hidden="true" /> {t("ai.suggestions.title")}
          </p>
          <ul class="flex flex-wrap gap-1.5">
            <For each={ai.suggestions().slice(0, 3)}>
              {(suggestion) => (
                <li class="flex items-center gap-1 rounded-full bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 text-xs">
                  <button
                    type="button"
                    class="text-blue-700 dark:text-blue-300 hover:underline"
                    onClick={() => setDraft(suggestion.prompt)}
                    title={suggestion.description}
                  >
                    {suggestion.title}
                  </button>
                  <button
                    type="button"
                    class="text-gray-400"
                    aria-label={t("ai.suggestions.dismiss")}
                    onClick={() => ai.dismissSuggestion(suggestion.id)}
                  >
                    <X size={10} aria-hidden="true" />
                  </button>
                </li>
              )}
            </For>
          </ul>
        </section>
      </Show>

      <div ref={transcript} class="flex-1 overflow-y-auto p-4 space-y-3" aria-live="polite" data-testid="ai-transcript">
        <Show
          when={ai.messages().length > 0}
          fallback={
            <div class="text-center py-8 text-gray-500 dark:text-gray-400">
              <Sparkles size={36} aria-hidden="true" class="mx-auto mb-3 text-gray-300" />
              <p class="text-sm font-medium">{t("ai.empty")}</p>
              <Show when={ai.suggestions().length > 0}>
                <p class="text-xs mt-1">{t("ai.suggestions.empty")}</p>
              </Show>
            </div>
          }
        >
          <For each={ai.messages()}>
            {(message) => <MessageBubble message={message} onCopy={handleCopy} copiedId={copiedId()} />}
          </For>
        </Show>
        <Show when={running()}>
          <div class="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <RefreshCw size={12} aria-hidden="true" class="animate-spin" />
            <span>{t("ai.thinking")}…</span>
          </div>
        </Show>
        <Show when={ai.error()}>
          {(error) => (
            <div class="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg p-3">
              <p class="text-sm text-red-700 dark:text-red-300">{error()}</p>
            </div>
          )}
        </Show>
      </div>

      <ModelToolbar
        showStats={showStats()}
        showTools={showTools()}
        onToggleStats={() => setShowStats(!showStats())}
        onToggleTools={() => setShowTools(!showTools())}
        onClear={() => batch(() => { ai.clear(); setDraft("") })}
        sessionsCount={sessionsCount()}
      />

      <Show when={showTools()}>
        <details class="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-2 text-xs">
          <summary class="font-semibold text-gray-700 dark:text-gray-300 cursor-pointer">{t("ai.tool.tools")} ({TOOL_IDS.length})</summary>
          <p class="text-gray-500 mt-1">{t("ai.tool.toolsHint")}</p>
          <ul class="mt-1 grid grid-cols-2 gap-1 text-gray-600 dark:text-gray-400">
            <For each={TOOL_IDS}>{(id) => <li><code class="text-[10px]">{id}</code></li>}</For>
          </ul>
        </details>
      </Show>

      <form
        class="flex items-end gap-2 border-t border-gray-200 dark:border-gray-700 p-3 bg-gray-50 dark:bg-gray-950"
        onSubmit={(event) => {
          event.preventDefault()
          void handleSend()
        }}
      >
        <label class="sr-only" for="ai-prompt">{t("ai.input.placeholder")}</label>
        <div class="flex-1">
          <textarea
            id="ai-prompt"
            class="form-textarea min-h-12 w-full resize-none"
            rows={2}
            placeholder={t("ai.input.placeholder")}
            value={draft()}
            onInput={(event) => setDraft(event.currentTarget.value)}
            onKeyDown={handleKeyDown}
            disabled={running() && ai.status() !== "connecting"}
          />
          <div class="mt-1 flex items-center justify-between text-[10px] text-gray-500">
            <span>{t("ai.input.shortcut.hint")}</span>
            <span>{draft().length}/4000</span>
          </div>
        </div>
        <Show
          when={!running()}
          fallback={
            <button type="button" class="btn btn-outline" onClick={() => ai.abort()}>
              <X size={14} aria-hidden="true" />
              {t("common.cancel")}
            </button>
          }
        >
          <button type="submit" class="btn btn-primary" disabled={draft().trim().length === 0}>
            <Send size={14} aria-hidden="true" />
            {t("ai.send")}
          </button>
        </Show>
      </form>
    </div>
  )
}

interface ModelToolbarProps {
  readonly showStats: boolean
  readonly showTools: boolean
  readonly onToggleStats: () => void
  readonly onToggleTools: () => void
  readonly onClear: () => void
  readonly sessionsCount: number
}

function ModelToolbar(props: ModelToolbarProps): JSX.Element {
  const ai = useAiStore()
  const [open, setOpen] = createSignal(false)
  const [showProviders, setShowProviders] = createSignal(false)
  const currentLabel = (): string => {
    const m = ai.model()
    if (m === undefined) return t("ai.model.label")
    return `${m.provider}/${m.model}`
  }

  return (
    <div class="flex items-center gap-1 border-t border-gray-200 dark:border-gray-700 px-3 py-1.5 text-xs">
      <div class="relative">
        <button
          type="button"
          class="flex items-center gap-1 rounded px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          aria-label={t("ai.model.label")}
          aria-expanded={open()}
          onClick={() => setOpen(!open())}
        >
          <span class="text-gray-600 dark:text-gray-400">{currentLabel()}</span>
          <ChevronDown size={12} aria-hidden="true" class={open() ? "rotate-180 transition" : "transition"} />
        </button>
        <Show when={open()}>
          <ModelMenu onSelect={() => setOpen(false)} />
        </Show>
      </div>
      <div class="relative">
        <button
          type="button"
          class="rounded p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          aria-label={t("ai.providers.title")}
          aria-expanded={showProviders()}
          data-testid="ai-providers-toggle"
          onClick={() => setShowProviders(!showProviders())}
        >
          <KeyRound size={14} aria-hidden="true" />
        </button>
        <Show when={showProviders()}>
          <div class="absolute bottom-full mb-1 left-0 w-80 max-h-96 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg z-10 p-3">
            <ProviderSettings />
          </div>
        </Show>
      </div>
      <label class="ml-2 inline-flex items-center gap-1 cursor-pointer text-gray-600 dark:text-gray-400">
        <input
          type="checkbox"
          class="h-3 w-3"
          checked={ai.includeContext()}
          onChange={(event) => ai.setIncludeContext(event.currentTarget.checked)}
        />
        {t("ai.toolbar.context")}
      </label>
      <div class="ml-auto flex items-center gap-1">
        <button
          type="button"
          class="rounded p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          aria-label={t("ai.toolbar.statistics")}
          aria-pressed={props.showStats}
          onClick={props.onToggleStats}
        >
          <BarChart3 size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          class="rounded p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          aria-label={t("ai.tool.tools")}
          aria-pressed={props.showTools}
          onClick={props.onToggleTools}
        >
          <Wrench size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          class="rounded p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          aria-label={t("ai.toolbar.refresh")}
          onClick={() => ai.refresh()}
        >
          <RefreshCw size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          class="rounded p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          aria-label={t("ai.clear")}
          onClick={props.onClear}
        >
          <Trash2 size={14} aria-hidden="true" />
        </button>
      </div>
      <Show when={props.sessionsCount > 0}>
        <span class="text-gray-400 text-[10px]">· {props.sessionsCount}</span>
      </Show>
    </div>
  )
}

function ModelMenu(props: { readonly onSelect: () => void }): JSX.Element {
  const ai = useAiStore()
  return (
    <div class="absolute bottom-full mb-1 left-0 w-72 max-h-60 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg z-10">
      <Show
        when={ai.models().length > 0}
        fallback={
          <p class="px-3 py-2 text-xs text-gray-500">{t("ai.model.noModels")}</p>
        }
      >
        <ul class="divide-y divide-gray-100 dark:divide-gray-800">
          <For each={ai.models()}>
            {(model) => (
              <li>
                <button
                  type="button"
                  class="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-blue-50 dark:hover:bg-blue-950/30 disabled:opacity-40"
                  disabled={!model.configured}
                  onClick={() => {
                    ai.setModel({ provider: model.provider, model: model.id, ...(model.tier === undefined ? {} : { tier: model.tier }) })
                    props.onSelect()
                  }}
                >
                  <span class="flex-1">
                    <div class="text-xs font-medium text-gray-900 dark:text-gray-100">{model.id}</div>
                    <div class="text-[10px] text-gray-500">
                      {ai.providers().find((p) => p.id === model.provider)?.name ?? t(`ai.model.provider.${model.provider}` as never)}
                      <Show when={model.tier !== undefined}> · {t(`ai.model.tier.${model.tier}` as never)}</Show>
                    </div>
                  </span>
                  <Show when={!model.configured}>
                    <span class="text-[10px] text-amber-600">{t("ai.model.unconfigured")}</span>
                  </Show>
                </button>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </div>
  )
}

interface MessageBubbleProps {
  readonly message: AiMessage
  readonly onCopy: (text: string, id: string) => void
  readonly copiedId: string | undefined
}

function MessageBubble(props: MessageBubbleProps): JSX.Element {
  const ai = useAiStore()
  const toolCalls = (): ReadonlyArray<StreamEvent> => props.message.events.filter((e) => e.type === "tool_call" || e.type === "tool_result")
  const permissions = (): ReadonlyArray<StreamEvent> => props.message.events.filter((e) => e.type === "permission_request")
  const isUser = (): boolean => props.message.role === "user"

  return (
    <div class="space-y-1.5">
      <div class="flex items-center justify-between text-[10px] text-gray-500 uppercase">
        <span class="font-semibold">
          {props.message.role === "user" ? t("ai.message.user") : t("ai.message.assistant")}
        </span>
        <span>{formatTimestamp(props.message.createdAt)}</span>
      </div>
      <div
        class="rounded-lg px-3 py-2 text-sm whitespace-pre-wrap"
        classList={{
          "bg-blue-50 dark:bg-blue-950/30 ml-auto max-w-[80%]": isUser(),
          "bg-gray-100 dark:bg-gray-800 mr-auto max-w-[80%]": !isUser()
        }}
      >
        <Show when={props.message.text.length > 0}>
          {props.message.text}
          <Show when={props.message.status === "streaming"}>
            <span class="ml-0.5 inline-block animate-pulse" aria-hidden="true">▍</span>
          </Show>
        </Show>
        <Show when={props.message.status === "error" && props.message.error}>
          <p class="mt-1 text-xs text-red-600 dark:text-red-400">{props.message.error}</p>
        </Show>
      </div>

      <Show when={toolCalls().length > 0}>
        <ul class="space-y-1 pl-2">
          <For each={toolCalls()}>
            {(event) => {
              if (event.type === "tool_call") {
                const result = createMemo(() => {
                  const calls = ai.toolCalls()
                  return calls[event.callId]
                })
                return (
                  <li class="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400" data-testid="tool-call">
                    <Wrench size={12} aria-hidden="true" />
                    <code class="text-[10px] font-mono">{event.tool}</code>
                    <Show when={result()?.status === "ok"}>
                      <ChevronRight size={10} aria-hidden="true" />
                      <span class="text-green-600">{t("ai.message.tool.ok", { tool: event.tool })}</span>
                    </Show>
                    <Show when={result()?.status === "error"}>
                      <ChevronRight size={10} aria-hidden="true" />
                      <span class="text-red-600">{t("ai.message.tool.error", { tool: event.tool })}</span>
                    </Show>
                    <Show when={result()?.status === "running"}>
                      <LoaderCircle size={10} aria-hidden="true" class="animate-spin" />
                    </Show>
                  </li>
                )
              }
              return null
            }}
          </For>
        </ul>
      </Show>

      <Show when={permissions().length > 0}>
        <ul class="space-y-1 pl-2">
          <For each={permissions()}>
            {(event) => {
              if (event.type !== "permission_request") return null
              return (
                <li class="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400" data-testid="permission">
                  <span>{t("ai.message.permission", { permission: event.permission })}</span>
                  <button
                    type="button"
                    class="rounded bg-amber-100 dark:bg-amber-950/40 px-1.5 py-0.5 hover:bg-amber-200"
                    onClick={() => ai.replyPermission(event.requestId, "once")}
                  >
                    {t("ai.message.permission.grant")}
                  </button>
                  <button
                    type="button"
                    class="rounded bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 hover:bg-gray-200"
                    onClick={() => ai.replyPermission(event.requestId, "reject")}
                  >
                    {t("ai.message.permission.deny")}
                  </button>
                </li>
              )
            }}
          </For>
        </ul>
      </Show>

      <div class="flex items-center gap-1 pl-2">
        <button
          type="button"
          class="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-700"
          onClick={() => props.onCopy(props.message.text, nextId())}
        >
          <Copy size={10} aria-hidden="true" />
          {props.copiedId ? t("ai.message.copied") : t("ai.message.copy")}
        </button>
        <Show when={isUser()}>
          <button
            type="button"
            class="flex items-center gap-1 text-[10px] text-gray-500 hover:text-red-600"
            onClick={() => ai.newSession()}
          >
            <Plus size={10} aria-hidden="true" />
            {t("ai.page.title")}
          </button>
        </Show>
      </div>
    </div>
  )
}