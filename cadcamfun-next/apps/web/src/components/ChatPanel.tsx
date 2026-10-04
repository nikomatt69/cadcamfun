import { For, Show, createSignal, onCleanup } from "solid-js"
import { createStore, produce } from "solid-js/store"
import { decodeDocument, decodeSetup, streamChat } from "../lib/chat"
import { useEditor } from "../editor/store"
import { Button } from "./ui"

interface ToolChip {
  readonly id: string
  readonly name: string
  status: "running" | "ok" | "error"
}

interface ChatMessage {
  readonly role: "user" | "assistant"
  text: string
  tools: Array<ToolChip>
  error?: string
}

const examples = [
  "Draw a 120×80 mm plate with 4 Ø6 holes 10 mm from each corner",
  "Pocket the selected shape 4 mm deep in MDF and cut it out",
  "Generate Fanuc G-code and tell me the cycle time",
]

export function ChatPanel() {
  const ed = useEditor()
  const [messages, setMessages] = createStore<Array<ChatMessage>>([])
  const [input, setInput] = createSignal("")
  const [busy, setBusy] = createSignal(false)
  let controller: AbortController | undefined
  let list!: HTMLDivElement
  onCleanup(() => controller?.abort())

  const scroll = () => queueMicrotask(() => list.scrollTo({ top: list.scrollHeight }))

  const send = async (text: string) => {
    if (!text.trim() || busy()) return
    setInput("")
    const history = [
      ...messages.map((m) => ({ role: m.role, content: m.text })),
      { role: "user" as const, content: text },
    ]
    setMessages(messages.length, { role: "user", text, tools: [] })
    const index = messages.length
    setMessages(index, { role: "assistant", text: "", tools: [] })
    setBusy(true)
    controller = new AbortController()
    try {
      for await (const event of streamChat(
        { document: ed.doc(), setup: ed.setup(), messages: history },
        controller.signal,
      )) {
        switch (event.type) {
          case "text":
            setMessages(index, "text", (t) => t + event.text)
            break
          case "tool-call":
            setMessages(index, "tools", (t) => [...t, { id: event.id, name: event.name, status: "running" as const }])
            break
          case "tool-result":
            setMessages(
              index,
              "tools",
              produce((tools) => {
                const chip = tools.find((c) => c.id === event.id)
                if (chip) chip.status = event.ok ? "ok" : "error"
              }),
            )
            break
          case "state": {
            const doc = decodeDocument(event.document)
            if (doc.revision !== ed.doc().revision) ed.commitDocument(doc)
            ed.setSetup(() => decodeSetup(event.setup))
            break
          }
          case "error":
            setMessages(index, "error", event.message)
            break
        }
        scroll()
      }
    } catch (error) {
      if (!controller.signal.aborted) setMessages(index, "error", String(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div class="flex h-full flex-col">
      <div ref={list} class="flex-1 space-y-3 overflow-y-auto p-3">
        <Show when={messages.length === 0}>
          <div class="space-y-2 text-xs text-zinc-500">
            <p>
              Ask the assistant to draw, edit or machine your part. It works on this document through CAD/CAM tools;
              every change can be undone.
            </p>
            <For each={examples}>
              {(ex) => (
                <button
                  class="block w-full rounded border border-zinc-800 p-2 text-left text-zinc-300 hover:border-[var(--accent)]"
                  onClick={() => send(ex)}
                >
                  {ex}
                </button>
              )}
            </For>
          </div>
        </Show>
        <For each={messages}>
          {(m) => (
            <div classList={{ "ml-6": m.role === "user", "mr-2": m.role === "assistant" }}>
              <div
                class="rounded-lg px-3 py-2 text-sm whitespace-pre-wrap"
                classList={{
                  "bg-[var(--accent)]/15 text-zinc-100": m.role === "user",
                  "bg-zinc-900 text-zinc-200": m.role === "assistant",
                }}
              >
                <Show when={m.tools.length > 0}>
                  <div class="mb-1 flex flex-wrap gap-1">
                    <For each={m.tools}>
                      {(t) => (
                        <span
                          class="rounded px-1.5 py-0.5 font-mono text-[10px]"
                          classList={{
                            "bg-zinc-800 text-zinc-400": t.status === "running",
                            "bg-emerald-900/60 text-emerald-300": t.status === "ok",
                            "bg-red-900/60 text-red-300": t.status === "error",
                          }}
                        >
                          {t.name}
                        </span>
                      )}
                    </For>
                  </div>
                </Show>
                {m.text || (m.role === "assistant" && busy() && !m.error ? "…" : "")}
                <Show when={m.error}>
                  <p class="mt-1 text-xs text-red-400">{m.error}</p>
                </Show>
              </div>
            </div>
          )}
        </For>
      </div>
      <form
        class="flex gap-2 border-t border-zinc-800 p-2"
        onSubmit={(e) => {
          e.preventDefault()
          void send(input())
        }}
      >
        <textarea
          class="h-16 flex-1 resize-none rounded border border-zinc-700 bg-zinc-900 p-2 text-sm text-zinc-100 outline-none focus:border-[var(--accent)]"
          placeholder="Describe a part or a machining step…"
          value={input()}
          onInput={(e) => setInput(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              void send(input())
            }
          }}
        />
        <Show
          when={busy()}
          fallback={
            <Button variant="primary" type="submit">
              Send
            </Button>
          }
        >
          <Button type="button" onClick={() => controller?.abort()}>
            Stop
          </Button>
        </Show>
      </form>
    </div>
  )
}
