import { BUILTIN_PROVIDER_IDS, DEFAULT_MINIMAX_BASE_URL, allModels, type BuiltinProviderId } from "../models.ts"
import { SUBAGENT_IDS, SUBAGENTS, subagentPermission } from "./agents.ts"

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
export const CADCAM_WORKER = SUBAGENTS.researcher.host
export const BACKGROUND_TOOL_IDS = ["agent_task", "agent_tasks", "agent_task_read", "agent_task_cancel"] as const

/** What the read-only researcher may call (verification persists operation metadata, so it is not a worker tool). */
export const WORKER_TOOL_IDS = SUBAGENTS.researcher.tools

export const workerToolAllowed = (id: string): boolean => WORKER_TOOL_IDS.includes(id)

export type HostProtocol = "openai-compatible" | "openai-responses" | "anthropic"

export interface HostProviderSpec {
  readonly id: string
  readonly name: string
  readonly protocol: HostProtocol
  readonly baseURL: string
  readonly models: ReadonlyArray<{ readonly id: string; readonly name: string; readonly context: number; readonly output: number; readonly vision?: boolean; readonly pdf?: boolean }>
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
      // nikcli asks a model for min(its output limit, 32 000) tokens: a long cad_add_elements call needs room to be written.
      models: allModels([id]).map((m) => ({ id: m.id, name: m.id, context: m.contextWindow, output: 32_000, vision: m.vision, pdf: id === "anthropic" || m.id.startsWith("anthropic/") }))
    }
  })

export interface HostConfigInput {
  readonly providers: ReadonlyArray<HostProviderSpec>
  /** Ids of the tools registered by this package; the only ones the agent may use. */
  readonly toolIds: ReadonlyArray<string>
  readonly systemPrompt: string
  readonly compaction?: HostCompactionSettings
}

/** Settings supported by the pinned host, not a client-side token budget. */
export interface HostCompactionSettings {
  readonly auto?: boolean
  readonly prune?: boolean
  readonly reserved?: number
}

export const validateCompactionSettings = (settings: HostCompactionSettings): void => {
  if (settings.auto !== undefined && typeof settings.auto !== "boolean") throw new Error("compaction.auto must be a boolean")
  if (settings.prune !== undefined && typeof settings.prune !== "boolean") throw new Error("compaction.prune must be a boolean")
  if (settings.reserved !== undefined && (!Number.isSafeInteger(settings.reserved) || settings.reserved < 0)) {
    throw new Error("compaction.reserved must be a non-negative safe integer")
  }
}

export const buildHostConfig = (input: HostConfigInput): Record<string, unknown> => {
  validateCompactionSettings(input.compaction ?? {})
  // Rules are evaluated last-match-wins. The trailing-`*` deny makes the host treat the
  // agent as "curated": allowed tools are active, every built-in tool is removed.
  const permission: Record<string, "allow" | "deny" | "ask"> = { "*": "deny" }
  for (const id of input.toolIds) permission[id] = "allow"
  permission["invalid"] = "allow"
  permission["search_tools"] = "allow"
  // The playbooks in `skills/index.ts`: loading one only reads text this package wrote.
  permission["skill"] = "allow"
  // The plan the agent keeps while it works (nikcli's own todo list): data only, nothing it can run.
  permission["todowrite"] = "allow"
  permission["todoread"] = "allow"
  // The host's goal loop: one objective, and the host keeps the agent working on it until it is verified complete.
  permission["create_goal"] = "allow"
  permission["get_goal"] = "allow"
  permission["update_goal"] = "allow"
  permission["task"] = "deny"
  // nikcli's confined program runner: a restricted JavaScript subset (no import, fetch, process, files or timers) whose only
  // tools are the ones this agent may call, so a loop of `cad_add_elements` or `cam_create_operation` is one call and only the
  // final value comes back.
  permission["code_mode"] = "allow"
  // One agent per specialist of the roster (`agents.ts`), each with only its own tools.
  const specialists = Object.fromEntries(
    SUBAGENT_IDS.map((id) => {
      const spec = SUBAGENTS[id]
      return [spec.host, { mode: "subagent", description: spec.description, steps: spec.steps, prompt: spec.prompt, permission: subagentPermission(spec, input.toolIds) }]
    })
  )

  const provider: Record<string, unknown> = {}
  for (const p of input.providers) {
    provider[p.id] = {
      name: p.name,
      npm: p.protocol === "anthropic" ? "@ai-sdk/anthropic" : p.protocol === "openai-responses" ? "@ai-sdk/openai" : "@ai-sdk/openai-compatible",
      options: { baseURL: p.baseURL, protocol: p.protocol },
      models: Object.fromEntries(
        p.models.map((m) => [
          m.id,
          { name: m.name, tool_call: true, ...(m.vision !== undefined || m.pdf !== undefined ? { attachment: m.vision === true || m.pdf === true, modalities: { input: ["text", ...(m.vision ? ["image"] : []), ...(m.pdf ? ["pdf"] : [])], output: ["text"] } } : {}), limit: { context: m.context, output: m.output } }
        ])
      )
    }
  }

  return {
    share: "disabled",
    autoupdate: false,
    snapshot: false,
    compaction: { auto: true, prune: true, ...input.compaction },
    username: "cadcam",
    provider,
    default_agent: CADCAM_AGENT,
    agent: {
      [CADCAM_AGENT]: {
        mode: "primary",
        description: "CAD/CAM assistant",
        // No step cap, as in nikcli (`agent.steps ?? Infinity`): one request runs from the model through the machining to the
        // check for as long as it takes. What ends it is the host's doom-loop guard, the goal budget, or the user's abort.
        prompt: input.systemPrompt,
        permission
      },
      ...specialists,
      // Background helpers would spend extra model calls on titles and summaries.
      title: { disable: true },
      summary: { disable: true }
    }
  }
}
