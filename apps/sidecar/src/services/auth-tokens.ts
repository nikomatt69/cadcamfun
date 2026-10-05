import { Context, Effect, Layer } from "effect"
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { AppConfigService } from "../config.ts"

export type TokenFailure = "expired" | "invalid"

export interface TokenClaims {
  readonly userId: string
  readonly email: string
  readonly type: string
  readonly exp: number
}

const b64 = (value: string | Buffer) => Buffer.from(value).toString("base64url")
const ISSUER = "cadcamfun"

/**
 * HS256 JWTs for the legacy reset/magic-link/verification e-mail links. The signing
 * secret is generated once per installation and lives next to the database, so a link
 * issued before a restart still verifies afterwards.
 */
export class AuthTokens extends Context.Service<AuthTokens, {
  sign(claims: { userId: string; email: string; type: string }, expiresInSeconds: number): string
  verify(token: string): Effect.Effect<TokenClaims, TokenFailure>
}>()("cadcamfun/AuthTokens") {
  static readonly layer = Layer.effect(AuthTokens, Effect.gen(function*() {
    const config = yield* AppConfigService
    const path = join(config.dataDir, "auth-secret")
    const secret = yield* Effect.sync(() => {
      if (existsSync(path)) return readFileSync(path, "utf8")
      mkdirSync(config.dataDir, { recursive: true })
      const fresh = randomBytes(48).toString("hex")
      writeFileSync(path, fresh, { mode: 0o600 })
      return fresh
    })
    const mac = (data: string) => createHmac("sha256", secret).update(data).digest()
    return AuthTokens.of({
      sign: (claims, expiresInSeconds) => {
        const now = Math.floor(Date.now() / 1000)
        const head = `${b64(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${b64(JSON.stringify({
          ...claims, token: randomBytes(32).toString("hex"), iat: now, exp: now + expiresInSeconds, iss: ISSUER
        }))}`
        return `${head}.${b64(mac(head))}`
      },
      verify: (token) => Effect.suspend(() => {
        const parts = token.split(".")
        if (parts.length !== 3) return Effect.fail("invalid" as const)
        const head = `${parts[0]}.${parts[1]}`
        const given = Buffer.from(parts[2]!, "base64url")
        const expected = mac(head)
        if (given.length !== expected.length || !timingSafeEqual(given, expected)) return Effect.fail("invalid" as const)
        try {
          const claims = JSON.parse(Buffer.from(parts[1]!, "base64url").toString("utf8")) as TokenClaims & { iss?: string }
          if (claims.iss !== ISSUER) return Effect.fail("invalid" as const)
          if (typeof claims.exp !== "number" || claims.exp * 1000 <= Date.now()) return Effect.fail("expired" as const)
          return Effect.succeed(claims)
        } catch {
          return Effect.fail("invalid" as const)
        }
      })
    })
  }))
}
