import { Effect, Stream } from "effect"
import { Headers, HttpClientRequest } from "effect/http"
import { Auth, type Auth as AuthDef } from "../auth"
import { type Endpoint, render as renderEndpoint } from "../endpoint"
import type { Framing } from "../framing"
import type { Transport } from "./index"
import * as ProviderShared from "../../protocols/shared"
import { mergeJsonRecords, type LLMRequest } from "../../schema"

export interface JsonRequestInput<Body> {
  readonly body: Body
  readonly request: LLMRequest
  readonly endpoint: Endpoint<Body>
  readonly auth: AuthDef
  readonly encodeBody: (body: Body) => string
  readonly headers?: (input: { readonly request: LLMRequest }) => Record<string, string>
}

export interface JsonRequestParts<Body = unknown> {
  readonly url: string
  readonly jsonBody: Body | Record<string, unknown>
  readonly bodyText: string
  readonly headers: Headers.Headers
}

export interface HttpPrepared<Frame> {
  readonly request: HttpClientRequest.HttpClientRequest
  readonly framing: Framing<Frame>
}

// Headers whose value is a comma-separated set of feature flags. A deployment sets the flags it always needs
// (on the model) while a protocol adds the ones a particular request needs; letting the later layer replace the
// earlier would drop one or the other, so these are unioned across layers instead.
const LIST_HEADERS = ["anthropic-beta"] as const

const unionedListHeaders = (layers: ReadonlyArray<Record<string, string> | undefined>) => {
  const out: Record<string, string> = {}
  for (const name of LIST_HEADERS) {
    const values = layers.flatMap((layer) =>
      Object.entries(layer ?? {})
        .filter(([key]) => key.toLowerCase() === name)
        .flatMap(([, value]) => value.split(",")),
    )
    const unique = [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))]
    if (unique.length > 0) out[name] = unique.join(",")
  }
  return out
}

const applyQuery = (url: string, query: Record<string, string> | undefined) => {
  if (!query) return url
  const next = new URL(url)
  Object.entries(query).forEach(([key, value]) => next.searchParams.set(key, value))
  return next.toString()
}

const bodyWithOverlay = <Body>(body: Body, request: LLMRequest, encodeBody: (body: Body) => string) =>
  Effect.gen(function* () {
    if (request.http?.body === undefined) return { jsonBody: body, bodyText: encodeBody(body) }
    if (ProviderShared.isRecord(body)) {
      const overlaid = mergeJsonRecords(body, request.http.body) ?? {}
      return { jsonBody: overlaid, bodyText: ProviderShared.encodeJson(overlaid) }
    }
    return yield* ProviderShared.invalidRequest("http.body can only overlay JSON object request bodies")
  })

export const jsonRequestParts = <Body>(input: JsonRequestInput<Body>) =>
  Effect.gen(function* () {
    const url = applyQuery(
      renderEndpoint(input.endpoint, { request: input.request, body: input.body }).toString(),
      input.request.http?.query,
    )
    const body = yield* bodyWithOverlay(input.body, input.request, input.encodeBody)
    const layers = [
      input.headers?.({ request: input.request }),
      input.request.model.headers,
      input.request.http?.headers,
    ]
    const headers = yield* Auth.toEffect(Auth.isAuth(input.request.model.auth) ? input.request.model.auth : input.auth)(
      {
        request: input.request,
        method: "POST",
        url,
        body: body.bodyText,
        headers: Headers.fromInput({
          ...layers[0],
          ...layers[1],
          ...layers[2],
          ...unionedListHeaders(layers),
        }),
      },
    )
    return { url, jsonBody: body.jsonBody, bodyText: body.bodyText, headers }
  })

export interface HttpJsonInput<Body, Frame> {
  readonly endpoint: Endpoint<Body>
  readonly auth?: AuthDef
  readonly framing: Framing<Frame>
  readonly encodeBody: (body: Body) => string
  readonly headers?: (input: { readonly request: LLMRequest }) => Record<string, string>
}

export type HttpJsonPatch<Body, Frame> = Partial<HttpJsonInput<Body, Frame>>

export interface HttpJsonTransport<Body, Frame> extends Transport<Body, HttpPrepared<Frame>, Frame> {
  readonly with: (patch: HttpJsonPatch<Body, Frame>) => HttpJsonTransport<Body, Frame>
}

export const httpJson = <Body, Frame>(input: HttpJsonInput<Body, Frame>): HttpJsonTransport<Body, Frame> => ({
  id: "http-json",
  with: (patch) => httpJson({ ...input, ...patch }),
  prepare: (body, request, options) =>
    Effect.gen(function* () {
      const parts = yield* jsonRequestParts({
        body,
        request,
        endpoint: input.endpoint,
        auth: input.auth ?? Auth.bearer(),
        encodeBody: input.encodeBody,
        headers: input.headers,
      })
      const outgoing = {
        url: parts.url,
        method: "POST",
        headers: Object.fromEntries(Object.entries(parts.headers).map(([name, value]) => [name, String(value)])),
        body: parts.bodyText as string | undefined,
      }
      yield* options?.transform?.(outgoing) ?? Effect.void
      return {
        request: ProviderShared.jsonPost({
          url: outgoing.url,
          body: outgoing.body ?? "",
          headers: Headers.fromInput(outgoing.headers),
        }),
        framing: input.framing,
      }
    }),
  frames: (prepared, request, runtime) =>
    Stream.unwrap(
      runtime.http
        .execute(prepared.request)
        .pipe(
          Effect.map((response) =>
            prepared.framing.frame(
              response.stream.pipe(
                Stream.mapError((error) =>
                  ProviderShared.eventError(
                    `${request.model.provider}/${request.model.route}`,
                    `Failed to read ${request.model.provider}/${request.model.route} stream`,
                    ProviderShared.errorText(error),
                  ),
                ),
              ),
            ),
          ),
        ),
    ),
})
