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
  { type: "tool_progress", sessionId: "s", callId: "c1", tool: "cad_edit", chars: 1500 },
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
        expect(q('[data-testid="ai-preparing"]')?.textContent).toContain("cad_edit")
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

test("assistant controls select roles and modes, answer questions and compact through the typed client", async () => {
  const client = app.state.client as unknown as { ai: { chatStream: unknown; sessionControl: unknown } }
  const originalStream = client.ai.chatStream, originalControl = client.ai.sessionControl
  const controls: Array<Record<string, unknown>> = []
  let sent: Record<string, unknown> | undefined
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  client.ai.chatStream = (input: { payload: Record<string, unknown> }) => {
    sent = input.payload
    const sid = input.payload.sessionId
    return Effect.succeed(Stream.concat(
      Stream.fromIterable([JSON.stringify({ type: "tool_call", sessionId: sid, callId: "question-call", tool: "question", input: { questions: [] } }), JSON.stringify({ type: "question_request", sessionId: sid, requestId: "q-ui", questions: [{ header: "Stock", question: "Which stock?", options: [{ label: "Aluminium", description: "Use aluminium" }], custom: false }] })]),
      Stream.fromEffect(Effect.promise(() => gate.then(() => JSON.stringify({ type: "done", sessionId: sid, text: "Stock confirmed." }))))
    ))
  }
  client.ai.sessionControl = (input: { payload: Record<string, unknown> }) => {
    controls.push(input.payload)
    if (input.payload.action === "answer_question") release()
    return Effect.succeed({ busy: false, text: "", tasks: [], questions: [], context: { auto: true, prune: true, contextWindow: 100_000, compactAt: 95_904, requestOutput: 4096, compacted: input.payload.action === "compact" } })
  }
  const { dispose } = app.visit("/cad")
  try {
    await flush()
    if (!q('[data-testid="ai-panel"]')) (await w("open assistant", () => q<HTMLButtonElement>('button[title="Show CAD Assistant"]'))).click()
    const panel = await w("controls", () => q('[data-testid="ai-controls"]'))
    const chooseControl = async (control: string, label: string): Promise<void> => {
      panel.querySelector<HTMLButtonElement>(`button[data-control="${control}"]`)!.click()
      const option = await w(`${control} option`, () => Array.from(panel.querySelectorAll<HTMLButtonElement>('.assistant-control-option')).find((candidate) => candidate.textContent?.includes(label)))
      option.click()
    }
    await chooseControl("agent", "Modeler")
    await chooseControl("mode", "CAD / 3D modelling")
    await chooseControl("permissions", "Auto")
    const input = await w("composer", () => q<HTMLTextAreaElement>("textarea.assistant-prompt"))
    input.value = "Model this part"; input.dispatchEvent(new window.Event("input", { bubbles: true }))
    await flush(); q<HTMLButtonElement>("button.assistant-send")!.click()
    const question = await w("question UI", () => q('[data-testid="ai-question"]'))
    expect(sent?.agent).toBe("modeler"); expect(sent?.mode).toBe("cad")
    expect(sent?.permissionMode).toBe("auto")
    question.querySelector<HTMLInputElement>('input[type="radio"]')!.click()
    await flush(); question.querySelector<HTMLButtonElement>("button")!.click()
    await w("question reply", () => controls.find((control) => control.action === "answer_question"))
    expect(controls.find((control) => control.action === "answer_question")?.answers).toEqual([["Aluminium"]])
    await w("turn finished", () => q<HTMLButtonElement>("button.assistant-send")?.disabled === false)
    q<HTMLButtonElement>('button[title="Conversation context"]')!.click()
    const compact = await w("compact button", () => q<HTMLButtonElement>('[data-testid="ai-compact"]'))
    await w("compaction available", () => !compact.disabled); compact.click()
    await w("compact request", () => controls.find((control) => control.action === "compact"))
  } finally {
    release(); dispose(); client.ai.chatStream = originalStream; client.ai.sessionControl = originalControl
  }
}, 60000)
