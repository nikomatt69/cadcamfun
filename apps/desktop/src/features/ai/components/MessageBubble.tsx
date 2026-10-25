/**
 * One message of the conversation: what was asked, what was answered, and
 * everything that happened in between.
 *
 * The answer is not only text. The stream carries the agent's reasoning, the
 * tools it called, the diagnostics the host sent and the retries it made, and
 * they are shown in the order they happened — the way nikcli's session view and
 * Claude Code do. This component is that rendering; it was the second half of
 * the assistant's main file.
 */
import { For, Index, Show, createEffect, createMemo, createSignal, type JSX } from "solid-js"
import Bot from "lucide-solid/icons/bot"
import Check from "lucide-solid/icons/check"
import CircleGauge from "lucide-solid/icons/circle-gauge"
import Copy from "lucide-solid/icons/copy"
import Paperclip from "lucide-solid/icons/paperclip"
import RefreshCw from "lucide-solid/icons/refresh-cw"
import ThumbsDown from "lucide-solid/icons/thumbs-down"
import ThumbsUp from "lucide-solid/icons/thumbs-up"
import { t } from "../../../i18n/index.ts"
import { groupExploration, timelineOf, type GroupedSegment } from "../lib/timeline.ts"
import { renderAssistantMarkdown } from "../lib/markdown.ts"
import { toolTitle } from "../lib/tools.ts"
import { isProviderError } from "../lib/error-kind.ts"
import { TaskCard } from "./TaskCard.tsx"
import { ToolRow } from "./ToolRow.tsx"
import { isTaskStart } from "../lib/task-card.ts"
import { useAiStore } from "../store/context.tsx"
import type { AiEvent as StreamEvent, AiMessage } from "../lib/types.ts"

const formatTimestamp = (iso: string): string => {
  try {
    const date = new Date(iso)
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  } catch {
    return ""
  }
}

/** Turn-footer token counts: exact while small, compact once they grow ("14k tok"). */
const compactTokens = (value: number): string => {
  if (value < 1000) return `${value}`
  if (value < 10000) return `${(value / 1000).toFixed(1)}k`
  if (value < 1000000) return `${Math.round(value / 1000)}k`
  return `${(value / 1000000).toFixed(1)}M`
}

export interface MessageBubbleProps {
  readonly message: AiMessage
  readonly onCopy: (text: string, id: string) => void
  readonly copiedId: string | undefined
  readonly onOpenProviders: () => void
  readonly onRegenerate: () => void
}

export function MessageBubble(props: MessageBubbleProps): JSX.Element {
  const ai = useAiStore()
  const timeline = createMemo(() => timelineOf(props.message))
  const segments = createMemo(() => groupExploration(timeline(), (callId) => ai.toolCalls()[callId]?.status === "ok"))
  const duration = (): string | undefined => {
    const end = props.message.finishedAt
    if (end === undefined) return undefined
    const ms = Date.parse(end) - Date.parse(props.message.createdAt)
    return Number.isFinite(ms) && ms >= 0 ? (ms < 60_000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`) : undefined
  }
  const isUser = (): boolean => props.message.role === "user"
  const rating = (): "up" | "down" | undefined => ai.feedback()[props.message.id]

  return (
    <article class="assistant-message" data-role={props.message.role}>
      <div class="assistant-message-header">
        <span class="font-semibold">
          {props.message.role === "user" ? t("ai.message.user") : t("ai.message.assistant")}
        </span>
        <span>{formatTimestamp(props.message.createdAt)}</span>
      </div>
      <div class="assistant-timeline" classList={{ "is-user": isUser(), "is-assistant": !isUser() }} data-testid="ai-timeline">
        <Index each={segments()}>
          {(segment, index) => {
            const last = (): boolean => index === segments().length - 1
            const streaming = (): boolean => props.message.status === "streaming"
            // Immutable deltas replace segment values. Keep the row mounted until its kind changes.
            return <Show when={segment().kind} keyed>{(kind) => {
              if (kind === "reasoning") {
                const current = () => segment() as Extract<GroupedSegment, { kind: "reasoning" }>
                let body: HTMLParagraphElement | undefined
                // While it streams, the thought shows its newest lines.
                createEffect(() => {
                  void current().text
                  if (body !== undefined && streaming()) body.scrollTop = body.scrollHeight
                })
                return (
                  <details class="assistant-reasoning" open={streaming() && last()} data-testid="ai-thinking">
                    <summary class="assistant-reasoning-summary">{t("ai.thinking")}</summary>
                    <p ref={body} class="assistant-reasoning-body">{current().text}</p>
                  </details>
                )
              }
              if (kind === "text") {
                const current = () => segment() as Extract<GroupedSegment, { kind: "text" }>
                const text = createMemo(() => current().text)
                return (
                  <div class="assistant-message-body break-words" classList={{ "whitespace-pre-wrap": isUser() }}>
                    <Show when={!isUser()} fallback={text()}>
                      <div class="assistant-markdown" data-testid="ai-markdown" innerHTML={renderAssistantMarkdown(text())} />
                    </Show>
                    <Show when={streaming() && last()}>
                      <span class="ml-0.5 inline-block animate-pulse" aria-hidden="true">▍</span>
                    </Show>
                  </div>
                )
              }
              if (kind === "retry") {
                const current = () => segment() as Extract<GroupedSegment, { kind: "retry" }>
                return <p class="assistant-retry-row" data-testid="ai-retry-row">↻ {t("ai.agent.retry", { n: current().attempt })} · {current().message}</p>
              }
              if (kind === "diagnostic") {
                const current = () => segment() as Extract<GroupedSegment, { kind: "diagnostic" }>
                return (
                  <div class="assistant-diagnostic-card" data-testid="ai-tool-diagnostic" data-tool={current().tool} data-severity={current().severity}>
                    <p class="font-medium">{current().tool}</p>
                    <p class="whitespace-pre-wrap">{current().message}</p>
                    <Show when={current().recovery}><p class="mt-1 whitespace-pre-wrap assistant-meta-text">{current().recovery}</p></Show>
                  </div>
                )
              }
              if (kind === "group") {
                const current = () => segment() as Extract<GroupedSegment, { kind: "group" }>
                const titles = (): string => {
                  const counts = new Map<string, number>()
                  for (const c of current().calls) counts.set(c.tool, (counts.get(c.tool) ?? 0) + 1)
                  return [...counts].map(([tool, n]) => (n > 1 ? `${toolTitle(tool)} ×${n}` : toolTitle(tool))).join(", ")
                }
                return (
                  <details class="assistant-tool-group" data-testid="ai-tool-group">
                    <summary class="assistant-tool-group-summary">{t("ai.tool.explored", { count: current().calls.length })}: {titles()}</summary>
                    <ul class="assistant-tool-group-list"><Index each={current().calls}>{(c) => {
                      const call = createMemo(() => ai.toolCalls()[c().callId])
                      return <ToolRow tool={c().tool} call={call()} projectId={ai.projectId()} />
                    }}</Index></ul>
                  </details>
                )
              }
              const current = () => segment() as Extract<GroupedSegment, { kind: "tool" }>
              const call = createMemo(() => ai.toolCalls()[current().callId])
              // A delegated task is a card that follows the host's record of it, not a one-line tool row.
              return (
                <ul class="assistant-tool-list">
                  <Show when={isTaskStart(call())} fallback={<ToolRow tool={current().tool} call={call()} projectId={ai.projectId()} />}>
                    <TaskCard call={call()!} />
                  </Show>
                </ul>
              )
            }}</Show>
          }}
        </Index>
        <Show when={!isUser() && props.message.status !== "streaming" && (props.message.model || duration() || props.message.interrupted || props.message.usage)}>
          <p class="assistant-turn-footer" data-testid="ai-turn-footer">
            <Bot size={10} aria-hidden="true" />{t("ai.message.assistant")}<Show when={props.message.model}> · {props.message.model?.replace(/^~/, "")}</Show><Show when={duration()}> · {duration()}</Show><Show when={props.message.usage}>{(usage) => <> · {compactTokens(usage().outputTokens)} tok</>}</Show><Show when={props.message.interrupted}> · {t("ai.interrupted")}</Show>
          </p>
        </Show>
        <Show when={props.message.status === "streaming" && segments().length === 0}>
          <span class="inline-block animate-pulse text-sm" aria-hidden="true">▍</span>
        </Show>
        <Show when={(props.message.attachments?.length ?? 0) > 0}>
          <p class="assistant-message-attachments" data-testid="message-attachments">
            <For each={props.message.attachments}>{(name) => <span class="assistant-attachment-pill"><Paperclip size={10} aria-hidden="true" />{name}</span>}</For>
          </p>
        </Show>
        <Show when={props.message.status === "error" && props.message.error && props.message.error !== props.message.text}>
          <div class="assistant-enterprise-card mt-2" role="alert">
            <div class="assistant-enterprise-card-head">
              <CircleGauge size={15} class="assistant-coral-icon" aria-hidden="true" />
              <span class="assistant-enterprise-card-title">{t("ai.runtime.error")}</span>
            </div>
            <div class="assistant-enterprise-card-body">
              <p>{props.message.error}</p>
              <Show when={isProviderError(props.message.error ?? "")}>
                <div class="assistant-card-actions">
                  <button type="button" class="assistant-btn assistant-btn-secondary" onClick={() => void ai.refresh()}>
                    {t("ai.toolbar.refresh")}
                  </button>
                  <button type="button" class="assistant-btn assistant-btn-primary" onClick={() => props.onOpenProviders()}>
                    {t("ai.providers.title")}
                  </button>
                </div>
              </Show>
            </div>
          </div>
        </Show>
      </div>

      <div class="assistant-message-actions" classList={{ "is-user": isUser() }}>
        <button
          type="button"
          class="assistant-copy-btn"
          disabled={props.message.text.length === 0}
          title={t("ai.message.copyTitle")}
          onClick={() => props.onCopy(props.message.text, props.message.id)}
        >
          {props.copiedId === props.message.id ? <Check size={10} aria-hidden="true" /> : <Copy size={10} aria-hidden="true" />}
          {props.copiedId === props.message.id ? t("ai.message.copied") : t("ai.message.copy")}
        </button>
        <Show when={!isUser() && props.message.status !== "streaming"}>
          <FeedbackButtons messageId={props.message.id} rating={rating()} />
          <button
            type="button"
            class="assistant-copy-btn"
            title={t("ai.message.regenerate")}
            data-testid="ai-regenerate"
            onClick={() => props.onRegenerate()}
          >
            <RefreshCw size={10} aria-hidden="true" />
            {t("ai.message.regenerate")}
          </button>
        </Show>
      </div>
    </article>
  )
}

/**
 * Was this answer any good? The host keeps the rating, the desktop remembers it
 * so the buttons show what was already said.
 */
function FeedbackButtons(props: { readonly messageId: string; readonly rating: "up" | "down" | undefined }): JSX.Element {
  const ai = useAiStore()
  const [commenting, setCommenting] = createSignal(false)
  const [comment, setComment] = createSignal("")
  const rate = (rating: "up" | "down"): void => {
    void ai.rateMessage(props.messageId, rating).catch(() => undefined)
  }
  const send = (): void => {
    const text = comment().trim()
    if (text === "") { setCommenting(false); return }
    void ai.rateMessage(props.messageId, props.rating ?? "down", text).catch(() => undefined)
    setComment("")
    setCommenting(false)
  }
  return (
    <span class="assistant-feedback" data-testid="ai-feedback">
      <button
        type="button"
        class="assistant-copy-btn"
        classList={{ "is-active": props.rating === "up" }}
        aria-pressed={props.rating === "up"}
        title={t("ai.feedback.up")}
        data-testid="ai-feedback-up"
        onClick={() => rate("up")}
      >
        <ThumbsUp size={10} aria-hidden="true" />
        {t("ai.feedback.up")}
      </button>
      <button
        type="button"
        class="assistant-copy-btn"
        classList={{ "is-active": props.rating === "down" }}
        aria-pressed={props.rating === "down"}
        title={t("ai.feedback.down")}
        data-testid="ai-feedback-down"
        onClick={() => { rate("down"); setCommenting(true) }}
      >
        <ThumbsDown size={10} aria-hidden="true" />
        {t("ai.feedback.down")}
      </button>
      <Show when={commenting()}>
        <input
          class="assistant-field assistant-feedback-comment"
          aria-label={t("ai.feedback.comment")}
          placeholder={t("ai.feedback.comment")}
          maxLength={1000}
          value={comment()}
          data-testid="ai-feedback-comment"
          onInput={(event) => setComment(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") { event.preventDefault(); send() }
            if (event.key === "Escape") { event.preventDefault(); setCommenting(false) }
          }}
        />
        <button type="button" class="assistant-btn-xs" data-testid="ai-feedback-send" onClick={send}>{t("ai.feedback.send")}</button>
      </Show>
    </span>
  )
}
