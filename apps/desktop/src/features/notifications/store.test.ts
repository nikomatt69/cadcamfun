import { describe, expect, test } from "bun:test"
import type { NotificationRow } from "@cadcamfun/api"
import { applyNotificationEvent, type NotificationFeedState } from "./store.ts"
import { shouldNotifyNative } from "./native.ts"

const row = (id: string, isRead = false, type: NotificationRow["type"] = "PR_OPENED"): NotificationRow => ({
  id, type, title: id, content: "c", isRead, createdAt: "2026-01-01T00:00:00.000Z",
  userId: "u1", organizationId: null, projectId: null, componentId: null, messageId: null, linkUrl: null
})
const at = "2026-01-01T00:00:00.000Z"

describe("notification sync (desktop)", () => {
  test("created/updated/deleted/readAll converge by id, idempotently", () => {
    let state: NotificationFeedState = { rows: [], unreadCount: 0 }
    state = applyNotificationEvent(state, { type: "notification.created", notification: row("a"), at })
    state = applyNotificationEvent(state, { type: "notification.created", notification: row("a"), at })
    expect(state.rows).toHaveLength(1)
    expect(state.unreadCount).toBe(1)
    state = applyNotificationEvent(state, { type: "notification.created", notification: row("b", true, "NEW_MESSAGE"), at })
    expect(state.unreadCount).toBe(1)
    state = applyNotificationEvent(state, { type: "notification.updated", notification: row("a", true), at })
    expect(state.unreadCount).toBe(0)
    state = applyNotificationEvent(state, { type: "notification.deleted", notificationId: "b", userId: "u1", at })
    expect(state.rows.map((r) => r.id)).toEqual(["a"])
    state = applyNotificationEvent(state, { type: "notification.created", notification: row("c"), at })
    state = applyNotificationEvent(state, { type: "notification.readAll", userId: "u1", count: 1, at })
    expect(state.unreadCount).toBe(0)
    expect(state.rows.every((r) => r.isRead)).toBe(true)
  })

  test("only important unread, never-shown rows raise a native popup", () => {
    expect(shouldNotifyNative(row("a"), new Set())).toBe(true)
    expect(shouldNotifyNative(row("a", false, "WORKFLOW_FAILED"), new Set())).toBe(true)
    expect(shouldNotifyNative(row("a", false, "NEW_MESSAGE"), new Set())).toBe(false)
    expect(shouldNotifyNative(row("a", true), new Set())).toBe(false)
    expect(shouldNotifyNative(row("a"), new Set(["a"]))).toBe(false)
  })
})
