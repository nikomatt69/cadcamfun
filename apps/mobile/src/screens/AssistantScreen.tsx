/**
 * Assistant tab — a chat with the AI that can propose changes via pull requests.
 *
 * Streaming text (`POST /api/ai/chat/stream`) is rendered into a single bubble that updates as
 * deltas arrive; tool calls (`.tool_call`) are surfaced as a separate, muted row so the user can
 * see the assistant thinking, not just its output.
 *
 * Safety rails (Apple §16 — Responsibility): the assistant works on `ai/*` branches only and
 * cannot touch `main`. The server enforces that; the UI surfaces a per-PR "AI" pill so a person
 * still reviews and merges every change.
 */
import { For, Match, Show, Switch, createSignal, type Component } from "solid-js"
import type { CompanionClient } from "../companion/client.ts"
import type { ChatEvent } from "../companion/sse.ts"
import { Send, Sparkle } from "../components/Icon.tsx"
import { Spinner } from "../components/Spinner.tsx"
import { errorMessage } from "../lib/error.ts"
import { haptic } from "../lib/haptic.ts"

export interface AssistantScreenProps {
  readonly client: CompanionClient
  readonly projectId: string
}

export const AssistantScreen: Component<AssistantScreenProps> = (props) => {
  const [input, setInput] = createSignal("")
  const [log, setLog] = createSignal<ChatEvent[]>([])
  const [busy, setBusy] = createSignal(false)
  let sessionId: string | undefined
  const logEl = (el: HTMLDivElement | undefined) => { if (el) el.scrollTop = el.scrollHeight }

  const send = async () => {
    const text = input().trim()
    if (!text || busy()) return
    setInput("")
    setBusy(true)
    haptic("light")
    setLog((l) => [...l, { type: "user", text } as ChatEvent])
    try {
      for await (const e of props.client.chat(props.projectId, text, sessionId)) {
        if ("sessionId" in e && typeof e.sessionId === "string") sessionId = e.sessionId
        setLog((l) => [...l, e])
      }
      haptic("success")
    } catch (e) {
      haptic("error")
      setLog((l) => [...l, { type: "error", sessionId: sessionId ?? "", code: "internal", message: errorMessage(e) }])
    } finally {
      setBusy(false)
    }
  }

  return (
    <div class="screen-pad">
      <div class="card card-elevated mb-3" style={{ display: "flex", gap: "12px", "align-items": "flex-start" }}>
        <div class="row-icon ai" aria-hidden="true"><Sparkle size={18} /></div>
        <div>
          <p class="t-headline">AI assistant</p>
          <p class="t-footnote text-secondary mt-2">Proposes changes on its own branch and opens a pull request. <strong>You</strong> decide what lands on <code>main</code>.</p>
        </div>
      </div>

      <div ref={logEl} class="chat">
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
        <Show when={busy()}>
          <div class="bubble-row them">
            <div class="bubble" style={{ display: "flex", "align-items": "center", gap: "8px" }}>
              <Spinner size="sm" /> <span class="text-tertiary t-footnote">Thinking…</span>
            </div>
          </div>
        </Show>
      </div>

      <form
        class="chat-form"
        onSubmit={(ev) => { ev.preventDefault(); void send() }}
      >
        <input
          class="field field-inline"
          placeholder="Make the plate 20 mm wider…"
          value={input()}
          onInput={(e) => setInput(e.currentTarget.value)}
          disabled={busy()}
        />
        <button class="btn" type="submit" aria-label="Send" disabled={busy() || !input().trim()}>
          <Show when={busy()} fallback={<Send size={18} />}><Spinner onAccent size="sm" /></Show>
        </button>
      </form>
    </div>
  )
}