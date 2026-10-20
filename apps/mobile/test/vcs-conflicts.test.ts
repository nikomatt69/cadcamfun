import { expect, test } from "bun:test"
import { CompanionError } from "../lib/client"
import { conflictSummary, conflictsOf, parseConflicts } from "../lib/vcs-conflicts"

test("the desktop's conflict sentence becomes the files that disagree", () => {
  expect(parseConflicts("Merge conflicts: drawings/a.json /name,/width; components/b.json /size"))
    .toEqual([
      { path: "drawings/a.json", pointers: ["/name", "/width"] },
      { path: "components/b.json", pointers: ["/size"] },
    ])
})

test("a conflict without pointers still names the file", () => {
  expect(parseConflicts("Merge conflicts: drawings/a.json")).toEqual([{ path: "drawings/a.json", pointers: [] }])
})

test("a failure that is not a conflict has no conflicts", () => {
  expect(parseConflicts("The working copy is dirty")).toEqual([])
  expect(conflictsOf(new CompanionError(409, "Merge conflicts: drawings/a.json /name"))).toHaveLength(1)
  expect(conflictsOf(new CompanionError(400, "Merge conflicts: drawings/a.json /name"))).toEqual([])
  expect(conflictsOf(new Error("boom"))).toEqual([])
})

test("the summary names the files, not just the count", () => {
  expect(conflictSummary([{ path: "a.json", pointers: [] }, { path: "b.json", pointers: [] }]))
    .toBe("2 files conflict: a.json, b.json")
  expect(conflictSummary([{ path: "a.json", pointers: [] }])).toBe("1 file conflicts: a.json")
  expect(conflictSummary([])).toBe("")
})
