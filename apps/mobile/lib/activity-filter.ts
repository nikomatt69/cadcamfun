import type { NotificationRow } from "@cadcamfun/api"
import { activityCategory } from "./activity-feed"

/**
 * The Activity feed's filter and search (the funnel sheet and the dock's field). Pure, so what each filter
 * keeps and how a query matches are tested without a device.
 */

export type ActivityFilter = "all" | "unread" | "reviews" | "workflows" | "assistant" | "projects" | "team"

export const ACTIVITY_FILTERS: readonly { readonly id: ActivityFilter; readonly label: string; readonly description: string }[] = [
  { id: "all", label: "All updates", description: "Everything from your desktop" },
  { id: "unread", label: "Unread", description: "Updates you have not opened yet" },
  { id: "reviews", label: "Pull requests", description: "Opened, reviewed and merged" },
  { id: "workflows", label: "Workflows", description: "Runs that passed or failed" },
  { id: "assistant", label: "Assistant", description: "Changes the assistant committed" },
  { id: "projects", label: "Projects & components", description: "New projects and components" },
  { id: "team", label: "Team", description: "Members, invitations and messages" },
]

type Row = Pick<NotificationRow, "type" | "isRead">

/** Which filter a notification type belongs to (other than "all" and "unread", which cut across types). */
const KIND_OF: Record<string, ActivityFilter> = {
  PR_OPENED: "reviews",
  PR_MERGED: "reviews",
  PR_REVIEWED: "reviews",
  WORKFLOW_FAILED: "workflows",
  WORKFLOW_PASSED: "workflows",
  AI_COMMITTED: "assistant",
  PROJECT_CREATED: "projects",
  COMPONENT_CREATED: "projects",
  NEW_MESSAGE: "team",
  MEMBER_JOINED: "team",
  ORGANIZATION_INVITATION: "team",
}

export const matchesActivityFilter = (row: Row, filter: ActivityFilter): boolean => {
  if (filter === "all") return true
  if (filter === "unread") return !row.isRead
  return KIND_OF[row.type] === filter
}

/** How many rows each filter would keep, for the counts in the funnel sheet. */
export const activityFilterCounts = (rows: readonly Row[]): Record<ActivityFilter, number> => {
  const counts: Record<ActivityFilter, number> = { all: rows.length, unread: 0, reviews: 0, workflows: 0, assistant: 0, projects: 0, team: 0 }
  for (const row of rows) {
    if (!row.isRead) counts.unread += 1
    const kind = KIND_OF[row.type]
    if (kind) counts[kind] += 1
  }
  return counts
}

/** Every word of the query must appear in the title, the text or the category label (case-insensitive); an empty query keeps everything. */
export const searchActivity = <T extends Pick<NotificationRow, "type" | "title" | "content">>(rows: readonly T[], query: string): T[] => {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return [...rows]
  return rows.filter((row) => {
    const haystack = `${row.title} ${row.content ?? ""} ${activityCategory(row.type).label}`.toLowerCase()
    return words.every((word) => haystack.includes(word))
  })
}
