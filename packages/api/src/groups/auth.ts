import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/unstable/httpapi"

const errorFields = { error: Schema.String, details: Schema.String }
export class AuthBadRequest extends Schema.TaggedError<AuthBadRequest>()("AuthBadRequest", errorFields, { httpApiStatus: 400 }) {}
export class AuthNotFound extends Schema.TaggedError<AuthNotFound>()("AuthNotFound", errorFields, { httpApiStatus: 404 }) {}
export class AuthInternal extends Schema.TaggedError<AuthInternal>()("AuthInternal", errorFields, { httpApiStatus: 500 }) {}
export class PasskeyNotImplemented extends Schema.TaggedError<PasskeyNotImplemented>()("PasskeyNotImplemented", {
  ...errorFields,
  todoImplementation: Schema.Struct({
    webauthn: Schema.String, challengeGeneration: Schema.String,
    credentialStorage: Schema.String, userVerification: Schema.String
  })
}, { httpApiStatus: 501 }) {}

// Request fields are optional because the legacy handlers validate them by hand and answer
// with their own `{ error, details }` messages rather than a generic schema failure.
export const AuthEmailRequest = Schema.Struct({ email: Schema.optional(Schema.String), callbackURL: Schema.optional(Schema.String) })
export const AuthTokenRequest = Schema.Struct({ token: Schema.optional(Schema.String) })
export const PasswordResetRequest = Schema.Struct({
  token: Schema.optional(Schema.String), newPassword: Schema.optional(Schema.String), confirmPassword: Schema.optional(Schema.String)
})
export const AuthMessage = Schema.Struct({ success: Schema.Literal(true), message: Schema.String })
export const AuthUserReference = Schema.Struct({ id: Schema.String, email: Schema.String, name: Schema.NullOr(Schema.String) })
export const ForgotPasswordResponse = Schema.Struct({ ...AuthMessage.fields, debugResetLink: Schema.optional(Schema.String) })
export const MagicLinkResponse = Schema.Struct({ ...AuthMessage.fields, debugMagicLink: Schema.optional(Schema.String) })
export const VerificationEmailResponse = Schema.Struct({ ...AuthMessage.fields, debug: Schema.Struct({ link: Schema.String }) })
export const PasswordResetResponse = Schema.Struct({ ...AuthMessage.fields, user: AuthUserReference })
export const VerifyEmailResponse = Schema.Struct({
  ...AuthMessage.fields, user: Schema.Struct({ ...AuthUserReference.fields, emailVerified: Schema.String })
})
export const SignoutResponse = HttpApiSchema.WithHeaders(AuthMessage, { "set-cookie": Schema.Array(Schema.String) })

export class AuthGroup extends HttpApiGroup.make("auth")
  .add(
    HttpApiEndpoint.post("forgotPassword", "/api/auth/forgot-password", {
      payload: AuthEmailRequest, success: ForgotPasswordResponse, error: [AuthBadRequest, AuthInternal]
    }),
    HttpApiEndpoint.post("resetPassword", "/api/auth/reset-password", {
      payload: PasswordResetRequest, success: PasswordResetResponse, error: [AuthBadRequest, AuthNotFound, AuthInternal]
    }),
    HttpApiEndpoint.post("sendMagicLink", "/api/auth/send-magic-link", {
      payload: AuthEmailRequest, success: MagicLinkResponse, error: [AuthBadRequest, AuthInternal]
    }),
    HttpApiEndpoint.post("sendVerificationEmail", "/api/auth/send-verification-email", {
      payload: AuthEmailRequest, success: VerificationEmailResponse, error: [AuthBadRequest, AuthNotFound, AuthInternal]
    }),
    HttpApiEndpoint.post("verifyEmail", "/api/auth/verify-email", {
      payload: AuthTokenRequest, success: VerifyEmailResponse, error: [AuthBadRequest, AuthNotFound, AuthInternal]
    }),
    HttpApiEndpoint.post("signout", "/api/auth/signout", { success: SignoutResponse }),
    // The legacy handler always returns 501; do not advertise a fabricated success response.
    HttpApiEndpoint.post("registerPasskey", "/api/auth/passkey-register", {
      success: Schema.Never, error: [PasskeyNotImplemented, AuthInternal]
    })
  )
{}
