import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { buildHostConfig, defaultProviderSpecs } from "../src/nikcli/config.ts"
import { compactHostSession, readHostContextPolicy } from "../src/nikcli/context.ts"
import { mapHostEvent, newMapperState } from "../src/nikcli/event-mapper.ts"
import type { ProjectHost } from "../src/nikcli/runtime.ts"

describe("host context management", () => {
  test("primary loops and provider inactivity are bounded without overriding catalogue routing", () => {
    const config = buildHostConfig({ providers: defaultProviderSpecs(), toolIds: [], systemPrompt: "CAD" }) as {
      agent: Record<string, { steps?: number }>; provider: Record<string, { options: Record<string, unknown> }>
    }
    for (const id of ["cadcam", "cadcam-cad", "cadcam-cam", "cadcam-auto", "cadcam-cad-ask"]) expect(config.agent[id]?.steps).toBe(25)
    for (const provider of Object.values(config.provider)) {
      expect(provider.options).toEqual({ headerTimeout: 120_000, chunkTimeout: 120_000 })
    }
  })
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

  test("a machining turn is not cut off by the host's editing-sized deadlines", () => {
    // The pinned host defaults to 600_000 per tool and 1_800_000 per task, which aborts a long generate or
    // verification mid-flight. The budgets are declared, validated, and overridable; `false` keeps the default.
    expect(buildHostConfig({ providers: [], toolIds: [], systemPrompt: "CAD" })["experimental"]).toEqual({
      brain: true, memory: true, tool_timeout: 1_800_000, task_timeout: 3_600_000
    })
    expect(buildHostConfig({ providers: [], toolIds: [], systemPrompt: "CAD", timeouts: { tool: false, task: 60_000 } })["experimental"])
      .toMatchObject({ tool_timeout: false, task_timeout: 60_000 })
    for (const timeouts of [{ tool: 0 }, { tool: -1 }, { tool: 1.5 }, { task: NaN }, { task: Infinity }]) {
      expect(() => buildHostConfig({ providers: [], toolIds: [], systemPrompt: "CAD", timeouts })).toThrow()
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
