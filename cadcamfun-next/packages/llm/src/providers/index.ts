export * as Anthropic from "./anthropic"
export * as AmazonBedrock from "./amazon-bedrock"
export * as Azure from "./azure"
export * as Cloudflare from "./cloudflare"
export * as GitHubCopilot from "./github-copilot"
export * as Google from "./google"
export * as GoogleVertex from "./google-vertex"
export * as NikcliInference from "./nikcli-inference"
export * as OpenAI from "./openai"
export * as OpenAICompatible from "./openai-compatible"
export * as OpenRouter from "./openrouter"
export * as VercelGateway from "./vercel-gateway"
export * as XAI from "./xai"

// Provider-options namespaces — one typed facade per provider, modeled after
// opencode's `provider/transform.ts`. Each module exports a `<Provider>OptionsInput`
// type, a `<provider>DefaultOptions(modelID)` per-model resolver, and a
// `with<Provider>Options(modelID, options)` helper used by the provider facades.
export * as AnthropicProviderOptions from "./anthropic-options"
export * as BedrockProviderOptions from "./bedrock-options"
export * as CloudflareProviderOptions from "./cloudflare-options"
export * as CopilotProviderOptions from "./copilot-options"
export * as GoogleProviderOptions from "./google-options"
export * as OpenAIProviderOptions from "./openai-options"
export * as OpenAICompatibleProviderOptions from "./openai-compatible-options"
export * as OpenRouterProviderOptions from "./openrouter-options"
export * as XAIProviderOptions from "./xai-options"
