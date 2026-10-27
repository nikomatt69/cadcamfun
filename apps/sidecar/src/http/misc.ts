import {
  Api, BadRequest, CurrentUser, DesktopBadRequest, DesktopConflict, DesktopInternal, DesktopNotFound, DesktopUnauthorized,
  Forbidden, InternalError, NotFound, NotifyBadRequest, NotifyInternal
} from "@cadcamfun/api"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { AuthRepo } from "../repos/auth-repo.ts"
import { MiscRepo } from "../repos/misc-repo.ts"
import { ProjectRepo } from "../repos/project-repo.ts"
import { NotificationService } from "../services/notifications.ts"
import { AuthTokens } from "../services/auth-tokens.ts"
import { signInPasswordMatches } from "../services/passwords.ts"

const fail = (message: string) => (e: unknown) =>
  Effect.logError(message, e).pipe(Effect.andThen(Effect.fail(new InternalError({ message }))))
const desktop = (error: string) => (e: unknown) =>
  Effect.logError(error, e).pipe(Effect.andThen(Effect.fail(new DesktopInternal({ success: false, error }))))
const project = (p: { id: string; name: string; description: string | null; ownerId: string; organizationId: string | null; isPublic: boolean; createdAt: Date; updatedAt: Date }) => ({
  id: p.id, name: p.name, description: p.description, owner_id: p.ownerId, organization_id: p.organizationId,
  is_public: p.isPublic, created_at: p.createdAt.toISOString(), updated_at: p.updatedAt.toISOString()
})

export const MiscHandlers = HttpApiBuilder.group(Api, "misc", Effect.fn(function*(handlers) {
  const repo = yield* MiscRepo
  const projects = yield* ProjectRepo
  const auth = yield* AuthRepo
  const tokens = yield* AuthTokens
  const notifications = yield* NotificationService

  return handlers
    .handle("pushSubscribe", ({ payload }) => Effect.gen(function*() {
      const user = yield* CurrentUser
      const { endpoint, keys } = payload
      if (!endpoint || !keys || !keys.p256dh || !keys.auth) return yield* new BadRequest({ message: "Dati di sottoscrizione non validi" })
      const id = yield* repo.savePush(user.id, { endpoint, p256dh: keys.p256dh, auth: keys.auth })
      return { success: true as const, id }
    }).pipe(Effect.catchTag("DatabaseError", fail("Error saving push subscription"))))
    .handle("pushUnsubscribe", ({ payload }) => Effect.gen(function*() {
      const user = yield* CurrentUser
      if (!payload.endpoint) return yield* new BadRequest({ message: "Endpoint richiesto" })
      yield* repo.deletePush(user.id, payload.endpoint)
      return { success: true as const }
    }).pipe(Effect.catchTag("DatabaseError", fail("Error deleting push subscription"))))
    .handle("notify", ({ payload }) => Effect.gen(function*() {
      if (!payload.userId || !payload.message) return yield* new NotifyBadRequest({ success: false, error: "Missing userId or message" })
      const m = payload.message as Record<string, unknown>
      yield* notifications.create({
        type: (m["type"] as never) ?? "NEW_MESSAGE", title: String(m["title"] ?? ""), content: String(m["content"] ?? ""),
        userId: String(m["userId"] ?? payload.userId)
      })
      return { success: true as const, message: "Notification triggered." }
    }).pipe(Effect.catchIf((e): e is Exclude<typeof e, NotifyBadRequest> => !(e instanceof NotifyBadRequest),
      (e) => Effect.fail(new NotifyInternal({ success: false, error: e instanceof Error ? e.message : "Unknown internal server error" })))))
    .handle("desktopSignin", ({ payload }) => Effect.gen(function*() {
      if (!payload.email || !payload.password) return yield* new DesktopBadRequest({ success: false, error: "Email and password are required" })
      const user = yield* auth.findForSignin(payload.email)
      const invalid = new DesktopUnauthorized({ success: false, error: "Invalid credentials" })
      if (!user || !user.password) return yield* invalid
      if (!(yield* signInPasswordMatches(payload.password, user.password, user.id))) return yield* invalid
      const token = tokens.sign({ userId: user.id, email: user.email ?? "", type: "desktop" }, 7 * 24 * 3600)
      yield* repo.logActivity(user.id, user.id, "desktop_signin", "signin", { platform: payload.platform ?? "desktop", deviceId: payload.deviceId ?? "unknown" })
      const profile = yield* auth.profile(user.id)
      return {
        success: true as const, token,
        user: { id: user.id, name: user.name, email: user.email, image: null as string | null },
        syncData: { lastSync: new Date().toISOString(), version: "1.0.0" }, ...(profile ? {} : {})
      }
    }).pipe(Effect.catchTag("DatabaseError", desktop("Internal server error"))))
    .handle("desktopProjects", () => Effect.gen(function*() {
      const rows = yield* repo.ownedProjects((yield* CurrentUser).id)
      return { success: true as const, data: rows.map(project), message: `Retrieved ${rows.length} projects` }
    }).pipe(Effect.catchTag("DatabaseError", desktop("Failed to retrieve projects"))))
    .handle("desktopCreateProject", ({ payload }) => Effect.gen(function*() {
      const user = yield* CurrentUser
      const name = payload.name
      if (!name || typeof name !== "string" || name.trim().length === 0) return yield* new DesktopBadRequest({ success: false, error: "Project name is required" })
      if (name.length > 255) return yield* new DesktopBadRequest({ success: false, error: "Project name must be less than 255 characters" })
      if (payload.organization_id && !(yield* repo.isMember(user.id, payload.organization_id))) {
        return yield* new DesktopBadRequest({ success: false, error: "Invalid organization or user not a member" })
      }
      const created = yield* repo.createProject(user.id, {
        name: name.trim(), description: payload.description?.trim() || null, organizationId: payload.organization_id || null, isPublic: payload.is_public ?? false
      })
      yield* repo.logActivity(user.id, created.id, "project", "created", { name: created.name, platform: "desktop" })
      return { success: true as const, data: project(created), message: "Project created successfully" }
    }).pipe(Effect.catchTag("DatabaseError", (e): Effect.Effect<never, DesktopConflict | DesktopInternal> => String(e).includes("UNIQUE")
      ? Effect.fail(new DesktopConflict({ success: false, error: "A project with this name already exists" }))
      : Effect.logError("Failed to create project", e).pipe(Effect.andThen(Effect.fail(new DesktopInternal({ success: false, error: "Failed to create project" })))))))
    .handle("desktopUserByEmail", ({ query }) => Effect.gen(function*() {
      if (!query.email) return yield* new DesktopBadRequest({ success: false, error: "Email parameter is required" })
      const row = yield* repo.userByEmail(query.email)
      if (!row) return yield* new DesktopNotFound({ success: false, error: "User not found" })
      return {
        success: true as const, message: "User found successfully",
        data: { id: row.id, name: row.name, email: row.email, image: row.image, created_at: row.createdAt.toISOString(), updated_at: row.updatedAt.toISOString() }
      }
    }).pipe(Effect.catchTag("DatabaseError", desktop("Internal server error"))))
    .handle("trackedGet", ({ params }) => Effect.gen(function*() {
      const user = yield* CurrentUser
      if (!params.id) return yield* new BadRequest({ message: "Project ID is required" })
      const access = yield* projects.find(user.id, params.id)
      if (!access) return yield* new NotFound({ message: "Project not found or access denied" })
      return access.project
    }).pipe(Effect.catchTag("DatabaseError", fail("Failed to fetch project"))))
    .handle("trackedUpdate", ({ params, payload }) => Effect.gen(function*() {
      const user = yield* CurrentUser
      const access = yield* projects.find(user.id, params.id)
      if (!access) return yield* new NotFound({ message: "Project not found or access denied" })
      if (!(access.project.ownerId === user.id || access.orgRole === "ADMIN" || access.orgRole === "MANAGER")) {
        return yield* new Forbidden({ message: "You do not have permission to update this project" })
      }
      if (!payload.name) return yield* new BadRequest({ message: "Project name is required" })
      if (payload.organizationId && payload.organizationId !== access.project.organization?.id && !(yield* projects.isMember(user.id, payload.organizationId))) {
        return yield* new Forbidden({ message: "You do not have access to the specified organization" })
      }
      return yield* projects.update(params.id, { name: payload.name, description: payload.description, organizationId: payload.organizationId })
    }).pipe(Effect.catchTag("DatabaseError", fail("Failed to update project"))))
    .handle("trackedRemove", ({ params }) => Effect.gen(function*() {
      const user = yield* CurrentUser
      const access = yield* projects.find(user.id, params.id)
      if (!access) return yield* new NotFound({ message: "Project not found or access denied" })
      if (access.project.ownerId !== user.id && access.orgRole !== "ADMIN") return yield* new Forbidden({ message: "You do not have permission to delete this project" })
      yield* projects.remove(params.id)
      return { message: "Project deleted successfully" }
    }).pipe(Effect.catchTag("DatabaseError", fail("Failed to delete project"))))
}))
