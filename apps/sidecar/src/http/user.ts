import { Api, BadRequest, CurrentUser, InternalError, KeyedInternal, NotFound, TokenBadRequest } from "@cadcamfun/api"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { extname, join } from "node:path"
import { AppConfigService } from "../config.ts"
import { UserRepo } from "../repos/user-repo.ts"
import { ProjectVcs, VcsFailure } from "../services/project-vcs.ts"

const fail = (message: string) => (e: unknown) =>
  Effect.logError(message, e).pipe(Effect.andThen(Effect.fail(new InternalError({ message }))))
const keyed = (log: string, error: string) => (e: unknown) =>
  Effect.logError(log, e).pipe(Effect.andThen(Effect.fail(new KeyedInternal({ error }))))
const isValidUrl = (url: string) => URL.canParse(url.startsWith("http") ? url : `https://${url}`)
const clean = (value: string | undefined) => (value?.trim() ? value.trim() : null)
const DAY = 24 * 60 * 60 * 1000

export const UserHandlers = HttpApiBuilder.group(Api, "user", Effect.fn(function*(handlers) {
  const repo = yield* UserRepo
  const config = yield* AppConfigService
  const vcs = yield* ProjectVcs
  const vcsError = (e: VcsFailure) => (e.code === "not-found" ? new NotFound({ message: e.message }) : new BadRequest({ message: e.message }))
  return handlers
    .handle("gitProfile", () => Effect.gen(function*() {
      return yield* vcs.gitProfile((yield* CurrentUser).id)
    }).pipe(Effect.catchTag("VcsFailure", (e) => Effect.fail(new NotFound({ message: e.message }))), Effect.catchTag("DatabaseError", fail("Internal server error"))))
    .handle("updateGitProfile", ({ payload }) => Effect.gen(function*() {
      return yield* vcs.setGitProfile((yield* CurrentUser).id, payload)
    }).pipe(Effect.catchTag("VcsFailure", (e) => Effect.fail(vcsError(e))), Effect.catchTag("DatabaseError", fail("Internal server error"))))
    .handle("profile", () => Effect.gen(function*() {
      const user = yield* CurrentUser
      const row = yield* repo.profile(user.id)
      if (!row) return yield* new NotFound({ message: "User not found" })
      return row as never
    }).pipe(Effect.catchTag("DatabaseError", fail("Internal server error"))))
    .handle("updateProfile", ({ payload }) => Effect.gen(function*() {
      const user = yield* CurrentUser
      const name = payload.name ?? ""
      if (!name || name.trim().length === 0) return yield* new BadRequest({ message: "Name is required" })
      if (name.length > 100) return yield* new BadRequest({ message: "Name must be less than 100 characters" })
      if (payload.bio && payload.bio.length > 500) return yield* new BadRequest({ message: "Bio must be less than 500 characters" })
      if (payload.website && !isValidUrl(payload.website)) return yield* new BadRequest({ message: "Invalid website URL" })
      let image: string | undefined
      const file = payload.profileImage?.[0]
      if (file && file.contentType.startsWith("image/")) {
        const dir = join(config.dataDir, "uploads", "profiles")
        const name = `${user.id}-${Date.now()}${extname(file.name)}`
        yield* Effect.tryPromise({
          try: async () => { await mkdir(dir, { recursive: true }); await writeFile(join(dir, name), await readFile(file.path)) },
          catch: (e) => new InternalError({ message: e instanceof Error ? e.message : "Internal server error" })
        })
        image = `/uploads/profiles/${name}`
      }
      const updated = (yield* repo.updateProfile(user.id, {
        name: name.trim(), bio: clean(payload.bio), location: clean(payload.location), website: clean(payload.website),
        company: clean(payload.company), title: clean(payload.title),
        publicProfile: payload.publicProfile === undefined ? true : payload.publicProfile === "true",
        showEmail: payload.showEmail === undefined ? false : payload.showEmail === "true",
        ...(image ? { image } : {})
      })) as { name: string | null; email: string | null; image: string | null }
      return { message: "Profile updated successfully", user: updated as never, name: updated.name, email: updated.email, image: updated.image }
    }).pipe(Effect.catchTag("DatabaseError", fail("Internal server error"))))
    .handle("stats", () => Effect.gen(function*() { return (yield* repo.stats((yield* CurrentUser).id)) as never })
      .pipe(Effect.catchTag("DatabaseError", keyed("Error fetching user stats", "Internal server error"))))
    .handle("components", () => Effect.gen(function*() { return (yield* repo.components((yield* CurrentUser).id)) as never })
      .pipe(Effect.catchTag("DatabaseError", fail("Error fetching components"))))
    .handle("projects", () => Effect.gen(function*() { return (yield* repo.projects((yield* CurrentUser).id)) as never })
      .pipe(Effect.catchTag("DatabaseError", fail("Error fetching projects"))))
    .handle("toolpaths", () => Effect.gen(function*() { return (yield* repo.toolpaths((yield* CurrentUser).id)) as never })
      .pipe(Effect.catchTag("DatabaseError", fail("Error fetching toolpaths"))))
    .handle("organizations", () => Effect.gen(function*() { return (yield* repo.organizations((yield* CurrentUser).id)) as never })
      .pipe(Effect.catchTag("DatabaseError", fail("Failed to fetch user organizations"))))
    .handle("apiKeys", () => Effect.gen(function*() { return (yield* repo.apiKeys((yield* CurrentUser).id)) as never })
      .pipe(Effect.catchTag("DatabaseError", fail("Internal Server Error"))))
    .handle("createApiKey", ({ payload }) => Effect.gen(function*() {
      const user = yield* CurrentUser
      const name = payload.name
      if (!name || typeof name !== "string" || name.trim() === "") return yield* new BadRequest({ message: "Key name is required" })
      const apiKey = yield* repo.createApiKey(user.id, name.trim())
      return { message: "API Key generated successfully. Store it securely!", apiKey, name: name.trim() }
    }).pipe(Effect.catchTag("DatabaseError", fail("Internal Server Error"))))
    .handle("revokeApiKey", ({ query }) => Effect.gen(function*() {
      const user = yield* CurrentUser
      if (!query.keyId) return yield* new BadRequest({ message: "Key ID is required" })
      if (!(yield* repo.revokeApiKey(user.id, query.keyId))) return yield* new NotFound({ message: "API Key not found or access denied" })
      return { message: "API Key revoked successfully" }
    }).pipe(Effect.catchTag("DatabaseError", fail("Internal Server Error"))))
    .handle("deleteAccount", () => Effect.gen(function*() {
      const user = yield* CurrentUser
      if (!(yield* repo.deleteAccount(user.id))) return yield* new NotFound({ message: "User not found or already deleted" })
      return { message: "Account deleted successfully" }
    }).pipe(Effect.catchTag("DatabaseError", (e) => Effect.logError("Account deletion failed", e).pipe(
      Effect.andThen(Effect.fail(new InternalError({ message: "Internal server error during account deletion" })))))))
    .handle("password", ({ payload }) => Effect.gen(function*() {
      const user = yield* CurrentUser
      const { currentPassword, newPassword } = payload
      if (!currentPassword || !newPassword) return yield* new BadRequest({ message: "Current password and new password are required" })
      if (newPassword.length < 8) return yield* new BadRequest({ message: "New password must be at least 8 characters long" })
      const cred = yield* repo.credential(user.id)
      if (!cred.userExists) return yield* new NotFound({ message: "User not found" })
      if (!cred.accountId || !cred.hash) return yield* new NotFound({ message: "No password set for this account" })
      const valid = yield* Effect.promise(() => Bun.password.verify(currentPassword, cred.hash!))
      if (!valid) return yield* new BadRequest({ message: "Current password is invalid" })
      yield* repo.setPassword(user.id, cred.accountId, yield* Effect.promise(() => Bun.password.hash(newPassword, { algorithm: "bcrypt", cost: 12 })))
      return { message: "Password updated successfully" }
    }).pipe(Effect.catchTag("DatabaseError", fail("Error updating password"))))
    // The legacy route answers with fixed demo tokens (it never stored them); the wire shape is kept as is.
    .handle("tokens", () => Effect.sync(() => ({
      tokens: [
        { id: "token-1", name: "Development Token", prefix: "cad_dev_abc123", permissions: ["read:projects", "write:drawings", "read:toolpaths"],
          createdAt: new Date(Date.now() - 7 * DAY).toISOString(), lastUsed: new Date(Date.now() - 3_600_000).toISOString(), isActive: true },
        { id: "token-2", name: "Mobile App Token", prefix: "cad_mobile_xyz789", permissions: ["read:projects", "write:toolpaths"],
          createdAt: new Date(Date.now() - 14 * DAY).toISOString(), lastUsed: new Date(Date.now() - 3 * 3_600_000).toISOString(),
          expiresAt: new Date(Date.now() + 30 * DAY).toISOString(), isActive: true },
        { id: "token-3", name: "Analytics Integration", prefix: "cad_analytics_def456", permissions: ["read:analytics", "read:usage"],
          createdAt: new Date(Date.now() - 21 * DAY).toISOString(), expiresAt: new Date(Date.now() - DAY).toISOString(), isActive: false }
      ]
    })))
    .handle("createToken", ({ payload }) => Effect.gen(function*() {
      if (!payload.name || !payload.permissions || !Array.isArray(payload.permissions)) {
        return yield* new TokenBadRequest({ error: "Name and permissions are required" })
      }
      const prefix = `cad_${payload.name.toLowerCase().replace(/\s+/g, "_")}_${Math.random().toString(36).substring(2, 8)}`
      const token = {
        id: `token_${Date.now()}`, name: payload.name, prefix, permissions: payload.permissions as ReadonlyArray<string>,
        createdAt: new Date().toISOString(), isActive: true,
        ...(payload.expiresIn ? { expiresAt: new Date(Date.now() + payload.expiresIn * DAY).toISOString() } : {})
      }
      return { token, fullToken: `${prefix}_${Math.random().toString(36).substring(2, 20)}` }
    }))
    .handle("verifyChange", ({ query }) => Effect.gen(function*() {
      if (!query.token || !query.type) return yield* new BadRequest({ message: "Token and verification type are required" })
      const r = yield* repo.verifyChange(query.token, query.type, query.password)
      if (r._tag === "missing") return yield* new NotFound({ message: "Invalid or expired token" })
      if (r._tag === "expired") return yield* new BadRequest({ message: "Token has expired" })
      if (r._tag === "wrongType") return yield* new BadRequest({ message: "Invalid token type" })
      if (r._tag === "needsPassword") return yield* new BadRequest({ message: "Password is required for password update" })
      return { message: r.type === "email" ? "Email updated successfully" : "Password updated successfully" }
    }).pipe(Effect.catchTag("DatabaseError", fail("Error during verification"))))
    .handle("byId", ({ params }) => Effect.gen(function*() {
      if (!params.id) return yield* new BadRequest({ message: "Drawing ID is required" })
      const row = yield* repo.publicUser(params.id)
      if (!row) return yield* new NotFound({ message: "User not found" })
      return row as never
    }).pipe(Effect.catchTag("DatabaseError", fail("Error fetching user"))))
}))
