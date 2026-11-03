import { Api, BadRequest, Conflict, CurrentUser, Forbidden, InternalError, NotFound } from "@cadcamfun/api"
import { randomBytes } from "node:crypto"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { OrganizationRepo } from "../repos/organization-repo.ts"
import { ProjectRepo } from "../repos/project-repo.ts"
import { NotificationService } from "../services/notifications.ts"

const fail = (message: string) => (error: unknown) =>
  Effect.logError(message, error).pipe(Effect.andThen(Effect.fail(new InternalError({ message }))))

export const OrganizationsHandlers = HttpApiBuilder.group(Api, "organizations", Effect.fn(function*(handlers) {
  const repo = yield* OrganizationRepo
  const projects = yield* ProjectRepo
  const notifications = yield* NotificationService
  const ROLES = ["ADMIN", "MANAGER", "MEMBER"] as const
  const isRole = (value: string): value is typeof ROLES[number] => (ROLES as readonly string[]).includes(value)
  /** The acting user's role; any other user gets the legacy 403 with the message of the route. */
  const roleOf = Effect.fn("organizations.roleOf")(function*(organizationId: string, notMember: string) {
    const user = yield* CurrentUser
    const role = yield* repo.membership(user.id, organizationId)
    if (!role) return yield* new Forbidden({ message: notMember })
    return { user, role }
  })
  const staff = (role: string) => role === "ADMIN" || role === "MANAGER"
  return handlers
    .handle("list", () => Effect.gen(function*() {
      const user = yield* CurrentUser
      return yield* repo.list(user.id)
    }).pipe(Effect.catchTag("DatabaseError", fail("Failed to fetch organizations"))))
    .handle("create", ({ payload }) => Effect.gen(function*() {
      const user = yield* CurrentUser
      if (!payload.name) return yield* new BadRequest({ message: "Organization name is required" })
      return yield* repo.create(user.id, payload)
    }).pipe(Effect.catchTag("DatabaseError", fail("Failed to create organization"))))
    .handle("get", ({ params }) => Effect.gen(function*() {
      const user = yield* CurrentUser
      const organization = yield* repo.get(user.id, params.id)
      if (!organization) return yield* new NotFound({ message: "Organization not found" })
      return organization
    }).pipe(Effect.catchTag("DatabaseError", fail("Failed to fetch organization"))))
    .handle("update", ({ params, payload }) => Effect.gen(function*() {
      const user = yield* CurrentUser
      if (!payload.name) return yield* new BadRequest({ message: "Organization name is required" })
      const { baseUpdatedAt, ...fields } = payload
      const organization = yield* repo.update(user.id, params.id, fields, baseUpdatedAt)
      if (!organization) return yield* new InternalError({ message: "Failed to update organization" })
      if (organization === "conflict") return yield* new Conflict({ message: "The organization was saved elsewhere since it was read. Nothing was overwritten." })
      return organization
    }).pipe(Effect.catchTag("DatabaseError", fail("Failed to update organization"))))
    .handle("remove", ({ params }) => Effect.gen(function*() {
      const user = yield* CurrentUser
      yield* repo.remove(user.id, params.id)
      return { message: "Organization deleted successfully" }
    }).pipe(Effect.catchTag("DatabaseError", fail("Failed to delete organization"))))
    .handle("members", ({ params, query }) => Effect.gen(function*() {
      yield* roleOf(params.id, "You are not a member of this organization")
      return yield* repo.members(params.id, query.search)
    }).pipe(Effect.catchTag("DatabaseError", fail("Failed to fetch organization members"))))
    .handle("setMemberRole", ({ params, payload }) => Effect.gen(function*() {
      const { role: actor } = yield* roleOf(params.id, "You are not a member of this organization")
      if (!staff(actor)) return yield* new Forbidden({ message: "You do not have permission to update member roles" })
      if (!payload.memberId || !payload.role) return yield* new BadRequest({ message: "Member ID and role are required" })
      if (!isRole(payload.role)) return yield* new BadRequest({ message: "Role must be ADMIN, MANAGER or MEMBER" })
      if (actor === "MANAGER" && payload.role === "ADMIN") return yield* new Forbidden({ message: "Managers cannot promote members to Admin" })
      const target = yield* repo.member(params.id, payload.memberId)
      if (!target) return yield* new NotFound({ message: "Member not found" })
      if (actor === "MANAGER" && target.role === "ADMIN") return yield* new Forbidden({ message: "Managers cannot update Admin roles" })
      // Legacy let the last Admin demote themselves; an organisation without an Admin cannot be managed or deleted.
      if (target.role === "ADMIN" && payload.role !== "ADMIN" && (yield* repo.adminCount(params.id)) <= 1) {
        return yield* new BadRequest({ message: "Cannot demote the last Admin. Promote another member to Admin first." })
      }
      const updated = yield* repo.setRole(params.id, payload.memberId, payload.role)
      if (!updated) return yield* new NotFound({ message: "Member not found" })
      return updated
    }).pipe(Effect.catchTag("DatabaseError", fail("Failed to update member role"))))
    .handle("removeMember", ({ params, payload }) => Effect.gen(function*() {
      const { user, role: actor } = yield* roleOf(params.id, "You are not a member of this organization")
      if (!staff(actor)) return yield* new Forbidden({ message: "You do not have permission to remove members" })
      if (!payload.memberId) return yield* new BadRequest({ message: "Member ID is required" })
      const target = yield* repo.member(params.id, payload.memberId)
      if (!target) return yield* new NotFound({ message: "Member not found" })
      if (actor === "MANAGER" && target.role === "ADMIN") return yield* new Forbidden({ message: "Managers cannot remove Admins" })
      if (payload.memberId === user.id && actor === "ADMIN" && (yield* repo.adminCount(params.id)) <= 1) {
        return yield* new BadRequest({ message: "Cannot remove the last Admin. Promote another member to Admin first." })
      }
      yield* repo.removeMember(params.id, payload.memberId)
      return { message: "Member removed successfully" }
    }).pipe(Effect.catchTag("DatabaseError", fail("Failed to remove member"))))
    .handle("invite", ({ params, payload }) => Effect.gen(function*() {
      const { role: actor } = yield* roleOf(params.id, "You do not have permission to invite members")
      if (!staff(actor)) return yield* new Forbidden({ message: "You do not have permission to invite members" })
      if (!payload.email) return yield* new BadRequest({ message: "Email is required" })
      const role = payload.role ?? "MEMBER"
      if (!isRole(role)) return yield* new BadRequest({ message: "Role must be ADMIN, MANAGER or MEMBER" })
      if (actor === "MANAGER" && role === "ADMIN") return yield* new Forbidden({ message: "Managers cannot invite Admins" })
      // Accounts are stored in lower case (sign-up), so the address is matched and kept that way.
      const email = payload.email.trim().toLowerCase()
      if (yield* repo.isMemberByEmail(params.id, email)) return yield* new BadRequest({ message: "User is already a member of this organization" })
      const organization = yield* repo.name(params.id)
      if (!organization) return yield* new NotFound({ message: "Organization not found" })
      const token = randomBytes(32).toString("hex")
      const saved = yield* repo.invite(params.id, email, role, token, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000))
      const invitation = { id: saved.id, email: saved.email, role: saved.role, expiresAt: saved.expiresAt }
      // No mail server is configured: the link is returned to the inviter to hand over.
      const inviteUrl = `/invitations/${token}`
      return saved.renewed
        ? { message: "Invitation updated and sent" as const, invitation, inviteUrl }
        : { message: "Invitation created and sent" as const, invitation, inviteUrl }
    }).pipe(Effect.catchTag("DatabaseError", fail("Failed to send invitation"))))
    .handle("acceptInvitation", ({ params }) => Effect.gen(function*() {
      const user = yield* CurrentUser
      const outcome = yield* repo.acceptInvitation(user.id, params.token)
      switch (outcome._tag) {
        case "no-user": return yield* new NotFound({ message: "User not found" })
        case "not-found": return yield* new NotFound({ message: "Invitation not found or has already been used" })
        case "expired": return yield* new BadRequest({ message: "Invitation has expired" })
        case "wrong-user": return yield* new Forbidden({ message: "You are not authorized to accept this invitation" })
        case "already-member": return yield* new BadRequest({ message: "You are already a member of this organization" })
        case "joined": return { message: "Invitation accepted successfully", organization: outcome.organization }
      }
    }).pipe(Effect.catchTag("DatabaseError", fail("Failed to accept invitation"))))
    .handle("projects", ({ params }) => Effect.gen(function*() {
      yield* roleOf(params.id, "You are not a member of this organization")
      return yield* projects.listForOrganization(params.id)
    }).pipe(Effect.catchTag("DatabaseError", fail("Failed to fetch organization projects"))))
    .handle("createProject", ({ params, payload }) => Effect.gen(function*() {
      const { user } = yield* roleOf(params.id, "You are not a member of this organization")
      if (!payload.name) return yield* new BadRequest({ message: "Project name is required" })
      const created = yield* projects.create(user.id, { name: payload.name, description: payload.description ?? null, organizationId: params.id })
      // Tell the other members; a failure here never fails the request (as in legacy).
      const creatorName = (yield* repo.member(params.id, user.id))?.user.name || "User"
      yield* notifications.newProject({ projectId: created.id, creatorId: user.id, projectName: created.name, organizationId: params.id, creatorName })
        .pipe(Effect.catch((e) => Effect.logError("Error creating project notifications", e)))
      return created
    }).pipe(Effect.catchTag("DatabaseError", fail("Failed to create project"))))
}))
