import { describe, expect, test } from "bun:test"
import { newEntryAssistantDraft, workspaceSections } from "../lib/workspace-list"

describe("workspace list", () => {
  const entries = [
    { id: "b", name: "Part 10", subtitle: "Steel", updatedAt: "2026-10-01T10:00:00Z" },
    { id: "a", name: "Part 2", subtitle: "Steel", updatedAt: "2026-10-03T10:00:00Z" },
    { id: "c", name: "Housing", subtitle: null, updatedAt: "invalid" },
  ]
  test("filters across names and details and groups the newest first", () => {
    expect(workspaceSections(entries, "steel", "recent").flatMap((section) => section.data.map((entry) => entry.id))).toEqual(["a", "b"])
    expect(workspaceSections(entries, "unknown", "recent")).toEqual([])
  })
  test("sorts names naturally without mutating the supplied entries", () => {
    expect(workspaceSections(entries, "part", "name")[0]?.data.map((entry) => entry.id)).toEqual(["a", "b"])
    expect(entries.map((entry) => entry.id)).toEqual(["b", "a", "c"])
  })
})

test("new items prepare a scoped draft that asks for the missing requirements", () => {
  const entry = { id: "part-1", name: 'Plate "A"' }
  const cad = newEntryAssistantDraft(entry)
  expect(cad.mode).toBe("cad")
  expect(cad.text).toContain('"Plate \\"A\\""')
  expect(cad.text).toContain("part-1")
  expect(cad.text).toContain("before making changes")
})
