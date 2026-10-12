/**
 * The docked, streaming AI panel (spec 06-desktop-ui.md §1).
 *
 * WP8 (the AI layer) has not landed, so the panel talks to an injected `onSend` that
 * returns an async iterable of deltas — the same shape an SSE endpoint will produce.
 * That keeps the streaming UI (partial text, a typing indicator, a stop button) real and
 * testable today, and swapping in the real endpoint later is a one-line change at the
 * call site rather than a rewrite of the component.
 */
import { For, Show, createSignal, type JSX } from "solid-js"
import { createEffect } from "solid-js"
import LoaderCircle from "lucide-solid/icons/loader-circle"
import Send from "lucide-solid/icons/send"
import Sparkles from "lucide-solid/icons/sparkles"
import Trash2 from "lucide-solid/icons/trash-2"
import X from "lucide-solid/icons/x"
import { t } from "../../../i18n/index.ts"

export interface AiMessage {
  readonly id: string
  readonly role: "user" | "assistant"
  /** The assistant's text so far; grows as deltas arrive. */
  readonly text: string
}

export interface AiPanelProps {
  readonly open: boolean
  readonly messages: ReadonlyArray<AiMessage>
  readonly streaming: boolean
  /** Starts a turn; yields the assistant's text delta by delta. */
  readonly onSend: (prompt: string, signal: AbortSignal) => AsyncIterable<string>
  readonly onClose: () => void
  readonly onClear: () => void
}

let sequence = 0
const nextId = (): string => {
  sequence += 1
  return `msg-${sequence}`
}

export function AiPanel(props: AiPanelProps): JSX.Element {
  const [draft, setDraft] = createSignal("")
  const [turn, setTurn] = createSignal<{ readonly messages: ReadonlyArray<AiMessage> }>({
    messages: props.messages
  })
  const [running, setRunning] = createSignal(false)
  const [log, setLog] = createSignal<Array<{ readonly level: "info" | "warn"; readonly text: string }>>([])

  // The shell owns the messages (it restores them from the route); follow it.
  createEffect(() => {
    if (!running()) setTurn({ messages: props.messages })
  })

  let controller: AbortController | undefined
  let transcript: HTMLDivElement | undefined

  // Follow the stream so a long answer does not need the user to scroll.
  createEffect(() => {
    const text = turn().messages.map((message) => message.text).join("")
    if (transcript !== undefined && running()) transcript.scrollTop = transcript.scrollHeight
    return text
  })

  const submit = async (): Promise<void> => {
    const prompt = draft().trim()
    if (prompt.length === 0 || running()) return
    const assistantId = nextId()
    setDraft("")
    setRunning(true)
    setTurn({
      messages: [
        ...turn().messages,
        { id: nextId(), role: "user", text: prompt },
        { id: assistantId, role: "assistant", text: "" }
      ]
    })
    controller = new AbortController()
    try {
      for await (const delta of props.onSend(prompt, controller.signal)) {
        setTurn((current) => ({
          messages: current.messages.map((message) =>
            message.id === assistantId ? { ...message, text: message.text + delta } : message
          )
        }))
      }
    } catch (error) {
      // A failed turn is reported in the panel rather than thrown: the rest of the app
      // keeps working, and the user can see what went wrong.
      setLog((current) => [
        ...current,
        { level: "warn", text: error instanceof Error ? error.message : String(error) }
      ])
    } finally {
      setRunning(false)
      controller = undefined
    }
  }

  const stop = (): void => {
    controller?.abort()
    setRunning(false)
  }

  return (
    <Show when={props.open}>
      <aside
        class="flex w-96 shrink-0 flex-col border-l border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"
        aria-label={t("ai.title")}
      >
        <header class="flex items-center gap-2 border-b border-gray-200 px-3 py-2 dark:border-gray-700">
          <Sparkles size={16} aria-hidden="true" class="text-blue-600" />
          <h2 class="text-sm font-semibold">{t("ai.title")}</h2>
          <button
            type="button"
            class="ml-auto rounded p-1 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:bg-gray-700"
            aria-label={t("ai.clear")}
            onClick={() => props.onClear()}
          >
            <Trash2 size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            class="rounded p-1 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:bg-gray-700"
            aria-label={t("ai.close")}
            onClick={() => props.onClose()}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </header>

        <div ref={transcript} class="flex-1 space-y-3 overflow-y-auto p-3" aria-live="polite">
          <Show
            when={turn().messages.length > 0}
            fallback={<p class="text-sm text-gray-500">{t("ai.empty")}</p>}
          >
            <For each={turn().messages}>
              {(message) => (
                <div class="ai-message-content">
                  <p class="text-xs font-semibold uppercase text-gray-500">
                    {message.role === "user" ? t("ai.you") : t("ai.assistant")}
                  </p>
                  <p
                    class="whitespace-pre-wrap rounded-lg px-3 py-2 text-sm"
                    classList={{
                      "bg-blue-50 dark:bg-blue-900/30": message.role === "user",
                      "bg-gray-100 dark:bg-gray-700": message.role === "assistant"
                    }}
                  >
                    {message.text}
                    <Show when={running() && message.role === "assistant"}>
                      <span class="ml-1 inline-block animate-pulse" aria-hidden="true">
                        ▍
                      </span>
                    </Show>
                  </p>
                </div>
              )}
            </For>
          </Show>
          <Show when={running()}>
            <p class="flex items-center gap-2 text-xs text-gray-500">
              <LoaderCircle size={14} aria-hidden="true" class="animate-spin" />
              {t("ai.thinking")}
            </p>
          </Show>
          <For each={log()}>
            {(entry) => (
              <p class="text-xs text-red-600 dark:text-red-400" role="alert">
                {entry.text}
              </p>
            )}
          </For>
        </div>

        <form
          class="flex items-end gap-2 border-t border-gray-200 p-2 dark:border-gray-700"
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <label class="sr-only" for="ai-prompt">
            {t("ai.placeholder")}
          </label>
          <textarea
            id="ai-prompt"
            class="form-textarea min-h-10 flex-1 resize-none"
            rows={2}
            placeholder={t("ai.placeholder")}
            value={draft()}
            onInput={(event) => setDraft(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault()
                void submit()
              }
            }}
          />
          <Show
            when={running()}
            fallback={
              <button type="submit" class="btn btn-primary" disabled={draft().trim().length === 0}>
                <Send size={16} aria-hidden="true" />
                {t("ai.send")}
              </button>
            }
          >
            <button type="button" class="btn btn-outline" onClick={stop}>
              {t("common.cancel")}
            </button>
          </Show>
        </form>
      </aside>
    </Show>
  )
}
