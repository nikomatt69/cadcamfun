import { Config, Context, Effect, Layer, Option, Redacted, Schema } from "effect"
import type { ModelRef } from "@cadcamfun/llm"
import * as Anthropic from "@cadcamfun/llm/providers/anthropic"
import * as Google from "@cadcamfun/llm/providers/google"
import * as OpenAI from "@cadcamfun/llm/providers/openai"
import * as OpenRouter from "@cadcamfun/llm/providers/openrouter"
import * as XAI from "@cadcamfun/llm/providers/xai"
import * as Nikcli from "./nikcli"

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
   * Resolve the model from the environment, falling back to a local nikcli install:
   * - provider: `CADCAMFUN_AI_PROVIDER`, else nikcli's default model provider, else the first
   *   provider with a key (env or nikcli `auth.json`), else anthropic;
   * - model: `CADCAMFUN_AI_MODEL`, else nikcli's default model for that provider, else a default;
   * - key: the provider's usual variable (e.g. `ANTHROPIC_API_KEY`), else nikcli's credential.
   */
  static readonly layerConfig = Layer.effect(
    AiModel,
    Effect.gen(function* () {
      const nikcli = yield* Nikcli.load()
      const envKey = (p: AiProvider) =>
        Config.Redacted(keyEnv[p]).pipe(
          Config.option,
          Config.map(Option.map(Redacted.value)),
          Config.map(Option.orElse(() => Option.fromUndefinedOr(nikcli.key(p)))),
        )
      const isProvider = Schema.is(AiProvider)
      const nikcliProvider = nikcli.model && isProvider(nikcli.model.provider) ? nikcli.model.provider : undefined

      const explicit = yield* Config.schema(AiProvider, "CADCAMFUN_AI_PROVIDER").pipe(Config.option)
      let provider: AiProvider = Option.getOrUndefined(explicit) ?? nikcliProvider ?? "anthropic"
      if (Option.isNone(explicit) && !nikcliProvider) {
        for (const p of AiProvider.literals) {
          if (Option.isSome(yield* envKey(p))) {
            provider = p
            break
          }
        }
      }

      const fallback = (nikcli.model?.provider === provider ? nikcli.model.id : undefined) ?? defaultModel[provider]
      const id = yield* fallback
        ? Config.String("CADCAMFUN_AI_MODEL").pipe(Config.withDefault(fallback))
        : Config.String("CADCAMFUN_AI_MODEL")
      const apiKey = yield* envKey(provider)
      if (Option.isNone(apiKey)) {
        return yield* Effect.die(
          new Error(`No ${provider} credential: set ${keyEnv[provider]} or run \`nikcli auth login\``),
        )
      }
      return AiModel.of({ model: modelFor(provider, id, apiKey.value) })
    }),
  )

  static readonly layer = (model: ModelRef) => Layer.succeed(AiModel, AiModel.of({ model }))
}
