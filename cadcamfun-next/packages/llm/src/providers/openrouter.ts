import { Effect, Schema } from "effect"
import { Route, type RouteModelInput } from "../route/client"
import { Endpoint } from "../route/endpoint"
import { Framing } from "../route/framing"
import { Provider } from "../provider"
import { Protocol } from "../route/protocol"
import { ProviderID, type CacheHint, type ModelID, type TypedModelRef } from "../schema"
import * as OpenAICompatibleProfiles from "./openai-compatible-profile"
import * as OpenAIChat from "../protocols/openai-chat"
import { isRecord } from "../protocols/shared"
import {
  withOpenRouterOptions,
  type OpenRouterOptionsInput as OpenRouterOptions,
  type OpenRouterProviderOptionsInput,
} from "./openrouter-options"

export type { OpenRouterOptionsInput, OpenRouterProviderOptionsInput } from "./openrouter-options"
/** @deprecated use OpenRouterOptionsInput from openrouter-options.ts */
export type { OpenRouterOptionsInput as OpenRouterOptionsLegacy } from "./openrouter-options"
export type { OpenRouterOptions }

export const profile = OpenAICompatibleProfiles.profiles.openrouter
export const id = ProviderID.make(profile.provider)
const ADAPTER = "openrouter"

export type ModelOptions = Omit<RouteModelInput, "id" | "baseURL" | "providerOptions"> & {
  readonly baseURL?: string
  readonly providerOptions?: OpenRouterProviderOptionsInput
}
type ModelInput = ModelOptions & Pick<RouteModelInput, "id">

const OpenRouterBody = Schema.StructWithRest(Schema.Struct(OpenAIChat.bodyFields), [
  Schema.Record(Schema.String, Schema.Any),
])
export type OpenRouterBody = Schema.Schema.Type<typeof OpenRouterBody>

export const protocol = Protocol.make({
  id: "openrouter-chat",
  body: {
    schema: OpenRouterBody,
    from: (request) =>
      OpenAIChat.fromRequest(request, { cacheControl: cacheControl() }).pipe(
        Effect.map(
          (body) =>
            ({
              ...body,
              ...bodyOptions(request.providerOptions?.openrouter),
            }) as OpenRouterBody,
        ),
      ),
  },
  stream: OpenAIChat.protocol.stream,
})

const bodyOptions = (input: unknown) => {
  const openrouter = isRecord(input) ? input : {}
  const { promptCacheKey, ...options } = openrouter
  const reasoning = isRecord(openrouter.reasoning)
    ? {
        ...openrouter.reasoning,
        ...(typeof openrouter.reasoning.maxTokens === "number"
          ? { max_tokens: openrouter.reasoning.maxTokens, maxTokens: undefined }
          : {}),
      }
    : undefined
  return {
    ...options,
    ...(openrouter.usage === undefined || openrouter.usage === true
      ? { usage: { include: true } }
      : openrouter.usage === false
        ? { usage: { include: false } }
        : isRecord(openrouter.usage)
          ? { usage: openrouter.usage }
          : {}),
    ...(reasoning ? { reasoning } : {}),
    ...(typeof promptCacheKey === "string" ? { prompt_cache_key: promptCacheKey } : {}),
  }
}

const cacheControl = () => {
  let remaining = 4
  return (cache: CacheHint | undefined) => {
    if (!cache || remaining === 0) return undefined
    remaining -= 1
    return {
      type: "ephemeral" as const,
      ...(cache.ttlSeconds !== undefined && cache.ttlSeconds >= 3_600 ? { ttl: "1h" } : {}),
    }
  }
}

export const route = Route.make({
  id: ADAPTER,
  protocol,
  endpoint: Endpoint.path("/chat/completions"),
  framing: Framing.sse,
})

export const routes = [route]

const modelRef = Route.model<ModelInput>(route, {
  provider: profile.provider,
  baseURL: profile.baseURL,
})

export const model = (
  modelID: string | ModelID,
  options: ModelOptions = {},
): TypedModelRef<OpenRouterProviderOptionsInput> => modelRef(withOpenRouterOptions(String(modelID), options))

export const provider = Provider.make({
  id,
  model,
})
