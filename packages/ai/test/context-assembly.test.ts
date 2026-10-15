import { describe, expect, test } from "bun:test"
import { assembleContext, notesByRecency, type ContextSource } from "../src/context-assembly.ts"

const source = (id: string, kind: ContextSource["kind"], text: string): ContextSource => ({ id, kind, label: id.replaceAll("-", " "), text })

describe("one context assembly per turn", () => {
  test("blocks follow the order of authority, whatever order they were acquired in", () => {
    const { text, manifest } = assembleContext([
      source("notes", "memory", "NOTES"), source("snapshot", "ui-snapshot", "SNAPSHOT"),
      source("rules", "requirement", "RULES"), source("now", "observation", "NOW"), source("link", "reference", "LINK")
    ])
    expect(text).toBe(["RULES", "NOW", "SNAPSHOT", "NOTES", "LINK"].join("\n\n"))
    expect(manifest.included.map((entry) => entry.id)).toEqual(["rules", "now", "snapshot", "notes", "link"])
    expect(manifest.used).toBe(text.length)
  })

  test("a source is delivered once: same id or same text is a duplicate, an empty one is noted, nothing is invented", () => {
    const { text, manifest } = assembleContext([
      source("habits", "memory", "HABITS"), source("habits", "memory", "HABITS AGAIN"), source("habits-mirror", "memory", " HABITS "), source("empty", "memory", "  ")
    ])
    expect(text).toBe("HABITS")
    expect(manifest.omitted.map((entry) => [entry.id, entry.reason])).toEqual([["habits", "duplicate"], ["habits-mirror", "duplicate"], ["empty", "empty"]])
  })

  test("one aggregate budget: lower kinds are cut or left out first, and the omission is named inside the budget", () => {
    const rules = source("rules", "requirement", "R".repeat(600))
    const snapshot = source("snapshot", "ui-snapshot", "S".repeat(2_000))
    const notes = source("notes", "memory", "N".repeat(2_000))
    const { text, manifest } = assembleContext([notes, snapshot, rules], 1_500)
    expect(text.length).toBeLessThanOrEqual(1_500)
    expect(manifest.used).toBe(text.length)
    expect(text.startsWith("R".repeat(600))).toBe(true)
    expect(manifest.included.find((entry) => entry.id === "snapshot")?.truncated).toBe(true)
    expect(text).toContain("[... truncated to fit the context budget]")
    expect(manifest.omitted).toEqual([{ id: "notes", kind: "memory", label: "notes", reason: "budget" }])
    expect(text).toContain("<context_omitted>Not included to stay within the context budget: notes.")
    // A budget too small for anything still answers within it.
    const tiny = assembleContext([rules, notes], 50)
    expect(tiny.text.length).toBeLessThanOrEqual(50)
    expect(tiny.manifest.omitted.filter((entry) => entry.reason === "budget").map((entry) => entry.id)).toEqual(["rules", "notes"])
  })

  test("notes are ordered by their effective timestamp, newest first", () => {
    const notes = [
      { key: "old", updatedAt: "2026-01-01T00:00:00.000Z" }, { key: "new", updatedAt: "2026-10-01T00:00:00.000Z" },
      { key: "mid", updatedAt: "2026-05-01T00:00:00.000Z" }, { key: "unknown" }
    ]
    expect(notesByRecency(notes).map((note) => note.key)).toEqual(["new", "mid", "old", "unknown"])
  })
})
