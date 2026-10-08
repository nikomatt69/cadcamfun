/**
 * The agent's work is visible: plan, goal, steps, reasoning, a tool still being written, retries. Events come from a scripted
 * stream in place of the sidecar's, through the real client, store and panel.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { Effect, Stream } from "effect"
import { bootLiveApp } from "./helpers/live-app.ts"

let app: Awaited<ReturnType<typeof bootLiveApp>>
beforeAll(async () => { app = await bootLiveApp() }, 60000)
afterAll(async () => { await app.dispose() })

const q = <T extends Element = HTMLElement>(selector: string): T | null => document.querySelector<T>(selector)
const w = async <T,>(label: string, read: () => T | null | undefined | false, ms = 30000): Promise<T> => { try { return await app.wait(read, ms) } catch (e) { throw new Error(`[${label}] ${String(e).slice(0, 60)}`) } }
const flush = (ms = 80): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

const events = (): object[] => [
  { type: "goal", sessionId: "s", goal: { objective: "Model the bracket and verify its toolpath", status: "active", iteration: 1, tokensUsed: 0 } },
  { type: "step", sessionId: "s", phase: "start", index: 1 },
  { type: "reasoning", sessionId: "s", text: "The plate needs two holes." },
  { type: "todo", sessionId: "s", todos: [{ content: "Model the plate", status: "in_progress" }, { content: "Drill the holes", status: "pending" }, { content: "Verify", status: "pending" }] },
  { type: "heartbeat" },
  { type: "tool_progress", sessionId: "s", callId: "c1", tool: "cad_add_elements", chars: 1500 },
  { type: "retry", sessionId: "s", attempt: 1, message: "Provider is overloaded" },
  { type: "delta", sessionId: "s", text: "Building the plate." },
  { type: "skill-ish", sessionId: "s" },
  { type: "tool_call", sessionId: "s", callId: "c2", tool: "todowrite", input: { todos: [] } },
  { type: "tool_result", sessionId: "s", callId: "c2", tool: "todowrite", ok: true, output: "ok" },
  { type: "todo", sessionId: "s", todos: [{ content: "Model the plate", status: "completed" }, { content: "Drill the holes", status: "in_progress" }, { content: "Verify", status: "pending" }] },
  { type: "done", sessionId: "s", text: "Building the plate." }
].map((e) => e)

describe("the agent's work is shown", () => {
  test("goal, plan, step, reasoning and a long tool call are on screen while it works, and the plan follows the agent", async () => {
    const client = app.state.client as unknown as { ai: { chatStream: unknown } }
    const original = client.ai.chatStream
    // Hold the stream open after the middle events so the live status can be read, then finish it.
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    const all = events()
    const first = all.slice(0, 8), rest = all.slice(8)
    client.ai.chatStream = () => Effect.succeed(Stream.concat(
      Stream.fromIterable(first.map((e) => JSON.stringify(e))),
      Stream.concat(Stream.fromEffect(Effect.promise(() => gate.then(() => JSON.stringify({ type: "heartbeat" })))), Stream.fromIterable(rest.map((e) => JSON.stringify(e))))
    ))
    try {
      const { dispose } = app.visit("/cad")
      try {
        ;(await w('open-button', () => q<HTMLButtonElement>('button[title="Show CAD Assistant"]'))).click()
        await flush(50)
        await w('panel', () => q('[data-testid="ai-panel"]'))
        const input = await w("prompt", () => q<HTMLTextAreaElement>("textarea.assistant-prompt"))
        input.value = "Model the bracket and verify its toolpath"
        input.dispatchEvent(new window.Event("input", { bubbles: true }))
        await flush()
        q<HTMLElement>('button.assistant-send')!.click()

        try { await app.wait(() => q('[data-testid="ai-plan"]'), 10000) } catch (e) { throw new Error(String(e).slice(0, 80) + " PANEL: " + (q('[data-testid="ai-panel"]')?.textContent ?? "none").slice(0, 900)) }
        expect(q('[data-testid="ai-goal"]')?.textContent).toContain("Model the bracket and verify its toolpath")
        expect(q('[data-testid="ai-plan"]')?.textContent).toContain("Drill the holes")
        expect(q('[data-testid="ai-plan"] [data-status="in_progress"]')?.textContent).toContain("Model the plate")
        expect(q('[data-testid="ai-status-line"]')?.textContent).toContain("Step 1")
        expect(q('[data-testid="ai-preparing"]')?.textContent).toContain("cad_add_elements")
        expect(q('[data-testid="ai-preparing"]')?.textContent).toContain("1.5 KB")
        expect(q('[data-testid="ai-thinking"]')?.textContent).toContain("The plate needs two holes.")

        release()
        await app.wait(() => (q('[data-testid="ai-plan"] [data-status="completed"]') ? true : undefined), 10000)
        expect(q('[data-testid="ai-plan"] [data-status="in_progress"]')?.textContent).toContain("Drill the holes")
        // The host's own todo tool is not shown as a failed call: it is not one of ours, and it is not rejected either.
        expect(document.body.textContent).not.toContain("is not allowed")
      } finally { dispose() }
    } finally { client.ai.chatStream = original }
  }, 60000)
})
