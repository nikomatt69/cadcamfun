import { Schema } from "effect"

/** Missing/invalid configuration: no credentials, unknown provider, bad base URL. */
export class AiConfigError extends Schema.TaggedError<AiConfigError>()("AiConfigError", {
  message: Schema.String,
  provider: Schema.optionalKey(Schema.String)
}) {}

/** The model provider (or the embedded host) failed while serving a request. */
export class AiProviderError extends Schema.TaggedError<AiProviderError>()("AiProviderError", {
  message: Schema.String,
  provider: Schema.optionalKey(Schema.String),
  retryable: Schema.optionalKey(Schema.Boolean)
}) {}

/** The caller (or `AiService.abort`) cancelled the request. */
export class AiAborted extends Schema.TaggedError<AiAborted>()("AiAborted", {
  sessionId: Schema.optionalKey(Schema.String)
}) {}

export type AiError = AiConfigError | AiProviderError | AiAborted
