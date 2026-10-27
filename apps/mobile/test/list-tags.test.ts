import { describe, expect, test } from "bun:test"
import { assignedTags, defaultTagCollection, deleteTag, matchesTag, saveTag, tagScope, tagTarget, toggleTag } from "../lib/list-tags"

describe("list tags", () => {
  test("seeds the seven Finder colors", () => {
    expect(defaultTagCollection().tags.map((tag) => tag.name)).toEqual(["Red", "Orange", "Yellow", "Green", "Blue", "Purple", "Gray"])
  })
  test("supports multiple tags independently on sessions and projects", () => {
    const project = tagTarget("project", "same")
    const session = tagTarget("session", "same")
    let value = toggleTag(defaultTagCollection(), project, "red")
    value = toggleTag(value, project, "blue")
    expect(assignedTags(value, project).map((tag) => tag.id)).toEqual(["red", "blue"])
    expect(assignedTags(value, session)).toEqual([])
    value = toggleTag(value, project, "red")
    expect(assignedTags(value, project).map((tag) => tag.id)).toEqual(["blue"])
    expect(toggleTag(value, project, "missing")).toBe(value)
  })
  test("filters all, tagged and untagged entries", () => {
    const value = toggleTag(defaultTagCollection(), "project:1", "red")
    expect(matchesTag(value, "project:1", null)).toBe(true)
    expect(matchesTag(value, "project:1", "red")).toBe(true)
    expect(matchesTag(value, "project:1", "blue")).toBe(false)
    expect(matchesTag(value, "project:1", "untagged")).toBe(false)
    expect(matchesTag(value, "session:1", "untagged")).toBe(true)
  })
  test("renames and recolors without losing assignments", () => {
    const initial = toggleTag(defaultTagCollection(), "session:1", "red")
    const value = saveTag(initial, { id: "red", name: "  Urgent  ", color: "#3984DB" })
    expect(assignedTags(value, "session:1")).toEqual([{ id: "red", name: "Urgent", color: "#3984DB" }])
    expect(saveTag(value, { id: "new", name: "urgent", color: "#3984DB" })).toBe(value)
    expect(saveTag(value, { id: "new", name: " ", color: "#3984DB" })).toBe(value)
    expect(saveTag(value, { id: "new", name: "Valid", color: "bad" })).toBe(value)
  })
  test("deleting a tag cleans all assignments and preserves other tags", () => {
    let value = toggleTag(defaultTagCollection(), "session:1", "red")
    value = toggleTag(value, "project:2", "red")
    value = toggleTag(value, "project:2", "green")
    const restored = JSON.parse(JSON.stringify(deleteTag(value, "red")))
    expect(assignedTags(restored, "session:1")).toEqual([])
    expect(assignedTags(restored, "project:2").map((tag) => tag.id)).toEqual(["green"])
    expect(restored.tags.some((tag: { id: string }) => tag.id === "red")).toBe(false)
  })
  test("desktop and account namespaces cannot collide", () => {
    expect(tagScope("a", "b|c")).not.toBe(tagScope("a|b", "c"))
    expect(tagScope("desktop1", "user")).not.toBe(tagScope("desktop2", "user"))
    expect(tagScope("desktop", "one")).not.toBe(tagScope("desktop", "two"))
  })
})
