import { expect, test } from "bun:test"
import { Schema } from "effect"
import { OpenApi } from "effect/unstable/httpapi"
import { Api, AuthEmailRequest, AuthTokenRequest, PasswordResetRequest, AuthMessage, AuthUserReference, ForgotPasswordResponse, MagicLinkResponse, VerificationEmailResponse, PasswordResetResponse, VerifyEmailResponse, WaitlistRequest, WaitlistResponse, PluginInstallResponse } from "../src/index.ts"
import { contractCoverage, normalizePath, parseInventory } from "../scripts/coverage.ts"
import { SystemMetricsResponse, TrackActivityRequest, TrackActivityResponse } from "../src/groups/analytics.ts"

test("new JSON schemas round-trip and reject invalid shapes", () => {
  const user = { id: "u", email: "u@example.com", name: null }
  const message = { success: true as const, message: "Done" }
  const fixtures = [
    [AuthMessage, message], [AuthUserReference, user],
    [ForgotPasswordResponse, { ...message, debugResetLink: "/reset" }],
    [MagicLinkResponse, { ...message, debugMagicLink: "/magic" }],
    [VerificationEmailResponse, { ...message, debug: { link: "/verify" } }],
    [PasswordResetResponse, { ...message, user }],
    [VerifyEmailResponse, { ...message, user: { ...user, emailVerified: "2026-10-05T00:00:00.000Z" } }],
    [WaitlistRequest, { email: user.email }], [WaitlistResponse, message]
    , [SystemMetricsResponse, { cpuUsage: 10, memoryUsage: 20, storageUsed: 30, networkLatency: 15, activeConnections: 2, cacheHitRatio: 90, errorRate: 0, responseTime: 50 }]
    , [TrackActivityResponse, { success: true }]
  ] as const
  // Request bodies are loose on purpose (handlers answer with the legacy messages), so `{}` decodes.
  for (const [schema, value] of [
    [AuthEmailRequest, { email: user.email, callbackURL: "/reset" }],
    [AuthTokenRequest, { token: "token" }],
    [PasswordResetRequest, { token: "token", newPassword: "password", confirmPassword: "password" }]
  ] as const) {
    expect(Schema.encodeSync(schema)(Schema.decodeUnknownSync(schema)(value))).toEqual(value)
    expect(Schema.decodeUnknownSync(schema)({})).toEqual({})
  }
  for (const [schema, value] of fixtures) {
    const decoded = Schema.decodeUnknownSync(schema)(value)
    expect(Schema.encodeSync(schema)(decoded)).toEqual(value)
    expect(() => Schema.decodeUnknownSync(schema)({})).toThrow()
  }
  expect(() => Schema.decodeUnknownSync(PluginInstallResponse)({ message: "Done", plugin: {} })).toThrow()
  // The track payload is deliberately loose: the handler answers with the legacy validation messages.
  const track = { itemId: "p", itemType: "project", action: "viewed", details: { source: "desktop" } }
  expect(Schema.encodeSync(TrackActivityRequest)(Schema.decodeUnknownSync(TrackActivityRequest)(track))).toEqual(track)
  expect(Schema.decodeUnknownSync(TrackActivityRequest)({})).toEqual({})
})

test("OpenAPI preserves status codes, concrete payloads and non-JSON encodings", () => {
  const document = OpenApi.fromApi(Api)
  expect(document.paths["/api/waitlist"]?.post?.responses).toHaveProperty("201")
  expect(document.paths["/api/waitlist"]?.post?.responses).toHaveProperty("409")
  expect(document.paths["/api/auth/passkey-register"]?.post?.responses).toHaveProperty("501")
  expect(document.paths["/api/plugins/install"]?.post?.requestBody).toHaveProperty("content.multipart/form-data")
  expect(document.paths["/api/plugins/bootstrap.js"]?.get?.responses["200"]).toHaveProperty("content.application/javascript")
  expect(document.paths["/api/auth/reset-password"]?.post?.requestBody).toBeDefined()
  expect(document.paths["/api/ai/models"]?.get?.parameters).toEqual(expect.arrayContaining([expect.objectContaining({ name: "configuredOnly", in: "query", required: false })]))
  expect(document).toMatchSnapshot()
})

test("coverage normalizes parameters without overlooking missing methods", () => {
  expect(normalizePath("/api/plugins/{pluginId}")).toBe(normalizePath("/api/plugins/:id"))
  const rows = parseInventory("| `/api/waitlist` | POST | |\n| `/api/waitlist` | GET, POST | |\n| `/api/plugins/:id` | GET, DELETE | |\n| `/api/unknown` | ? | |\n| `/api/waitlist` | OPTIONS | |")
  const result = contractCoverage(rows)
  expect(result.covered).toBe(2)
  expect(result.missing).toEqual([
    { route: "/api/waitlist", missingMethods: ["GET"], existingMethods: ["POST"], unresolvedMethods: false },
    { route: "/api/unknown", missingMethods: [], existingMethods: [], unresolvedMethods: true },
    { route: "/api/waitlist", missingMethods: ["OPTIONS"], existingMethods: ["POST"], unresolvedMethods: false }
  ])
})
