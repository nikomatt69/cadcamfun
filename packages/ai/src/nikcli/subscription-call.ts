import { Effect } from "effect"
import { AiProviderError } from "../errors.ts"
import type { ModelSelector, ResolvedModel } from "../models.ts"
import { CADCAM_AGENT } from "./config.ts"
import type { NikCliRuntime } from "./runtime.ts"

/** Stateless calls use the native subscription transport, with every host tool disabled. */
export const subscriptionText = Effect.fn("Subscription.text")(function*(runtime: NikCliRuntime, resolved: ResolvedModel, input: { prompt: string; system?: string; model?: ModelSelector }) {
  const host = yield* runtime.host("subscription-calls")
  return yield* Effect.scoped(Effect.gen(function*() {
    const session = yield* Effect.acquireRelease(
      Effect.tryPromise({ try: () => host.client.session.create({ title: "Subscription request" }), catch: () => new AiProviderError({ message: "Could not start the subscription request.", provider: resolved.provider }) }),
      (session) => Effect.promise(async () => {
        await host.client.session.abort({ sessionID: session.id }).catch(() => undefined)
        await host.client.session.remove({ sessionID: session.id }).catch(() => undefined)
      })
    )
    return yield* Effect.tryPromise({
      try: async (signal) => {
        const ids = await host.client.experimental.toolIDs()
        const result = await host.client["session-prompt"].prompt({
          sessionID: session.id, agent: CADCAM_AGENT,
          model: { providerID: resolved.provider, modelID: resolved.modelId },
          ...(input.model?.variant ? { variant: input.model.variant } : {}),
          ...(input.system ? { system: input.system } : {}),
          tools: Object.fromEntries(ids.map((id) => [id, false])),
          parts: [{ type: "text", text: input.prompt }]
        }, { signal })
        if (!result.info || result.info.error) throw new Error("Subscription provider failed")
        return { text: (result.parts ?? []).filter((part) => part.type === "text").map((part) => part.text ?? "").join(""), model: resolved.modelId }
      },
      catch: () => new AiProviderError({ message: "The subscription request failed. Check the provider connection and plan limits.", provider: resolved.provider })
    })
  }))
})
