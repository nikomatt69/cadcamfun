import { Schema } from "effect"
import { Sse } from "effect/unstable/encoding"
import { HttpClientError } from "effect/unstable/http"

export class ClientError extends Schema.TaggedError<ClientError>()("ClientError", {
  cause: Schema.Defect(),
}) {}

export const mapTransportError = (error: unknown) =>
  HttpClientError.isHttpClientError(error) ||
  Schema.isSchemaError(error) ||
  Sse.Retry.is(error) ||
  error instanceof Sse.SseError
    ? new ClientError({ cause: error })
    : error

export const mapClientError = mapTransportError
