import { Config, Context, Effect, Layer, Redacted, Schema } from "effect"
import type { ModelRef } from "@cadcamfun/llm"
import * as Anthropic from "@cadcamfun/llm/providers/anthropic"
import * as Google from "@cadcamfun/llm/providers/google"
import * as OpenAI from "@cadcamfun/llm/providers/openai"
import * as OpenRouter from "@cadcamfun/llm/providers/openrouter"
import * as XAI from "@cadcamfun/llm/providers/xai"

export const AiProvider = Schema.Literals(["anthropic", "openai", "openrouter", "google", "xai"])
export type AiProvider = typeof AiProvider.Type

const keyEnv: Record<AiProvider, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
  xai: "XAI_API_KEY",
}

const defaultModel: Partial<Record<AiProvider, string>> = {
  anthropic: "claude-sonnet-5-5",
}

export const modelFor = (provider: AiProvider, id: string, apiKey: string): ModelRef => {
  switch (provider) {
    case "anthropic":
      return Anthropic.model(id, { apiKey })
    case "openai":
      return OpenAI.model(id, { apiKey })
    case "openrouter":
      return OpenRouter.model(id, { apiKey })
    case "google":
      return Google.model(id, { apiKey })
    case "xai":
      return XAI.model(id, { apiKey })
  }
}

/** The language model the agent talks to. */
export class AiModel extends Context.Service<AiModel, { readonly model: ModelRef }>()("@cadcamfun/ai/AiModel") {
  /**
   * Resolve from environment: `CADCAMFUN_AI_PROVIDER` (default anthropic), `CADCAMFUN_AI_MODEL`
   * and the provider's usual API key variable (e.g. `ANTHROPIC_API_KEY`).
   */
  static readonly layerConfig = Layer.effect(
    AiModel,
    Effect.gen(function* () {
      const provider = yield* Config.schema(AiProvider, "CADCAMFUN_AI_PROVIDER").pipe(
        Config.withDefault("anthropic" as const),
      )
      const fallback = defaultModel[provider]
      const id = yield* fallback
        ? Config.String("CADCAMFUN_AI_MODEL").pipe(Config.withDefault(fallback))
        : Config.String("CADCAMFUN_AI_MODEL")
      const apiKey = yield* Config.Redacted(keyEnv[provider])
      return AiModel.of({ model: modelFor(provider, id, Redacted.value(apiKey)) })
    }),
  )

  static readonly layer = (model: ModelRef) => Layer.succeed(AiModel, AiModel.of({ model }))
}
