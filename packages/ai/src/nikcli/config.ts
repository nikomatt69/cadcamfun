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
export const CADCAM_WORKER = "cadcam-worker"
export const BACKGROUND_TOOL_IDS = ["agent_task", "agent_tasks", "agent_task_read", "agent_task_cancel"] as const

// Verification currently persists operation metadata, so it is not a worker tool.
export const WORKER_TOOL_IDS = [
  "cad_describe_drawing", "cad_check_design", "cam_list_operations", "cam_suggest_parameters",
  "cam_describe_machine", "cam_analyze_gcode", "lib_lookup_material", "lib_lookup_tool", "memory_recall"
] as const

export const workerToolAllowed = (id: string): boolean => (WORKER_TOOL_IDS as ReadonlyArray<string>).includes(id)

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
  const workerPermission: Record<string, "allow" | "deny"> = { "*": "deny" }
  for (const id of input.toolIds) if (workerToolAllowed(id)) workerPermission[id] = "allow"
  workerPermission["skill"] = "allow"

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
    compaction: { auto: true, prune: true, ...input.compaction },
    username: "cadcam",
    provider,
    default_agent: CADCAM_AGENT,
    agent: {
      [CADCAM_AGENT]: {
        mode: "primary",
        description: "CAD/CAM assistant",
        // Many steps, so one request can run from the model through the machining to the check; the host stops a doom loop itself.
        steps: 200,
        prompt: input.systemPrompt,
        permission
      },
      [CADCAM_WORKER]: {
        mode: "subagent",
        description: "Read-only CAD/CAM background researcher",
        steps: 40,
        prompt: "Research the assigned CAD/CAM question using read-only tools. Return concise findings, evidence, warnings and recommended next steps to the parent. Never modify a document, delegate work, create or update goals, or claim a change was applied. Verification that stores results must be performed by the parent.",
        permission: workerPermission
      },
      // Background helpers would spend extra model calls on titles and summaries.
      title: { disable: true },
      summary: { disable: true }
    }
  }
}
