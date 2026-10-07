import { BUILTIN_PROVIDER_IDS, DEFAULT_MINIMAX_BASE_URL, allModels, type BuiltinProviderId } from "../models.ts"

/**
 * Builds the host's global `nikcli.json`. It contains no secrets: keys are
 * pushed separately through `provider.api`. The host's built-in model
 * catalogue is unavailable with `NIKCLI_DISABLE_MODELS_FETCH`, so every provider
 * the app uses is declared here from the single `models.ts` catalogue.
 *
 * `enabled_providers` is deliberately NOT set: nikcli turns it into a
 * deny-everything-then-allow-list policy, which would hide every models.dev
 * provider we do not declare here. Leaving it out lets the user pick any
 * provider and model the host knows (`provider.list()`), while the entries
 * below only override base URL / protocol for the ones we care about.
 */
export const CADCAM_AGENT = "cadcam"

export type HostProtocol = "openai-compatible" | "openai-responses" | "anthropic"

export interface HostProviderSpec {
  readonly id: string
  readonly name: string
  readonly protocol: HostProtocol
  readonly baseURL: string
  readonly models: ReadonlyArray<{ readonly id: string; readonly name: string; readonly context: number; readonly output: number }>
}

const PROTOCOLS: Readonly<Record<BuiltinProviderId, { name: string; protocol: HostProtocol; baseURL: string }>> = {
  anthropic: { name: "Anthropic", protocol: "anthropic", baseURL: "https://api.anthropic.com/v1" },
  openai: { name: "OpenAI", protocol: "openai-responses", baseURL: "https://api.openai.com/v1" },
  minimax: { name: "MiniMax", protocol: "openai-compatible", baseURL: DEFAULT_MINIMAX_BASE_URL },
  gateway: { name: "AI Gateway", protocol: "openai-compatible", baseURL: "https://ai-gateway.vercel.sh/v1" }
}

/** One entry per built-in provider; every other provider comes from models.dev through the host. */
export const defaultProviderSpecs = (baseUrls: Partial<Record<BuiltinProviderId, string>> = {}): ReadonlyArray<HostProviderSpec> =>
  BUILTIN_PROVIDER_IDS.map((id) => {
    const p = PROTOCOLS[id]
    return {
      id,
      name: p.name,
      protocol: p.protocol,
      baseURL: baseUrls[id] ?? p.baseURL,
      models: allModels([id]).map((m) => ({ id: m.id, name: m.id, context: m.contextWindow, output: 16_000 }))
    }
  })

export interface HostConfigInput {
  readonly providers: ReadonlyArray<HostProviderSpec>
  /** Ids of the tools registered by this package; the only ones the agent may use. */
  readonly toolIds: ReadonlyArray<string>
  readonly systemPrompt: string
}

export const buildHostConfig = (input: HostConfigInput): Record<string, unknown> => {
  // Rules are evaluated last-match-wins. The trailing-`*` deny makes the host treat the
  // agent as "curated": allowed tools are active, every built-in tool is removed.
  const permission: Record<string, "allow" | "deny" | "ask"> = { "*": "deny" }
  for (const id of input.toolIds) permission[id] = "allow"
  permission["invalid"] = "allow"

  const provider: Record<string, unknown> = {}
  for (const p of input.providers) {
    provider[p.id] = {
      name: p.name,
      npm: p.protocol === "anthropic" ? "@ai-sdk/anthropic" : p.protocol === "openai-responses" ? "@ai-sdk/openai" : "@ai-sdk/openai-compatible",
      options: { baseURL: p.baseURL, protocol: p.protocol },
      models: Object.fromEntries(
        p.models.map((m) => [
          m.id,
          { name: m.name, tool_call: true, limit: { context: m.context, output: m.output } }
        ])
      )
    }
  }

  return {
    share: "disabled",
    autoupdate: false,
    snapshot: false,
    username: "cadcam",
    provider,
    default_agent: CADCAM_AGENT,
    agent: {
      [CADCAM_AGENT]: {
        mode: "primary",
        description: "CAD/CAM assistant",
        prompt: input.systemPrompt,
        permission
      },
      // Background helpers would spend extra model calls on titles and summaries.
      title: { disable: true },
      summary: { disable: true }
    }
  }
}
