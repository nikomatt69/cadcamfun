/**
 * Scoped, revocable tokens for a standalone nikcli (RM-11, spec 27 §5): one project, read-only or read-write, with an expiry.
 *
 * The application's own bearer opens everything and is not for an outside agent. A bridge token is a signed token
 * (`AuthTokens`, `type: "bridge"`) whose scope is in its claims, plus a record in the key-value store that the owner can list and
 * revoke. It opens only the two action-bridge routes (`http/authorization.ts`), only for the project it names, and for `read`
 * actions only when its mode is `read`. The secret is shown once, when it is issued; only its id is kept.
 */
import { Context, Effect, Layer } from "effect"
import { AuthTokens } from "./auth-tokens.ts"
import { KvStore } from "./kv.ts"

export type BridgeMode = "read" | "write"

export interface BridgeScope {
  readonly projectId: string
  readonly mode: BridgeMode
}

export interface BridgeTokenInfo extends BridgeScope {
  readonly id: string
  readonly name: string
  readonly userId: string
  readonly createdAt: string
  readonly expiresAt: string
}

/** What a presented bearer turns out to be. */
export interface BridgeGrant {
  readonly info: BridgeTokenInfo
  readonly scope: BridgeScope
}

const PREFIX = "bridge.token."
export const MAX_DAYS = 365
export const DEFAULT_DAYS = 30

const isMode = (value: unknown): value is BridgeMode => value === "read" || value === "write"

export class BridgeTokens extends Context.Service<BridgeTokens, {
  /** Issues a token for `userId`; `token` is returned once and never stored. */
  readonly issue: (input: { readonly name: string; readonly projectId: string; readonly mode: BridgeMode; readonly userId: string; readonly email: string | null; readonly days?: number }) => Effect.Effect<{ readonly info: BridgeTokenInfo; readonly token: string }>
  readonly list: Effect.Effect<ReadonlyArray<BridgeTokenInfo>>
  /** Revokes by id; false when there is no such token. */
  readonly revoke: (id: string) => Effect.Effect<boolean>
  /** The grant a bearer carries, or undefined when it is not a live bridge token (forged, expired, revoked, another kind). */
  readonly grantOf: (bearer: string) => Effect.Effect<BridgeGrant | undefined>
}>()("cadcamfun/BridgeTokens") {
  static readonly layer = Layer.effect(BridgeTokens, Effect.gen(function*() {
    const tokens = yield* AuthTokens
    const kv = yield* KvStore
    const read = (id: string) => kv.get(`${PREFIX}${id}`).pipe(Effect.map((entry) => entry?.value as BridgeTokenInfo | undefined), Effect.orElseSucceed(() => undefined))
    return BridgeTokens.of({
      issue: ({ name, projectId, mode, userId, email, days }) => Effect.gen(function*() {
        const lifetime = Math.min(Math.max(Math.floor(days ?? DEFAULT_DAYS), 1), MAX_DAYS)
        const token = tokens.sign({ userId, email: email ?? "", type: "bridge", scope: { projectId, mode } }, lifetime * 86_400)
        const claims = yield* tokens.verify(token).pipe(Effect.orDie)
        const info: BridgeTokenInfo = {
          id: claims.token, name: name.trim().slice(0, 80) || "Standalone nikcli", projectId, mode, userId,
          createdAt: new Date().toISOString(), expiresAt: new Date(claims.exp * 1000).toISOString()
        }
        yield* kv.set(`${PREFIX}${info.id}`, info).pipe(Effect.orDie)
        return { info, token }
      }),
      list: kv.list(PREFIX).pipe(Effect.map((entries) => entries.map((entry) => entry.value as BridgeTokenInfo).sort((a, b) => b.createdAt.localeCompare(a.createdAt))), Effect.orElseSucceed(() => [])),
      revoke: (id) => Effect.gen(function*() {
        const info = yield* read(id)
        if (info === undefined) return false
        yield* tokens.revokeId(id, Math.floor(Date.parse(info.expiresAt) / 1000))
        yield* kv.delete(`${PREFIX}${id}`).pipe(Effect.orDie)
        return true
      }),
      grantOf: (bearer) => Effect.gen(function*() {
        const claims = yield* tokens.verify(bearer).pipe(Effect.option)
        if (claims._tag === "None" || claims.value.type !== "bridge") return undefined
        const scope = claims.value.scope as { projectId?: unknown; mode?: unknown } | undefined
        if (typeof scope?.projectId !== "string" || !isMode(scope.mode)) return undefined
        // A token whose record is gone was revoked (or never issued here): the signature alone is not enough.
        const info = yield* read(claims.value.token)
        return info === undefined ? undefined : { info, scope: { projectId: scope.projectId, mode: scope.mode } }
      })
    })
  }))
}
