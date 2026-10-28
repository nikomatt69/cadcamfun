/**
 * The conversation itself: what was said, what happened, and the way back to
 * the latest turn.
 *
 * It was the middle of the assistant's main file, along with the empty state,
 * the thinking card and the scroll handling. It is on its own now; the scroll
 * rule (follow the newest turn unless the user scrolled away) stays where it
 * belongs, with the transcript.
 */
import { For, Index, Show, createEffect, createMemo, createSignal, onCleanup, type JSX } from "solid-js"
import ChevronDown from "lucide-solid/icons/chevron-down"
import CircleGauge from "lucide-solid/icons/circle-gauge"
import Search from "lucide-solid/icons/search"
import Sparkles from "lucide-solid/icons/sparkles"
import X from "lucide-solid/icons/x"
import { t } from "../../../i18n/index.ts"
import { MessageBubble } from "./MessageBubble.tsx"
import { filterMessages } from "../lib/search.ts"
import { useAiStore } from "../store/context.tsx"

export interface AssistantTranscriptProps {
  readonly onCopy: (text: string, id: string) => void
  readonly copiedId: string | undefined
  readonly onOpenProviders: () => void
  readonly onOpenContext: () => void
  readonly onRegenerate: () => void
  readonly onUseSuggestion: (prompt: string) => void
  readonly headerMeta: string
  /** Whether the transcript follows the newest turn. The user scrolling away turns it off. */
  readonly followLatest: boolean
  readonly onFollowLatest: (next: boolean) => void
  /** What the user is looking for in the conversation. */
  readonly query: string
  readonly onQuery: (next: string) => void
}

export function AssistantTranscript(props: AssistantTranscriptProps): JSX.Element {
  const ai = useAiStore()
  const query = (): string => props.query
  const setQuery = (next: string): void => props.onQuery(next)
  let transcript: HTMLDivElement | undefined

  const running = (): boolean => ai.status() === "streaming" || ai.status() === "connecting"

  let content: HTMLDivElement | undefined

  const scrollToLatest = (): void => {
    if (transcript === undefined) return
    transcript.scrollTop = transcript.scrollHeight
  }

  // Following stops only when the person scrolls up, never because a scroll event looked like it. Content that
  // shrinks and grows again inside one frame (a card re-rendered, a thought closing) clamps `scrollTop` and then
  // raises a scroll event that reads as "moved up, not at the end"; deciding from that let go of the newest turn.
  // So the intent comes from the input that can only be a person: wheel, touch, keys and the scrollbar.
  const letGo = (): void => props.onFollowLatest(false)
  let touchY: number | undefined
  let dragging = false
  const handleScroll = (el: HTMLDivElement): void => {
    const nearEnd = el.scrollHeight - el.scrollTop - el.clientHeight < 64
    if (nearEnd) props.onFollowLatest(true)
    else if (dragging) letGo()
  }
  const handleWheel = (event: WheelEvent): void => { if (event.deltaY < 0) letGo() }
  const handleTouch = (event: TouchEvent): void => {
    const y = event.touches[0]?.clientY
    if (y === undefined) return
    if (touchY !== undefined && y > touchY + 2) letGo()
    touchY = y
  }
  const handleKey = (event: KeyboardEvent): void => {
    if (["PageUp", "Home", "ArrowUp"].includes(event.key) && event.target === transcript) letGo()
  }
  // A press on the scroll container itself (not on its content) is the scrollbar: dragging it away lets go.
  const handlePointerDown = (event: PointerEvent): void => {
    if (event.target !== transcript) return
    dragging = true
    window.addEventListener("pointerup", () => { dragging = false }, { once: true })
  }

  let scrollFrame: number | undefined
  onCleanup(() => { if (scrollFrame !== undefined) cancelAnimationFrame(scrollFrame) })

  const followSoon = (): void => {
    if (scrollFrame !== undefined || !props.followLatest) return
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = undefined
      if (props.followLatest) scrollToLatest()
    })
  }

  // Follow the newest turn unless the user scrolled away to read something. The turn is more than the
  // last message: the thinking card, a queued message and an error land below it.
  createEffect(() => {
    const last = ai.messages().at(-1)
    void ai.pending().length
    void ai.error()
    void running()
    if (last || running()) followSoon()
  })

  // What grows after it was rendered (a thinking block streaming in, markdown, a tool result opening)
  // moves the end of the conversation without any signal changing, so the end is watched itself.
  createEffect(() => {
    if (content === undefined || typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(followSoon)
    observer.observe(content)
    if (transcript !== undefined) observer.observe(transcript)
    onCleanup(() => observer.disconnect())
  })

  /** The messages on screen: the whole conversation, or only the ones that match. */
  const visible = createMemo(() => filterMessages(ai.messages(), query()))
  const searching = (): boolean => query().trim() !== ""

  return (
    <div class="relative flex min-h-0 flex-1 flex-col">
      <Show when={ai.messages().length > 0}>
        <div class="assistant-transcript-tools">
          <label class="assistant-search">
            <Search size={12} aria-hidden="true" />
            <input
              type="search"
              class="assistant-search-input"
              aria-label={t("ai.search.placeholder")}
              placeholder={t("ai.search.placeholder")}
              data-testid="ai-search-input"
              value={query()}
              onInput={(event) => setQuery(event.currentTarget.value)}
            />
            <Show when={searching()}>
              <span class="assistant-meta-text" data-testid="ai-search-count">{t("ai.search.matches", { count: visible().length })}</span>
            </Show>
            <Show when={searching()}>
              <button type="button" class="assistant-icon-action" aria-label={t("ai.search.close")} data-testid="ai-search-close" onClick={() => setQuery("")}>
                <X size={12} aria-hidden="true" />
              </button>
            </Show>
          </label>
        </div>
      </Show>
      <div
        ref={transcript}
        class="assistant-transcript flex-1 overflow-y-auto"
        onScroll={(event) => handleScroll(event.currentTarget)}
        onWheel={handleWheel}
        onTouchStart={() => { touchY = undefined }}
        onTouchMove={handleTouch}
        onKeyDown={handleKey}
        onPointerDown={handlePointerDown}
        aria-live="polite"
        data-testid="ai-transcript"
      >
        <div ref={content} class="assistant-transcript-content">
        <Show
          when={ai.messages().length > 0}
          fallback={
            /* --- Empty state: the mark, the promise, then the lede. --- */
            <div class="assistant-empty flex flex-1 flex-col items-center justify-center text-center">
              <div class="relative mb-5">
                <div class="assistant-emblem" aria-hidden="true">
                  <Sparkles size={19} />
                </div>
              </div>
              <div class="assistant-empty-copy">
                <h3 class="mb-2">
                  {t("ai.empty.title")}
                </h3>
                <p>
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
                          onClick={() => props.onUseSuggestion(suggestion.prompt)}
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
          <div class="assistant-thread-meta">
            <span>{t("ai.composer.thisComputer")} · {props.headerMeta} · </span>
            <button
              type="button"
              class="assistant-thread-meta-link"
              onClick={() => props.onOpenContext()}
            >
              {t("ai.context.title")}
            </button>
          </div>
          <div class="assistant-messages-stack">
            <Show when={ai.canLoadOlder() && !searching()}>
              <button
                type="button"
                class="assistant-older-button"
                data-testid="ai-load-older"
                disabled={ai.loadingOlder()}
                onClick={() => void ai.loadOlderMessages()}
              >
                {ai.loadingOlder() ? t("ai.history.loading") : t("ai.history.older")}
              </button>
            </Show>
            <Show when={searching() && visible().length === 0}>
              <p class="assistant-meta-text" data-testid="ai-search-empty">{t("ai.search.empty")}</p>
            </Show>
            <Index each={visible()}>
              {(message) => (
                <MessageBubble
                  message={message()}
                  onCopy={props.onCopy}
                  copiedId={props.copiedId}
                  onOpenProviders={props.onOpenProviders}
                  onRegenerate={props.onRegenerate}
                />
              )}
            </Index>
            <For each={ai.pending()}>
              {(item) => (
                <article class="assistant-message assistant-pending-bubble ml-auto max-w-[85%]" data-testid="ai-pending" data-delivery={item.delivery}>
                  <p class="assistant-pending-badge">{item.delivery === "steer" ? t("ai.pending.steer") : t("ai.pending.queue")}</p>
                  <p class="whitespace-pre-wrap break-words">{item.text}</p>
                </article>
              )}
            </For>
          </div>
          <Show when={running()}>
            <div class="assistant-thinking-card">
              <div class="ui-dots" aria-label={t("ai.thinking")}>
                <span /><span /><span />
              </div>
              <div class="flex flex-col">
                <span class="assistant-thinking-title">
                  {t("ai.thinking.processing")}
                </span>
                <span class="assistant-thinking-subtitle">
                  {t("ai.runtime.streaming")}
                </span>
              </div>
            </div>
          </Show>
        </Show>
        </div>
      </div>
      <Show when={!props.followLatest && ai.messages().length > 0}>
        <button
          type="button"
          class="assistant-jump-latest"
          aria-label={t("ai.transcript.latest")}
          title={t("ai.transcript.latest")}
          data-testid="ai-jump-latest"
          onClick={() => {
            props.onFollowLatest(true)
            scrollToLatest()
          }}
        >
          <ChevronDown size={14} aria-hidden="true" />
        </button>
      </Show>
    </div>
  )
}
