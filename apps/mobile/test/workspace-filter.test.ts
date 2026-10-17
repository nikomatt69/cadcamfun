import { describe, expect, test } from "bun:test"
import {
  commitBody,
  defaultPullFilter,
  diffSummary,
  filterChanges,
  filterEntries,
  filterPulls,
  formatDiffSummary,
  matchesQuery,
  pullCounts,
} from "../lib/workspace-filter"

describe("workspace search", () => {
  const entries = [
    { id: "a", name: "Bracket", subtitle: "Aluminium 6061", updatedAt: "2026-10-01T10:00:00Z" },
    { id: "b", name: "Gear housing", subtitle: null, updatedAt: "2026-10-03T10:00:00Z" },
    { id: "c", name: "Bracket mount", subtitle: "Steel", updatedAt: "not a date" },
  ]
  test("every word must match name or subtitle, ignoring case", () => {
    expect(matchesQuery("Gear housing", "  HOUSING gear ")).toBe(true)
    expect(matchesQuery("Gear housing", "gear plate")).toBe(false)
    expect(filterEntries(entries, "bracket alu").map((entry) => entry.id)).toEqual(["a"])
  })
  test("results are newest first; unparseable dates sink to the end", () => {
    expect(filterEntries(entries, "").map((entry) => entry.id)).toEqual(["b", "a", "c"])
  })
})

describe("pull request filters", () => {
  const pulls = [
    { number: 1, state: "merged" as const },
    { number: 3, state: "open" as const },
    { number: 2, state: "closed" as const },
    { number: 4, state: "open" as const },
  ]
  test("counts and filters by state, newest number first", () => {
    expect(pullCounts(pulls)).toEqual({ open: 2, merged: 1, closed: 1, all: 4 })
    expect(filterPulls(pulls, "open").map((pull) => pull.number)).toEqual([4, 3])
    expect(filterPulls(pulls, "all").map((pull) => pull.number)).toEqual([4, 3, 2, 1])
  })
  test("the list opens on open requests only when there are some", () => {
    expect(defaultPullFilter(pulls)).toBe("open")
    expect(defaultPullFilter([{ state: "merged" }])).toBe("all")
  })
})

describe("diff summary", () => {
  const changes = [
    { status: "added" as const, changes: [{}, {}] },
    { status: "modified" as const, changes: [{}] },
    { status: "modified" as const, changes: [] },
    { status: "deleted" as const, changes: [] },
  ]
  test("summarises files by status and counts property changes", () => {
    const summary = diffSummary(changes)
    expect(summary).toEqual({ files: 4, added: 1, modified: 2, deleted: 1, properties: 3 })
    expect(formatDiffSummary(summary)).toBe("4 files · 1 added · 2 modified · 1 deleted · 3 properties")
    expect(formatDiffSummary(diffSummary([{ status: "modified", changes: [{}] }]))).toBe("1 file · 1 modified · 1 property")
    expect(filterChanges(changes, "modified")).toHaveLength(2)
    expect(filterChanges(changes, "all")).toBe(changes)
  })
  test("the commit body is everything after the title line", () => {
    expect(commitBody("Widen the plate\r\n\r\nAdds 20 mm.\nRegenerates the pocket.\n")).toBe("Adds 20 mm.\nRegenerates the pocket.")
    expect(commitBody("Single line")).toBe("")
  })
})
