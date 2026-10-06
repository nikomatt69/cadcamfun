import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { InternalError, NotFound } from "@cadcamfun/api"
import {
  AI_SETTINGS_KEY, defaultAiSettings, loadAiSettings, sanitizeAiSettings, saveAiSettings,
  type AiSettingsClient
} from "./ai-settings.ts"

const fakeClient = (initial?: unknown) => {
  const entries = new Map<string, unknown>()
  if (initial !== undefined) entries.set(AI_SETTINGS_KEY, initial)
  const client: AiSettingsClient = {
    kv: {
      get: ({ params }) => entries.has(params.key)
        ? Effect.succeed({ key: params.key, value: entries.get(params.key), updatedAt: "2026-10-06" })
        : Effect.fail(new NotFound({ message: "Missing settings" })),
      set: ({ params, payload }) => Effect.sync(() => {
        entries.set(params.key, payload.value)
        return { key: params.key, value: payload.value, updatedAt: "2026-10-06" }
      })
    }
  }
  return { client, entries }
}

describe("AI settings sanitization", () => {
  test("missing and malformed payloads use independent defaults", () => {
    for (const input of [undefined, null, [], "broken", { settings: [] }]) {
      expect(sanitizeAiSettings(input)).toEqual({ temperature: 0.7, settings: defaultAiSettings() })
    }
    const first = sanitizeAiSettings(undefined)
    first.settings.customPrompts.changed = "prompt"
    expect(sanitizeAiSettings(undefined).settings.customPrompts).toEqual({})
  })

  test("valid legacy controls survive while credentials and model ownership do not", () => {
    const sanitized = sanitizeAiSettings({
      model: "old-claude", apiKey: "secret", temperature: 0,
      settings: {
        autoSuggest: false, analyticsEnabled: false, maxTokens: 8000,
        suggestThreshold: 0.9, mcpStrategy: "aggressive", mcpCacheLifetime: 604800000,
        mcpEndpoint: "/api/custom-mcp", customPrompts: { cad: "help", invalid: 12 },
        mcpApiKey: "secret", preferredProvider: "claude", providerKeys: { openai: "secret" }
      }
    })
    expect(sanitized.temperature).toBe(0)
    expect(sanitized.settings).toMatchObject({
      autoSuggest: false, analyticsEnabled: false, maxTokens: 8000, suggestThreshold: 0.9,
      mcpStrategy: "aggressive", mcpCacheLifetime: 604800000, mcpEndpoint: "/api/custom-mcp",
      customPrompts: { cad: "help" }
    })
    expect(JSON.stringify(sanitized)).not.toContain("secret")
    expect(sanitized).not.toHaveProperty("model")
    expect(sanitized.settings).not.toHaveProperty("preferredProvider")
  })

  test("invalid types, non-finite numbers, old cache units and unsafe endpoints reset", () => {
    expect(sanitizeAiSettings({ temperature: NaN, settings: {
      autoSuggest: "false", maxTokens: 6000.5, suggestThreshold: Infinity,
      mcpStrategy: "unknown", mcpCacheLifetime: 3600, mcpEndpoint: "//external.test/key?token=secret"
    } })).toEqual({ temperature: 0.7, settings: defaultAiSettings() })
    for (const endpoint of ["https://external.test", "/api/mcp?apiKey=secret", "/api/mcp#secret"]) {
      expect(sanitizeAiSettings({ settings: { mcpEndpoint: endpoint } }).settings.mcpEndpoint)
        .toBe("/api/mcp-protocol")
    }
  })
})

describe("typed KV settings persistence", () => {
  test("missing KV entry loads defaults", async () => {
    expect(await Effect.runPromise(loadAiSettings(fakeClient().client)))
      .toEqual({ temperature: 0.7, settings: defaultAiSettings() })
  })

  test("save and load round-trip only sanitized preferences under the legacy key", async () => {
    const { client, entries } = fakeClient()
    const saved = await Effect.runPromise(saveAiSettings(client, {
      temperature: 0.2, model: "stale", settings: { cacheEnabled: false, mcpApiKey: "secret" }
    }))
    expect([...entries.keys()]).toEqual([AI_SETTINGS_KEY])
    expect(entries.get(AI_SETTINGS_KEY)).toEqual(saved)
    expect(JSON.stringify(entries.get(AI_SETTINGS_KEY))).not.toContain("secret")
    expect(await Effect.runPromise(loadAiSettings(client))).toEqual(saved)
  })

  test("loading legacy KV values sanitizes before returning them", async () => {
    const { client } = fakeClient({ settings: { mcpApiKey: "secret", costOptimization: false } })
    const result = await Effect.runPromise(loadAiSettings(client))
    expect(result.settings.costOptimization).toBe(false)
    expect(result.settings).not.toHaveProperty("mcpApiKey")
  })

  test("server failures are not silently converted to defaults or save success", async () => {
    const { client } = fakeClient()
    const failing: AiSettingsClient = { kv: {
      ...client.kv,
      get: () => Effect.fail(new InternalError({ message: "Read failed" })),
      set: () => Effect.fail(new InternalError({ message: "Write failed" }))
    } }
    await expect(Effect.runPromise(loadAiSettings(failing))).rejects.toMatchObject({ _tag: "InternalError" })
    await expect(Effect.runPromise(saveAiSettings(failing, {}))).rejects.toMatchObject({ _tag: "InternalError" })
  })
})
