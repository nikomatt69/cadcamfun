import { expect, test } from "bun:test"
import { agentLabel, contextLine, contextUsage, goalBudget, goalTone, groupTools, permissionTone, statusLabel, taskTone, toolTitle, turnTotals } from "../lib/assistant-inspector"
import { idleActivity } from "../lib/turn-activity"

test("the context meter clamps, rounds and warns before the desktop compacts", () => {
  expect(contextUsage(undefined, 100)).toBeUndefined()
  expect(contextUsage(10, 0)).toBeUndefined()
  expect(contextUsage(10, Number.NaN)).toBeUndefined()
  expect(contextUsage(0, 1000)).toEqual({ fraction: 0, percent: 0, level: "ok" })
  expect(contextUsage(690, 1000)?.level).toBe("ok")
  expect(contextUsage(700, 1000)?.level).toBe("warn")
  expect(contextUsage(850, 1000)?.level).toBe("warn")
  expect(contextUsage(851, 1000)?.level).toBe("high")
  expect(contextUsage(5000, 1000)).toEqual({ fraction: 1, percent: 100, level: "high" })
  expect(contextUsage(-5, 1000)?.fraction).toBe(0)
})

test("the last turn shows its token spend only once it has one", () => {
  expect(turnTotals(idleActivity)).toBeUndefined()
  expect(turnTotals({ ...idleActivity, inputTokens: 12_400, outputTokens: 950, step: 3 })).toEqual({ input: "12.4k", output: "950", steps: 3, total: 13_350 })
  expect(goalBudget(undefined)).toBeUndefined()
  expect(goalBudget({ objective: "x", status: "active", tokensUsed: 500 })).toBeUndefined()
  expect(goalBudget({ objective: "x", status: "active", tokensUsed: 900, tokenBudget: 1000 })?.level).toBe("high")
})

test("permission presets and statuses carry a tone", () => {
  expect(["approve", "ask", "auto"].map((mode) => permissionTone(mode as "approve"))).toEqual(["accent", "warning", "info"])
  expect(["running", "completed", "error", "queued", "cancelled"].map(taskTone)).toEqual(["accent", "success", "danger", "warning", "neutral"])
  expect(["active", "complete", "paused", "blocked", "budget_limited"].map(goalTone)).toEqual(["accent", "success", "neutral", "warning", "warning"])
  expect(statusLabel("budget_limited")).toBe("Budget limited")
  expect(contextLine(12_400, 128_000)).toBe("12.4k of 128k tokens")
  expect(contextLine(undefined, 128_000)).toBe("128k token window")
})

test("agents and tools read as words, and tools group by the family their id names", () => {
  expect([agentLabel("general"), agentLabel("cad-editor"), agentLabel(" "), agentLabel("machinist_pro")]).toEqual(["General", "Cad editor", "General", "Machinist pro"])
  expect(toolTitle("cad_edit_part")).toBe("edit part")
  expect(toolTitle("read")).toBe("read")
  const groups = groupTools([{ id: "read" }, { id: "mcp_x" }, { id: "cam_post" }, { id: "cad_b" }, { id: "cad_a" }, { id: "vcs_commit" }])
  expect(groups.map((group) => group.label)).toEqual(["CAD", "CAM", "Version control", "Extensions", "General"])
  expect(groups[0]?.tools.map((tool) => tool.id)).toEqual(["cad_a", "cad_b"])
  expect(groupTools([])).toEqual([])
})
