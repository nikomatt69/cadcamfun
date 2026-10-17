import { expect, test } from "bun:test"
import type { NotificationRow } from "@cadcamfun/api"
import { activityCategory, activityTarget, appendFeedPage, daySection, firstFeedPage, nextPageQuery, groupActivity, markAllInFeed, markLocally, removeFromFeed } from "../lib/activity-feed"

const now = new Date(2026, 9, 17, 15, 0).getTime()
const at = (days: number, hour = 10) => new Date(2026, 9, 17 - days, hour).toISOString()
const row = (id: string, createdAt: string, patch: Partial<NotificationRow> = {}): NotificationRow => ({
  id, type: "PR_OPENED", title: "PR #7 opened", content: "Widen plate", isRead: false, createdAt,
  userId: "u", organizationId: null, projectId: "p1", componentId: null, messageId: null, linkUrl: null, ...patch,
})

test("rows group newest first under local-day headers that count unread updates", () => {
  const items = groupActivity([row("old", at(30)), row("today", at(0), { isRead: true }), row("y", at(1)), row("week", at(4)), row("today2", at(0, 12))], now)
  expect(items.map((item) => item.kind === "section" ? `#${item.title}:${item.unread}` : item.key)).toEqual([
    "#Today:1", "today2", "today", "#Yesterday:1", "y", "#This week:1", "week", "#Earlier:1", "old",
  ])
  expect(daySection("garbage", now)).toBe("Earlier")
})

test("notifications open the pull request, component or project they are about", () => {
  expect(activityTarget(row("a", at(0)))).toBe("/projects/p1/pulls/7")
  expect(activityTarget(row("b", at(0), { type: "PR_MERGED", title: "Merged" }))).toBe("/projects/p1")
  expect(activityTarget(row("c", at(0), { type: "COMPONENT_CREATED", title: "Bracket", componentId: "c 1" }))).toBe("/projects/p1/workspace/components/c%201")
  expect(activityTarget(row("d", at(0), { projectId: null }))).toBeUndefined()
  expect(activityCategory("WORKFLOW_FAILED")).toEqual({ label: "Workflow failed", tone: "danger" })
  expect(activityCategory("SOMETHING_NEW").label).toBe("Update")
})

test("read toggles update the feed optimistically and keep the unread count consistent", () => {
  const feed = { notifications: [row("a", at(0)), row("b", at(0), { isRead: true })], unreadCount: 1 }
  const read = markLocally(feed, "a", true)
  expect(read.unreadCount).toBe(0)
  expect(markLocally(read, "a", true)).toBe(read)
  expect(markLocally(read, "b", false).unreadCount).toBe(1)
  expect(markLocally(feed, "missing", true)).toBe(feed)
})

test("older pages continue at the server offset, drop rows that shifted in, and stop on a short page", () => {
  const first = firstFeedPage({ notifications: [row("n5", at(0)), row("n4", at(0))], unreadCount: 2 }, 2)
  expect(first.offset).toBe(2)
  expect(first.exhausted).toBe(false)
  // A new row arrived on the desktop: the server's page at offset 2 now starts with n4 again.
  const second = appendFeedPage(first, { notifications: [row("n4", at(0)), row("n3", at(1))], unreadCount: 3 }, 2)
  expect(second.notifications.map((item) => item.id)).toEqual(["n5", "n4", "n3"])
  expect(second.offset).toBe(4)
  expect(second.unreadCount).toBe(3)
  const last = appendFeedPage(second, { notifications: [row("n2", at(2))], unreadCount: 3 }, 2)
  expect(last.exhausted).toBe(true)
  expect(last.offset).toBe(5)
})

test("a deletion here moves the next page back by one; read edits keep the paging state", () => {
  const feed = firstFeedPage({ notifications: [row("a", at(0)), row("b", at(0), { isRead: true })], unreadCount: 1 }, 2)
  const removed = removeFromFeed(feed, "a")
  expect(removed.offset).toBe(1)
  expect(removed.unreadCount).toBe(0)
  expect(removeFromFeed(feed, "missing")).toBe(feed)
  const read = markLocally(feed, "a", true)
  expect(read.offset).toBe(2)
  expect(read.unreadCount).toBe(0)
  expect(markAllInFeed(feed).notifications.every((item) => item.isRead)).toBe(true)
})

test("a desktop with cursors is followed by cursor until it says the feed ended", () => {
  const first = firstFeedPage({ notifications: [row("n3", at(0)), row("n2", at(0))], unreadCount: 2, nextCursor: "c1" }, 2)
  expect(nextPageQuery(first)).toEqual({ cursor: "c1" })
  expect(first.exhausted).toBe(false)
  const last = appendFeedPage(first, { notifications: [row("n1", at(1)), row("n0", at(1))], unreadCount: 2, nextCursor: null }, 2)
  // A full page can still be the last one: the cursor decides, not the length.
  expect(last.exhausted).toBe(true)
  expect(last.cursor).toBeUndefined()
  // Older desktops send no cursor and keep paging by offset.
  expect(nextPageQuery(firstFeedPage({ notifications: [row("a", at(0))], unreadCount: 0 }, 1))).toEqual({ offset: 1 })
})
