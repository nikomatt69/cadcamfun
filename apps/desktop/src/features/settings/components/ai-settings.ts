import { Effect } from "effect"
import type { Client } from "../../../shared/state/client.ts"

export type McpStrategy = "aggressive" | "balanced" | "conservative"

export interface AiSettings {
  autoSuggest: boolean
  cacheEnabled: boolean
  analyticsEnabled: boolean
  maxTokens: number
  suggestThreshold: number
  customPrompts: Record<string, string>
  autoModelSelection: boolean
  costOptimization: boolean
  mcpEnabled: boolean
  mcpStrategy: McpStrategy
  mcpCacheLifetime: number
  mcpEndpoint: string
  multiProviderEnabled: boolean
}

export interface AiSettingsPayload {
  temperature: number
  settings: AiSettings
}

export const AI_SETTINGS_KEY = "aiSettings"
export const DEFAULT_TEMPERATURE = 0.7

export const defaultAiSettings = (): AiSettings => ({
  autoSuggest: true,
  cacheEnabled: true,
  analyticsEnabled: true,
  maxTokens: 6000,
  suggestThreshold: 0.7,
  customPrompts: {},
  autoModelSelection: true,
  costOptimization: true,
  mcpEnabled: true,
  mcpStrategy: "balanced",
  mcpCacheLifetime: 3600000,
  mcpEndpoint: "/api/mcp-protocol",
  multiProviderEnabled: true
})

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const bounded = (value: unknown, fallback: number, min: number, max: number): number =>
  typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : fallback

// Rebuild the allowlisted payload rather than spreading legacy data that may contain credentials or a stale model.
export const sanitizeAiSettings = (value: unknown): AiSettingsPayload => {
  const root = isRecord(value) ? value : {}
  const raw = isRecord(root.settings) ? root.settings : {}
  const defaults = defaultAiSettings()
  const boolean = (key: keyof AiSettings): boolean =>
    typeof raw[key] === "boolean" ? raw[key] : defaults[key] === true
  const customPrompts = isRecord(raw.customPrompts)
    ? Object.fromEntries(Object.entries(raw.customPrompts).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
    : {}
  const endpoint = typeof raw.mcpEndpoint === "string" && /^\/(?!\/)[^?#\s]*$/.test(raw.mcpEndpoint)
    ? raw.mcpEndpoint : defaults.mcpEndpoint
  return {
    temperature: bounded(root.temperature, DEFAULT_TEMPERATURE, 0, 1),
    settings: {
      autoSuggest: boolean("autoSuggest"),
      cacheEnabled: boolean("cacheEnabled"),
      analyticsEnabled: boolean("analyticsEnabled"),
      maxTokens: Number.isInteger(raw.maxTokens) ? bounded(raw.maxTokens, defaults.maxTokens, 1000, 8000) : defaults.maxTokens,
      suggestThreshold: bounded(raw.suggestThreshold, defaults.suggestThreshold, 0.1, 0.9),
      customPrompts,
      autoModelSelection: boolean("autoModelSelection"),
      costOptimization: boolean("costOptimization"),
      mcpEnabled: boolean("mcpEnabled"),
      mcpStrategy: raw.mcpStrategy === "aggressive" || raw.mcpStrategy === "conservative" || raw.mcpStrategy === "balanced"
        ? raw.mcpStrategy : defaults.mcpStrategy,
      mcpCacheLifetime: bounded(raw.mcpCacheLifetime, defaults.mcpCacheLifetime, 3600000, 604800000),
      mcpEndpoint: endpoint,
      multiProviderEnabled: boolean("multiProviderEnabled")
    }
  }
}

type DecodedKvMethod<K extends "get" | "set"> = (
  request: Parameters<Client["kv"][K]>[0] & { readonly responseMode?: "decoded-only" }
) => ReturnType<Client["kv"][K]>

export type AiSettingsClient = { readonly kv: {
  readonly get: DecodedKvMethod<"get">
  readonly set: DecodedKvMethod<"set">
} }

export const loadAiSettings = Effect.fn("AiSettings.load")(function* (client: AiSettingsClient) {
  const value = yield* client.kv.get({ params: { key: AI_SETTINGS_KEY } }).pipe(
    Effect.map((entry) => entry.value),
    Effect.catchTag("NotFound", () => Effect.succeed(undefined))
  )
  return sanitizeAiSettings(value)
})

export const saveAiSettings = Effect.fn("AiSettings.save")(function* (client: AiSettingsClient, value: unknown) {
  const sanitized = sanitizeAiSettings(value)
  yield* client.kv.set({ params: { key: AI_SETTINGS_KEY }, payload: { value: sanitized } })
  return sanitized
})
