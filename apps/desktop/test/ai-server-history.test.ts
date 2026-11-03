import { expect, test } from "bun:test"
import type { AiSessionMessage } from "@cadcamfun/api"
import { conversationCost } from "../src/features/ai/lib/cost.ts"
import { serverMessages } from "../src/features/ai/lib/server-history.ts"

const row = (id: string, role: "user" | "assistant", usage?: { inputTokens: number; outputTokens: number }): AiSessionMessage => ({
  id, role, text: id, createdAt: "2026-11-03T10:00:00.000Z", agent: null, model: null, error: null, truncated: false, tools: [], ...(usage ? { usage } : {})
})

test("a reopened conversation keeps the tokens the host reported, so its cost adds up as the live one did", () => {
  const messages = serverMessages([
    row("u1", "user"),
    row("a1", "assistant", { inputTokens: 2_000_000, outputTokens: 100_000 }),
    row("u2", "user"),
    row("a2", "assistant", { inputTokens: 1_000_000, outputTokens: 0 })
  ], "s1")
  expect(messages.map((m) => m.usage)).toEqual([undefined, { inputTokens: 2_000_000, outputTokens: 100_000 }, undefined, { inputTokens: 1_000_000, outputTokens: 0 }])
  // USD per million tokens: 3 * 2 + 15 * 0.1 + 3 * 1.
  expect(conversationCost(messages, { input: 3, output: 15 })).toBeCloseTo(10.5, 10)
})

test("a history without usage stays unknown instead of costing nothing", () => {
  expect(conversationCost(serverMessages([row("a1", "assistant")], "s1"), { input: 3, output: 15 })).toBeUndefined()
})
