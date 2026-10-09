/**
 * Assistant tab — a chat with the AI that can propose changes via pull requests.
 *
 * Streaming text (`POST /api/ai/chat/stream`) is rendered into a single bubble that grows as deltas
 * arrive: consecutive `delta` frames are folded into the last text bubble, so one answer is one
 * bubble instead of one per token chunk. Tool calls (`.tool_call`) are surfaced as a separate, muted
 * row so the user can see the assistant working, not just its output.
 *
 * The turn is steerable: a Stop button aborts it server-side (`/api/ai/chat/abort`), and a
 * `permission_request` frame is answered inline — unanswered, the assistant's tool call would stall
 * until the model gives up, because nothing ever tells it the person said yes.
 *
 * Safety rails (Apple §16 — Responsibility): the assistant works on `ai/*` branches only and cannot
 * touch `main`. The server enforces that; the UI surfaces a per-PR "AI" pill so a person still reviews
 * and merges every change.
 */
import { For, Match, Show, Switch, createEffect, createSignal, onCleanup, type Component } from "solid-js"
import type { CompanionClient } from "../companion/client.ts"
import type { ChatEvent } from "../companion/sse.ts"
import { Send, Sparkle } from "../components/Icon.tsx"
import { Pill } from "../components/Pill.tsx"
import { Spinner } from "../components/Spinner.tsx"
import { appendChatEvent } from "../lib/chat-log.ts"
import { errorMessage } from "../lib/error.ts"
import { haptic } from "../lib/haptic.ts"

export interface AssistantScreenProps {
  readonly client: CompanionClient
  readonly projectId: string
}

/** A permission the assistant is waiting on; answered inline rather than dropped. */
interface Pending {
  readonly sessionId: string
  readonly requestId: string
  readonly permission: string
  readonly patterns: ReadonlyArray<string>
}

export const AssistantScreen: Component<AssistantScreenProps> = (props) => {
  const [input, setInput] = createSignal("")
  const [log, setLog] = createSignal<ReadonlyArray<ChatEvent>>([])
  const [busy, setBusy] = createSignal(false)
  const [pending, setPending] = createSignal<Pending>()
  const [configured, setConfigured] = createSignal<boolean | undefined>(undefined)
  let sessionId: string | undefined
  let scroll: HTMLDivElement | undefined
  /** The controller of the turn in flight, so Stop can cut the stream. */
  let running: AbortController | undefined

  /** Ask the desktop whether it has a model key, so we can say so before the user types. */
  createEffect(() => {
    void props.client
      .aiStatus()
      .then((s) => setConfigured(s.configured))
      .catch(() => setConfigured(undefined))
  })

  // Keep the newest message in view as the answer streams in.
  createEffect(() => {
    log().length
    if (scroll) scroll.scrollTop = scroll.scrollHeight
  })

  const send = async () => {
    const text = input().trim()
    if (!text || busy()) return
    setInput("")
    setBusy(true)
    haptic("light")
    setLog((l) => appendChatEvent(l, { type: "user", text } as ChatEvent))
    const controller = new AbortController()
    running = controller
    try {
      for await (const event of props.client.chat(props.projectId, text, sessionId, controller.signal)) {
        if ("sessionId" in event && typeof event.sessionId === "string") sessionId = event.sessionId
        if (event.type === "permission_request") {
          const p = event as { sessionId: string; requestId: string; permission: string; patterns: string[] }
          setPending({ sessionId: p.sessionId, requestId: p.requestId, permission: p.permission, patterns: p.patterns })
          haptic("warning")
          continue
        }
        if (event.type === "done") setPending(undefined)
        if (event.type === "error") haptic("error")
        setLog((l) => appendChatEvent(l, event))
      }
      haptic("success")
    } catch (e) {
      // A stop is a user decision, not a fault: report it, do not dress it as an error.
      if (controller.signal.aborted) haptic("selection")
      else {
        haptic("error")
        setLog((l) => appendChatEvent(l, { type: "error", sessionId: sessionId ?? "", code: "internal", message: errorMessage(e) }))
      }
    } finally {
      setBusy(false)
      setPending(undefined)
      running = undefined
    }
  }

  /** Aborts the HTTP stream *and* tells the desktop to stop the turn it is running. */
  const stop = () => {
    running?.abort()
    running = undefined
    void props.client.abortChat(sessionId).catch(() => undefined)
    setBusy(false)
    setPending(undefined)
  }
  onCleanup(() => running?.abort())

  const decide = async (decision: "once" | "always" | "reject") => {
    const request = pending()
    if (!request) return
    setPending(undefined)
    haptic("selection")
    try {
      await props.client.permissionReply(request.sessionId, request.requestId, decision)
    } catch (e) {
      setLog((l) => appendChatEvent(l, { type: "error", sessionId: request.sessionId, code: "internal", message: errorMessage(e) }))
    }
  }

  return (
    <div class="screen-pad">
      <Show when={configured() === false}>
        <div class="card card-elevated mb-3">
          <p class="t-headline">No model key on the desktop</p>
          <p class="t-footnote text-secondary mt-2">
            Add a provider key in the desktop&rsquo;s AI settings, then come back — the phone borrows its model.
          </p>
        </div>
      </Show>

      <div class="card card-elevated mb-3" style={{ display: "flex", gap: "12px", "align-items": "flex-start" }}>
        <div class="row-icon ai" aria-hidden="true"><Sparkle size={18} /></div>
        <div>
          <p class="t-headline">AI assistant</p>
          <p class="t-footnote text-secondary mt-2">Proposes changes on its own branch and opens a pull request. <strong>You</strong> decide what lands on <code>main</code>.</p>
        </div>
      </div>

      <div ref={scroll} class="chat">
        <Switch>
          <Match when={log().length === 0}>
            <div class="empty">
              <div class="empty-mark"><Sparkle size={26} /></div>
              <h3>Ask for a change</h3>
              <p>Try: <em>"Make the plate 20 mm wider and regenerate the pocket."</em></p>
            </div>
          </Match>
        </Switch>
        <For each={log()}>{(e) => (
          <Switch>
            <Match when={e.type === "user"}>
              <div class="bubble-row me">
                <div class="bubble">{(e as { text: string }).text}</div>
              </div>
            </Match>
            <Match when={e.type === "delta"}>
              <div class="bubble-row them">
                <div class="bubble">{(e as { text: string }).text}</div>
              </div>
            </Match>
            <Match when={e.type === "tool_call"}>
              <div class="bubble tool">⚙ {(e as { tool: string }).tool}</div>
            </Match>
            <Match when={e.type === "tool_result"}>
              <div class="bubble tool">{(e as { ok: boolean }).ok ? "✓" : "✕"} {(e as { tool: string }).tool}</div>
            </Match>
            <Match when={e.type === "error"}>
              <div class="chat-error">{(e as { message: string }).message}</div>
            </Match>
            <Match when={e.type === "done"}>
              <div class="bubble-row them">
                <div class="bubble"><em>{(e as { text: string }).text}</em></div>
              </div>
            </Match>
          </Switch>
        )}</For>

        <Show when={pending()}>{(request) => (
          <div class="card card-elevated">
            <div style={{ display: "flex", gap: "8px", "align-items": "center", "margin-bottom": "8px" }}>
              <Pill tone="warning">Needs you</Pill>
              <span class="t-footnote text-secondary">{request().permission}</span>
            </div>
            <Show when={request().patterns.length > 0}>
              <ul class="t-footnote text-tertiary" style={{ "margin": "0 0 8px", "padding-left": "18px" }}>
                <For each={request().patterns}>{(pattern) => <li><code>{pattern}</code></li>}</For>
              </ul>
            </Show>
            <div class="actions-row">
              <button class="btn btn-secondary" onClick={() => void decide("reject")}>Deny</button>
              <button class="btn" onClick={() => void decide("once")}>Allow once</button>
            </div>
          </div>
        )}</Show>

        <Show when={busy() && !pending()}>
          <div class="bubble-row them">
            <div class="bubble" style={{ display: "flex", "align-items": "center", gap: "8px" }}>
              <Spinner size="sm" /> <span class="text-tertiary t-footnote">Thinking…</span>
            </div>
          </div>
        </Show>
      </div>

      <form class="chat-form" onSubmit={(ev) => { ev.preventDefault(); void send() }}>
        <input
          class="field field-inline"
          placeholder="Make the plate 20 mm wider…"
          value={input()}
          onInput={(e) => setInput(e.currentTarget.value)}
          disabled={busy()}
        />
        <Show
          when={busy()}
          fallback={<button class="btn" type="submit" aria-label="Send" disabled={!input().trim() || configured() === false}><Send size={18} /></button>}
        >
          <button class="btn btn-secondary" type="button" aria-label="Stop" onClick={stop}>Stop</button>
        </Show>
      </form>
    </div>
  )
}