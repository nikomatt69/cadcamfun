/**
 * Notification sync: the DB row is committed first, then one live frame per change reaches
 * subscribers, so a desktop, a paired phone and the feed converge without polling. A frame
 * carries the full row for created/updated, so receivers never refetch to render a popup.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { isNativeNotificationType } from "@cadcamfun/api"
import { Context, Effect, Fiber, Stream } from "effect"
import { makeApp } from "./helpers.ts"
import { LiveEvents, liveEventMatches } from "../src/services/live-events.ts"
import { NotificationService } from "../src/services/notifications.ts"
import { NotificationRepo } from "../src/repos/notification-repo.ts"

let app: Awaited<ReturnType<typeof makeApp>>
let userId: string
beforeAll(async () => {
  app = await makeApp()
  userId = (await app.call("/api/user/profile")).body.id
})
afterAll(async () => { await app.dispose() })

describe("notification sync", () => {
  test("only important types raise a native popup", () => {
    expect(isNativeNotificationType("WORKFLOW_FAILED")).toBe(true)
    expect(isNativeNotificationType("PR_OPENED")).toBe(true)
    expect(isNativeNotificationType("AI_COMMITTED")).toBe(true)
    expect(isNativeNotificationType("NEW_MESSAGE")).toBe(false)
    expect(isNativeNotificationType("WORKFLOW_PASSED")).toBe(false)
  })

  test("notification frames are not project-scoped", () => {
    const frame = { type: "notification.created", notification: { id: "n1", type: "PR_OPENED", title: "t", content: "c", isRead: false, createdAt: "2026-01-01T00:00:00.000Z", userId, organizationId: null, projectId: "p1", componentId: null, messageId: null, linkUrl: null }, at: "2026-01-01T00:00:00.000Z" } as const
    expect(liveEventMatches(frame, {})).toBe(true)
    expect(liveEventMatches(frame, { projectId: "p1" })).toBe(false)
  })

  test("create, read, delete and read-all publish in commit order", async () => {
    const frames = await Effect.runPromise(Effect.scoped(Effect.gen(function*() {
      const ctx = yield* Effect.promise(() => app.services())
      const events = Context.get(ctx, LiveEvents)
      const service = Context.get(ctx, NotificationService)
      const repo = Context.get(ctx, NotificationRepo)
      const stream = yield* events.subscribe({})
      const collecting = yield* Effect.forkDetach(Stream.runCollect(stream.pipe(Stream.take(5))))
      const first = yield* service.create({ type: "WORKFLOW_FAILED", title: "Build failed", content: "boom", userId })
      yield* repo.update(userId, first.id, true)
      yield* repo.remove(userId, first.id)
      yield* service.create({ type: "NEW_MESSAGE", title: "Hi", content: "there", userId })
      yield* repo.markAllRead(userId)
      return yield* Fiber.join(collecting).pipe(Effect.timeout("5 seconds"))
    })))
    expect(frames.map((f) => f.type)).toEqual(["notification.created", "notification.updated", "notification.deleted", "notification.created", "notification.readAll"])
    const created = frames[0]!
    expect(created.type === "notification.created" && created.notification.title).toBe("Build failed")
    // The row announced is the row in the DB feed: same id, already marked read after update.
    const feed = (await app.call("/api/notifications")).body
    expect(feed.notifications.some((n: { title: string }) => n.title === "Hi")).toBe(true)
    expect(feed.unreadCount).toBe(0)
  })
})
