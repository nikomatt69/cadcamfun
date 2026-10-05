import { Schema } from "effect"
import { AiConfigError } from "./errors.ts"

export const PROVIDER_IDS = ["anthropic", "openai", "minimax", "gateway"] as const
export type ProviderId = (typeof PROVIDER_IDS)[number]
export const ProviderIdSchema = Schema.Literals(PROVIDER_IDS)

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
  readonly tier: Tier
  readonly contextWindow: number
  readonly tools: boolean
  readonly vision: boolean
}

/**
 * The only place that names model ids. Gateway ids are `<vendor>/<model>`.
 * Keep these in sync with the vendors' current lineups.
 */
const CATALOGUE: Readonly<Record<ProviderId, Readonly<Record<Tier, Omit<ModelInfo, "provider" | "tier">>>>> = {
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

export const modelFor = (provider: ProviderId, tier: Tier = DEFAULT_TIER): ModelInfo => ({
  ...CATALOGUE[provider][tier],
  provider,
  tier
})

export const allModels = (providers: ReadonlyArray<ProviderId> = PROVIDER_IDS): ReadonlyArray<ModelInfo> => {
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

/**
 * Resolution rule: direct vendor when its key is configured, otherwise the
 * gateway; `forceGateway` routes everything through the gateway. A selector
 * without a provider takes the first configured vendor in declaration order.
 */
export const resolveModel = (
  selector: ModelSelector | undefined,
  options: ResolveOptions
): ResolvedModel | AiConfigError => {
  const tier = selector?.tier ?? DEFAULT_TIER
  const gatewayOk = options.configured.has("gateway")
  const requested = selector?.provider

  if (requested === "gateway" || (options.forceGateway && requested !== undefined)) {
    return viaGateway(selector, tier, gatewayOk, requested)
  }
  if (requested !== undefined) {
    if (options.configured.has(requested) && !options.forceGateway) {
      return { provider: requested, modelId: selector?.model ?? modelFor(requested, tier).id, viaGateway: false }
    }
    return viaGateway(selector, tier, gatewayOk, requested)
  }
  if (options.forceGateway) return viaGateway(selector, tier, gatewayOk, undefined)
  for (const vendor of ["anthropic", "openai", "minimax"] as const) {
    if (options.configured.has(vendor)) {
      return { provider: vendor, modelId: selector?.model ?? modelFor(vendor, tier).id, viaGateway: false }
    }
  }
  return viaGateway(selector, tier, gatewayOk, undefined)
}

const viaGateway = (
  selector: ModelSelector | undefined,
  tier: Tier,
  gatewayOk: boolean,
  vendor: ProviderId | undefined
): ResolvedModel | AiConfigError => {
  if (!gatewayOk) {
    return new AiConfigError({
      message: vendor
        ? `No API key configured for "${vendor}" and no gateway key available.`
        : "No AI provider is configured. Add an API key in the AI settings.",
      ...(vendor ? { provider: vendor } : {})
    })
  }
  const explicit = selector?.model
  if (explicit) {
    const prefixed = explicit.includes("/") ? explicit : `${gatewayVendor(vendor)}/${explicit}`
    return { provider: "gateway", modelId: prefixed, viaGateway: true }
  }
  const base = vendor && vendor !== "gateway" ? modelFor(vendor, tier).id : modelFor("gateway", tier).id
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
