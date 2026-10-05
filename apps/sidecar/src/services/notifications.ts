import { Database, DatabaseError, schema } from "@cadcamfun/db"
import type { NotificationType } from "@cadcamfun/db/schema"
import { and, eq, ne } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"

export interface NotificationData {
  readonly type: NotificationType
  readonly title: string
  readonly content: string
  readonly userId: string
  readonly organizationId?: string
  readonly projectId?: string
  readonly componentId?: string
  readonly messageId?: string
  readonly linkUrl?: string
}

/**
 * Port of the legacy `NotificationService`: writes `Notification` rows for the other members of an organisation /
 * conversation. Titles and bodies are in English (the legacy strings were Italian).
 */
export class NotificationService extends Context.Service<NotificationService, {
  create(data: NotificationData): Effect.Effect<void, DatabaseError>
  newMessage(a: { messageId: string; senderId: string; conversationId: string; content: string; senderName: string; organizationId: string }): Effect.Effect<void, DatabaseError>
  newProject(a: { projectId: string; creatorId: string; projectName: string; organizationId: string; creatorName: string }): Effect.Effect<void, DatabaseError>
  newComponent(a: { componentId: string; creatorId: string; componentName: string; organizationId: string; projectId: string; creatorName: string }): Effect.Effect<void, DatabaseError>
}>()("cadcamfun/NotificationService") {
  static readonly layer = Layer.effect(
    NotificationService,
    Effect.gen(function*() {
      const { query } = yield* Database
      const create = (d: NotificationData) =>
        query("notifications.create", async (db) => {
          await db.insert(schema.notificationTable).values({
            type: d.type, title: d.title, content: d.content, userId: d.userId,
            organizationId: d.organizationId ?? null, projectId: d.projectId ?? null,
            componentId: d.componentId ?? null, messageId: d.messageId ?? null, linkUrl: d.linkUrl ?? null
          })
        })
      const otherMembers = (organizationId: string, except: string) =>
        query("notifications.members", (db) =>
          db.select({ userId: schema.userOrganizationTable.userId }).from(schema.userOrganizationTable)
            .where(and(eq(schema.userOrganizationTable.organizationId, organizationId), ne(schema.userOrganizationTable.userId, except))))
      return NotificationService.of({
        create,
        newMessage: (a) => Effect.gen(function*() {
          const participants = yield* query("notifications.participants", (db) =>
            db.select({ userId: schema.conversationParticipantTable.userId }).from(schema.conversationParticipantTable)
              .where(and(eq(schema.conversationParticipantTable.conversationId, a.conversationId), ne(schema.conversationParticipantTable.userId, a.senderId))))
          yield* Effect.forEach(participants, (p) => create({
            type: "NEW_MESSAGE", title: "New message",
            content: `${a.senderName}: ${a.content.substring(0, 100)}${a.content.length > 100 ? "..." : ""}`,
            userId: p.userId, organizationId: a.organizationId, messageId: a.messageId,
            linkUrl: `/organizations/${a.organizationId}/chat/${a.conversationId}`
          }))
        }),
        newProject: (a) => Effect.gen(function*() {
          const members = yield* otherMembers(a.organizationId, a.creatorId)
          yield* Effect.forEach(members, (m) => create({
            type: "PROJECT_CREATED", title: "New project", content: `${a.creatorName} created a new project: ${a.projectName}`,
            userId: m.userId, organizationId: a.organizationId, projectId: a.projectId, linkUrl: `/projects/${a.projectId}`
          }))
        }),
        newComponent: (a) => Effect.gen(function*() {
          const members = yield* otherMembers(a.organizationId, a.creatorId)
          yield* Effect.forEach(members, (m) => create({
            type: "COMPONENT_CREATED", title: "New component", content: `${a.creatorName} created a new component: ${a.componentName}`,
            userId: m.userId, organizationId: a.organizationId, componentId: a.componentId, projectId: a.projectId,
            linkUrl: `/projects/${a.projectId}/components/${a.componentId}`
          }))
        })
      })
    })
  )
}
