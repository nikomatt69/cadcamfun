export interface OpenAICompatibleProfile {
  readonly provider: string
  readonly baseURL: string
}

export const profiles = {
  aihubmix: { provider: "aihubmix", baseURL: "https://aihubmix.com/v1" },
  baseten: { provider: "baseten", baseURL: "https://inference.baseten.co/v1" },
  cerebras: { provider: "cerebras", baseURL: "https://api.cerebras.ai/v1" },
  cohere: { provider: "cohere", baseURL: "https://api.cohere.ai/compatibility/v1" },
  deepinfra: { provider: "deepinfra", baseURL: "https://api.deepinfra.com/v1/openai" },
  deepseek: { provider: "deepseek", baseURL: "https://api.deepseek.com/v1" },
  fireworks: { provider: "fireworks", baseURL: "https://api.fireworks.ai/inference/v1" },
  groq: { provider: "groq", baseURL: "https://api.groq.com/openai/v1" },
  // Merge's catalog entry points at `/v1/ai-sdk`, the path its AI SDK package speaks; the OpenAI-compatible
  // surface is `/v1/openai`.
  "merge-gateway": { provider: "merge-gateway", baseURL: "https://api-gateway.merge.dev/v1/openai" },
  mistral: { provider: "mistral", baseURL: "https://api.mistral.ai/v1" },
  openrouter: { provider: "openrouter", baseURL: "https://openrouter.ai/api/v1" },
  perplexity: { provider: "perplexity", baseURL: "https://api.perplexity.ai" },
  togetherai: { provider: "togetherai", baseURL: "https://api.together.xyz/v1" },
  venice: { provider: "venice", baseURL: "https://api.venice.ai/api/v1" },
  v0: { provider: "v0", baseURL: "https://api.v0.dev/v1" },
  xai: { provider: "xai", baseURL: "https://api.x.ai/v1" },
} as const satisfies Record<string, OpenAICompatibleProfile>

export const byProvider: Record<string, OpenAICompatibleProfile> = Object.fromEntries(
  Object.values(profiles).map((profile) => [profile.provider, profile]),
)
