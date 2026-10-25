/**
 * The modules the assistant's own architecture is made of (spec 06-desktop-ui.md §1).
 *
 * Each of them answers one question on its own — which panel is open, what a turn
 * cost, what a search finds, what the host suggests for what is being typed, what
 * a streamed event does to the conversation — so each is tested on its own, without
 * mounting the assistant or running a sidecar.
 */
import { describe, expect, test } from "bun:test"
import { createRoot, createSignal } from "solid-js"
import { PANEL_IDS, isPanelId, nextPanel } from "../src/features/ai/lib/panels.ts"
import { conversationCost, costOf, formatCost, ratesFor } from "../src/features/ai/lib/cost.ts"
import { filterMessages, matchCount, matchesQuery } from "../src/features/ai/lib/search.ts"
import { createCompletion } from "../src/features/ai/lib/completion.ts"
import { mergeTasks, nextMessageId } from "../src/features/ai/store/events.ts"
import type { AiMessage, AiTask, ProviderInfo } from "../src/features/ai/lib/types.ts"

describe("the panels of the assistant", () => {
  test("opening a panel closes the one that was open", () => {
    expect(nextPanel(undefined, "tools")).toBe("tools")
    expect(nextPanel("tools", "stats")).toBe("stats")
    expect(nextPanel("tools", "tools")).toBeUndefined()
  })

  test("every panel name is known, and nothing else is", () => {
    for (const id of PANEL_IDS) expect(isPanelId(id)).toBe(true)
    expect(isPanelId("nope")).toBe(false)
    expect(isPanelId("")).toBe(false)
  })
})

describe("what a conversation costs", () => {
  const providers: ReadonlyArray<ProviderInfo> = [
    {
      id: "anthropic",
      name: "Anthropic",
      source: "config",
      auth: ["api"],
      configured: true,
      models: [{ id: "sonnet", name: "Sonnet", provider: "anthropic", contextWindow: 200_000, maxOutput: 8192, tools: true, vision: true, cost: { input: 3, output: 15 } }]
    }
  ]

  test("the price of a model comes from the catalogue", () => {
    expect(ratesFor({ provider: "anthropic", model: "sonnet" }, providers)).toEqual({ input: 3, output: 15 })
    expect(ratesFor({ provider: "anthropic", model: "other" }, providers)).toBeUndefined()
    expect(ratesFor(undefined, providers)).toBeUndefined()
  })

  test("a turn costs what its tokens cost", () => {
    const rates = { input: 3, output: 15 }
    // 1 000 input tokens at $3 per million is $0.003; 500 output at $15 is $0.0075.
    expect(costOf({ inputTokens: 1000, outputTokens: 500 }, rates)).toBeCloseTo(0.0105, 8)
    expect(costOf(undefined, rates)).toBeUndefined()
    expect(costOf({ inputTokens: 1000, outputTokens: 500 }, undefined)).toBeUndefined()
  })

  test("a conversation costs what its turns cost", () => {
    const rates = { input: 3, output: 15 }
    const messages = [{ usage: { inputTokens: 1000, outputTokens: 0 } }, { usage: { inputTokens: 0, outputTokens: 1000 } }, {}]
    expect(conversationCost(messages, rates)).toBeCloseTo(0.003 + 0.015, 8)
    // Nothing was reported, so nothing is claimed.
    expect(conversationCost([{}, {}], rates)).toBeUndefined()
  })

  test("a price is shown the way it reads", () => {
    expect(formatCost(undefined)).toBe("—")
    expect(formatCost(0)).toBe("$0.00")
    expect(formatCost(0.0004)).toBe("$0.0004")
    expect(formatCost(1.5)).toBe("$1.50")
  })
})

describe("finding something in a conversation", () => {
  const message = (text: string): AiMessage => ({
    id: text,
    role: "assistant",
    text,
    createdAt: "2026-01-01T00:00:00.000Z",
    events: [],
    status: "done"
  })

  test("a message carries the query whatever its case", () => {
    expect(matchesQuery(message("The wall thickness is 3 mm"), "wall")).toBe(true)
    expect(matchesQuery(message("The wall thickness is 3 mm"), "WALL")).toBe(true)
    expect(matchesQuery(message("The wall thickness is 3 mm"), "hole")).toBe(false)
  })

  test("an empty query keeps everything", () => {
    const messages = [message("one"), message("two")]
    expect(filterMessages(messages, "")).toHaveLength(2)
    expect(filterMessages(messages, "  ")).toHaveLength(2)
  })

  test("only the messages that carry the query are kept", () => {
    const messages = [message("one"), message("two"), message("three")]
    expect(filterMessages(messages, "t").map((m) => m.text)).toEqual(["two", "three"])
    expect(matchCount(messages, "t")).toBe(2)
    expect(matchCount(messages, "")).toBe(3)
  })
})

describe("the suggestion for what is being typed", () => {
  test("a short question is not completed", async () => {
    const asked: string[] = []
    const handle = createRoot((dispose) => {
      const [prompt, setPrompt] = createSignal("hi")
      const completion = createCompletion({ prompt, complete: async (text) => { asked.push(text); return "there" }, delay: 1 })
      queueMicrotask(() => setPrompt("hi"))
      setTimeout(() => dispose(), 30)
      return completion
    })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(asked).toHaveLength(0)
    expect(handle.suggestion()).toBeUndefined()
  })

  test("a real question is completed, and the suggestion is what follows", async () => {
    const handle = createRoot((dispose) => {
      const [prompt, setPrompt] = createSignal("the wall thickness should be 3 mm")
      const completion = createCompletion({ prompt, complete: async () => "the wall thickness should be 3 mm for a 20 mm bar", delay: 1 })
      setTimeout(() => dispose(), 60)
      return completion
    })
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(handle.suggestion()).toBe(" for a 20 mm bar")
    expect(handle.accept()).toBe(" for a 20 mm bar")
    // The suggestion is taken once.
    expect(handle.suggestion()).toBeUndefined()
  })

  test("a suggestion for text the user moved on from is dropped", async () => {
    let setPrompt: (next: string) => void = () => {}
    let resolveFirst: ((value: string) => void) | undefined
    const handle = createRoot((dispose) => {
      const [prompt, set] = createSignal("the wall thickness should be 3 mm")
      setPrompt = set
      const completion = createCompletion({
        prompt,
        // The first question is answered late; the second one is never answered.
        complete: (text) => text.includes("3 mm")
          ? new Promise<string>((resolve) => { resolveFirst = resolve })
          : new Promise<string>(() => {}),
        delay: 1
      })
      setTimeout(() => dispose(), 200)
      return completion
    })
    await new Promise((resolve) => setTimeout(resolve, 20))
    // The user types on before the host answers.
    setPrompt("the wall thickness should be 4 mm")
    await new Promise((resolve) => setTimeout(resolve, 20))
    resolveFirst?.("the wall thickness should be 3 mm for a 20 mm bar")
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(handle.suggestion()).toBeUndefined()
  })
})

describe("what a task tool answered", () => {
  test("one task and a list of tasks are both merged", () => {
    const one = mergeTasks([], JSON.stringify({ id: "t1", agent: "researcher", description: "look", status: "running" }))
    expect(one).toHaveLength(1)
    expect(one[0]?.id).toBe("t1")
    const many = mergeTasks(one, JSON.stringify([{ id: "t2", status: "completed" }]))
    expect(many.map((task: AiTask) => task.id)).toEqual(["t1", "t2"])
  })

  test("an answer that is not a task changes nothing", () => {
    const current: ReadonlyArray<AiTask> = []
    expect(mergeTasks(current, "not json")).toHaveLength(0)
    expect(mergeTasks(current, JSON.stringify({ id: 1 }))).toHaveLength(0)
  })
})

describe("the ids of the messages", () => {
  test("two messages never share an id", () => {
    const first = nextMessageId()
    const second = nextMessageId()
    expect(first).not.toBe(second)
  })
})
