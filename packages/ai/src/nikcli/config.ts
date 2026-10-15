import { HUMAN_APPROVAL, NATIVE_APPROVAL_TOOL_IDS, permissionAgents, type PermissionRule } from "./permission-modes.ts"
import memoryPrompt from "./prompts/memory.txt" with { type: "text" }
import { BUILTIN_PROVIDER_IDS, DEFAULT_MINIMAX_BASE_URL, allModels, type BuiltinProviderId } from "../models.ts"
import { SUBAGENT_IDS, SUBAGENTS, subagentPermission } from "./agents.ts"
import { PRIMARIES, PRIMARY_IDS } from "./primaries.ts"
import { NATIVE_TOOLS } from "./tool-registry.ts"
import { permittedTools, toolAllowed, type PolicyStatement } from "./policy.ts"
import compactionPrompt from "./prompts/compaction.txt" with { type: "text" }
import { ACTION_EXPOSURES } from "../actions/catalogue.ts"

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
export const CADCAM_AGENT = PRIMARIES.general.host
export const CADCAM_WORKER = SUBAGENTS.researcher.host
export const BACKGROUND_TOOL_IDS = ["agent"] as const

/** What the read-only researcher may call (verification persists operation metadata, so it is not a worker tool). */
export const WORKER_TOOL_IDS = SUBAGENTS.researcher.tools

export const workerToolAllowed = (id: string): boolean => WORKER_TOOL_IDS.includes(id)

export type HostProtocol = "openai-compatible" | "openai-responses" | "anthropic"

export interface HostProviderSpec {
  readonly id: string
  readonly name: string
  readonly protocol: HostProtocol
  readonly baseURL: string
  readonly models: ReadonlyArray<{ readonly id: string; readonly name: string; readonly context?: number; readonly input?: number; readonly output?: number; readonly vision?: boolean; readonly pdf?: boolean }>
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
      // Inherit models.dev limits; overriding them masks both output caps and compaction thresholds.
      models: allModels([id]).map((m) => ({ id: m.id, name: m.id, vision: m.vision, pdf: id === "anthropic" || m.id.startsWith("anthropic/") }))
    }
  })

export interface HostConfigInput {
  readonly providers: ReadonlyArray<HostProviderSpec>
  /** Ids of the tools registered by this package; the only ones the agent may use. */
  readonly toolIds: ReadonlyArray<string>
  /** Registered tools the host asks about before every call, in every role that holds them (extension tools that change something). */
  readonly askToolIds?: ReadonlyArray<string>
  readonly systemPrompt: string
  readonly compaction?: HostCompactionSettings
  /**
   * Deadlines for one tool call and for one delegated task, in milliseconds. The pinned host's defaults
   * (600_000 / 1_800_000) are sized for editing text files: a pocket, a roughing pass or a full machine
   * verification can outlast them, and the host would abort work that is still making progress. Declared here
   * rather than inherited, so the budget is a reviewed decision and `false` keeps the host default.
   */
  readonly timeouts?: HostTimeoutSettings
  /**
   * nikcli resource policy (`experimental.policies`). The host enforces `provider.use` itself; `tool.use` is resolved
   * here into the deny-by-default permission map, so a forbidden tool is denied for the agent and every specialist.
   */
  readonly policies?: ReadonlyArray<PolicyStatement>
}

/** Settings supported by the pinned host, not a client-side token budget. */
export interface HostCompactionSettings {
  readonly auto?: boolean
  readonly prune?: boolean
  readonly reserved?: number
}

/** `experimental.tool_timeout` / `experimental.task_timeout` of the pinned host: milliseconds, or `false` for the host default. */
export interface HostTimeoutSettings {
  readonly tool?: number | false
  readonly task?: number | false
}

/** What a CAD/CAM turn needs: a long generate or verification is normal work here, not a hung tool. */
export const CAM_TOOL_TIMEOUTS: HostTimeoutSettings = { tool: 1_800_000, task: 3_600_000 }

export const validateTimeoutSettings = (settings: HostTimeoutSettings): void => {
  for (const [name, value] of [["tool_timeout", settings.tool], ["task_timeout", settings.task]] as const) {
    if (value === undefined || value === false) continue
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive safe integer or false`)
  }
}

export const validateCompactionSettings = (settings: HostCompactionSettings): void => {
  if (settings.auto !== undefined && typeof settings.auto !== "boolean") throw new Error("compaction.auto must be a boolean")
  if (settings.prune !== undefined && typeof settings.prune !== "boolean") throw new Error("compaction.prune must be a boolean")
  if (settings.reserved !== undefined && (!Number.isSafeInteger(settings.reserved) || settings.reserved < 0)) {
    throw new Error("compaction.reserved must be a non-negative safe integer")
  }
}

/** Natives such as `code_mode` are granted by the role itself; a `tool.use` deny must still take them away. */
const withoutDeniedTools = (permission: Record<string, PermissionRule>, policies: ReadonlyArray<PolicyStatement>): Record<string, PermissionRule> =>
  policies.length === 0 ? permission : Object.fromEntries(Object.entries(permission).filter(([id]) => id === "**" || toolAllowed(policies, id)))

export const buildHostConfig = (input: HostConfigInput): Record<string, unknown> => {
  validateCompactionSettings(input.compaction ?? {})
  const timeouts = input.timeouts ?? CAM_TOOL_TIMEOUTS
  validateTimeoutSettings(timeouts)
  // Native wildcard matching makes `**` deny every unregistered capability. Unlike
  // the special curated `*` fallback, it preserves nikcli's deferred schema loading.
  const policies = input.policies ?? []
  const toolIds = permittedTools(policies, input.toolIds)
  const permission: Record<string, PermissionRule> = { "**": "deny" }
  // Exposures (`cam_verify`) are narrow views for one specialist; the main agent already holds the canonical tool.
  for (const id of toolIds) if (!Object.hasOwn(ACTION_EXPOSURES, id)) permission[id] = "allow"
  for (const id of NATIVE_APPROVAL_TOOL_IDS) {
    if (toolIds.includes(id)) permission[id] = HUMAN_APPROVAL
  }
  for (const id of input.askToolIds ?? []) if (toolIds.includes(id)) permission[id] = HUMAN_APPROVAL
  for (const tool of NATIVE_TOOLS) if (toolAllowed(policies, tool.id)) permission[tool.id] = "allow"
  permission["task"] = "deny" // All delegation uses the registered CAD/CAM scheduler.
  // One agent per specialist of the roster (`agents.ts`), each with only its own tools.
  const specialists = Object.fromEntries(
    SUBAGENT_IDS.map((id) => {
      const spec = SUBAGENTS[id]
      return [spec.host, { mode: "subagent", description: spec.description, steps: spec.steps, prompt: spec.prompt, permission: withoutDeniedTools(subagentPermission(spec, toolIds), policies) }]
    })
  )

  // The three agents a person talks to (`primaries.ts`). No step cap, as in nikcli (`agent.steps ?? Infinity`): one request runs
  // from the model through the machining to the check for as long as it takes. What ends it is the host's doom-loop guard,
  // the goal budget, or the user's abort.
  const primaries = Object.fromEntries(
    PRIMARY_IDS.map((id) => {
      const spec = PRIMARIES[id]
      const held = Object.fromEntries(Object.entries(permission).filter(([tool]) => !spec.without.includes(tool)))
      return [spec.host, {
        mode: "primary",
        description: spec.description,
        prompt: spec.focus === "" ? input.systemPrompt : `${input.systemPrompt}\n\n${spec.focus}`,
        permission: held
      }]
    })
  )

  const provider: Record<string, unknown> = {}
  for (const p of input.providers) {
    for (const model of p.models) for (const limit of [model.context, model.input, model.output]) {
      if (limit !== undefined && (!Number.isSafeInteger(limit) || limit <= 0)) throw new Error(`Invalid token limit for ${p.id}/${model.id}`)
    }
    provider[p.id] = {
      name: p.name,
      npm: p.protocol === "anthropic" ? "@ai-sdk/anthropic" : p.protocol === "openai-responses" ? "@ai-sdk/openai" : "@ai-sdk/openai-compatible",
      options: { baseURL: p.baseURL, protocol: p.protocol },
      models: Object.fromEntries(
        p.models.map((m) => [
          m.id,
          { name: m.name, tool_call: true, ...(m.vision !== undefined || m.pdf !== undefined ? { attachment: m.vision === true || m.pdf === true, modalities: { input: ["text", ...(m.vision ? ["image"] : []), ...(m.pdf ? ["pdf"] : [])], output: ["text"] } } : {}), ...((m.context !== undefined || m.output !== undefined || m.input !== undefined) ? { limit: { ...(m.context !== undefined ? { context: m.context } : {}), ...(m.input !== undefined ? { input: m.input } : {}), ...(m.output !== undefined ? { output: m.output } : {}) } } : {}) }
        ])
      )
    }
  }

  return {
    share: "disabled",
    autoupdate: false,
    snapshot: false,
    experimental: {
      brain: true,
      memory: true,
      ...(policies.length > 0 ? { policies: policies.map((p) => ({ effect: p.effect, action: p.action, resource: p.resource })) } : {}),
      ...(timeouts.tool !== undefined ? { tool_timeout: timeouts.tool } : {}),
      ...(timeouts.task !== undefined ? { task_timeout: timeouts.task } : {})
    },
    compaction: { auto: true, prune: true, ...input.compaction },
    username: "cadcam",
    provider,
    // Chat and specialist runners always select their role explicitly. Native Brain omits it.
    default_agent: "cadcam-memory",
    agent: {
      "cadcam-memory": { mode: "primary", description: "Internal project memory consolidator", prompt: memoryPrompt.trim(), permission: { "*": "deny", read: "allow", edit: "allow", glob: "allow", grep: "allow", list: "allow", tree: "allow" } },
      ...permissionAgents({ ...primaries, ...specialists }, toolIds),
      compaction: { prompt: compactionPrompt.trim(), permission: { "*": "deny" } },
      // Background helpers would spend extra model calls on titles and summaries.
      title: { disable: true },
      summary: { disable: true }
    }
  }
}
