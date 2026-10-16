import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { exportJWK, generateKeyPair, SignJWT } from "jose"
import { makeApp } from "./helpers.ts"

let app: Awaited<ReturnType<typeof makeApp>>
let keys: Awaited<ReturnType<typeof generateKeyPair>>
let server: ReturnType<typeof Bun.serve>
let issuer: string

beforeAll(async () => {
  keys = await generateKeyPair("ES256")
  const jwk = { ...await exportJWK(keys.publicKey), kid: "identity-test", alg: "ES256", use: "sig" }
  server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => Response.json({ keys: [jwk] }) })
  issuer = `http://127.0.0.1:${server.port}`
  app = await makeApp({ identityIssuer: issuer })
})
afterAll(async () => { await app?.dispose(); server?.stop(true) })

const token = (subject: string, overrides: Record<string, unknown> = {}) => new SignJWT({
  email: "identity@example.com", client_id: "cadcamfun-desktop", ...overrides,
}).setProtectedHeader({ alg: "ES256", kid: "identity-test" })
  .setSubject(subject).setIssuer(issuer).setAudience("cadcamfun-api")
  .setIssuedAt().setExpirationTime("15m").sign(keys.privateKey)
const session = (access?: string) => app.call("/api/auth/get-session", { headers: access ? { "x-identity-token": access } : {} })

describe("CADCAMFUN identity account mapping", () => {
  test("keeps the desktop local and optional when no account credential is supplied", async () => {
    const reply = await session()
    expect(reply.status).toBe(200)
    expect(reply.body.session.user.email).toBe("local@cadcamfun.local")
  })

  test("desktop and mobile OAuth credentials resolve to the same application user", async () => {
    const desktop = await session(await token("cadcamfun-account-1"))
    const mobile = await session(await token("cadcamfun-account-1", { client_id: "cadcamfun-mobile" }))
    expect(desktop.status).toBe(200)
    expect(mobile.status).toBe(200)
    expect(desktop.body.session.user.email).toBe("identity@example.com")
    expect(mobile.body.session.user.id).toBe(desktop.body.session.user.id)
    expect((await session()).body.session.user.id).not.toBe(desktop.body.session.user.id)
  })

  test("does not take over an existing account based on email alone", async () => {
    const created = await app.call("/api/auth/signup", { method: "POST", json: {
      email: "existing@example.com", name: "Existing user", password: "test-password-long", confirmPassword: "test-password-long",
    } })
    expect(created.status).toBe(201)
    const identity = await session(await token("new-identity-subject", { email: "existing@example.com" }))
    expect(identity.status).toBe(200)
    expect(identity.body.session.user.id).not.toBe(created.body.user.id)
    const repeated = await session(await token("new-identity-subject", { email: "existing@example.com" }))
    expect(repeated.body.session.user.id).toBe(identity.body.session.user.id)
  })

  test("rejects untrusted claims rather than silently using the local account", async () => {
    for (const overrides of [{ client_id: "other-client" }, { email: "invalid" }]) {
      expect((await session(await token("attacker", overrides))).status).toBe(401)
    }
    for (const claims of [{ iss: "https://other.test" }, { aud: "wrong-api" }, { exp: 1 }]) {
      const access = await new SignJWT({ sub: "attacker", email: "attacker@example.com", client_id: "cadcamfun-desktop", iss: issuer, aud: "cadcamfun-api", iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 900, ...claims })
        .setProtectedHeader({ alg: "ES256", kid: "identity-test" }).sign(keys.privateKey)
      expect((await session(access)).status).toBe(401)
    }
    expect((await session("forged-token")).status).toBe(401)
  })
})
