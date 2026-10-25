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
 * This file is the composition root: it owns the state the bands share (the
 * draft, the attachments, which disclosure is open, the command palette) and
 * wires the parts together. The parts themselves live next door.
 *
 * nikcli is the AI base — the sidecar's `chatStream` endpoint streams the
 * events this component renders. `cadcamfun/AiCatalog` (Effect v4 service)
 * owns the typed client calls for status, models, and credentials.
 */
import { For, Show, batch, createMemo, createSignal, type JSX } from "solid-js"
import BarChart3 from "lucide-solid/icons/chart-column"
import BookOpen from "lucide-solid/icons/book-open"
import History from "lucide-solid/icons/history"
import KeyRound from "lucide-solid/icons/key-round"
import Layers from "lucide-solid/icons/layers"
import Plus from "lucide-solid/icons/plus"
import Plug from "lucide-solid/icons/plug"
import RefreshCw from "lucide-solid/icons/refresh-cw"
import ScrollText from "lucide-solid/icons/scroll-text"
import Sparkles from "lucide-solid/icons/sparkles"
import Trash2 from "lucide-solid/icons/trash-2"
import Wrench from "lucide-solid/icons/wrench"
import X from "lucide-solid/icons/x"
import { AssistantHeader, type HeaderItem } from "./AssistantHeader.tsx"
import { AssistantControlError, AssistantPermissions, AssistantQuestions } from "./AssistantControls.tsx"
import { AssistantComposer, MAX_PROMPT } from "./AssistantComposer.tsx"
import { AssistantPanels } from "./AssistantPanels.tsx"
import { AssistantTranscript } from "./AssistantTranscript.tsx"
import { AgentActivity } from "./AgentActivity.tsx"
import { ContextDialog } from "./ContextDialog.tsx"
import { t } from "../../../i18n/index.ts"
import { toast } from "../../../shared/ui/toast.tsx"
import { copyText } from "../../../shared/lib/clipboard.ts"
import { saveFile } from "../../../shared/lib/save-file.ts"
import { MAX_ATTACHMENTS, readAttachment, type ChatAttachment } from "../lib/attachments.ts"
import { useAiStore } from "../store/context.tsx"
import { useApp } from "../../../shared/state/context.ts"
import { useDocumentStore } from "../../cad/store/documentStore.ts"
import { useElementsStore } from "../../cad/store/elementsStore.ts"
import {
  findCommand,
  isCommandDraft,
  parseCommand,
  searchCommands,
  type CommandHost,
  type SlashCommand
} from "../lib/commands.ts"
import { nextPanel, type PanelId } from "../lib/panels.ts"
import { createCompletion } from "../lib/completion.ts"
import "../styles/assistant.css"

interface Props {
  readonly className?: string
  readonly onClose?: () => void
  readonly headerActions?: JSX.Element
}

export function EnhancedAssistant(props: Props): JSX.Element {
  const ai = useAiStore()
  const registeredTools = createMemo(() => ai.aiStatus()?.tools ?? [])
  const app = useApp()
  const document = useDocumentStore()
  const elements = useElementsStore()
  const [draft, setDraft] = createSignal("")
  const [files, setFiles] = createSignal<ReadonlyArray<ChatAttachment>>([])
  const [fileProblems, setFileProblems] = createSignal<ReadonlyArray<string>>([])
  const [panel, setPanel] = createSignal<PanelId | undefined>()
  const [copiedId, setCopiedId] = createSignal<string | undefined>()
  /** True while the composer draft is a slash command, so the palette owns the keyboard. */
  const [paletteOpen, setPaletteOpen] = createSignal(false)
  const [commandIndex, setCommandIndex] = createSignal(0)
  /** Whether the transcript follows the newest turn; the user scrolling away turns it off. */
  const [followLatest, setFollowLatest] = createSignal(true)

  /** The host's suggestion for what is being typed; Tab takes it. */
  const completion = createCompletion({
    prompt: draft,
    complete: async (text) => {
      const model = ai.model()
      const reply = await app.runtime.run(app.client.ai.completion({ payload: { prompt: text, ...(model === undefined ? {} : { model: model.model }) } }))
      return reply.text
    }
  })

  /** What the user is looking for in the conversation. */
  const [query, setQuery] = createSignal("")

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
     return t("ai.header.meta", { name, count: elements.elements.length })
  }

  const handleCopy = async (text: string, id: string): Promise<void> => {
    try {
      await copyText(text)
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

  const notify = (message: string, tone: "info" | "error" = "info"): void => {
    if (tone === "error") toast.error(message)
    else toast.success(message)
  }

  /** Writes the conversation to a Markdown file the user chooses where to put. */
  const saveTranscript = async (): Promise<void> => {
    const { transcriptMarkdown } = await import("../lib/transcript-markdown.ts")
    const markdown = transcriptMarkdown(ai)
    if (markdown === "") throw new Error("The conversation is empty")
    const title = ai.sessions().find((session) => session.id === ai.sessionId())?.title ?? "conversation"
    const name = `${title.replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/^-+|-+$/g, "").toLowerCase() || "conversation"}.md`
    const saved = await saveFile({ name, data: markdown, mime: "text/markdown" })
    if (!saved) throw new Error("The transcript was not saved")
    toast.success(t("ai.export.saved", { name }))
  }

  const commandHost: CommandHost = {
    ai,
    send: (prompt) => handleSend("queue", prompt),
    setDraft: (next) => { setDraft(next); setCommandIndex(0) },
    togglePanel: (wanted) => setPanel((current) => nextPanel(current, wanted)),
    notify,
    search: (text) => setQuery(text),
    loadOlder: () => { void ai.loadOlderMessages() },
    regenerate: () => { void ai.regenerate() },
    saveTranscript
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
  }

  /** Prefills a command from the `/help` reference and returns focus to the composer. */
  const insertCommand = (name: string): void => {
    setDraft(`/${name} `)
    setPaletteOpen(false)
    setCommandIndex(0)
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
    if (event.key === "Tab" && !event.shiftKey && completion.suggestion() !== undefined) {
      // The host's suggestion for what is being typed.
      event.preventDefault()
      const accepted = completion.accept()
      if (accepted !== undefined) setDraft(`${draft()}${accepted}`)
      return
    }
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault()
      // Enter queues while the agent works; Ctrl/Cmd+Enter sends at once (nikcli: queue, or steer to interrupt and send now).
      void submitDraft(running() && (event.metaKey || event.ctrlKey) ? "steer" : "queue")
    }
  }

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
      active: panel() === "sessions",
      run: () => setPanel((current) => nextPanel(current, "sessions"))
    },
    {
      id: "context",
      label: t("ai.context.title"),
      icon: <Layers size={15} aria-hidden="true" />,
      active: panel() === "context",
      run: () => setPanel((current) => nextPanel(current, "context"))
    }
  ])

  const headerItems = createMemo((): ReadonlyArray<HeaderItem> => [
    { id: "extensions", label: t("ai.extensions.title"), icon: <Plug size={15} aria-hidden="true" />, active: panel() === "extensions", run: () => setPanel((current) => nextPanel(current, "extensions")) },
    {
      id: "tools",
      label: t("ai.tool.tools"),
      icon: <Wrench size={15} aria-hidden="true" />,
      count: registeredTools().length,
      active: panel() === "tools",
      run: () => setPanel((current) => nextPanel(current, "tools"))
    },
    {
      id: "catalog",
      label: t("ai.catalog.title"),
      icon: <ScrollText size={15} aria-hidden="true" />,
      active: panel() === "catalog",
      run: () => setPanel((current) => nextPanel(current, "catalog"))
    },
    {
      id: "skills",
      label: t("ai.skills.title"),
      icon: <BookOpen size={15} aria-hidden="true" />,
      active: panel() === "skills",
      run: () => setPanel((current) => nextPanel(current, "skills"))
    },
    {
      id: "stats",
      label: t("ai.toolbar.statistics"),
      icon: <BarChart3 size={15} aria-hidden="true" />,
      active: panel() === "stats",
      run: () => setPanel((current) => nextPanel(current, "stats"))
    },
    {
      id: "providers",
      label: t("ai.providers.title"),
      icon: <KeyRound size={15} aria-hidden="true" />,
      active: panel() === "providers",
      disabled: busy(),
      run: () => setPanel((current) => nextPanel(current, "providers"))
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
        onOpenContext={() => setPanel("context")}
      />

      <AssistantPanels panel={panel()} onRunCommand={insertCommand} />

      <AgentActivity />
      <AssistantQuestions />

      <AssistantTranscript
        onCopy={handleCopy}
        copiedId={copiedId()}
        onOpenProviders={() => setPanel("providers")}
        onOpenContext={() => setPanel("context")}
        onRegenerate={() => void ai.regenerate()}
        onUseSuggestion={(prompt) => setDraft(prompt)}
        headerMeta={headerMeta()}
        followLatest={followLatest()}
        onFollowLatest={setFollowLatest}
        query={query()}
        onQuery={setQuery}
      />

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
                    onClick={() => setDraft(suggestion.prompt)}
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

      {/* The dock is its own box, outside the scrolling transcript: it keeps its size while the conversation moves. */}
      <div class="assistant-dock" data-testid="ai-dock">
      <AssistantPermissions />
      <AssistantControlError />

      <AssistantComposer
        draft={draft()}
        onDraft={(next) => {
          setDraft(next)
          setPaletteOpen(isCommandDraft(next))
          setCommandIndex(0)
        }}
        files={files()}
        fileProblems={fileProblems()}
        onRemoveFile={(file) => setFiles(files().filter((f) => f !== file))}
        onFiles={(list) => void addFiles(list)}
        onSend={(delivery) => void submitDraft(delivery)}
        onOpenContext={() => setPanel("context")}
        onOpenProviders={() => setPanel("providers")}
        paletteOpen={paletteOpen()}
        commands={matches()}
        activeCommand={activeCommand()}
        onHighlightCommand={(id) => {
          const index = matches().findIndex((command) => command.name === id)
          if (index >= 0) setCommandIndex(index)
        }}
        onSelectCommand={(command) => {
          if (command.args !== undefined) insertCommand(command.name)
          else void executeCommand(command.name, "")
        }}
        onKeyDown={handleKeyDown}
        onOpenPalette={insertSlash}
        onClosePalette={closePalette}
        completion={completion.suggestion()}
      />
      </div>

      <Show when={panel() === "context"}>
        <ContextDialog onClose={() => setPanel(undefined)} />
      </Show>
    </div>
  )
}

const countToolCalls = (events: ReadonlyArray<{ readonly type: string }>): number =>
  events.reduce((n, e) => (e.type === "tool_call" ? n + 1 : n), 0)
