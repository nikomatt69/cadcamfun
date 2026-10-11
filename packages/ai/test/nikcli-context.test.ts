import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { buildHostConfig } from "../src/nikcli/config.ts"
import { compactHostSession, readHostContextPolicy } from "../src/nikcli/context.ts"
import { mapHostEvent, newMapperState } from "../src/nikcli/event-mapper.ts"
import type { ProjectHost } from "../src/nikcli/runtime.ts"

describe("host context management", () => {
  test("preserves automatic host defaults and disabled billing helpers", () => {
    const config = buildHostConfig({ providers: [], toolIds: [], systemPrompt: "CAD" })
    expect(config["compaction"]).toEqual({ auto: true, prune: true })
    expect(config["agent"]).toMatchObject({ title: { disable: true }, summary: { disable: true } })
    const custom = buildHostConfig({ providers: [], toolIds: [], systemPrompt: "CAD", compaction: { auto: false, prune: false, reserved: 0 } })
    expect(custom["compaction"]).toEqual({ auto: false, prune: false, reserved: 0 })
    for (const reserved of [-1, 0.5, NaN, Infinity]) {
      expect(() => buildHostConfig({ providers: [], toolIds: [], systemPrompt: "CAD", compaction: { reserved } })).toThrow()
    }
  })

  test("reads effective settings without usage estimates or model requests", async () => {
    const host = { client: { config: { get: async () => ({ compaction: { auto: false, reserved: 123 } }) } } } as unknown as ProjectHost
    expect(await Effect.runPromise(readHostContextPolicy(host))).toEqual({ source: "host-config", auto: false, prune: true, reserved: 123 })
  })

  test("manual compaction disables automatic continuation and checks stored failures", async () => {
    const calls: unknown[] = []
    let failed = false
    let summaryId = 0
    const host = { client: { session: {
      summarize: async (input: unknown) => { calls.push(input); summaryId++; return true },
      messages: async () => [{ info: { id: `summary-${summaryId}`, summary: true, ...(failed ? { error: { data: { message: "provider unavailable" } } } : {}) }, parts: [] }]
    } } } as unknown as ProjectHost
    const model = { providerID: "fake", modelID: "fake-model" }
    await Effect.runPromise(compactHostSession(host, "ses-test", model))
    expect(calls).toEqual([{ sessionID: "ses-test", ...model, auto: false }])
    failed = true
    await expect(Effect.runPromise(compactHostSession(host, "ses-test", model))).rejects.toThrow("provider unavailable")
  })

  test("internal summary deltas never become chat output, other sessions stay isolated", () => {
    const state = newMapperState()
    mapHostEvent("ses-a", { type: "message.updated", properties: { info: { sessionID: "ses-a", id: "summary", role: "assistant", summary: true, agent: "compaction" } } }, state)
    const delta = (messageID: string) => ({ type: "message.part.updated", properties: { delta: "text", part: { sessionID: "ses-a", messageID, type: "text" } } })
    expect(mapHostEvent("ses-a", delta("summary"), state)).toEqual([])
    mapHostEvent("ses-a", { type: "message.updated", properties: { info: { sessionID: "ses-b", id: "answer", summary: true } } }, state)
    expect(mapHostEvent("ses-a", delta("answer"), state)).toEqual([{ type: "delta", sessionId: "ses-a", text: "text" }])
    // A compaction is reported as its own event, never as text.
    expect(mapHostEvent("ses-a", { type: "session.compacted", properties: { sessionID: "ses-a" } }, state)).toEqual([{ type: "compaction", sessionId: "ses-a", phase: "finish" }, { type: "compacted", sessionId: "ses-a" }])
    expect(mapHostEvent("ses-b", { type: "session.compacted", properties: { sessionID: "ses-a" } }, state)).toEqual([])
  })

  test("an old successful summary is not proof of a new compaction", async () => {
    const host = { client: { session: {
      summarize: async () => true,
      messages: async () => [{ info: { id: "old-summary", summary: true }, parts: [] }]
    } } } as unknown as ProjectHost
    await expect(Effect.runPromise(compactHostSession(host, "ses-test", { providerID: "fake", modelID: "fake-model" }))).rejects.toThrow("did not produce")
  })
})
