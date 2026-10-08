import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/unstable/httpapi"

const errorFields = { error: Schema.String, details: Schema.String }
export class AuthBadRequest extends Schema.TaggedError<AuthBadRequest>()("AuthBadRequest", errorFields, { httpApiStatus: 400 }) {}
export class AuthNotFound extends Schema.TaggedError<AuthNotFound>()("AuthNotFound", errorFields, { httpApiStatus: 404 }) {}
export class AuthUnauthorized extends Schema.TaggedError<AuthUnauthorized>()("AuthUnauthorized", errorFields, { httpApiStatus: 401 }) {}
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
export const FullUser = Schema.Struct({
  id: Schema.String, email: Schema.NullOr(Schema.String), name: Schema.NullOr(Schema.String),
  emailVerified: Schema.NullOr(Schema.String), createdAt: Schema.String
})
export const SignInBody = Schema.Struct({ email: Schema.optional(Schema.String), password: Schema.optional(Schema.String) })
export const SignUpBody = Schema.Struct({
  email: Schema.optional(Schema.String), password: Schema.optional(Schema.String),
  confirmPassword: Schema.optional(Schema.String), name: Schema.optional(Schema.String)
})
/**
 * The session cookie. Optional on purpose: `fetch` hides `Set-Cookie` from scripts, so the
 * typed client of a webview never sees the header and must not fail to decode without it
 * (runtimes that expose it give a single joined string; the same token also travels in the body, for the `x-session-token` header).
 */
const SET_COOKIE = { "set-cookie": Schema.optional(Schema.Union([Schema.Array(Schema.String), Schema.String])) }
export const SignInResponse = HttpApiSchema.WithHeaders(
  Schema.Struct({ ...AuthMessage.fields, user: FullUser, token: Schema.String }), SET_COOKIE)
export const SignUpResponse = Schema.Struct({ ...AuthMessage.fields, user: FullUser })
export const SessionResponse = Schema.Struct({
  session: Schema.Struct({
    user: Schema.Struct({
      id: Schema.String, email: Schema.NullOr(Schema.String), name: Schema.NullOr(Schema.String),
      emailVerified: Schema.NullOr(Schema.String), createdAt: Schema.String, updatedAt: Schema.String
    }),
    expires: Schema.String, sessionToken: Schema.optional(Schema.String)
  })
})
export const TestCreateBody = Schema.Struct({ email: Schema.optional(Schema.String), password: Schema.optional(Schema.String), name: Schema.optional(Schema.String) })
export const TestCreateResponse = Schema.Struct({ success: Schema.Literal(true), message: Schema.String, user: FullUser })
export class TestCreateBadRequest extends Schema.TaggedError<TestCreateBadRequest>()("TestCreateBadRequest", { error: Schema.String }, { httpApiStatus: 400 }) {}
export class TestCreateFailure extends Schema.TaggedError<TestCreateFailure>()("TestCreateFailure", { error: Schema.String, message: Schema.String }, { httpApiStatus: 500 }) {}
export const MagicVerifyResponse = HttpApiSchema.WithHeaders(
  Schema.Struct({
    ...AuthMessage.fields,
    user: Schema.Struct({ id: Schema.String, email: Schema.NullOr(Schema.String), name: Schema.NullOr(Schema.String) }),
    /** Session token for the `x-session-token` header (the desktop client cannot rely on the cookie). */
    token: Schema.optional(Schema.String)
  }),
  SET_COOKIE)
export const SignoutResponse = HttpApiSchema.WithHeaders(AuthMessage, SET_COOKIE)

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
    HttpApiEndpoint.get("getSession", "/api/auth/get-session", { success: SessionResponse, error: [AuthUnauthorized, AuthInternal] }),
    HttpApiEndpoint.post("signinDirect", "/api/auth/signin-direct", {
      payload: SignInBody, success: SignInResponse, error: [AuthBadRequest, AuthUnauthorized, AuthNotFound, AuthInternal]
    }),
    HttpApiEndpoint.post("signup", "/api/auth/signup", {
      payload: SignUpBody, success: SignUpResponse.pipe(Schema.annotate({ httpApiStatus: 201 })), error: [AuthBadRequest, AuthInternal]
    }),
    HttpApiEndpoint.post("testDirectCreate", "/api/auth/test-direct-create", {
      payload: TestCreateBody, success: TestCreateResponse.pipe(Schema.annotate({ httpApiStatus: 201 })), error: [TestCreateBadRequest, TestCreateFailure]
    }),
    HttpApiEndpoint.post("verifyMagicLink", "/api/auth/verify-magic-link", {
      payload: AuthTokenRequest, success: MagicVerifyResponse, error: [AuthBadRequest, AuthNotFound, AuthInternal]
    }),
    // The legacy handler always returns 501; do not advertise a fabricated success response.
    HttpApiEndpoint.post("registerPasskey", "/api/auth/passkey-register", {
      success: Schema.Never, error: [PasskeyNotImplemented, AuthInternal]
    })
  )
{}
