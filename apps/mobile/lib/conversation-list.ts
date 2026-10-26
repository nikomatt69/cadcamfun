/**
 * The conversations list (nikcli: sessions/index.tsx): newest first, grouped by day, searchable.
 * Pure so the grouping and the search are unit-testable.
 */

export interface ConversationLike {
  readonly id: string
  readonly title: string
  readonly createdAt: string | null
  readonly updatedAt: string | null
  readonly busy: boolean
}

/** Searching a list of five is noise: the field appears once there is something to look through. */
export const SEARCH_THRESHOLD = 6

export const conversationTime = (item: Pick<ConversationLike, "createdAt" | "updatedAt">): number =>
  Date.parse(item.updatedAt ?? item.createdAt ?? "") || 0

/** Running conversations first (they need attention), then the newest. */
export const sortConversations = <T extends ConversationLike>(items: readonly T[]): T[] =>
  [...items].sort((a, b) => Number(b.busy) - Number(a.busy) || conversationTime(b) - conversationTime(a))

/** Every word of the query must appear in the title (case-insensitive); an empty query keeps everything. */
export const filterConversations = <T extends ConversationLike>(items: readonly T[], query: string, titleOf: (item: T) => string = (item) => item.title): T[] => {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  return words.length === 0 ? [...items] : items.filter((item) => {
    const title = titleOf(item).toLowerCase()
    return words.every((word) => title.includes(word))
  })
}

export type DayBucket = "Running" | "Today" | "Yesterday" | "Previous 7 days" | "Earlier"

const startOfDay = (time: number): number => { const date = new Date(time); date.setHours(0, 0, 0, 0); return date.getTime() }
const DAY = 86_400_000

export const dayBucket = (time: number, now: number): Exclude<DayBucket, "Running"> => {
  if (time <= 0) return "Earlier"
  const today = startOfDay(now)
  if (time >= today) return "Today"
  if (time >= today - DAY) return "Yesterday"
  if (time >= today - 7 * DAY) return "Previous 7 days"
  return "Earlier"
}

export interface ConversationSection<T> {
  readonly title: DayBucket
  readonly data: T[]
}

/** Sections in display order: a "Running" group on top when something is working, then by day. Empty groups are dropped. */
export const sectionConversations = <T extends ConversationLike>(items: readonly T[], now: number = Date.now()): ConversationSection<T>[] => {
  const order: DayBucket[] = ["Running", "Today", "Yesterday", "Previous 7 days", "Earlier"]
  const buckets = new Map<DayBucket, T[]>()
  for (const item of sortConversations(items)) {
    const bucket: DayBucket = item.busy ? "Running" : dayBucket(conversationTime(item), now)
    buckets.set(bucket, [...(buckets.get(bucket) ?? []), item])
  }
  return order.flatMap((title) => buckets.has(title) ? [{ title, data: buckets.get(title)! }] : [])
}

export type ConversationFilter = "all" | "running" | "week"

/** The filter sheet's choices, in nikcli's order: everything first, then the narrower views. */
export const CONVERSATION_FILTERS: ReadonlyArray<{ id: ConversationFilter; label: string; description: string }> = [
  { id: "all", label: "All conversations", description: "Everything on this project" },
  { id: "running", label: "Running", description: "The assistant is working on these" },
  { id: "week", label: "Last 7 days", description: "Active this week" },
]

export const matchesConversationFilter = (item: ConversationLike, filter: ConversationFilter, now: number = Date.now()): boolean => {
  if (filter === "all") return true
  if (filter === "running") return item.busy
  const time = conversationTime(item)
  return time > 0 && time >= startOfDay(now) - 6 * DAY
}
