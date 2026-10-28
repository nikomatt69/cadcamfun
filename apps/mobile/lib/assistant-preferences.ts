import type { AiProviderEntry } from "@cadcamfun/api"

export type AssistantProvider = typeof AiProviderEntry.Type
export interface AssistantModelSelection {
  readonly provider: string
  readonly model: string
  readonly variant?: string
}
export type AssistantPermissionMode = "approve" | "ask" | "auto"
export interface AssistantPreferences {
  readonly agent: string
  readonly model?: AssistantModelSelection
  readonly permissionMode: AssistantPermissionMode
  readonly includeContext: boolean
}
export const DEFAULT_ASSISTANT_PREFERENCES: AssistantPreferences = { agent: "build", permissionMode: "approve", includeContext: true }

/** Phone-wide defaults for projects that have no assistant settings of their own yet (Settings → Assistant). */
export type AssistantDefaults = Pick<AssistantPreferences, "permissionMode" | "includeContext">
export const DEFAULT_ASSISTANT_DEFAULTS: AssistantDefaults = { permissionMode: DEFAULT_ASSISTANT_PREFERENCES.permissionMode, includeContext: DEFAULT_ASSISTANT_PREFERENCES.includeContext }

/** The agents stored preferences may still name from before Build and Plan were the only two: all of them edited, so they land on Build. */
const LEGACY_AGENT_IDS = new Set<string>(["general", "cad", "cam", "cadcam", "cadcam-cad", "cadcam-cam"])
export const currentAssistantAgent = (agent: string): string => LEGACY_AGENT_IDS.has(agent) ? "build" : agent

/** A project's own settings win; anything it never set comes from the phone defaults. */
export const resolveAssistantPreferences = (stored: Partial<AssistantPreferences> | undefined, defaults: Partial<AssistantDefaults> | undefined): AssistantPreferences => {
  const merged: AssistantPreferences = {
    ...DEFAULT_ASSISTANT_PREFERENCES,
    ...(defaults?.permissionMode && PERMISSION_IDS.has(defaults.permissionMode) ? { permissionMode: defaults.permissionMode } : {}),
    ...(typeof defaults?.includeContext === "boolean" ? { includeContext: defaults.includeContext } : {}),
    ...stored,
  }
  return { ...merged, agent: currentAssistantAgent(merged.agent) }
}
const PERMISSION_IDS = new Set<string>(["approve", "ask", "auto"])
export const PERMISSION_MODES: readonly { id: AssistantPermissionMode; title: string; description: string }[] = [
  { id: "approve", title: "Standard", description: "Run routine tools. Ask before destructive changes and external tools." },
  { id: "ask", title: "Ask every time", description: "Ask for approval before each tool action." },
  { id: "auto", title: "Auto review", description: "Let the host classify creation and editing actions. Deletion, VCS writes and extension changes are blocked; external tools still need approval." },
]

export interface AssistantModelOption extends AssistantModelSelection {
  readonly key: string
  readonly name: string
  readonly providerName: string
  readonly variants: readonly string[]
  readonly contextWindow: number
  readonly tools: boolean
  readonly vision: boolean
  /** "Thinking" for `:thinking` model ids, "Reasoning" for models with thinking levels; same badges as nikcli mobile. */
  readonly badge?: "Thinking" | "Reasoning"
}

const VARIANT_ORDER = ["none", "minimal", "low", "medium", "high", "xhigh", "max"]
/** Effort levels from lowest to highest, unknown host levels last. */
export const sortVariants = (variants: readonly string[]): readonly string[] => [...new Set(variants)].sort((left, right) => {
  const a = VARIANT_ORDER.indexOf(left), b = VARIANT_ORDER.indexOf(right)
  return a === -1 && b === -1 ? left.localeCompare(right) : a === -1 ? 1 : b === -1 ? -1 : a - b
})
export const formatVariantLabel = (variant: string): string => variant === "xhigh"
  ? "Extra high"
  : variant.split(/[_-]/).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ")
export const assistantModelKey = (model: AssistantModelSelection): string => JSON.stringify([model.provider, model.model])
export const assistantModels = (providers: readonly AssistantProvider[]): readonly AssistantModelOption[] => providers
  .filter((provider) => provider.configured)
  .flatMap((provider) => provider.models.map((model): AssistantModelOption => {
    const variants = sortVariants(model.variants ?? [])
    const badge = model.id.endsWith(":thinking") ? "Thinking" : variants.length > 0 || model.reasoning ? "Reasoning" : undefined
    return {
      key: assistantModelKey({ provider: provider.id, model: model.id }), provider: provider.id, model: model.id,
      name: model.name, providerName: provider.name, variants, contextWindow: model.contextWindow, tools: model.tools, vision: model.vision,
      ...(badge ? { badge } : {}),
    }
  }))
  .sort((left, right) => left.providerName.localeCompare(right.providerName) || left.name.localeCompare(right.name))

export const filterAssistantModels = (models: readonly AssistantModelOption[], query: string, provider?: string): readonly AssistantModelOption[] => {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  return models.filter((model) => (!provider || model.provider === provider) && words.every((word) => `${model.name} ${model.model} ${model.providerName} ${model.provider}`.toLowerCase().includes(word)))
}

export const selectedAssistantModel = (models: readonly AssistantModelOption[], selected?: AssistantModelSelection): AssistantModelOption | undefined => selected
  ? models.find((model) => model.provider === selected.provider && model.model === selected.model && (!selected.variant || model.variants.includes(selected.variant)))
  : undefined

/** The thinking level last used with this model, when the model still offers it (nikcli remembers it per model). */
export const rememberedSelection = (model: AssistantModelOption, remembered: Readonly<Record<string, string>>): AssistantModelSelection => {
  const variant = remembered[model.key]
  return { provider: model.provider, model: model.model, ...(variant && model.variants.includes(variant) ? { variant } : {}) }
}

/** A context window as a short label: 8k, 128k, 1M. */
export const formatContextWindow = (tokens: number): string => {
  if (!Number.isFinite(tokens) || tokens <= 0) return ""
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`
  return tokens >= 1000 ? `${Math.round(tokens / 1000)}k` : String(Math.round(tokens))
}

/** The facts a model row shows under its name, like nikcli's quiet badge line. Skips what the name already says. */
export const modelFacts = (model: AssistantModelOption): readonly string[] => [
  model.badge,
  model.model !== model.name ? model.model : undefined,
  model.contextWindow > 0 ? `${formatContextWindow(model.contextWindow)} context` : undefined,
  model.tools ? "Tools" : "Chat only",
  model.vision ? "Vision" : undefined,
  model.variants.length > 0 ? `${model.variants.length} thinking ${model.variants.length === 1 ? "level" : "levels"}` : undefined,
].filter((fact): fact is string => Boolean(fact))

export interface AssistantModelGroup {
  readonly provider: string
  readonly providerName: string
  readonly models: readonly AssistantModelOption[]
}

/** Models grouped under their provider in list order (the list is already sorted by provider). */
export const groupAssistantModels = (models: readonly AssistantModelOption[]): readonly AssistantModelGroup[] => {
  const groups: Array<{ provider: string; providerName: string; models: AssistantModelOption[] }> = []
  for (const model of models) {
    const last = groups[groups.length - 1]
    if (last && last.provider === model.provider) last.models.push(model)
    else groups.push({ provider: model.provider, providerName: model.providerName, models: [model] })
  }
  return groups
}
