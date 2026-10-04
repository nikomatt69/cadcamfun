import { Effect, Schema } from "effect"
import { Route, type RouteModelInput } from "../route/client"
import { Endpoint } from "../route/endpoint"
import { Framing } from "../route/framing"
import { Provider } from "../provider"
import { Protocol } from "../route/protocol"
import { ProviderID, type CacheHint, type ModelID, type TypedModelRef } from "../schema"
import * as OpenAIChat from "../protocols/openai-chat"
import { isRecord } from "../protocols/shared"

/**
 * Vercel AI Gateway, over its OpenAI Chat Completions endpoint.
 *
 * The body is OpenAI Chat plus one gateway extension: a top-level `providerOptions` object, whose
 * `gateway` key carries routing (`order`, `only`, `sort`, `models` fallbacks, `byok`, `providerTimeouts`)
 * and whose other keys (`anthropic`, `openai`, ...) are options for the upstream provider the gateway
 * routes to. Anthropic models behind the gateway take `cache_control` markers, with the same four-marker
 * ceiling as Anthropic itself.
 */
export const id = ProviderID.make("vercel")
export const DEFAULT_BASE_URL = "https://ai-gateway.vercel.sh/v1"
const ADAPTER = "vercel-gateway"

export type ModelOptions = Omit<RouteModelInput, "id" | "baseURL"> & {
  readonly baseURL?: string
}
type ModelInput = ModelOptions & Pick<RouteModelInput, "id">

const GatewayBody = Schema.StructWithRest(Schema.Struct(OpenAIChat.bodyFields), [
  Schema.Record(Schema.String, Schema.Any),
])
export type VercelGatewayBody = Schema.Schema.Type<typeof GatewayBody>

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

export const protocol = Protocol.make({
  id: "vercel-gateway-chat",
  body: {
    schema: GatewayBody,
    from: (request) =>
      OpenAIChat.fromRequest(request, { cacheControl: cacheControl() }).pipe(
        Effect.map((body) => {
          const options = request.providerOptions
          const providerOptions =
            isRecord(options) &&
            Object.values(options).some((value) => isRecord(value) && Object.keys(value).length > 0)
              ? { providerOptions: options }
              : {}
          return { ...body, ...providerOptions } as VercelGatewayBody
        }),
      ),
  },
  stream: OpenAIChat.protocol.stream,
})

export const route = Route.make({
  id: ADAPTER,
  protocol,
  endpoint: Endpoint.path("/chat/completions"),
  framing: Framing.sse,
})

export const routes = [route]

const modelRef = Route.model<ModelInput>(route, {
  provider: id,
  baseURL: DEFAULT_BASE_URL,
})

export const model = (modelID: string | ModelID, options: ModelOptions = {}): TypedModelRef<never> =>
  modelRef({ ...options, id: String(modelID) }) as TypedModelRef<never>

export const provider = Provider.make({
  id,
  model,
})
