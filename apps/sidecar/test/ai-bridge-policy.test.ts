import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { makeApp } from "./helpers.ts"

/** The operator's `<data dir>/ai/policy.json` narrows what an outside client sees and can call (RM-11 scoping). */
const dataDir = mkdtempSync(join(tmpdir(), "cadcamfun-bridge-policy-"))
mkdirSync(join(dataDir, "ai"), { recursive: true })
writeFileSync(join(dataDir, "ai", "policy.json"), JSON.stringify([
  { effect: "deny", action: "bridge.use", resource: "cad_edit.*" },
  { effect: "allow", action: "bridge.use", resource: "cad_edit.add" },
  { effect: "deny", action: "tool.use", resource: "vcs_edit" },
  { effect: "deny", action: "bridge.use", resource: "cam_edit.*" }
]))

let app: Awaited<ReturnType<typeof makeApp>>
let projectId: string
beforeAll(async () => {
  app = await makeApp({ dataDir })
  projectId = (await app.call("/api/projects", { method: "POST", json: { name: "Scoped" } })).body.id
})
afterAll(async () => { await app.dispose(); rmSync(dataDir, { recursive: true, force: true }) })

const invoke = (tool: string, input: Record<string, unknown>) => app.call("/api/ai/actions/invoke", { method: "POST", json: { projectId, tool, input } })

describe("bridge policy", () => {
  test("the catalogue lists only what the policy leaves", async () => {
    const tools = (await app.call("/api/ai/actions")).body.tools as Array<{ id: string; actions: Array<{ name: string }> }>
    const ids = tools.map((tool) => tool.id)
    expect(ids).toContain("cad")
    expect(ids).not.toContain("vcs_edit")
    expect(ids).not.toContain("cam_edit")
    expect(tools.find((tool) => tool.id === "cad_edit")!.actions.map((action) => action.name)).toEqual(["add"])
  })

  test("a call outside the policy is refused with the reason, and one inside it runs", async () => {
    const modify = await invoke("cad_edit", { action: "modify", changes: [] })
    expect(modify.status).toBe(400)
    expect(JSON.stringify(modify.body)).toContain("AI policy")
    expect((await invoke("vcs_edit", { action: "commit", message: "x" })).status).toBe(400)
    const added = await invoke("cad_edit", { action: "add", elements: [{ type: "cube", width: 4, height: 4, depth: 4 }] })
    expect(added.status).toBe(200)
    expect(added.body.result.ok).toBe(true)
  })
})
