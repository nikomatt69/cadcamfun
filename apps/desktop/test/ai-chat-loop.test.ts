/**
 * The chat loop as nikcli and Claude Code show it: reasoning, text and tool calls in the order they happened, and a message
 * written while the agent works joins the running turn (queued or steered) instead of being dropped. Events come from a scripted
 * stream in place of the sidecar's, through the real client, store and panel.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { Effect, Stream } from "effect"
import { bootLiveApp } from "./helpers/live-app.ts"

let app: Awaited<ReturnType<typeof bootLiveApp>>
beforeAll(async () => { app = await bootLiveApp() }, 60000)
afterAll(async () => { await app.dispose() })

const q = <T extends Element = HTMLElement>(selector: string): T | null => document.querySelector<T>(selector)
const qa = (selector: string): Element[] => [...document.querySelectorAll(selector)]
const flush = (ms = 80): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
const sse = (events: object[]) => events.map((e) => JSON.stringify(e))
const type = (text: string): void => {
  const input = q<HTMLTextAreaElement>("textarea.assistant-prompt")!
  input.value = text
  input.dispatchEvent(new window.Event("input", { bubbles: true }))
}
const open = async (): Promise<void> => {
  // The panel stays open between visits once a test opened it.
  const button = await app.wait(() => q<HTMLButtonElement>('button[title="Show CAD Assistant"]') ?? q("textarea.assistant-prompt"), 30000)
  if (button instanceof window.HTMLButtonElement) button.click()
  await app.wait(() => q("textarea.assistant-prompt"), 30000)
  await flush(50)
}

describe("the transcript follows the order of the work", () => {
  test("reasoning, text and tool calls are interleaved as they happened", async () => {
    const client = app.state.client as unknown as { ai: { chatStream: unknown } }
    client.ai.chatStream = () => Effect.succeed(Stream.fromIterable(sse([
      { type: "reasoning", sessionId: "s", text: "The plate needs a hole." },
      { type: "delta", sessionId: "s", text: "Let me look at " },
      { type: "delta", sessionId: "s", text: "the drawing." },
      { type: "tool_call", sessionId: "s", callId: "c1", tool: "cad", input: { action: "describe",} },
      { type: "tool_result", sessionId: "s", callId: "c1", tool: "cad", ok: true, output: "{\"ok\":true}" },
      { type: "delta", sessionId: "s", text: "One plate, no hole yet." },
      { type: "done", sessionId: "s", text: "Let me look at the drawing.One plate, no hole yet." }
    ])))
    const { dispose } = app.visit("/cad")
    try {
      await open()
      type("is there a hole?")
      await flush()
      q<HTMLElement>("button.assistant-send")!.click()
      await app.wait(() => qa('[data-testid="ai-timeline"]').some((t) => t.textContent?.includes("One plate, no hole yet.")) || undefined, 10000)
      const timeline = qa('[data-testid="ai-timeline"]').find((t) => t.textContent?.includes("One plate"))!
      const kinds = [...timeline.children].map((c) => c.getAttribute("data-testid") ?? (c.classList.contains("assistant-message-body") ? "text" : c.tagName.toLowerCase()))
      expect(kinds.slice(0, 4)).toEqual(["ai-thinking", "text", "ul", "text"])
      expect(timeline.children[1]!.textContent?.trim()).toBe("Let me look at the drawing.")
      expect(timeline.children[2]!.getAttribute("data-testid") ?? timeline.children[2]!.querySelector("[data-testid='tool-call']")?.getAttribute("data-tool")).toBe("cad")
    } finally { dispose() }
  }, 30000)
})

describe("the turn reads like nikcli's session view", () => {
  test("a retry is a row where it happened, finished reads are folded, a failed call is not, and the turn has a footer", async () => {
    const client = app.state.client as unknown as { ai: { chatStream: unknown } }
    const call = (id: string, tool: string, output: unknown, ok = true, input: unknown = {}) => [
      { type: "tool_call", sessionId: "s", callId: id, tool, input },
      { type: "tool_result", sessionId: "s", callId: id, tool, ok, output: JSON.stringify(output) }
    ]
    client.ai.chatStream = () => Effect.succeed(Stream.fromIterable(sse([
      { type: "retry", sessionId: "s", attempt: 1, message: "Provider is overloaded" },
      ...call("g1", "cad", { total: 1 }, true, { action: "describe" }), ...call("g2", "cad", { ok: true, issues: [] }, true, { action: "check" }), ...call("g3", "cad", { total: 1 }, true, { action: "describe" }),
      ...call("g4", "cad_edit", { ok: true, ids: ["1"], elements: [{ id: "1", type: "cube" }] }, true, { action: "add", elements: [{ type: "cube" }] }),
      ...call("g5", "cad", { total: 1 }, false, { action: "describe" }),
      { type: "delta", sessionId: "s", text: "Built it." },
      { type: "done", sessionId: "s", text: "Built it.", usage: { inputTokens: 10, outputTokens: 42 } }
    ])))
    const { dispose } = app.visit("/cad")
    try {
      await open()
      type("build a cube")
      await flush()
      q<HTMLElement>("button.assistant-send")!.click()
      // Earlier tests of this file left their turns in the same conversation: look at the newest answer only.
      const newest = (): Element | undefined => qa('article.assistant-message[data-role="assistant"]').at(-1)
      await app.wait(() => (newest()?.querySelector('[data-testid="ai-turn-footer"]') && newest()!.textContent?.includes("Built it.") ? true : undefined), 15000)
      const answer = newest()!
      expect(answer.querySelector('[data-testid="ai-retry-row"]')!.textContent).toContain("Provider is overloaded")
      const group = answer.querySelector('[data-testid="ai-tool-group"]')!
      expect(group.querySelector("summary")!.textContent).toContain("Looked at 3 things")
      expect(group.querySelectorAll('[data-testid="tool-call"]').length).toBe(3)
      // What changed the drawing and what failed are not folded away.
      const outside = [...answer.querySelectorAll('[data-testid="tool-call"]')].filter((r) => !group.contains(r)).map((r) => r.getAttribute("data-tool"))
      expect(outside).toEqual(["cad_edit", "cad"])
      expect(answer.querySelector('[data-testid="ai-turn-footer"]')!.textContent).toContain("42 tok")
    } finally { dispose() }
  }, 30000)
})

describe("a message written while the agent works", () => {
  test("joins the running turn, shows as pending, then lands in the transcript where the agent took it in", async () => {
    const client = app.state.client as unknown as { ai: { chatStream: unknown; chatQueue: unknown } }
    const queued: Array<{ message: string; delivery?: string; sessionId: string }> = []
    client.ai.chatQueue = (input: { payload: { message: string; delivery?: string; sessionId: string } }) => { queued.push(input.payload); return Effect.succeed({ message: "Queued" }) }
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    client.ai.chatStream = () => Effect.succeed(Stream.concat(
      Stream.fromIterable(sse([{ type: "delta", sessionId: "s", text: "Building the plate." }, { type: "tool_call", sessionId: "s", callId: "w1", tool: "cad", input: { action: "describe",} }])),
      Stream.concat(
        Stream.fromEffect(Effect.promise(() => gate.then(() => JSON.stringify({ type: "heartbeat" })))),
        Stream.fromIterable(sse([
          { type: "tool_result", sessionId: "s", callId: "w1", tool: "cad", ok: true, output: "{\"ok\":true}" },
          { type: "user_message", sessionId: "s", text: "also make it 5 mm thick" },
          { type: "delta", sessionId: "s", text: "Thickness set to 5 mm." },
          { type: "done", sessionId: "s", text: "Thickness set to 5 mm." }
        ]))
      )
    ))
    const { dispose } = app.visit("/cad")
    try {
      await open()
      // Earlier tests of this file left their turns in the same conversation: let the last one finish before this one starts,
      // or its stop button would be mistaken for this turn's.
      await app.wait(() => (q('[data-testid="ai-stop"]') === null ? true : undefined), 10000)
      type("build a plate")
      await flush()
      q<HTMLElement>("button.assistant-send")!.click()
      await app.wait(() => q('[data-testid="ai-stop"]') || undefined, 10000)
      // The agent is working: the input stays open and takes a second message.
      type("also make it 5 mm thick")
      await flush()
      q<HTMLElement>('[data-testid="ai-send"]')!.click()
      await app.wait(() => q('[data-testid="ai-pending"]') || undefined, 10000)
      expect(queued).toHaveLength(1)
      expect(queued[0]).toMatchObject({ message: "also make it 5 mm thick", delivery: "queue" })
      expect(q('[data-testid="ai-pending"]')!.textContent).toContain("also make it 5 mm thick")
      // A third one is sent at once.
      type("and name it Plate")
      await flush()
      q<HTMLElement>('[data-testid="ai-steer"]')!.click()
      await flush(300)
      await app.wait(() => (queued.length === 2 ? true : undefined), 10000)
      expect(queued[1]).toMatchObject({ message: "and name it Plate", delivery: "steer" })

      release()
      await app.wait(() => (qa('[data-testid="ai-timeline"]').some((t) => t.textContent?.includes("Thickness set to 5 mm.")) ? true : undefined), 10000)
      const bubbles = qa("article.assistant-message[data-role]").map((a) => `${a.getAttribute("data-role")}:${a.textContent}`)
      const user = bubbles.findIndex((b) => b.startsWith("user:") && b.includes("also make it 5 mm thick"))
      const first = bubbles.findIndex((b) => b.startsWith("assistant:") && b.includes("Building the plate."))
      const second = bubbles.findIndex((b) => b.startsWith("assistant:") && b.includes("Thickness set to 5 mm."))
      expect(first).toBeGreaterThanOrEqual(0)
      expect(user).toBeGreaterThan(first)
      expect(second).toBeGreaterThan(user)
      // The one the agent took in is no longer pending; the steered one it did not report is sent after the turn.
      expect(qa('[data-testid="ai-pending"]').some((p) => p.textContent?.includes("also make it 5 mm thick"))).toBe(false)
    } finally { dispose() }
  }, 30000)
})
