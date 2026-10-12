/** The summaries the chat shows for version-control and delegation tools, and that the tools the sidecar adds are not rejected. */
import { describe, expect, test } from "bun:test"
import { toolFacts } from "../src/features/ai/lib/tool-facts.ts"
import { HOST_TOOLS } from "../src/features/ai/lib/stream.ts"

const task = { id: "11111111-1111-4111-8111-111111111111", agent: "editor", description: "Make the hole 8 mm", status: "completed", background: false, text: "Done: hole-1 radius 3 -> 4." }

describe("tool facts", () => {
  test("version-control and delegation results are summarised", () => {
    expect(toolFacts("vcs_start_change", JSON.stringify({ ok: true, value: { branch: "ai/x" } }))).toEqual(["branch ai/x"])
    expect(toolFacts("vcs_commit", JSON.stringify({ ok: true, value: { commit: "0123456789abcdef" } }))).toEqual(["commit 01234567"])
    expect(toolFacts("vcs_open_pull_request", JSON.stringify({ ok: true, value: { number: 7, head: "ai/x", base: "main" } }))).toEqual(["pull request #7 ai/x → main"])
    expect(toolFacts("actions_run", JSON.stringify({ ok: true, value: [{ workflow: "verify", status: "success" }, { workflow: "lint", status: "failure" }] }))).toEqual(["verify: success", "lint: failure"])
    expect(toolFacts("vcs_status", JSON.stringify({ ok: true, value: { branch: "main", dirty: [1, 2], openPullRequests: [1] } }))).toEqual(["branch main · 2 changed · 1 open PR"])
    expect(toolFacts("agent_task", JSON.stringify(task))).toEqual(["editor · completed", "Done: hole-1 radius 3 -> 4."])
    expect(toolFacts("vcs_commit", JSON.stringify({ ok: false, error: "no" }))).toEqual([])
    expect(toolFacts("cad_add_elements", "{}")).toEqual([])
    expect(toolFacts("vcs_status", "not json")).toEqual([])
  })

  test("the tools the sidecar adds are never shown as rejected", () => {
    for (const tool of ["agent_task", "agent_tasks", "agent_task_read", "agent_task_cancel", "vcs_status", "vcs_start_change", "vcs_commit", "vcs_diff", "vcs_open_pull_request", "vcs_list_pull_requests", "actions_run"]) {
      expect(HOST_TOOLS).toContain(tool)
    }
  })
})

