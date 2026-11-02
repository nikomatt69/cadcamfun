import { describe, expect, test } from "bun:test"
import { BUILD_PLAN_PROMPT, planAwaitingApproval } from "../src/features/ai/lib/plan-approval.ts"
import type { AiMessage } from "../src/features/ai/lib/types.ts"

const message = (patch: Partial<AiMessage>): AiMessage => ({ id: "m", role: "assistant", text: "1. Rough the pocket\n2. Finish the walls", createdAt: "2026-11-02T00:00:00Z", events: [], status: "done", ...patch })

describe("plan approval", () => {
  test("a finished plan in the Plan agent offers to build it", () => {
    expect(planAwaitingApproval("plan", "idle", [message({ role: "user", text: "Plan the housing" }), message({})])).toBe(true)
  })

  test("nothing is offered while the turn runs, after a failure, a stop or an empty answer, or in another agent", () => {
    const done = [message({})]
    expect(planAwaitingApproval("plan", "streaming", done)).toBe(false)
    expect(planAwaitingApproval("plan", "connecting", done)).toBe(false)
    expect(planAwaitingApproval("plan", "error", done)).toBe(false)
    expect(planAwaitingApproval("plan", "idle", [message({ status: "error" })])).toBe(false)
    expect(planAwaitingApproval("plan", "idle", [message({ status: "streaming" })])).toBe(false)
    expect(planAwaitingApproval("plan", "idle", [message({ interrupted: true })])).toBe(false)
    expect(planAwaitingApproval("plan", "idle", [message({ text: "  \n" })])).toBe(false)
    expect(planAwaitingApproval("plan", "idle", [message({ role: "user", text: "Plan it" })])).toBe(false)
    expect(planAwaitingApproval("plan", "idle", [])).toBe(false)
    expect(planAwaitingApproval("build", "idle", done)).toBe(false)
  })

  test("the prompt that starts the build says to refresh ids and verify", () => {
    expect(BUILD_PLAN_PROMPT).toContain("Execute the plan above")
    expect(BUILD_PLAN_PROMPT).toContain("revisions")
  })
})
