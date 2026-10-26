import { expect, test } from "bun:test"
import type { NotificationRow } from "@cadcamfun/api"
import { ACTIVITY_FILTERS, activityFilterCounts, matchesActivityFilter, searchActivity } from "../lib/activity-filter"
import { activityCategory } from "../lib/activity-feed"

const row = (type: NotificationRow["type"], isRead = false, title = "Title", content = "") => ({ type, isRead, title, content })

test("every notification type belongs to exactly one kind filter", () => {
  const types: NotificationRow["type"][] = ["PR_OPENED", "PR_MERGED", "PR_REVIEWED", "AI_COMMITTED", "WORKFLOW_FAILED", "WORKFLOW_PASSED", "PROJECT_CREATED", "COMPONENT_CREATED", "NEW_MESSAGE", "MEMBER_JOINED", "ORGANIZATION_INVITATION"]
  const kinds = ACTIVITY_FILTERS.map((filter) => filter.id).filter((id) => id !== "all" && id !== "unread")
  for (const type of types) expect(kinds.filter((kind) => matchesActivityFilter(row(type), kind))).toHaveLength(1)
})

test("all keeps everything, unread keeps what is not read, kinds cut by type", () => {
  expect(matchesActivityFilter(row("PR_OPENED", true), "all")).toBe(true)
  expect(matchesActivityFilter(row("PR_OPENED", true), "unread")).toBe(false)
  expect(matchesActivityFilter(row("WORKFLOW_FAILED"), "workflows")).toBe(true)
  expect(matchesActivityFilter(row("WORKFLOW_FAILED"), "reviews")).toBe(false)
  expect(matchesActivityFilter(row("AI_COMMITTED"), "assistant")).toBe(true)
})

test("counts follow the loaded rows", () => {
  const counts = activityFilterCounts([row("PR_OPENED"), row("PR_MERGED", true), row("WORKFLOW_PASSED"), row("MEMBER_JOINED", true)])
  expect(counts).toEqual({ all: 4, unread: 2, reviews: 2, workflows: 1, assistant: 0, projects: 0, team: 1 })
})

test("search needs every word in the title, text or category", () => {
  const rows = [row("PR_OPENED", false, "PR #7 opened", "Widen plate"), row("WORKFLOW_FAILED", false, "Toolpath check", "Gouge at 4.2 mm")]
  expect(searchActivity(rows, "")).toHaveLength(2)
  expect(searchActivity(rows, "widen PLATE")).toHaveLength(1)
  expect(searchActivity(rows, "gouge failed")).toHaveLength(1)
  expect(searchActivity(rows, "gouge plate")).toHaveLength(0)
  expect(activityCategory("WORKFLOW_FAILED").label).toBe("Workflow failed")
})
