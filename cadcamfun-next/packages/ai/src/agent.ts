import { Context, Effect, Layer, Stream } from "effect"
import { CamLibrary } from "@cadcamfun/cam"
import { LLM, LLMClient, type LLMClientService, type LLMError, type LLMEvent, type Message } from "@cadcamfun/llm"
import { RequestExecutor } from "@cadcamfun/llm/route"
import { AiModel } from "./model"
import { systemPrompt } from "./prompt"
import { makeTools } from "./tools"
import type { Workspace } from "./workspace"

export interface ChatInput {
  readonly messages: ReadonlyArray<Message | LLM.MessageInput>
  /** Maximum model rounds (each round may call several tools). */
  readonly maxSteps?: number
}

/**
 * The CAD/CAM agent: an Effect-native tool loop on top of the nikcli LLM core.
 * Streams model text, reasoning, tool calls and tool results as `LLMEvent`s.
 */
export class CadAgent extends Context.Service<
  CadAgent,
  { readonly chat: (input: ChatInput) => Stream.Stream<LLMEvent, LLMError> }
>()("@cadcamfun/ai/CadAgent") {
  static readonly layerNoDeps: Layer.Layer<CadAgent, never, AiModel | Workspace | CamLibrary | LLMClientService> =
    Layer.effect(
      CadAgent,
      Effect.gen(function* () {
        const { model } = yield* AiModel
        const client = yield* LLMClient.Service
        const tools = yield* makeTools
        return CadAgent.of({
          chat: ({ messages, maxSteps = 12 }) =>
            client.stream({
              request: LLM.request({ model, system: systemPrompt, messages: [...messages] }),
              tools,
              stopWhen: LLM.stepCountIs(maxSteps),
            }),
        })
      }),
    )

  /** Real HTTP transport. */
  static readonly layer = CadAgent.layerNoDeps.pipe(
    Layer.provide(LLMClient.layer.pipe(Layer.provide(RequestExecutor.defaultLayer))),
  )
}
