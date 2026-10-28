/**
 * nikcli's plan-mode and build-switch reminders (spec 64): sent when the primary changes, never while it stays.
 */
import { describe, expect, test } from "bun:test"
import { BUILD_SWITCH_REMINDER, PLAN_MODE_REMINDER, primaryOfHost, reminderFor } from "../src/prompts/reminders.ts"
import { PRIMARIES } from "../src/nikcli/primaries.ts"
import { ACTION_CATALOGUE } from "../src/actions/catalogue.ts"

describe("which reminder a turn gets", () => {
  test("entering Plan from nothing or from Build", () => {
    expect(reminderFor("plan", undefined)).toBe(PLAN_MODE_REMINDER)
    expect(reminderFor("plan", "build")).toBe(PLAN_MODE_REMINDER)
  })
  test("leaving Plan for Build", () => {
    expect(reminderFor("build", "plan")).toBe(BUILD_SWITCH_REMINDER)
  })
  test("staying in the same primary, or a first Build turn, adds nothing", () => {
    expect(reminderFor("plan", "plan")).toBeUndefined()
    expect(reminderFor("build", "build")).toBeUndefined()
    expect(reminderFor("build", undefined)).toBeUndefined()
    expect(reminderFor(undefined, "plan")).toBeUndefined()
  })
})

describe("host agent names", () => {
  test("resolve with or without the permission-mode suffix", () => {
    for (const id of ["build", "plan"] as const) {
      const host = PRIMARIES[id].host
      expect([host, `${host}-ask`, `${host}-auto`].map(primaryOfHost)).toEqual([id, id, id])
    }
    expect(primaryOfHost("cadcam-worker")).toBeUndefined()
    expect(primaryOfHost(undefined)).toBeUndefined()
  })
})

describe("the texts", () => {
  test("are wrapped as system reminders and say what changes", () => {
    for (const text of [PLAN_MODE_REMINDER, BUILD_SWITCH_REMINDER]) {
      expect(text.startsWith("<system-reminder>")).toBe(true)
      expect(text.endsWith("</system-reminder>")).toBe(true)
    }
    expect(PLAN_MODE_REMINDER).toMatch(/MUST NOT change/)
    expect(BUILD_SWITCH_REMINDER).toMatch(/no longer read-only/)
  })
  test("name only actions that exist in the catalogue", () => {
    const actions = new Set(ACTION_CATALOGUE.map((spec) => spec.id.split(".")[1]))
    for (const name of ["describe", "operations", "machine", "stock", "parametric_dfm", "exact", "plan_check", "recall", "status"]) expect(actions.has(name), name).toBe(true)
  })
})
