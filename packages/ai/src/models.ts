import { Schema } from "effect"
import { AiConfigError } from "./errors.ts"

/**
 * Providers the app configures itself (base URL / protocol defaults). These
 * are also the only ones the one-shot AI SDK path can build a client for; every
 * other provider is served by the embedded nikcli host.
 */
export const BUILTIN_PROVIDER_IDS = ["anthropic", "openai", "minimax", "gateway"] as const
export type BuiltinProviderId = (typeof BUILTIN_PROVIDER_IDS)[number]

/**
 * Any provider the embedded host knows: the models.dev catalogue merged with
 * `nikcli.json`. Not a closed union, because the user picks the provider.
 */
export type ProviderId = string
export const ProviderIdSchema = Schema.String
/** `/^[a-z0-9][a-z0-9._-]*$/i` — what nikcli accepts as a provider id. */
export const isProviderId = (value: string): boolean => /^[a-z0-9][a-z0-9._-]*$/i.test(value)
/** @deprecated Use {@link BUILTIN_PROVIDER_IDS}; kept for the one-shot AI SDK path. */
export const PROVIDER_IDS: ReadonlyArray<BuiltinProviderId> = BUILTIN_PROVIDER_IDS
export const isBuiltinProviderId = (value: string): value is BuiltinProviderId =>
  (BUILTIN_PROVIDER_IDS as ReadonlyArray<string>).includes(value)

export const TIERS = ["fast", "balanced", "best"] as const
export type Tier = (typeof TIERS)[number]

export interface ModelSelector {
  readonly provider?: ProviderId
  readonly model?: string
  readonly tier?: Tier
}

export interface ModelInfo {
  readonly id: string
  readonly provider: ProviderId
  readonly tier?: Tier
  readonly contextWindow: number
  readonly tools: boolean
  readonly vision: boolean
}

/**
 * Fallback tiers for the builtin providers, used when the host is unavailable
 * (one-shot AI SDK path) and as the default model of a provider. The full
 * catalogue the user picks from comes from the host (`nikcli/catalog.ts`).
 */
const CATALOGUE: Readonly<Record<BuiltinProviderId, Readonly<Record<Tier, Omit<ModelInfo, "provider" | "tier">>>>> = {
  anthropic: {
    fast: { id: "claude-haiku-4-5", contextWindow: 200_000, tools: true, vision: true },
    balanced: { id: "claude-sonnet-5-5", contextWindow: 1_000_000, tools: true, vision: true },
    best: { id: "claude-opus-5-5", contextWindow: 1_000_000, tools: true, vision: true }
  },
  openai: {
    fast: { id: "gpt-5-mini", contextWindow: 400_000, tools: true, vision: true },
    balanced: { id: "gpt-5", contextWindow: 400_000, tools: true, vision: true },
    best: { id: "gpt-5", contextWindow: 400_000, tools: true, vision: true }
  },
  minimax: {
    fast: { id: "MiniMax-M2", contextWindow: 200_000, tools: true, vision: false },
    balanced: { id: "MiniMax-M2", contextWindow: 200_000, tools: true, vision: false },
    best: { id: "MiniMax-M2", contextWindow: 200_000, tools: true, vision: false }
  },
  gateway: {
    fast: { id: "anthropic/claude-haiku-4-5", contextWindow: 200_000, tools: true, vision: true },
    balanced: { id: "anthropic/claude-sonnet-5-5", contextWindow: 1_000_000, tools: true, vision: true },
    best: { id: "anthropic/claude-opus-5-5", contextWindow: 1_000_000, tools: true, vision: true }
  }
}

export const DEFAULT_TIER: Tier = "balanced"
export const DEFAULT_MINIMAX_BASE_URL = "https://api.minimax.io/v1"

/** Default model for a provider, or `undefined` when we declare no default. */
export const defaultModelFor = (provider: ProviderId, tier: Tier = DEFAULT_TIER): string | undefined =>
  isBuiltinProviderId(provider) ? CATALOGUE[provider][tier].id : undefined

export const modelFor = (provider: BuiltinProviderId, tier: Tier = DEFAULT_TIER): ModelInfo => ({
  ...CATALOGUE[provider][tier],
  provider,
  tier
})

export const allModels = (providers: ReadonlyArray<BuiltinProviderId> = BUILTIN_PROVIDER_IDS): ReadonlyArray<ModelInfo> => {
  const seen = new Set<string>()
  const out: ModelInfo[] = []
  for (const provider of providers) {
    for (const tier of TIERS) {
      const info = modelFor(provider, tier)
      const key = `${provider}/${info.id}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push(info)
    }
  }
  return out
}

export interface ResolveOptions {
  /** Providers that currently hold a key. */
  readonly configured: ReadonlySet<ProviderId>
  readonly forceGateway?: boolean
}

export interface ResolvedModel {
  readonly provider: ProviderId
  readonly modelId: string
  /** True when the vendor was not available directly and the gateway serves it. */
  readonly viaGateway: boolean
}

const missingKey = (provider: ProviderId | undefined): AiConfigError =>
  new AiConfigError({
    message: provider
      ? `No API key configured for "${provider}" and no gateway key available.`
      : "No AI provider is configured. Add an API key in the AI settings.",
    ...(provider ? { provider } : {})
  })

/** Gateway model ids are `<vendor>/<model>`; do not double-prefix. */
const gatewayModelId = (vendor: ProviderId | undefined, modelId: string): string =>
  modelId.includes("/") ? modelId : `${gatewayVendor(vendor)}/${modelId}`

/**
 * Resolution rule: the requested provider when its key is configured, otherwise
 * the gateway (`forceGateway` routes everything through it). A selector without
 * a provider takes the first configured builtin vendor in declaration order,
 * then any other configured provider in catalogue order (the caller passes the
 * ordered list in `configured`).
 */
export const resolveModel = (
  selector: ModelSelector | undefined,
  options: ResolveOptions
): ResolvedModel | AiConfigError => {
  const tier = selector?.tier ?? DEFAULT_TIER
  const has = (provider: ProviderId): boolean => options.configured.has(provider)
  const gatewayOk = has("gateway")
  const requested = selector?.provider
  const explicit = selector?.model

  // The user picked one exact model: honour it verbatim on its own provider.
  if (requested !== undefined && explicit !== undefined) {
    if (requested === "gateway") {
      return gatewayOk ? { provider: "gateway", modelId: explicit, viaGateway: true } : missingKey(requested)
    }
    if (has(requested) && !options.forceGateway) return { provider: requested, modelId: explicit, viaGateway: false }
    if (gatewayOk) return { provider: "gateway", modelId: gatewayModelId(requested, explicit), viaGateway: true }
    return missingKey(requested)
  }

  if (requested === "gateway" || (options.forceGateway && requested !== undefined)) {
    return viaGateway(selector, tier, gatewayOk, requested)
  }
  if (requested !== undefined) {
    if (has(requested) && !options.forceGateway) {
      return { provider: requested, modelId: explicit ?? defaultModelFor(requested, tier) ?? requested, viaGateway: false }
    }
    return viaGateway(selector, tier, gatewayOk, requested)
  }
  if (options.forceGateway) return viaGateway(selector, tier, gatewayOk, undefined)
  for (const vendor of BUILTIN_PROVIDER_IDS) {
    if (vendor === "gateway") continue
    if (has(vendor)) return { provider: vendor, modelId: defaultModelFor(vendor, tier)!, viaGateway: false }
  }
  // Any other configured provider (a models.dev one), served directly.
  for (const provider of options.configured) {
    if (provider === "gateway") continue
    return { provider, modelId: defaultModelFor(provider, tier) ?? provider, viaGateway: false }
  }
  return viaGateway(selector, tier, gatewayOk, undefined)
}

const viaGateway = (
  selector: ModelSelector | undefined,
  tier: Tier,
  gatewayOk: boolean,
  vendor: ProviderId | undefined
): ResolvedModel | AiConfigError => {
  if (!gatewayOk) return missingKey(vendor)
  const explicit = selector?.model
  if (explicit !== undefined) return { provider: "gateway", modelId: gatewayModelId(vendor, explicit), viaGateway: true }
  const base = vendor && isBuiltinProviderId(vendor) ? CATALOGUE[vendor][tier].id : defaultModelFor("gateway", tier)!
  const id = base.includes("/") ? base : `${gatewayVendor(vendor)}/${base}`
  return { provider: "gateway", modelId: id, viaGateway: true }
}

const gatewayVendor = (vendor: ProviderId | undefined): string => {
  switch (vendor) {
    case "openai":
      return "openai"
    case "minimax":
      return "minimax"
    default:
      return "anthropic"
  }
}
