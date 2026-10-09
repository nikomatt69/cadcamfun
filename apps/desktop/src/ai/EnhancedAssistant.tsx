/**
 * The full AI assistant UI (spec 06-desktop-ui.md §1 + spec 08-ai.md §3).
 *
 * Visual parity with the reference `CADAssistantOpenai` (legacy Next.js app).
 * The structure is the same three-row header — title + controls, tool
 * toggles, status indicators — sitting on a blue→indigo gradient with a
 * glassmorphism overlay. Below it: suggestions, the animated empty state,
 * the transcript, and the input row.
 *
 * nikcli is the AI base — the sidecar's `chatStream` endpoint streams the
 * events this component renders. `cadcamfun/AiCatalog` (Effect v4 service)
 * owns the typed client calls for status, models, and credentials.
 */
import { For, Show, batch, createEffect, createMemo, createSignal, createUniqueId, type JSX } from "solid-js"
import BookOpen from "lucide-solid/icons/book-open"
import Layers from "lucide-solid/icons/layers"
import Square from "lucide-solid/icons/square"
import Brain from "lucide-solid/icons/brain"
import LoaderCircle from "lucide-solid/icons/loader-circle"
import Send from "lucide-solid/icons/send"
import Sparkles from "lucide-solid/icons/sparkles"
import Trash2 from "lucide-solid/icons/trash-2"
import X from "lucide-solid/icons/x"
import BarChart3 from "lucide-solid/icons/chart-column"
import RefreshCw from "lucide-solid/icons/refresh-cw"
import Wrench from "lucide-solid/icons/wrench"
import ChevronDown from "lucide-solid/icons/chevron-down"
import KeyRound from "lucide-solid/icons/key-round"
import Copy from "lucide-solid/icons/copy"
import Plus from "lucide-solid/icons/plus"
import History from "lucide-solid/icons/history"
import Paperclip from "lucide-solid/icons/paperclip"
import { t } from "../i18n/index.ts"
import { ACCEPT, MAX_ATTACHMENTS, readAttachment, type ChatAttachment } from "./attachments.ts"
import { useAiStore } from "./context.tsx"
import { ContextGauge } from "./ContextGauge.tsx"
import { useApp } from "../state/context.ts"
import { AgentActivity } from "./AgentActivity.tsx"
import { SessionsPanel } from "./SessionsPanel.tsx"
import { ProviderBadge } from "./ProviderBadge.tsx"
import { ProviderSettings } from "./ProviderSettings.tsx"
import { SkillsSettings } from "./SkillsSettings.tsx"
import "./assistant.css"
import { EXTRA_TOOL_SUMMARIES, TOOL_IDS, TOOL_SUMMARIES, toolTitle } from "./tools.ts"
import { ToolRow } from "./ToolRow.tsx"
import { groupExploration, timelineOf } from "./timeline.ts"
import type { AiEvent as StreamEvent, AiMessage } from "./types.ts"

interface Props {
  readonly className?: string
  readonly onClose?: () => void
  readonly headerActions?: JSX.Element
}

const MAX_PROMPT = 4000

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
  const registeredTools = createMemo(() => ai.aiStatus()?.tools ?? [])
  const app = useApp()
  const [draft, setDraft] = createSignal("")
  const [files, setFiles] = createSignal<ReadonlyArray<ChatAttachment>>([])
  const [fileProblems, setFileProblems] = createSignal<ReadonlyArray<string>>([])
  let picker: HTMLInputElement | undefined
  const [showStats, setShowStats] = createSignal(false)
  const [showTools, setShowTools] = createSignal(false)
  const [showSessions, setShowSessions] = createSignal(false)
  const [showSkills, setShowSkills] = createSignal(false)
  const [showContext, setShowContext] = createSignal(false)
  const [followLatest, setFollowLatest] = createSignal(true)
  const promptId = createUniqueId()
  const [copiedId, setCopiedId] = createSignal<string | undefined>()
  let transcript: HTMLDivElement | undefined

  const running = (): boolean => ai.status() === "streaming" || ai.status() === "connecting"
  const toolCallCount = (): number => {
    let total = 0
    for (const message of ai.messages()) total += countToolCalls(message.events)
    return total
  }
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
  const elementCount = (): number => {
    const drawing = app.drawing()
    return drawing ? drawing.entities.length : 0
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

  const handleSend = async (delivery: "queue" | "steer" = "queue"): Promise<void> => {
    const text = draft().trim()
    if (text.length === 0 || text.length > MAX_PROMPT) return
    setFollowLatest(true)
    // While the agent works the message joins the running turn; files only go with a message that starts one.
    const busy = running()
    const attachments = busy ? [] : files()
    setDraft("")
    if (!busy) {
      setFiles([])
      setFileProblems([])
    }
    await ai.send(text, attachments, delivery)
  }

  const addFiles = async (list: FileList | null): Promise<void> => {
    if (list === null) return
    const problems: string[] = []
    const next = [...files()]
    for (const file of Array.from(list)) {
      if (next.length >= MAX_ATTACHMENTS) {
        problems.push(t("ai.attach.tooMany", { max: MAX_ATTACHMENTS }))
        break
      }
      const read = await readAttachment(file)
      if (read.ok) next.push(read.attachment)
      else problems.push(`${read.name}: ${read.reason}`)
    }
    batch(() => {
      setFiles(next)
      setFileProblems(problems)
    })
  }

  const handleKeyDown = (event: KeyboardEvent & { currentTarget: HTMLTextAreaElement }): void => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault()
      // Enter queues while the agent works; Ctrl/Cmd+Enter sends at once (nikcli: queue, or steer to interrupt and send now).
      void handleSend(running() && (event.metaKey || event.ctrlKey) ? "steer" : "queue")
    }
  }

  createEffect(() => {
    const last = ai.messages().at(-1)
    if (last && followLatest()) {
      queueMicrotask(() => {
        if (transcript && followLatest()) transcript.scrollTop = transcript.scrollHeight
      })
    }
  })

  return (
    <div
      class={`enhanced-assistant assistant-surface relative flex flex-col h-full overflow-hidden ${props.className ?? ""}`}
      data-testid="ai-assistant"
    >
      {/* --- Header: gradient + glassmorphism overlay (matches the
            reference's blue-500 → blue-600 → indigo-700 strip). --- */}
      <header
        class="assistant-header relative shrink-0 overflow-hidden"
      >
        <div class="ui-header-overlay rounded-t-2xl" />

        <div class="relative z-10 flex flex-col gap-2 px-3 py-3">
          {/* Row 1 — title and controls */}
          <div class="flex items-center justify-between gap-2">
            <div class="flex min-w-0 items-center gap-2">
              <div class="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm">
                <Sparkles size={16} aria-hidden="true" />
              </div>
              <div class="min-w-0">
                <h2 class="text-sm font-bold leading-tight tracking-tight ui-vibrancy">
                  {t("ai.title")}
                </h2>
                <p class="truncate text-[11px] text-blue-100/90 dark:text-gray-300/90">
                  {headerSubtitle()}
                </p>
              </div>
            </div>
            <div class="flex items-center gap-1">
              {props.headerActions}
              <Show when={props.onClose}>
                <button
                  type="button"
                  class="ui-press inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 p-1.5 backdrop-blur-sm transition-colors duration-[160ms] ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                  aria-label={t("ai.close")}
                  title={t("ai.close")}
                  onClick={() => props.onClose?.()}
                >
                  <X size={14} aria-hidden="true" />
                </button>
              </Show>
            </div>
          </div>

          <div class="assistant-nav" aria-label={t("ai.title")}>
            <button type="button" aria-expanded={showSessions()} aria-controls={`${promptId}-sessions`} data-testid="ai-sessions-toggle" onClick={() => setShowSessions(!showSessions())}>
              <History size={14} aria-hidden="true" />{t("ai.sessions.title")}<span>{sessionsCount()}</span>
            </button>
            <button type="button" aria-expanded={showTools()} aria-controls={`${promptId}-tools`} onClick={() => setShowTools(!showTools())}><Wrench size={14} aria-hidden="true" />{t("ai.tool.tools")}<span>{registeredTools().length}</span></button>
            <button type="button" aria-expanded={showSkills()} aria-controls={`${promptId}-skills`} onClick={() => setShowSkills(!showSkills())}><BookOpen size={14} aria-hidden="true" />{t("ai.skills.title")}</button>
            <button type="button" aria-expanded={showStats()} aria-controls={`${promptId}-stats`} onClick={() => setShowStats(!showStats())}><BarChart3 size={14} aria-hidden="true" />{t("ai.stats.usage")}</button>
          </div>
          <div class="assistant-status-line">
            <ProviderBadge />
            <span role="status" class="assistant-runtime-status" data-status={ai.status()}>
              <span aria-hidden="true" />{t(`ai.runtime.${ai.status()}`)}
            </span>
            <ContextGauge />
          </div>
        </div>
      </header>

      <Show when={showStats()}>
        <section id={`${promptId}-stats`} class="assistant-disclosure assistant-settings">
          <p class="text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-1">{t("ai.stats.title")}</p>
          <div class="grid grid-cols-3 gap-2 text-center text-xs">
            <div>
              <p class="font-medium text-gray-900 dark:text-gray-100">{ai.stats().exchanges}</p>
              <p class="text-gray-500">{t("ai.stats.exchanges")}</p>
            </div>
            <div>
              <p class="font-medium text-gray-900 dark:text-gray-100">{toolCallCount()}</p>
              <p class="text-gray-500">{t("ai.stats.toolCalls")}</p>
            </div>
            <div>
              <p class="font-medium text-gray-900 dark:text-gray-100">{formatTokens(ai.stats().totalInputTokens, ai.stats().totalOutputTokens)}</p>
              <p class="text-gray-500">{t("ai.stats.usage")}</p>
            </div>
          </div>
        </section>
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

      <AgentActivity />

      <div
        ref={transcript}
        class="assistant-transcript flex-1 overflow-y-auto"
        onScroll={(event) => {
          const el = event.currentTarget
          setFollowLatest(el.scrollHeight - el.scrollTop - el.clientHeight < 64)
        }}
        aria-live="polite"
        data-testid="ai-transcript"
      >
        <Show
          when={ai.messages().length > 0}
          fallback={
            /* --- Empty state (matches the reference: gradient icon in a
                  rounded square with a pulsing glow ring, then title + lede) --- */
            <div class="assistant-empty flex h-full flex-col items-center justify-center text-center">
              <div class="relative mb-6">
                <div class="assistant-emblem relative flex h-16 w-16 items-center justify-center rounded-2xl">
                  <Brain size={32} aria-hidden="true" class="text-white" />
                </div>
              </div>
              <div class="max-w-xs">
                <h3 class="mb-2 text-base font-bold text-gray-700 dark:text-gray-200">
                  {t("ai.empty.title")}
                </h3>
                <p class="text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                  {t("ai.empty.lede")}
                </p>
              </div>
              <Show when={ai.suggestions().length > 0}>
                <p class="mt-3 text-[11px] text-gray-400 dark:text-gray-500">
                  {t("ai.suggestions.empty")}
                </p>
              </Show>
            </div>
          }
        >
          <div class="space-y-3">
            <For each={ai.messages()}>
              {(message) => <MessageBubble message={message} onCopy={handleCopy} copiedId={copiedId()} />}
            </For>
            <For each={ai.pending()}>
              {(item) => (
                <article class="assistant-message ml-auto max-w-[90%] rounded border border-dashed border-blue-300 px-2 py-1.5 text-sm dark:border-blue-700" data-testid="ai-pending" data-delivery={item.delivery}>
                  <p class="mb-0.5 text-[10px] font-semibold uppercase text-blue-700 dark:text-blue-300">{item.delivery === "steer" ? t("ai.pending.steer") : t("ai.pending.queue")}</p>
                  <p class="whitespace-pre-wrap break-words">{item.text}</p>
                </article>
              )}
            </For>
          </div>
          <Show when={running()}>
            {/* --- Bouncing-dots processing card (Apple-spring feel: blue →
                  indigo → purple dots with staggered phases). --- */}
            <div class="mx-2 mt-3 rounded-xl border border-blue-200/50 bg-gradient-to-r from-blue-50/80 to-indigo-50/80 p-3 shadow-sm backdrop-blur-sm dark:border-gray-600/50 dark:from-gray-700/80 dark:to-gray-600/80">
              <div class="flex items-center gap-3">
                <div class="ui-dots" aria-label={t("ai.thinking")}>
                  <span /><span /><span />
                </div>
                <div class="flex flex-col">
                  <span class="text-xs font-medium text-gray-700 dark:text-gray-200">
                    {t("ai.thinking.processing")}
                  </span>
                  <span class="text-[11px] text-gray-500 dark:text-gray-400">
                    {t("ai.runtime.streaming")}
                  </span>
                </div>
              </div>
            </div>
          </Show>
           <Show when={ai.error() && !ai.messages().some((message) => message.error === ai.error())}>
            {(error) => (
              <div class="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-950/40">
                <p class="text-sm text-red-700 dark:text-red-300">{error()}</p>
              </div>
            )}
          </Show>
        </Show>
      </div>

      <ModelToolbar
        onClear={() => batch(() => { ai.clear(); setDraft("") })}
        showContext={showContext()}
        onToggleContext={() => setShowContext(!showContext())}
      />

      <Show when={showContext()}>
        <section class="assistant-disclosure assistant-settings" data-testid="ai-context-details">
          <h3>{t("ai.context.title")}</h3>
          <p>{t("ai.context.hint")}</p>
          <dl class="assistant-context-facts">
            <div><dt>{t("ai.context.workspace")}</dt><dd>{app.drawing()?.name ?? t("ai.header.noProject")}</dd></div>
            <div><dt>{t("ai.header.elements")}</dt><dd>{elementCount()}</dd></div>
            <div><dt>{t("ai.context.messages")}</dt><dd>{ai.messages().length}</dd></div>
            <div><dt>{t("ai.stats.usage")}</dt><dd>{formatTokens(ai.stats().totalInputTokens, ai.stats().totalOutputTokens)}</dd></div>
          </dl>
          <p>{t("ai.context.usageHint")}</p>
          <label class="assistant-context-toggle"><input type="checkbox" checked={ai.includeContext()} onChange={(event) => ai.setIncludeContext(event.currentTarget.checked)} />{t("ai.toolbar.context")}</label>
        </section>
      </Show>

      <Show when={showTools()}>
        <details id={`${promptId}-tools`} open class="assistant-disclosure assistant-settings">
          <summary class="font-semibold text-gray-700 dark:text-gray-300 cursor-pointer">{t("ai.tool.tools")} ({registeredTools().length})</summary>
          <p class="text-gray-500 mt-1">{t("ai.tool.toolsHint")}</p>
          <ul class="assistant-tool-catalogue">
            <For each={registeredTools()}>{(tool) => <li><span>{toolTitle(tool.id)}</span><code>{tool.id}</code><p>{tool.description}</p></li>}</For>
          </ul>
        </details>
      </Show>
      <Show when={showSessions()}>
        <div id={`${promptId}-sessions`} class="assistant-disclosure assistant-settings"><SessionsPanel /></div>
      </Show>
      <Show when={showSkills()}>
        <section id={`${promptId}-skills`} class="assistant-disclosure assistant-settings"><SkillsSettings /></section>
      </Show>

      <form
        class="assistant-composer"
        onSubmit={(event) => {
          event.preventDefault()
          void handleSend()
        }}
      >
        <label class="sr-only" for={promptId}>{t("ai.input.placeholder")}</label>
        <input
          ref={picker}
          type="file"
          multiple
          accept={ACCEPT}
          class="hidden"
          data-testid="ai-attach-input"
          onChange={(event) => {
            void addFiles(event.currentTarget.files)
            event.currentTarget.value = ""
          }}
        />
        <div class="assistant-compose-frame">
          <Show when={files().length > 0 || fileProblems().length > 0}>
            <ul class="mb-1 flex flex-wrap gap-1 text-[11px]" data-testid="ai-attachments">
              <For each={files()}>{(file) => (
                <li class="assistant-attachment inline-flex items-center gap-1">
                  <Paperclip size={10} aria-hidden="true" />
                   <span class="truncate" title={file.name}>{file.name}</span>
                  <button type="button" aria-label={t("ai.attach.remove", { name: file.name })} onClick={() => setFiles(files().filter((f) => f !== file))}>
                    <X size={10} aria-hidden="true" />
                  </button>
                </li>
              )}</For>
              <For each={fileProblems()}>{(problem) => <li class="rounded bg-red-100 px-2 py-0.5 text-red-700 dark:bg-red-950 dark:text-red-300">{problem}</li>}</For>
            </ul>
          </Show>
          <textarea
            id={promptId}
            class="assistant-prompt"
            rows={3}
            maxLength={MAX_PROMPT}
            placeholder={t("ai.input.placeholder")}
            value={draft()}
            onInput={(event) => {
              setDraft(event.currentTarget.value)
              event.currentTarget.style.height = "auto"
              event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 180)}px`
            }}
            onKeyDown={handleKeyDown}
            aria-describedby={`${promptId}-hint`}
          />
          <div class="assistant-compose-actions">
            <button type="button" class="assistant-icon-button" title={t("ai.attach.title")} aria-label={t("ai.attach.title")} disabled={running() || files().length >= MAX_ATTACHMENTS} onClick={() => picker?.click()}><Paperclip size={17} aria-hidden="true" /></button>
          <button type="button" class="assistant-context-chip" aria-pressed={ai.includeContext()} onClick={() => ai.setIncludeContext((current) => !current)} data-enabled={ai.includeContext()}><Layers size={13} aria-hidden="true" />{t(ai.includeContext() ? "ai.context.included" : "ai.context.excluded")}</button>
            <span class="assistant-character-count">{t("ai.input.charCount", { count: draft().length })}</span>
        <Show when={running()}>
          <button type="button" class="assistant-send assistant-stop" onClick={() => ai.abort()} data-testid="ai-stop">
            <Square size={13} aria-hidden="true" />
            {t("ai.stop")}
          </button>
          <button type="button" class="assistant-send" disabled={draft().trim().length === 0 || draft().length > MAX_PROMPT} onClick={() => void handleSend("steer")} title={t("ai.steer.title")} data-testid="ai-steer">
            {t("ai.steer")}
          </button>
        </Show>
        <button type="submit" class="assistant-send" disabled={draft().trim().length === 0 || draft().length > MAX_PROMPT} data-testid="ai-send">
          <Send size={14} aria-hidden="true" />
          {running() ? t("ai.queue") : t("ai.send")}
        </button>
          </div>
        </div>
        <div id={`${promptId}-hint`} class="assistant-composer-hint"><span>{t("ai.input.shortcut.hint")}</span><span>{t("ai.composer.brand")}</span></div>
      </form>
    </div>
  )
}

interface ModelToolbarProps {
  readonly showContext: boolean
  readonly onToggleContext: () => void
  readonly onClear: () => void
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
    <div class="assistant-model-toolbar">
      <div class="relative min-w-0 flex-1">
        <button
          type="button"
          class="assistant-model-trigger"
          aria-label={t("ai.model.label")}
          aria-expanded={open()}
          onClick={() => setOpen(!open())}
        >
          <Sparkles size={13} aria-hidden="true" /><span class="truncate" title={currentLabel()}>{currentLabel()}</span>
          <ChevronDown size={12} aria-hidden="true" class={open() ? "rotate-180 transition" : "transition"} />
        </button>
        <Show when={open()}>
          <ModelMenu onSelect={() => setOpen(false)} />
        </Show>
      </div>
      <div class="relative">
        <button
          type="button"
          class="assistant-icon-button"
          aria-label={t("ai.providers.title")}
          aria-expanded={showProviders()}
          data-testid="ai-providers-toggle"
          onClick={() => setShowProviders(!showProviders())}
        >
          <KeyRound size={14} aria-hidden="true" />
        </button>
        <Show when={showProviders()}>
          <div class="assistant-popover assistant-provider-popover" onKeyDown={(event) => { if (event.key === "Escape") setShowProviders(false) }}>
            <ProviderSettings />
          </div>
        </Show>
      </div>
      <div class="flex items-center gap-1 shrink-0">
        <button type="button" class="assistant-icon-button" title={t("ai.context.title")} aria-label={t("ai.context.title")} aria-expanded={props.showContext} onClick={props.onToggleContext}><Layers size={14} aria-hidden="true" /></button>
        <button type="button" class="assistant-icon-button" title={t("ai.sessions.newConversation")} aria-label={t("ai.sessions.newConversation")} disabled={ai.status() === "connecting" || ai.status() === "streaming"} onClick={() => ai.newSession()} data-testid="ai-new-conversation"><Plus size={16} aria-hidden="true" /></button>
        <button
          type="button"
          class="assistant-icon-button"
          aria-label={t("ai.toolbar.refresh")}
          onClick={() => ai.refresh()}
        >
          <RefreshCw size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          class="assistant-icon-button text-red-600"
          disabled={ai.status() === "connecting" || ai.status() === "streaming" || ai.messages().length === 0}
          aria-label={t("ai.clear")}
          onClick={props.onClear}
        >
          <Trash2 size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}

function ModelMenu(props: { readonly onSelect: () => void }): JSX.Element {
  const ai = useAiStore()
  const [search, setSearch] = createSignal("")
  const [provider, setProvider] = createSignal("")
  const [limit, setLimit] = createSignal(50)
  const available = createMemo(() => ai.models().filter((model) => model.configured))
  const providers = createMemo(() => [...new Set(available().map((model) => model.provider))].sort())
  const filtered = createMemo(() => {
    const query = search().trim().toLowerCase()
    return available().filter((model) => (!provider() || model.provider === provider()) && (!query || `${model.provider} ${model.id}`.toLowerCase().includes(query)))
  })
  return (
    <div class="assistant-popover" onKeyDown={(event) => { if (event.key === "Escape") props.onSelect() }}>
      <div class="sticky top-0 z-10 space-y-1 bg-white p-2 dark:bg-gray-900">
        <input type="search" aria-label="Search available models" placeholder="Search available models" class="w-full rounded border px-2 py-1 text-xs dark:bg-gray-900" value={search()} onInput={(event) => { setSearch(event.currentTarget.value); setLimit(50) }} />
        <select aria-label="Connected provider" class="w-full rounded border px-2 py-1 text-xs dark:bg-gray-900" value={provider()} onChange={(event) => { setProvider(event.currentTarget.value); setLimit(50) }}>
          <option value="">All connected providers</option>
          <For each={providers()}>{(id) => <option value={id}>{id}</option>}</For>
        </select>
      </div>
      <Show
        when={filtered().length > 0}
        fallback={
          <p class="px-3 py-2 text-xs text-gray-500">{t("ai.model.noModels")}</p>
        }
      >
        <ul class="divide-y divide-gray-100 dark:divide-gray-800">
          <For each={filtered().slice(0, limit())}>
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
                  <span class="flex-1 min-w-0">
                    <div class="truncate text-xs font-medium text-gray-900 dark:text-gray-100" title={model.id}>{model.id}</div>
                    <div class="text-[10px] text-gray-500">
                      {model.provider}
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
        <Show when={filtered().length > limit()}>
          <button type="button" class="w-full px-3 py-2 text-xs text-blue-600" onClick={() => setLimit((value) => value + 50)}>Show more ({filtered().length - limit()})</button>
        </Show>
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
  const segments = createMemo(() => groupExploration(timelineOf(props.message), (callId) => ai.toolCalls()[callId]?.status === "ok"))
  const duration = (): string | undefined => {
    const end = props.message.finishedAt
    if (end === undefined) return undefined
    const ms = Date.parse(end) - Date.parse(props.message.createdAt)
    return Number.isFinite(ms) && ms >= 0 ? (ms < 60_000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`) : undefined
  }
  const permissions = (): ReadonlyArray<StreamEvent> => props.message.events.filter((e) => e.type === "permission_request")
  const isUser = (): boolean => props.message.role === "user"

  return (
    <article class="assistant-message space-y-1.5" data-role={props.message.role}>
      <div class="flex items-center justify-between text-[10px] text-gray-500 uppercase">
        <span class="font-semibold">
          {props.message.role === "user" ? t("ai.message.user") : t("ai.message.assistant")}
        </span>
        <span>{formatTimestamp(props.message.createdAt)}</span>
      </div>
      <div class="space-y-1.5" classList={{ "ml-auto max-w-[90%]": isUser(), "mr-auto w-full": !isUser() }} data-testid="ai-timeline">
        <For each={segments()}>
          {(segment, index) => {
            const last = (): boolean => index() === segments().length - 1
            const streaming = (): boolean => props.message.status === "streaming"
            if (segment.kind === "reasoning") {
              return (
                <details class="rounded border border-gray-200 px-2 py-1 text-[11px] text-gray-500 dark:border-gray-700" open={streaming() && last()} data-testid="ai-thinking">
                  <summary class="cursor-pointer">{t("ai.thinking")}</summary>
                  <p class="mt-1 whitespace-pre-wrap italic">{segment.text}</p>
                </details>
              )
            }
            if (segment.kind === "text") {
              return (
                <div class="assistant-message-body text-sm whitespace-pre-wrap break-words">
                  {segment.text}
                  <Show when={streaming() && last()}>
                    <span class="ml-0.5 inline-block animate-pulse" aria-hidden="true">▍</span>
                  </Show>
                </div>
              )
            }
            if (segment.kind === "retry") {
              return <p class="text-xs text-amber-700 dark:text-amber-300" data-testid="ai-retry-row">↻ {t("ai.agent.retry", { n: segment.attempt })} · {segment.message}</p>
            }
            if (segment.kind === "group") {
              const titles = (): string => {
                const counts = new Map<string, number>()
                for (const c of segment.calls) counts.set(c.tool, (counts.get(c.tool) ?? 0) + 1)
                return [...counts].map(([tool, n]) => (n > 1 ? `${toolTitle(tool)} ×${n}` : toolTitle(tool))).join(", ")
              }
              return (
                <details class="pl-2 text-xs text-gray-600 dark:text-gray-400" data-testid="ai-tool-group">
                  <summary class="cursor-pointer">{t("ai.tool.explored", { count: segment.calls.length })}: {titles()}</summary>
                  <ul class="mt-1 space-y-1"><For each={segment.calls}>{(c) => <ToolRow tool={c.tool} call={ai.toolCalls()[c.callId]} projectId={ai.projectId()} />}</For></ul>
                </details>
              )
            }
            const call = createMemo(() => ai.toolCalls()[segment.callId])
            return <ul class="space-y-1 pl-2"><ToolRow tool={segment.tool} call={call()} projectId={ai.projectId()} /></ul>
          }}
        </For>
        <Show when={!isUser() && props.message.status !== "streaming" && (props.message.model || duration() || props.message.interrupted || props.message.usage)}>
          <p class="text-[10px] text-gray-500" data-testid="ai-turn-footer">
            ▣ {t("ai.message.assistant")}<Show when={props.message.model}> · {props.message.model}</Show><Show when={duration()}> · {duration()}</Show><Show when={props.message.usage}>{(usage) => <> · {usage().outputTokens} tok</>}</Show><Show when={props.message.interrupted}> · {t("ai.interrupted")}</Show>
          </p>
        </Show>
        <Show when={props.message.status === "streaming" && segments().length === 0}>
          <span class="inline-block animate-pulse text-sm" aria-hidden="true">▍</span>
        </Show>
        <Show when={(props.message.attachments?.length ?? 0) > 0}>
          <p class="mt-1 flex flex-wrap gap-1 text-[11px] text-blue-700 dark:text-blue-300" data-testid="message-attachments">
            <For each={props.message.attachments}>{(name) => <span class="inline-flex items-center gap-1"><Paperclip size={10} aria-hidden="true" />{name}</span>}</For>
          </p>
        </Show>
        <Show when={props.message.status === "error" && props.message.error && props.message.error !== props.message.text}>
          <p class="mt-1 text-xs text-red-600 dark:text-red-400">{props.message.error}</p>
        </Show>
      </div>

      <Show when={permissions().length > 0}>
        <ul class="space-y-1 pl-2">
          <For each={permissions()}>
            {(event) => {
               if (event.type !== "permission_request") return null
               const pending = () => ai.permissions().some((permission) => permission.requestId === event.requestId)
               return (
                 <Show when={pending()}><li class="assistant-permission flex flex-wrap items-center gap-2 text-xs text-amber-700 dark:text-amber-400" data-testid="permission">
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
                 </li></Show>
              )
            }}
          </For>
        </ul>
      </Show>

      <div class="flex items-center gap-1 pl-2">
        <button
          type="button"
          class="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-700"
          disabled={props.message.text.length === 0}
          onClick={() => props.onCopy(props.message.text, props.message.id)}
        >
          <Copy size={10} aria-hidden="true" />
          {props.copiedId === props.message.id ? t("ai.message.copied") : t("ai.message.copy")}
        </button>
      </div>
    </article>
  )
}
