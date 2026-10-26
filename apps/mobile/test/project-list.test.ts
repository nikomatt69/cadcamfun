import { expect, test } from "bun:test"
import { NAME_SECTION, commitMillis, listProjects, matchesCommit, matchesPull, matchesRun, projectMeta, sectionByDay, sortRuns, timeOf } from "../lib/project-list"

const NOW = new Date(2026, 9, 26, 15, 0, 0).getTime()
const at = (daysAgo: number, hour = 9) => new Date(2026, 9, 26 - daysAgo, hour, 0, 0).toISOString()
const project = (id: string, name: string, updatedAt: string, description: string | null = null) => ({ id, name, description, updatedAt })

test("an unreadable date is time zero", () => {
  expect(timeOf("nope")).toBe(0)
  expect(timeOf(null)).toBe(0)
  expect(timeOf(at(0))).toBeGreaterThan(0)
})

test("projects are grouped under day headings, newest first, and empty groups are dropped", () => {
  const sections = listProjects([
    project("old", "Old", at(30)),
    project("today", "Today", at(0)),
    project("week", "Week", at(3)),
    project("yday", "Yesterday", at(1)),
    project("blank", "Blank", "garbage"),
  ], { now: NOW })
  expect(sections.map((section) => section.title)).toEqual(["Today", "Yesterday", "Previous 7 days", "Earlier"])
  expect(sections.map((section) => section.data.map((item) => item.id))).toEqual([["today"], ["yday"], ["week"], ["old", "blank"]])
})

test("sorting by name is one alphabetical group that ignores case and reads numbers as numbers", () => {
  const sections = listProjects([
    project("c", "part 10", at(0)), project("a", "Alpha", at(9)), project("b", "part 2", at(2)),
  ], { sort: "name", now: NOW })
  expect(sections).toHaveLength(1)
  expect(sections[0]!.title).toBe(NAME_SECTION)
  expect(sections[0]!.data.map((item) => item.id)).toEqual(["a", "b", "c"])
})

test("the week filter keeps what changed in the last seven days", () => {
  const list = [project("a", "A", at(0)), project("b", "B", at(6)), project("c", "C", at(8)), project("d", "D", "bad date")]
  expect(listProjects(list, { filter: "week", now: NOW }).flatMap((section) => section.data.map((item) => item.id))).toEqual(["a", "b"])
  expect(listProjects(list, { filter: "all", now: NOW }).flatMap((section) => section.data)).toHaveLength(4)
})

test("search needs every word in the name or the description, and an empty result has no sections", () => {
  const list = [project("1", "Gripper", at(0), "Rack and pinion"), project("2", "Bracket", at(1), "Pocket toolpath")]
  expect(listProjects(list, { query: "rack gripper", now: NOW }).flatMap((section) => section.data.map((item) => item.id))).toEqual(["1"])
  expect(listProjects(list, { query: "TOOLPATH", now: NOW }).flatMap((section) => section.data.map((item) => item.id))).toEqual(["2"])
  expect(listProjects(list, { query: "zzz", now: NOW })).toEqual([])
  expect(listProjects([], { now: NOW })).toEqual([])
})

test("filter and search compose", () => {
  const list = [project("1", "Plate", at(0)), project("2", "Plate old", at(20))]
  expect(listProjects(list, { query: "plate", filter: "week", now: NOW }).flatMap((section) => section.data.map((item) => item.id))).toEqual(["1"])
})

test("sectionByDay keeps the order it is given and merges a bucket that comes back", () => {
  const sections = sectionByDay([at(0), at(1), at(0, 8)], (iso) => Date.parse(iso), NOW)
  expect(sections.map((section) => [section.title, section.data.length])).toEqual([["Today", 2], ["Yesterday", 1]])
})

test("commit time is seconds, and a bad value is time zero", () => {
  expect(commitMillis(1_700_000_000)).toBe(1_700_000_000_000)
  expect(commitMillis(Number.NaN)).toBe(0)
})

test("commits are found by message, author or oid", () => {
  const commit = { oid: "abc1234def", message: "Widen the plate", author: { name: "Niko" } }
  expect(matchesCommit(commit, "widen plate")).toBe(true)
  expect(matchesCommit(commit, "niko")).toBe(true)
  expect(matchesCommit(commit, "abc12")).toBe(true)
  expect(matchesCommit(commit, "thin")).toBe(false)
  expect(matchesCommit(commit, "")).toBe(true)
})

test("pull requests are found by number, title or branch", () => {
  const pull = { number: 12, title: "Add fillets", head: "ai/fillets", base: "main" }
  expect(matchesPull(pull, "#12")).toBe(true)
  expect(matchesPull(pull, "12")).toBe(true)
  expect(matchesPull(pull, "fillets main")).toBe(true)
  expect(matchesPull(pull, "13")).toBe(false)
})

test("workflow runs are found by workflow, ref, event or status, and sorted newest first", () => {
  const run = { workflow: "Verify", event: "pull-request", ref: "ai/fillets", status: "failure" }
  expect(matchesRun(run, "verify failure")).toBe(true)
  expect(matchesRun(run, "pull-request")).toBe(true)
  expect(matchesRun(run, "success")).toBe(false)
  expect(sortRuns([{ startedAt: at(2) }, { startedAt: at(0) }, { startedAt: "x" }]).map((item) => item.startedAt)).toEqual([at(0), at(2), "x"])
})

test("a meta line joins only the parts that exist", () => {
  expect(projectMeta(["Open in assistant", false, "3m ago"])).toBe("Open in assistant · 3m ago")
  expect(projectMeta([undefined, null, ""])).toBe("")
})
