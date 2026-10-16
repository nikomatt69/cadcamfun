import { afterAll, beforeAll, expect, test } from "bun:test"
import { Effect, Stream } from "effect"
import { bootLiveApp } from "./helpers/live-app.ts"

let app: Awaited<ReturnType<typeof bootLiveApp>>
beforeAll(async () => { app = await bootLiveApp() }, 60000)
afterAll(async () => { await app.dispose() })

const gate = () => {
  let release!: () => void
  const promise = new Promise<void>((resolve) => { release = resolve })
  return { promise, release }
}
const events = (items: ReadonlyArray<object>) => Stream.fromIterable(items.map((item) => JSON.stringify(item)))
const newest = () => [...document.querySelectorAll('article.assistant-message[data-role="assistant"]')].at(-1)

test("streamed bursts preserve messages, tool disclosures and unchanged Markdown nodes", async () => {
  const client = app.state.client as unknown as { ai: { chatStream: unknown } }
  const original = client.ai.chatStream
  const textGate = gate(), reasoningGate = gate(), doneGate = gate()
  const output = JSON.stringify({ ok: true, payload: "x".repeat(300_000) })
  const suffix = " More detail.".repeat(200)
  client.ai.chatStream = () => Effect.succeed(Stream.concat(
    events([
      { type: "delta", sessionId: "s", text: "**Inspecting** the drawing." },
      { type: "tool_call", sessionId: "s", callId: "read-1", tool: "cad", input: { action: "describe" } },
      { type: "tool_result", sessionId: "s", callId: "read-1", tool: "cad", ok: true, output: '{"ok":true}' },
      { type: "tool_call", sessionId: "s", callId: "read-2", tool: "cam", input: { action: "analyze", gcode: "G0 X0" } },
      { type: "tool_result", sessionId: "s", callId: "read-2", tool: "cam", ok: true, output },
      { type: "delta", sessionId: "s", text: "Summary." }
    ]),
    Stream.concat(
      Stream.fromEffect(Effect.promise(() => textGate.promise.then(() => JSON.stringify({ type: "heartbeat" })))),
      Stream.concat(
        events(Array.from({ length: 200 }, () => ({ type: "delta", sessionId: "s", text: " More detail." }))),
        Stream.concat(
          Stream.fromEffect(Effect.promise(() => reasoningGate.promise.then(() => JSON.stringify({ type: "heartbeat" })))),
          Stream.concat(
            events(Array.from({ length: 200 }, () => ({ type: "reasoning", sessionId: "s", text: "Checking. " }))),
            Stream.fromEffect(Effect.promise(() => doneGate.promise.then(() => JSON.stringify({ type: "done", sessionId: "s", text: `**Inspecting** the drawing.Summary.${suffix}` }))))
          )
        )
      )
    )
  ))
  const { dispose } = app.visit("/ai")
  try {
    const input = await app.wait(() => document.querySelector<HTMLTextAreaElement>("textarea.assistant-prompt"), 30000)
    input.value = "Inspect the current workspace"
    input.dispatchEvent(new window.Event("input", { bubbles: true }))
    document.querySelector<HTMLButtonElement>("button.assistant-send")!.click()
    const group = await app.wait(() => newest()?.querySelector<HTMLDetailsElement>('[data-testid="ai-tool-group"]'), 15000)
    const answer = newest()!
    const firstMarkdown = answer.querySelector('[data-testid="ai-markdown"] strong')!
    const summary = [...answer.querySelectorAll('[data-testid="ai-markdown"]')].at(-1)!
    const rows = [...group.querySelectorAll('[data-testid="tool-call"]')]
    const raw = rows[1]!.querySelector<HTMLDetailsElement>('[data-testid="tool-raw"]')!
    expect(raw.querySelector("pre")).toBeNull()
    group.open = true
    raw.open = true
    raw.dispatchEvent(new window.Event("toggle"))
    await app.wait(() => raw.querySelector("pre"))
    expect(raw.textContent).toContain("payload")
    expect(raw.textContent!.length).toBeLessThan(6500)

    // The burst must update existing rows, preserving an already opened disclosure.
    textGate.release()
    await app.wait(() => summary.textContent?.includes(`Summary.${suffix}`) || undefined, 10000)
    expect(newest()).toBe(answer)
    expect(answer.querySelector('[data-testid="ai-tool-group"]')).toBe(group)
    expect([...group.querySelectorAll('[data-testid="tool-call"]')]).toEqual(rows)
    expect(rows[1]!.querySelector('[data-testid="tool-raw"]')).toBe(raw)
    expect(raw.open).toBe(true)
    expect(group.open).toBe(true)
    expect(answer.querySelector('[data-testid="ai-markdown"] strong')).toBe(firstMarkdown)

    const summaryParagraph = summary.firstChild
    reasoningGate.release()
    await app.wait(() => answer.querySelector('[data-testid="ai-thinking"]')?.textContent?.includes("Checking. ".repeat(200)) || undefined, 10000)
    expect(summary.firstChild).toBe(summaryParagraph)
    expect(newest()).toBe(answer)
    expect(raw.open).toBe(true)
    doneGate.release()
    await app.wait(() => answer.querySelector('[data-testid="ai-turn-footer"]'), 10000)
    expect(newest()).toBe(answer)
    expect(summary.textContent?.trim()).toBe(`Summary.${suffix}`)
  } finally {
    textGate.release(); reasoningGate.release(); doneGate.release()
    dispose()
    client.ai.chatStream = original
  }
}, 60000)
