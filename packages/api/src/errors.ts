import { Schema } from "effect"

// Legacy handlers answer every failure with `{ message: string }` and a plain status code.
// Keep that wire format: one tagged error per status, all carrying only `message`.
const fields = { message: Schema.String }

export class BadRequest extends Schema.TaggedError<BadRequest>()("BadRequest", fields, { httpApiStatus: 400 }) {}
export class Unauthorized extends Schema.TaggedError<Unauthorized>()("Unauthorized", fields, { httpApiStatus: 401 }) {}
export class Forbidden extends Schema.TaggedError<Forbidden>()("Forbidden", fields, { httpApiStatus: 403 }) {}
export class NotFound extends Schema.TaggedError<NotFound>()("NotFound", fields, { httpApiStatus: 404 }) {}
export class MethodNotAllowed extends Schema.TaggedError<MethodNotAllowed>()("MethodNotAllowed", fields, { httpApiStatus: 405 }) {}
export class Conflict extends Schema.TaggedError<Conflict>()("Conflict", fields, { httpApiStatus: 409 }) {}
export class InternalError extends Schema.TaggedError<InternalError>()("InternalError", fields, { httpApiStatus: 500 }) {}

/** Convenience union used by most groups. */
export const CommonErrors = [BadRequest, Forbidden, NotFound, InternalError] as const

// ---- Envelope errors: legacy `sendErrorResponse` => `{ success: false, message, errors }` ----
const envelope = { success: Schema.Literal(false), message: Schema.String, errors: Schema.NullOr(Schema.Unknown) }
export class EnvBadRequest extends Schema.TaggedError<EnvBadRequest>()("EnvBadRequest", envelope, { httpApiStatus: 400 }) {}
export class EnvForbidden extends Schema.TaggedError<EnvForbidden>()("EnvForbidden", envelope, { httpApiStatus: 403 }) {}
export class EnvNotFound extends Schema.TaggedError<EnvNotFound>()("EnvNotFound", envelope, { httpApiStatus: 404 }) {}
export class EnvMethodNotAllowed extends Schema.TaggedError<EnvMethodNotAllowed>()("EnvMethodNotAllowed", envelope, { httpApiStatus: 405 }) {}
export class EnvConflict extends Schema.TaggedError<EnvConflict>()("EnvConflict", envelope, { httpApiStatus: 409 }) {}
export class EnvInternal extends Schema.TaggedError<EnvInternal>()("EnvInternal", envelope, { httpApiStatus: 500 }) {}

/** Build an envelope error body: `envErr(EnvNotFound, "Material not found")`. */
export const envErr = <E extends { new (a: { success: false; message: string; errors: unknown }): unknown }>(
  Cls: E, message: string, errors: unknown = null
): InstanceType<E> => new Cls({ success: false, message, errors }) as InstanceType<E>

/** Legacy `sendSuccessResponse` body: `{ success: true, message, data }`. */
export const Envelope = <A extends Schema.Top>(data: A) =>
  Schema.Struct({ success: Schema.Literal(true), message: Schema.String, data: Schema.NullOr(data) })
export const ok = <A>(data: A | null = null, message = "Success") => ({ success: true as const, message, data })

/** Variant used by routes importing helpers from `lib/api/auth`: success body omits `message` when none is given. */
export const okAuth = <A>(data: A | null, message?: string) =>
  message === undefined ? { success: true as const, data } : { success: true as const, data, message }
export const EnvelopeOpt = <A extends Schema.Top>(data: A) =>
  Schema.Struct({ success: Schema.Literal(true), data: Schema.NullOr(data), message: Schema.optional(Schema.String) })

// ---- `{ error: string }` bodies used by a few legacy routes (e.g. /api/library/components) ----
export class KeyedInternal extends Schema.TaggedError<KeyedInternal>()("KeyedInternal", { error: Schema.String }, { httpApiStatus: 500 }) {}
export class KeyedMethodNotAllowed extends Schema.TaggedError<KeyedMethodNotAllowed>()("KeyedMethodNotAllowed", { error: Schema.String }, { httpApiStatus: 405 }) {}
