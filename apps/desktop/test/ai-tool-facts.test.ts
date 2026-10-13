/** The summaries the chat shows for version-control and delegation tools, and that no catalogue tool is exempt from validation. */
import { describe, expect, test } from "bun:test"
import { toolFacts } from "../src/features/ai/lib/tool-facts.ts"
import { HOST_TOOLS, isToolId } from "../src/features/ai/lib/stream.ts"
import { TOOL_IDS } from "../src/features/ai/lib/tools.ts"

const task = { id: "11111111-1111-4111-8111-111111111111", agent: "editor", description: "Make the hole 8 mm", status: "completed", background: false, text: "Done: hole-1 radius 3 -> 4." }

describe("tool facts", () => {
  test("version-control and delegation results are summarised", () => {
    expect(toolFacts("vcs_edit", { action: "start_change" }, JSON.stringify({ ok: true, value: { branch: "ai/x" } }))).toEqual(["branch ai/x"])
    expect(toolFacts("vcs_edit", { action: "commit" }, JSON.stringify({ ok: true, value: { commit: "0123456789abcdef" } }))).toEqual(["commit 01234567"])
    expect(toolFacts("vcs_edit", { action: "open_pull_request" }, JSON.stringify({ ok: true, value: { number: 7, head: "ai/x", base: "main" } }))).toEqual(["pull request #7 ai/x → main"])
    expect(toolFacts("vcs_edit", { action: "run_workflows" }, JSON.stringify({ ok: true, value: [{ workflow: "verify", status: "success" }, { workflow: "lint", status: "failure" }] }))).toEqual(["verify: success", "lint: failure"])
    expect(toolFacts("vcs", { action: "status" }, JSON.stringify({ ok: true, value: { branch: "main", dirty: [1, 2], openPullRequests: [1] } }))).toEqual(["branch main · 2 changed · 1 open PR"])
    expect(toolFacts("agent", { action: "start" }, JSON.stringify(task))).toEqual(["editor · completed", "Done: hole-1 radius 3 -> 4."])
    expect(toolFacts("vcs_edit", { action: "commit" }, JSON.stringify({ ok: false, error: "no" }))).toEqual([])
    expect(toolFacts("cad_edit", { action: "add" }, "{}")).toEqual([])
    expect(toolFacts("vcs", { action: "status" }, "not json")).toEqual([])
  })

  test("one tool, two actions, two different facts", () => {
    // `vcs_edit` and `vcs` are two tools and `commit` and `status` are actions: the fact follows the pair, so a tool
    // id alone can no longer say what happened.
    const commit = toolFacts("vcs_edit", { action: "commit" }, JSON.stringify({ ok: true, value: { commit: "abcdef0123" } }))
    const status = toolFacts("vcs_edit", { action: "status" }, JSON.stringify({ ok: true, value: { branch: "main", dirty: [], openPullRequests: [] } }))
    expect(commit).toEqual(["commit abcdef01"])
    expect(status).toEqual([])
  })

  test("delegation and version control are validated like every other tool, not exempt from it", () => {
    // They used to be listed only in `HOST_TOOLS`, which meant no input check at all. They are catalogue tools now,
    // so they go through the same contract as `cad_edit`; only nikcli's own tools are exempt.
    for (const tool of ["agent", "vcs", "vcs_edit"]) expect(isToolId(tool), tool).toBe(true)
    for (const tool of TOOL_IDS) expect(HOST_TOOLS, tool).not.toContain(tool)
  })
})