import { Effect, Schema } from "effect"
import { Route, type RouteModelInput } from "../route/client"
import { Auth } from "../route/auth"
import { Endpoint } from "../route/endpoint"
import { Framing } from "../route/framing"
import { Protocol } from "../route/protocol"
import { Provider } from "../provider"
import { ProviderID, type ModelID, type TypedModelRef } from "../schema"
import * as Gemini from "../protocols/gemini"
import * as AnthropicMessages from "../protocols/anthropic-messages"
import { withGoogleOptions, type GoogleProviderOptionsInput } from "./google-options"

/**
 * Google Vertex AI: Gemini, and Claude served as a Vertex partner model.
 *
 * Both reuse the protocol of the direct API and differ in where they are sent and how they authenticate.
 * Vertex takes an OAuth access token as a bearer (not an API key header); the token is minted per request
 * by whoever supplies the model's `fetch` or `auth`, so these routes ask only for `Auth.bearer()` and the
 * model's `apiKey` carries whatever stands in for it.
 *
 * - Gemini: `…/publishers/google/models/{model}:streamGenerateContent?alt=sse`, same body as the AI Studio API.
 * - Claude: `…/publishers/anthropic/models/{model}:streamRawPredict`, the Messages body with `model` dropped
 *   and `anthropic_version: "vertex-2023-10-16"` added.
 */
export const id = ProviderID.make("google-vertex")
export const anthropicID = ProviderID.make("google-vertex-anthropic")

export const ANTHROPIC_VERSION = "vertex-2023-10-16"

/** `{location}-aiplatform.googleapis.com`, or the global host when the location is `global`. */
export const host = (location: string) =>
  location === "global" ? "https://aiplatform.googleapis.com" : `https://${location}-aiplatform.googleapis.com`

export const baseURL = (input: { readonly project: string; readonly location: string; readonly publisher: string }) =>
  `${host(input.location)}/v1/projects/${input.project}/locations/${input.location}/publishers/${input.publisher}`

export const geminiRoute = Route.make({
  id: "vertex-gemini",
  provider: id,
  protocol: Gemini.protocol,
  endpoint: Endpoint.path(({ request }) => `/models/${request.model.id}:streamGenerateContent?alt=sse`),
  auth: Auth.bearer(),
  framing: Framing.sse,
})

const VertexAnthropicBody = Schema.Record(Schema.String, Schema.Any)

const anthropicProtocol = Protocol.make({
  id: "vertex-anthropic-messages",
  body: {
    schema: VertexAnthropicBody,
    from: (request) =>
      AnthropicMessages.protocol.body.from(request).pipe(
        Effect.map((body) => {
          const { model: _model, ...rest } = body as Record<string, unknown>
          return { ...rest, anthropic_version: ANTHROPIC_VERSION }
        }),
      ),
  },
  stream: AnthropicMessages.protocol.stream,
})

export const anthropicRoute = Route.make({
  id: "vertex-anthropic",
  provider: anthropicID,
  protocol: anthropicProtocol,
  endpoint: Endpoint.path(({ request }) => `/models/${request.model.id}:streamRawPredict`),
  auth: Auth.bearer(),
  framing: Framing.sse,
})

export const routes = [geminiRoute, anthropicRoute]

type Location = { readonly project: string; readonly location: string }
export type GeminiOptions = Omit<RouteModelInput, "id" | "baseURL" | "providerOptions"> &
  Location & { readonly providerOptions?: GoogleProviderOptionsInput }
export type AnthropicOptions = Omit<RouteModelInput, "id" | "baseURL"> & Location

const geminiModel = Route.model<GeminiOptions & Pick<RouteModelInput, "id">>(
  geminiRoute,
  { provider: id },
  {
    mapInput: (input) => {
      const { project, location, ...rest } = input
      return { ...rest, baseURL: baseURL({ project, location, publisher: "google" }) }
    },
  },
)

const anthropicModel = Route.model<AnthropicOptions & Pick<RouteModelInput, "id">>(
  anthropicRoute,
  { provider: anthropicID },
  {
    mapInput: (input) => {
      const { project, location, ...rest } = input
      return { ...rest, baseURL: baseURL({ project, location, publisher: "anthropic" }) }
    },
  },
)

export const gemini = (
  modelID: string | ModelID,
  options: GeminiOptions,
): TypedModelRef<GoogleProviderOptionsInput> => {
  const { providerOptions, ...rest } = options
  return geminiModel({
    ...withGoogleOptions(String(modelID), { ...rest, providerOptions }),
    id: String(modelID),
  } as never)
}

export const claude = (modelID: string | ModelID, options: AnthropicOptions) =>
  anthropicModel({ ...options, id: String(modelID) })

export const model = gemini

export const provider = Provider.make({ id, model: gemini })
