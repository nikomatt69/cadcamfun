import type { NotificationRow } from "@cadcamfun/api"

/**
 * The Activity feed's reading structure: day sections, a category per notification type and the
 * screen a row opens. Pure, so the grouping and the deep links are tested without a device.
 */

export type ActivityTone = "accent" | "success" | "danger" | "muted"
export type ActivityCategory = { readonly label: string; readonly tone: ActivityTone }

const CATEGORY: Record<NotificationRow["type"], ActivityCategory> = {
  PR_OPENED: { label: "Pull request", tone: "accent" },
  PR_MERGED: { label: "Merged", tone: "success" },
  PR_REVIEWED: { label: "Review", tone: "accent" },
  AI_COMMITTED: { label: "Assistant", tone: "accent" },
  WORKFLOW_FAILED: { label: "Workflow failed", tone: "danger" },
  WORKFLOW_PASSED: { label: "Workflow passed", tone: "success" },
  PROJECT_CREATED: { label: "Project", tone: "muted" },
  COMPONENT_CREATED: { label: "Component", tone: "muted" },
  NEW_MESSAGE: { label: "Message", tone: "muted" },
  MEMBER_JOINED: { label: "Team", tone: "muted" },
  ORGANIZATION_INVITATION: { label: "Invitation", tone: "muted" },
}

export const activityCategory = (type: string): ActivityCategory => CATEGORY[type as NotificationRow["type"]] ?? { label: "Update", tone: "muted" }

export type FeedItem =
  | { readonly kind: "section"; readonly key: string; readonly title: string; readonly unread: number }
  | { readonly kind: "row"; readonly key: string; readonly row: NotificationRow }

const startOfDay = (time: number): number => { const date = new Date(time); date.setHours(0, 0, 0, 0); return date.getTime() }

/** Local-calendar bucket: phones show dates in the owner's time zone, like the desktop. */
export const daySection = (iso: string, now: number): string => {
  const time = Date.parse(iso)
  if (!Number.isFinite(time)) return "Earlier"
  const today = startOfDay(now)
  const day = startOfDay(time)
  if (day >= today) return "Today"
  if (day >= today - 86_400_000 * 1.5 && day < today) return "Yesterday"
  if (day > today - 86_400_000 * 7) return "This week"
  return "Earlier"
}

/** Newest first, with a header before each day bucket; headers count their unread rows. */
export const groupActivity = (rows: readonly NotificationRow[], now: number): FeedItem[] => {
  const sorted = [...rows].sort((left, right) => (Date.parse(right.createdAt) || 0) - (Date.parse(left.createdAt) || 0))
  const items: FeedItem[] = []
  let current: { index: number; title: string; unread: number } | undefined
  for (const row of sorted) {
    const title = daySection(row.createdAt, now)
    if (current?.title !== title) {
      current = { index: items.length, title, unread: 0 }
      items.push({ kind: "section", key: `section:${title}`, title, unread: 0 })
    }
    if (!row.isRead) {
      current.unread += 1
      items[current.index] = { kind: "section", key: `section:${title}`, title, unread: current.unread }
    }
    items.push({ kind: "row", key: row.id, row })
  }
  return items
}

/**
 * The mobile route a notification opens, or `undefined` when it has no project.
 * Pull-request notifications carry their number in the title ("PR #12 opened").
 */
export const activityTarget = (row: Pick<NotificationRow, "type" | "title" | "projectId" | "componentId">): string | undefined => {
  if (!row.projectId) return undefined
  const project = `/projects/${encodeURIComponent(row.projectId)}`
  if (row.type.startsWith("PR_")) {
    const number = /#(\d+)\b/.exec(row.title)?.[1]
    if (number) return `${project}/pulls/${number}`
  }
  if (row.type === "COMPONENT_CREATED" && row.componentId) return `${project}/workspace/components/${encodeURIComponent(row.componentId)}`
  return project
}

/** Optimistic local update while the desktop confirms; the next reload replaces it. */
export const markLocally = <F extends { readonly notifications: readonly NotificationRow[]; readonly unreadCount: number }>(feed: F, id: string, isRead: boolean): F => {
  const row = feed.notifications.find((item) => item.id === id)
  if (!row || row.isRead === isRead) return feed
  return {
    ...feed,
    notifications: feed.notifications.map((item) => item.id === id ? { ...item, isRead } : item),
    unreadCount: Math.max(0, feed.unreadCount + (isRead ? -1 : 1)),
  }
}

/**
 * The loaded part of the feed, page by page (`GET /api/notifications?limit&offset`, newest first). `offset` counts the
 * server rows consumed, minus rows deleted here, so the next page starts right after the last one shown. A row that
 * arrived on the desktop meanwhile shifts the server's order by one: the overlap is dropped by id, nothing is skipped.
 */
export interface FeedPages {
  readonly notifications: readonly NotificationRow[]
  readonly unreadCount: number
  readonly offset: number
  /** The last page came back short: there is nothing older to load. */
  readonly exhausted: boolean
}

type FeedPage = { readonly notifications: readonly NotificationRow[]; readonly unreadCount: number }

export const firstFeedPage = (page: FeedPage, pageSize: number): FeedPages => appendFeedPage(undefined, page, pageSize)

export const appendFeedPage = (feed: FeedPages | undefined, page: FeedPage, pageSize: number): FeedPages => {
  const known = new Set((feed?.notifications ?? []).map((row) => row.id))
  const fresh = page.notifications.filter((row) => !known.has(row.id))
  return {
    notifications: [...(feed?.notifications ?? []), ...fresh],
    // The newest page carries the newest count.
    unreadCount: page.unreadCount,
    offset: (feed?.offset ?? 0) + page.notifications.length,
    exhausted: page.notifications.length < pageSize,
  }
}

/** A row deleted here is gone from the server too: the next page starts one row earlier. */
export const removeFromFeed = (feed: FeedPages, id: string): FeedPages => {
  const row = feed.notifications.find((item) => item.id === id)
  if (!row) return feed
  return {
    ...feed,
    notifications: feed.notifications.filter((item) => item.id !== id),
    unreadCount: Math.max(0, feed.unreadCount - (row.isRead ? 0 : 1)),
    offset: Math.max(0, feed.offset - 1),
  }
}

export const markAllInFeed = (feed: FeedPages): FeedPages => ({ ...feed, notifications: feed.notifications.map((row) => row.isRead ? row : { ...row, isRead: true }), unreadCount: 0 })
