import { expect, test } from "bun:test"
import { conversationTime, dayBucket, filterConversations, sectionConversations, sortConversations, type ConversationLike } from "../lib/conversation-list"

const NOW = new Date(2026, 9, 26, 15, 0, 0).getTime()
const at = (daysAgo: number, hour = 9) => new Date(2026, 9, 26 - daysAgo, hour, 0, 0).toISOString()
const item = (id: string, title: string, updatedAt: string | null, busy = false, createdAt: string | null = null): ConversationLike => ({ id, title, updatedAt, createdAt, busy })

test("conversations sort newest first with running ones on top, and a missing date sorts last", () => {
  const sorted = sortConversations([item("old", "Old", at(3)), item("none", "None", null), item("new", "New", at(0)), item("run", "Run", at(5), true)])
  expect(sorted.map((entry) => entry.id)).toEqual(["run", "new", "old", "none"])
  expect(conversationTime(item("a", "A", null, false, at(1)))).toBeGreaterThan(0)
  expect(conversationTime(item("a", "A", "not a date"))).toBe(0)
})

test("search needs every word in the title, in any order, ignoring case", () => {
  const list = [item("1", "Rack and pinion gripper", at(0)), item("2", "Pocket toolpath", at(1))]
  expect(filterConversations(list, "").map((entry) => entry.id)).toEqual(["1", "2"])
  expect(filterConversations(list, "  GRIPPER rack ").map((entry) => entry.id)).toEqual(["1"])
  expect(filterConversations(list, "gripper toolpath")).toEqual([])
  expect(filterConversations(list, "xyz", (entry) => `${entry.title} xyz`).map((entry) => entry.id)).toEqual(["1", "2"])
})

test("day buckets follow the calendar, not 24 hour windows", () => {
  expect(dayBucket(new Date(2026, 9, 26, 0, 1).getTime(), NOW)).toBe("Today")
  expect(dayBucket(new Date(2026, 9, 25, 23, 59).getTime(), NOW)).toBe("Yesterday")
  expect(dayBucket(new Date(2026, 9, 24, 12).getTime(), NOW)).toBe("Previous 7 days")
  expect(dayBucket(new Date(2026, 9, 19, 12).getTime(), NOW)).toBe("Previous 7 days")
  expect(dayBucket(new Date(2026, 9, 18, 12).getTime(), NOW)).toBe("Earlier")
  expect(dayBucket(0, NOW)).toBe("Earlier")
})

test("sections list running conversations first, then by day, and drop empty groups", () => {
  const sections = sectionConversations([
    item("a", "A", at(0, 10)), item("b", "B", at(0, 12)), item("c", "C", at(1)), item("d", "D", at(30)), item("e", "E", at(2), true),
  ], NOW)
  expect(sections.map((section) => [section.title, section.data.map((entry) => entry.id)])).toEqual([
    ["Running", ["e"]], ["Today", ["b", "a"]], ["Yesterday", ["c"]], ["Earlier", ["d"]],
  ])
  expect(sectionConversations([], NOW)).toEqual([])
})
