/**
 * The full AI assistant UI (spec 06-desktop-ui.md §1 + spec 08-ai.md §3).
 *
 * The shell is three bands: a thin floating bar that rides over the
 * conversation and gets out of the way while the user reads a long answer,
 * the transcript itself, and one composer that carries the per-turn controls
 * as a quiet row of chips. Everything that is not needed while talking —
 * conversations, tools, skills, statistics, context, providers, refresh,
 * clear — hangs off the bar's overflow menu.
 *
 * nikcli is the AI base — the sidecar's `chatStream` endpoint streams the
 * events this component renders. `cadcamfun/AiCatalog` (Effect v4 service)
 * owns the typed client calls for status, models, and credentials.
 */
import { For, Show, batch, createEffect, createMemo, createResource, createSignal, createUniqueId, onCleanup, onMount, type JSX } from "solid-js"
import { useNavigate } from "@solidjs/router"
import BookOpen from "lucide-solid/icons/book-open"
import Layers from "lucide-solid/icons/layers"
import Square from "lucide-solid/icons/square"
import Brain from "lucide-solid/icons/brain"
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
import Check from "lucide-solid/icons/check"
import Bot from "lucide-solid/icons/bot"
import Plus from "lucide-solid/icons/plus"
import History from "lucide-solid/icons/history"
import Paperclip from "lucide-solid/icons/paperclip"
import Terminal from "lucide-solid/icons/terminal"
import FolderOpen from "lucide-solid/icons/folder-open"
import Monitor from "lucide-solid/icons/monitor"
import Smartphone from "lucide-solid/icons/smartphone"
import Settings2 from "lucide-solid/icons/settings-2"
import { t } from "../../../i18n/index.ts"
import { toast } from "../../../shared/ui/toast.tsx"
import { ACCEPT, MAX_ATTACHMENTS, readAttachment, type ChatAttachment } from "../lib/attachments.ts"
import { useAiStore } from "../store/context.tsx"
import { AssistantHeader, type HeaderItem } from "./AssistantHeader.tsx"
import { AssistantControlError, AssistantControls, AssistantQuestions } from "./AssistantControls.tsx"
import { useApp } from "../../../shared/state/context.ts"
import { useDocumentStore } from "../../cad/store/documentStore.ts"
import { AgentActivity } from "./AgentActivity.tsx"
import { SessionsPanel } from "./SessionsPanel.tsx"
import { ProviderSettings } from "./ProviderSettings.tsx"
import { SkillsSettings } from "./SkillsSettings.tsx"
import "../styles/assistant.css"
import { toolTitle } from "../lib/tools.ts"
import { ToolRow } from "./ToolRow.tsx"
import { groupExploration, timelineOf } from "../lib/timeline.ts"
import { CommandHelp } from "./CommandHelp.tsx"
import { CommandPalette } from "./CommandPalette.tsx"
import {
  findCommand,
  isCommandDraft,
  parseCommand,
  searchCommands,
  type CommandHost,
  type SlashCommand
} from "../lib/commands.ts"
import type { AiEvent as StreamEvent, AiMessage } from "../lib/types.ts"

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
  const document = useDocumentStore()
  const [draft, setDraft] = createSignal("")
  const [files, setFiles] = createSignal<ReadonlyArray<ChatAttachment>>([])
  const [fileProblems, setFileProblems] = createSignal<ReadonlyArray<string>>([])
  let picker: HTMLInputElement | undefined
  const [showStats, setShowStats] = createSignal(false)
  const [showTools, setShowTools] = createSignal(false)
  const [showSessions, setShowSessions] = createSignal(false)
  const [showSkills, setShowSkills] = createSignal(false)
  const [showContext, setShowContext] = createSignal(false)
  const [showProviders, setShowProviders] = createSignal(false)
  const [showHelp, setShowHelp] = createSignal(false)
  const [followLatest, setFollowLatest] = createSignal(true)
  const promptId = createUniqueId()
  const [copiedId, setCopiedId] = createSignal<string | undefined>()
  /** True while the composer draft is a slash command, so the palette owns the keyboard. */
  const [paletteOpen, setPaletteOpen] = createSignal(false)
  const [commandIndex, setCommandIndex] = createSignal(0)
  let transcript: HTMLDivElement | undefined
  let composer: HTMLTextAreaElement | undefined

  const running = (): boolean => ai.status() === "streaming" || ai.status() === "connecting"
  const busy = (): boolean => ai.status() === "connecting" || ai.status() === "streaming"
  const toolCallCount = (): number => {
    let total = 0
    for (const message of ai.messages()) total += countToolCalls(message.events)
    return total
  }
  const sessionsCount = (): number => ai.sessions().length

  /** The thin bar's workspace line: what the assistant is looking at, right now. */
  const headerMeta = (): string => {
    const drawing = app.drawing()
    const name = document.name ?? drawing.name
    return t("ai.header.meta", { name, count: drawing.entities.length })
  }
  const elementCount = (): number => {
    const drawing = app.drawing()
    return drawing ? drawing.entities.length : 0
  }

  const scrollToLatest = (): void => {
    if (transcript === undefined) return
    transcript.scrollTop = transcript.scrollHeight
  }

  const handleScroll = (el: HTMLDivElement): void => {
    setFollowLatest(el.scrollHeight - el.scrollTop - el.clientHeight < 64)
  }

  createEffect(() => {
    const last = ai.messages().at(-1)
    if (last && followLatest()) queueMicrotask(scrollToLatest)
  })

  /** Conversations and context: reachable in one click, without opening a menu. */
  const quickItems = createMemo((): ReadonlyArray<HeaderItem> => [
    {
      id: "new",
      label: t("ai.sessions.newConversation"),
      icon: <Plus size={15} aria-hidden="true" />,
      primary: true,
      disabled: busy(),
      run: () => ai.newSession()
    },
    {
      id: "sessions",
      label: t("ai.sessions.title"),
      icon: <History size={15} aria-hidden="true" />,
      count: sessionsCount(),
      active: showSessions(),
      run: () => setShowSessions(!showSessions())
    },
    {
      id: "context",
      label: t("ai.context.title"),
      icon: <Layers size={15} aria-hidden="true" />,
      active: showContext(),
      run: () => setShowContext(!showContext())
    }
  ])

  const headerItems = createMemo((): ReadonlyArray<HeaderItem> => [
    {
      id: "tools",
      label: t("ai.tool.tools"),
      icon: <Wrench size={15} aria-hidden="true" />,
      count: registeredTools().length,
      active: showTools(),
      run: () => setShowTools(!showTools())
    },
    {
      id: "skills",
      label: t("ai.skills.title"),
      icon: <BookOpen size={15} aria-hidden="true" />,
      active: showSkills(),
      run: () => setShowSkills(!showSkills())
    },
    {
      id: "stats",
      label: t("ai.toolbar.statistics"),
      icon: <BarChart3 size={15} aria-hidden="true" />,
      active: showStats(),
      run: () => setShowStats(!showStats())
    },
    {
      id: "providers",
      label: t("ai.providers.title"),
      icon: <KeyRound size={15} aria-hidden="true" />,
      active: showProviders(),
      disabled: busy(),
      run: () => setShowProviders(!showProviders())
    },
    {
      id: "refresh",
      label: t("ai.toolbar.refresh"),
      icon: <RefreshCw size={15} aria-hidden="true" />,
      disabled: busy(),
      run: () => ai.refresh()
    },
    {
      id: "clear",
      label: t("ai.clear"),
      icon: <Trash2 size={15} aria-hidden="true" />,
      danger: true,
      disabled: busy() || ai.messages().length === 0,
      run: () => batch(() => { ai.clear(); setDraft("") })
    }
  ])

  const handleCopy = async (text: string, id: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId(id)
      setTimeout(() => setCopiedId((current) => (current === id ? undefined : current)), 1500)
    } catch {
      setCopiedId(undefined)
    }
  }

  const handleSend = async (delivery: "queue" | "steer" = "queue", explicit?: string): Promise<void> => {
    const text = (explicit ?? draft()).trim()
    if (text.length === 0 || text.length > MAX_PROMPT) return
    setFollowLatest(true)
    // While the agent works the message joins the running turn; files only go with a message that starts one.
    const working = running()
    const attachments = working ? [] : files()
    setDraft("")
    if (!working) {
      setFiles([])
      setFileProblems([])
    }
    await ai.send(text, attachments, delivery)
  }

  /* --- Slash commands ------------------------------------------------------
     A `/` at the start of the composer is never sent to the model: it is
     resolved against the registry in `commands.ts`. A command either acts on
     the assistant — through the store, and so through the typed sidecar client
     — or hands back a brief the user then sends. */

  const togglePanel = (panel: "sessions" | "tools" | "skills" | "stats" | "context" | "help"): void => {
    batch(() => {
      setShowSessions(panel === "sessions" ? !showSessions() : false)
      setShowTools(panel === "tools" ? !showTools() : false)
      setShowSkills(panel === "skills" ? !showSkills() : false)
      setShowStats(panel === "stats" ? !showStats() : false)
      setShowContext(panel === "context" ? !showContext() : false)
      setShowHelp(panel === "help" ? !showHelp() : false)
    })
  }

  const notify = (message: string, tone: "info" | "error" = "info"): void => {
    if (tone === "error") toast.error(message)
    else toast.success(message)
  }

  const commandHost: CommandHost = {
    ai,
    send: (prompt) => handleSend("queue", prompt),
    setDraft: (next) => { setDraft(next); setCommandIndex(0) },
    togglePanel,
    notify
  }

  /** Runs one command. A refused argument keeps the draft so it can be corrected. */
  const executeCommand = async (name: string, args: string): Promise<void> => {
    const command = findCommand(name)
    if (command === undefined) {
      notify(t("ai.cmd.unknown"), "error")
      return
    }
    const outcome = await command.run({ args, host: commandHost })
    closePalette()
    if (outcome.kind === "prompt") {
      await handleSend("queue", outcome.prompt)
      return
    }
    if (outcome.kind === "rejected") notify(t(outcome.reason as never), "error")
    else setDraft("")
  }

  const matches = createMemo<ReadonlyArray<SlashCommand>>(() => (paletteOpen() ? searchCommands(draft().slice(1)) : []))
  const activeCommand = createMemo<SlashCommand | undefined>(() => matches()[commandIndex()])

  const openPalette = (): void => {
    setPaletteOpen(true)
    setCommandIndex(0)
  }

  const closePalette = (): void => {
    if (!paletteOpen()) return
    setPaletteOpen(false)
    setCommandIndex(0)
  }

  const moveCommand = (delta: number): void => {
    const total = matches().length
    if (total === 0) return
    setCommandIndex((current) => (current + delta + total) % total)
  }

  /** Tab completes the highlighted command so an argument can be typed after it. */
  const completeCommand = (): void => {
    const command = activeCommand()
    if (command === undefined) return
    setDraft(`/${command.name} `)
    setPaletteOpen(false)
    setCommandIndex(0)
  }

  /** The `/` button: opens the palette with an empty query. */
  const insertSlash = (): void => {
    setDraft("/")
    openPalette()
    queueMicrotask(() => composer?.focus())
  }

  /** Prefills a command from the `/help` reference and returns focus to the composer. */
  const insertCommand = (name: string): void => {
    setDraft(`/${name} `)
    setPaletteOpen(false)
    setCommandIndex(0)
    queueMicrotask(() => composer?.focus())
  }

  /** Enter runs a command when the draft names one; anything else is a message. */
  const submitDraft = async (delivery: "queue" | "steer" = "queue"): Promise<void> => {
    const parsed = parseCommand(draft())
    if (parsed !== undefined && findCommand(parsed.name) !== undefined) {
      await executeCommand(parsed.name, parsed.args)
      return
    }
    closePalette()
    await handleSend(delivery)
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
    if (paletteOpen()) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault()
        moveCommand(event.key === "ArrowDown" ? 1 : -1)
        return
      }
      if (event.key === "Tab") {
        event.preventDefault()
        completeCommand()
        return
      }
      if (event.key === "Escape") {
        event.preventDefault()
        closePalette()
        return
      }
      if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
        event.preventDefault()
        const parsed = parseCommand(draft())
        const exact = parsed === undefined ? undefined : findCommand(parsed.name)
        const command = exact ?? activeCommand()
        if (command !== undefined) void executeCommand(command.name, exact === undefined ? "" : parsed?.args ?? "")
        return
      }
    }
    if (event.key === "Escape" && running() && draft().length === 0) {
      event.preventDefault()
      ai.abort()
      return
    }
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault()
      // Enter queues while the agent works; Ctrl/Cmd+Enter sends at once (nikcli: queue, or steer to interrupt and send now).
      void submitDraft(running() && (event.metaKey || event.ctrlKey) ? "steer" : "queue")
    }
  }

  return (
    <div
      class={`enhanced-assistant assistant-surface relative flex flex-col h-full overflow-hidden ${props.className ?? ""}`}
      data-testid="ai-assistant"
    >
      <AssistantHeader
        meta={headerMeta()}
        quick={quickItems()}
        items={headerItems()}
        headerActions={props.headerActions}
        onClose={props.onClose}
      />
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

      <Show when={showSessions()}>
        <div id={`${promptId}-sessions`} class="assistant-disclosure"><SessionsPanel /></div>
      </Show>
      <Show when={showProviders()}>
        <section id={`${promptId}-providers`} class="assistant-disclosure assistant-settings">
          <ProviderSettings />
        </section>
      </Show>
      <Show when={showSkills()}>
        <section id={`${promptId}-skills`} class="assistant-disclosure assistant-settings"><SkillsSettings /></section>
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
      <Show when={showContext()}>
        <section id={`${promptId}-context`} class="assistant-disclosure assistant-settings" data-testid="ai-context-details">
          <h3>{t("ai.context.title")}</h3>
          <p>{t("ai.context.hint")}</p>
          <dl class="assistant-context-facts">
            <div><dt>{t("ai.context.workspace")}</dt><dd>{app.drawing()?.name ?? t("ai.header.noProject")}</dd></div>
            <div><dt>{t("ai.header.elements")}</dt><dd>{elementCount()}</dd></div>
            <div><dt>{t("ai.context.messages")}</dt><dd>{ai.messages().length}</dd></div>
            <div><dt>{t("ai.stats.usage")}</dt><dd>{formatTokens(ai.stats().totalInputTokens, ai.stats().totalOutputTokens)}</dd></div>
          </dl>
          <p>{t("ai.context.usageHint")}</p>
          <button data-testid="ai-compact" type="button" class="rounded border px-3 py-1 text-xs" disabled={running() || ai.controlBusy() || !ai.sessionId() || ai.tasks().some((task) => task.status === "queued" || task.status === "running")} onClick={() => void ai.compact()}>{t(ai.controlBusy() ? "ai.controls.compacting" : "ai.controls.compact")}</button>
          <Show when={ai.hostContext()}>{(context) => <p class="mt-2 text-xs">{t("ai.controls.contextPolicy", { threshold: context().compactAt?.toLocaleString() ?? t("ai.context.gauge.unknown"), output: context().requestOutput?.toLocaleString() ?? t("ai.context.gauge.unknown") })}</p>}</Show>
          <Show when={ai.hostContext()?.memory}>{(memory) => <div class="mt-2"><p class="text-xs">{t("ai.controls.memoryPolicy", { hours: memory().minHours, sessions: memory().minSessions, count: memory().sessionsSinceLastBrain })}</p><button type="button" class="rounded border px-3 py-1 text-xs" disabled={running() || ai.controlBusy() || !memory().enabled || ai.tasks().some((task) => task.status === "queued" || task.status === "running")} onClick={() => void ai.consolidateMemory()}>{t("ai.controls.learnMemory")}</button></div>}</Show>
        </section>
      </Show>
      <Show when={showHelp()}>
        <section id={`${promptId}-help`} class="assistant-disclosure assistant-settings">
          <CommandHelp onRun={insertCommand} />
        </section>
      </Show>

      <AgentActivity />
      <AssistantQuestions />

      <div class="relative flex min-h-0 flex-1 flex-col">
        <div
          ref={transcript}
          class="assistant-transcript flex-1 overflow-y-auto"
          onScroll={(event) => handleScroll(event.currentTarget)}
          aria-live="polite"
          data-testid="ai-transcript"
        >
          <Show
            when={ai.messages().length > 0}
            fallback={
              /* --- Empty state: the mark, the promise, then the lede. --- */
              <div class="assistant-empty flex h-full flex-col items-center justify-center text-center">
                <div class="relative mb-6">
                  <div class="assistant-emblem" aria-hidden="true">
                    <Terminal size={20} />
                  </div>
                </div>
                <div class="assistant-empty-copy">
                  <h3 class="mb-2 text-base font-bold text-gray-700 dark:text-gray-200">
                    {t("ai.empty.title")}
                  </h3>
                  <p class="text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                    {t("ai.empty.lede")}
                  </p>
                </div>
                <Show when={ai.suggestions().length > 0}>
                  <ul class="assistant-empty-suggestions" data-testid="proactive-suggestions">
                    <For each={ai.suggestions().slice(0, 3)}>
                      {(suggestion) => (
                        <li class="assistant-suggestion-toast">
                          <button
                            type="button"
                            class="assistant-suggestion-toast-main"
                            onClick={() => {
                              setDraft(suggestion.prompt)
                              queueMicrotask(() => composer?.focus())
                            }}
                            title={suggestion.description}
                          >
                            <span class="assistant-suggestion-toast-icon"><Sparkles size={13} aria-hidden="true" /></span>
                            <span class="assistant-suggestion-toast-copy">
                              <strong>{suggestion.title}</strong>
                              <small>{suggestion.description}</small>
                            </span>
                          </button>
                          <button
                            type="button"
                            class="assistant-suggestion-toast-close"
                            aria-label={t("ai.suggestions.dismiss")}
                            onClick={() => ai.dismissSuggestion(suggestion.id)}
                          >
                            <X size={11} aria-hidden="true" />
                          </button>
                        </li>
                      )}
                    </For>
                  </ul>
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
              <div class="assistant-thinking-card">
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
        <Show when={!followLatest() && ai.messages().length > 0}>
          <button
            type="button"
            class="assistant-jump-latest"
            aria-label={t("ai.transcript.latest")}
            title={t("ai.transcript.latest")}
            data-testid="ai-jump-latest"
            onClick={() => {
              setFollowLatest(true)
              scrollToLatest()
            }}
          >
            <ChevronDown size={14} aria-hidden="true" />
          </button>
        </Show>
      </div>

      <Show when={ai.messages().length > 0 && ai.suggestions().length > 0 && !running()}>
        <section class="assistant-suggestions" data-testid="proactive-suggestions">
          <p class="assistant-section-label"><Sparkles size={10} aria-hidden="true" /> {t("ai.suggestions.title")}</p>
          <ul>
            <For each={ai.suggestions().slice(0, 3)}>
              {(suggestion) => (
                <li class="assistant-suggestion">
                  <button
                    type="button"
                    class="assistant-suggestion-label"
                    onClick={() => {
                      setDraft(suggestion.prompt)
                      queueMicrotask(() => composer?.focus())
                    }}
                    title={suggestion.description}
                  >
                    <span class="assistant-suggestion-toast-icon"><Sparkles size={12} aria-hidden="true" /></span>
                    <span class="assistant-suggestion-toast-copy">
                      <strong>{suggestion.title}</strong>
                      <small>{suggestion.description}</small>
                    </span>
                  </button>
                  <button
                    type="button"
                    class="assistant-suggestion-dismiss"
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

      <AssistantControlError />

      <form
        class="assistant-composer"
        onSubmit={(event) => {
          event.preventDefault()
          void submitDraft()
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
        <Show when={paletteOpen()}>
          <CommandPalette
            draft={draft()}
            activeId={activeCommand()?.name}
            onHighlight={(id) => {
              const index = matches().findIndex((command) => command.name === id)
              if (index >= 0) setCommandIndex(index)
            }}
            onSelect={(command) => {
              if (command.args !== undefined) insertCommand(command.name)
              else void executeCommand(command.name, "")
            }}
          />
        </Show>
        <div class="assistant-compose-frame" data-command={paletteOpen() ? "true" : undefined}>
          <AssistantScopeBar />
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
            ref={composer}
            id={promptId}
            class="assistant-prompt"
            rows={2}
            maxLength={MAX_PROMPT}
            placeholder={t("ai.input.placeholder")}
            value={draft()}
            onInput={(event) => {
              const next = event.currentTarget.value
              setDraft(next)
              setPaletteOpen(isCommandDraft(next))
              setCommandIndex(0)
              event.currentTarget.style.height = "auto"
              event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 180)}px`
            }}
            onKeyDown={handleKeyDown}
            aria-describedby={`${promptId}-hint`}
          />
          <div class="assistant-compose-actions">
            <button
              type="button"
              class="assistant-icon-button assistant-attach"
              title={t("ai.attach.title")}
              aria-label={t("ai.attach.title")}
              disabled={running() || files().length >= MAX_ATTACHMENTS}
              onClick={() => picker?.click()}
            >
              <Plus size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              class="assistant-icon-button assistant-command-button"
              title={t("ai.commands.hint")}
              aria-label={t("ai.commands.open")}
              aria-expanded={paletteOpen()}
              data-testid="ai-command-toggle"
              onClick={() => {
                if (paletteOpen()) closePalette()
                else insertSlash()
              }}
            >
              <Terminal size={15} aria-hidden="true" />
              <span aria-hidden="true">/</span>
            </button>
            <AssistantControls />
            <div class="assistant-compose-tail">
              <ModelChip />
              <button
                type="button"
                class="assistant-context-chip"
                aria-pressed={ai.includeContext()}
                onClick={() => ai.setIncludeContext((current) => !current)}
                data-enabled={ai.includeContext()}
                title={t("ai.toolbar.context")}
              >
                <Layers size={13} aria-hidden="true" />
                <span class="sr-only">{t("ai.toolbar.context")}</span>
                <Show when={ai.includeContext()}><span class="assistant-context-dot" aria-hidden="true" /></Show>
              </button>
              <Show when={draft().length > 0}>
                <span class="assistant-character-count" data-over={draft().length > MAX_PROMPT}>{t("ai.input.charCount", { count: draft().length })}</span>
              </Show>
              <Show when={running()}>
                <button
                  type="button"
                  class="assistant-send assistant-send-icon assistant-stop"
                  onClick={() => ai.abort()}
                  data-testid="ai-stop"
                  title={t("ai.stop")}
                  aria-label={t("ai.stop")}
                >
                  <Square size={12} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  class="assistant-send"
                  disabled={draft().trim().length === 0 || draft().length > MAX_PROMPT}
                  onClick={() => void handleSend("steer")}
                  title={t("ai.steer.title")}
                  data-testid="ai-steer"
                >
                  {t("ai.steer")}
                </button>
              </Show>
              <button
                type="submit"
                class="assistant-send assistant-send-icon"
                disabled={draft().trim().length === 0 || draft().length > MAX_PROMPT}
                data-testid="ai-send"
                title={running() ? t("ai.queue") : t("ai.send")}
                aria-label={running() ? t("ai.queue") : t("ai.send")}
              >
                <Send size={14} aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
        <div id={`${promptId}-hint`} class="assistant-composer-hint">
          <span>{running() ? t("ai.input.stopHint") : t("ai.input.shortcut.hint")}</span>
          <span>{t("ai.composer.brand")}</span>
        </div>
      </form>
    </div>
  )
}

/** The model picker, as a composer chip: the name is the label, the chevron the affordance. */
function ModelChip(): JSX.Element {
  const ai = useAiStore()
  const [open, setOpen] = createSignal(false)
  const currentLabel = (): string => {
    const m = ai.model()
    if (m === undefined) return t("ai.model.label")
    return `${m.provider}/${m.model}`
  }

  return (
    <div class="assistant-chip-root">
      <button
        type="button"
        class="assistant-chip assistant-chip-model"
        aria-label={t("ai.model.label")}
        aria-expanded={open()}
        title={currentLabel()}
        onClick={() => setOpen(!open())}
      >
        <span class="assistant-chip-icon" aria-hidden="true"><Sparkles size={13} /></span>
        <span class="assistant-chip-value">{currentLabel()}</span>
        <ChevronDown size={12} aria-hidden="true" class={open() ? "rotate-180 transition" : "transition"} />
      </button>
      <Show when={open()}>
        <ModelMenu onSelect={() => setOpen(false)} />
      </Show>
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
        <input type="search" aria-label={t("ai.model.search")} placeholder={t("ai.model.search")} class="w-full rounded border px-2 py-1 text-xs dark:bg-gray-900" value={search()} onInput={(event) => { setSearch(event.currentTarget.value); setLimit(50) }} />
        <select aria-label={t("ai.model.provider")} class="w-full rounded border px-2 py-1 text-xs dark:bg-gray-900" value={provider()} onChange={(event) => { setProvider(event.currentTarget.value); setLimit(50) }}>
          <option value="">{t("ai.model.allProviders")}</option>
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
          <button type="button" class="w-full px-3 py-2 text-xs text-blue-600" onClick={() => setLimit((value) => value + 50)}>{t("ai.model.showMore", { count: filtered().length - limit() })}</button>
        </Show>
      </Show>
    </div>
  )
}

interface ScopeProject {
  readonly id: string
  readonly name: string
  readonly drawings: ReadonlyArray<{ readonly id: string; readonly name: string }>
}

interface ScopeDevice {
  readonly id: string
  readonly name: string
  readonly lastSeen: string | null
}

/** Real project/drawing and companion-device data, kept in the composer's context rail. */
function AssistantScopeBar(): JSX.Element {
  const app = useApp()
  const document = useDocumentStore()
  const navigate = useNavigate()
  const [scopeOpen, setScopeOpen] = createSignal(false)
  const [projects] = createResource(async (): Promise<ReadonlyArray<ScopeProject>> => {
    try {
      const rows = await app.runtime.run(app.client.projects.list()) as ReadonlyArray<{ readonly id: string; readonly name: string }>
      return await Promise.all(rows.map(async (project) => ({
        ...project,
        drawings: await app.runtime.run(app.client.drawings.listForProject({ params: { id: project.id } })) as ReadonlyArray<{ readonly id: string; readonly name: string }>
      })))
    } catch {
      return []
    }
  })
  const [devices] = createResource(async (): Promise<{ readonly enabled: boolean; readonly devices: ReadonlyArray<ScopeDevice> }> => {
    try {
      const status = await app.runtime.run(app.client.companion.status())
      return { enabled: status.enabled, devices: status.devices }
    } catch {
      return { enabled: false, devices: [] }
    }
  })

  const drawingValue = (): string => document.drawingId ?? ""
  const scopeLabel = createMemo(() => {
    if (!document.drawingId) return document.name ?? t("ai.composer.unsavedDrawing", { name: app.drawing().name })
    for (const project of projects() ?? []) {
      const drawing = project.drawings.find((candidate) => candidate.id === document.drawingId)
      if (drawing) return t("ai.composer.drawingInProject", { drawing: drawing.name, project: project.name })
    }
    return document.name ?? app.drawing().name
  })
  const selectDrawing = (value: string): void => {
    if (value === "") return
    const [kind, id] = value.split(":", 2)
    if (!id) return
    app.setActivity(kind === "drawing" ? "cad" : "projects")
    navigate(kind === "drawing" ? `/cad?drawingId=${encodeURIComponent(id)}` : `/projects/${encodeURIComponent(id)}`)
  }

  onMount(() => {
    const dismiss = (event: PointerEvent): void => {
      if (!(event.target as Element | null)?.closest?.(".assistant-scope-control-root")) setScopeOpen(false)
    }
    const escape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setScopeOpen(false)
    }
    globalThis.document.addEventListener("pointerdown", dismiss)
    globalThis.document.addEventListener("keydown", escape)
    onCleanup(() => {
      globalThis.document.removeEventListener("pointerdown", dismiss)
      globalThis.document.removeEventListener("keydown", escape)
    })
  })

  return (
    <div class="assistant-compose-scope" aria-label={t("ai.composer.scope")}>
      <div class="assistant-scope-control-root">
        <button
          type="button"
          class="assistant-scope-control"
          title={t("ai.composer.drawingTitle")}
          aria-label={t("ai.composer.drawing")}
          aria-haspopup="listbox"
          aria-expanded={scopeOpen()}
          onClick={() => setScopeOpen((open) => !open)}
        >
          <FolderOpen size={14} aria-hidden="true" />
          <span class="assistant-scope-label">{scopeLabel()}</span>
          <ChevronDown size={12} aria-hidden="true" />
        </button>
        <Show when={scopeOpen()}>
          <div class="assistant-scope-menu" role="listbox" aria-label={t("ai.composer.drawing")}>
            <button
              type="button"
              role="option"
              aria-selected={drawingValue() === ""}
              class="assistant-scope-option"
              classList={{ "is-active": drawingValue() === "" }}
              onClick={() => setScopeOpen(false)}
            >
              <span class="assistant-scope-check">{drawingValue() === "" ? <Check size={13} aria-hidden="true" /> : null}</span>
              <span>{document.name ?? t("ai.composer.unsavedDrawing", { name: app.drawing().name })}</span>
            </button>
            <For each={projects()}>
              {(project) => (
                <section class="assistant-scope-group">
                  <p>{project.name}</p>
                  <For
                    each={project.drawings}
                    fallback={
                      <button type="button" role="option" aria-selected="false" class="assistant-scope-option" onClick={() => { selectDrawing(`project:${project.id}`); setScopeOpen(false) }}>
                        <span class="assistant-scope-check" />
                        <span>{t("ai.composer.openProject", { name: project.name })}</span>
                      </button>
                    }
                  >
                    {(drawing) => {
                      const active = (): boolean => drawing.id === drawingValue()
                      return (
                        <button
                          type="button"
                          role="option"
                          aria-selected={active()}
                          class="assistant-scope-option"
                          classList={{ "is-active": active() }}
                          onClick={() => { selectDrawing(`drawing:${drawing.id}`); setScopeOpen(false) }}
                        >
                          <span class="assistant-scope-check">{active() ? <Check size={13} aria-hidden="true" /> : null}</span>
                          <span>{t("ai.composer.drawingInProject", { drawing: drawing.name, project: project.name })}</span>
                        </button>
                      )
                    }}
                  </For>
                </section>
              )}
            </For>
          </div>
        </Show>
      </div>

      <details class="assistant-device-control">
        <summary title={t("ai.composer.deviceTitle")}>
          <Monitor size={14} aria-hidden="true" />
          <span>{t("ai.composer.thisComputer")}</span>
          <Show when={(devices()?.devices.length ?? 0) > 0}>
            <span class="assistant-device-count">{devices()?.devices.length}</span>
          </Show>
          <ChevronDown size={12} aria-hidden="true" />
        </summary>
        <div class="assistant-device-menu">
          <p class="assistant-device-menu-title">{t("ai.composer.executionDevice")}</p>
          <div class="assistant-device-row is-active">
            <Monitor size={14} aria-hidden="true" />
            <span><strong>{t("ai.composer.thisComputer")}</strong><small>{t("ai.composer.executionHost")}</small></span>
            <Check size={13} aria-hidden="true" />
          </div>
          <For each={devices()?.devices ?? []}>
            {(device) => (
              <div class="assistant-device-row">
                <Smartphone size={14} aria-hidden="true" />
                <span>
                  <strong>{device.name}</strong>
                  <small>{device.lastSeen ? t("ai.composer.lastSeen", { when: new Date(device.lastSeen).toLocaleString() }) : t("ai.composer.pairedCompanion")}</small>
                </span>
              </div>
            )}
          </For>
          <button type="button" class="assistant-device-manage" onClick={() => navigate("/settings/companion")}>
            <Settings2 size={13} aria-hidden="true" />
            {t("ai.composer.manageDevices")}
          </button>
        </div>
      </details>
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
            if (segment.kind === "diagnostic") {
              return <div class="rounded border border-current/20 px-2 py-1 text-xs" classList={{ "text-red-700 dark:text-red-300": segment.severity === "error", "text-amber-700 dark:text-amber-300": segment.severity === "warning" }} data-testid="ai-tool-diagnostic" data-tool={segment.tool} data-severity={segment.severity}>
                <p class="font-medium">{segment.tool}</p><p class="whitespace-pre-wrap">{segment.message}</p>
                <Show when={segment.recovery}><p class="mt-1 whitespace-pre-wrap">{segment.recovery}</p></Show>
              </div>
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
          <p class="flex flex-wrap items-center gap-x-1 text-[10px] text-gray-500" data-testid="ai-turn-footer">
            <Bot size={10} aria-hidden="true" />{t("ai.message.assistant")}<Show when={props.message.model}> · {props.message.model?.replace(/^~/, "")}</Show><Show when={duration()}> · {duration()}</Show><Show when={props.message.usage}>{(usage) => <> · {usage().outputTokens} tok</>}</Show><Show when={props.message.interrupted}> · {t("ai.interrupted")}</Show>
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
          title={t("ai.message.copyTitle")}
          onClick={() => props.onCopy(props.message.text, props.message.id)}
        >
          {props.copiedId === props.message.id ? <Check size={10} aria-hidden="true" /> : <Copy size={10} aria-hidden="true" />}
          {props.copiedId === props.message.id ? t("ai.message.copied") : t("ai.message.copy")}
        </button>
      </div>
    </article>
  )
}
