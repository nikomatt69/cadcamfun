import { describe, expect, test } from "bun:test"
import { ACTION_CATALOGUE, toolOf, nameOf } from "../src/actions/catalogue.ts"
import { BRIDGE_EXCLUDED_TOOLS, bridgeAdmission, describeBridge, scopeBridge } from "../src/actions/bridge.ts"

/** The two faces of the catalogue (in-process host tools, HTTP for a standalone nikcli) are derived from the one list. */
describe("the action catalogue's HTTP face", () => {
  const bridge = describeBridge()
  const byId = new Map(bridge.map((tool) => [tool.id, tool]))

  test("parity: every catalogue action is on the bridge with the same effect, or its tool is declared in-process only", () => {
    for (const spec of ACTION_CATALOGUE) {
      const tool = byId.get(toolOf(spec))
      if (BRIDGE_EXCLUDED_TOOLS.includes(toolOf(spec))) { expect(tool, spec.id).toBeUndefined(); continue }
      expect(tool, `${spec.id} has no tool on the bridge`).toBeDefined()
      expect(tool!.actions.find((action) => action.id === spec.id), `${spec.id} is not listed`).toMatchObject({ name: nameOf(spec), kind: spec.kind })
    }
    // And nothing is listed that the catalogue does not declare.
    const declared = new Set(ACTION_CATALOGUE.map((spec) => spec.id))
    for (const tool of bridge) for (const action of tool.actions) expect(declared.has(action.id), action.id).toBe(true)
  })

  test("every tool carries its prompt and a JSON Schema a client can use", () => {
    expect(bridge.length).toBeGreaterThanOrEqual(12)
    for (const tool of bridge) {
      expect(tool.description.length, tool.id).toBeGreaterThan(50)
      expect(tool.parameters["anyOf"] ?? tool.parameters["oneOf"] ?? tool.parameters["properties"], `${tool.id} has no schema`).toBeDefined()
      expect(() => JSON.stringify(tool.parameters)).not.toThrow()
      // The discriminator is in the schema, so a client can offer the actions.
      expect(JSON.stringify(tool.parameters), tool.id).toContain("\"action\"")
    }
  })

  test("cad_grep stays reachable, read-only, through the consolidated cad tool", () => {
    expect(byId.get("cad")!.actions.find((action) => action.name === "grep")).toMatchObject({ id: "cad.grep", kind: "read" })
  })

  test("reads and writes are admitted; destructive actions and in-process tools are refused with where to go", () => {
    for (const tool of bridge) {
      for (const action of tool.actions) {
        const verdict = bridgeAdmission(tool.id, { action: action.name })
        if (action.kind === "destructive") {
          expect(verdict, action.id).toMatchObject({ ok: false })
          expect((verdict as { error: string }).error).toContain("person's approval")
        } else expect(verdict, action.id).toEqual({ ok: true, tool: tool.id, action: action.name, kind: action.kind })
      }
    }
    expect(bridgeAdmission("agent", { action: "start" })).toMatchObject({ ok: false })
    expect((bridgeAdmission("agent", { action: "start" }) as { error: string }).error).toContain("inside the application")
  })

  test("a confirm flag is not an approval, and a malformed call says what to send", () => {
    expect(bridgeAdmission("cad_edit", { action: "delete", ids: ["e1"], confirm: true })).toMatchObject({ ok: false })
    expect(bridgeAdmission("nope", {})).toMatchObject({ ok: false })
    expect((bridgeAdmission("cad", {}) as { error: string }).error).toContain("needs an \"action\"")
    expect((bridgeAdmission("cad", { action: "frobnicate" }) as { error: string }).error).toContain("describe")
    expect(bridgeAdmission("cad", null)).toMatchObject({ ok: false })
  })
})

describe("the operator's policy narrows the bridge (nikcli's policy statements)", () => {
  const deny = (action: string, resource: string) => ({ effect: "deny" as const, action, resource })
  const allow = (action: string, resource: string) => ({ effect: "allow" as const, action, resource })

  test("no statement changes nothing; bridge.use on a tool or a tool.action takes it away from outside only", () => {
    const all = describeBridge()
    expect(scopeBridge(all, [])).toBe(all)
    const readOnly = scopeBridge(all, [deny("bridge.use", "cad_edit.*"), deny("bridge.use", "cam_edit.*")])
    expect(readOnly.map((tool) => tool.id)).not.toContain("cad_edit")
    expect(readOnly.map((tool) => tool.id)).not.toContain("cam_edit")
    expect(readOnly.map((tool) => tool.id)).toContain("cad")
    expect(bridgeAdmission("cad_edit", { action: "add" }, [deny("bridge.use", "cad_edit.*")])).toMatchObject({ ok: false })
    expect(bridgeAdmission("cad", { action: "describe" }, [deny("bridge.use", "cad_edit.*")])).toMatchObject({ ok: true })
  })

  test("last match wins, so one action can be let back in", () => {
    const policy = [deny("bridge.use", "cad_edit.*"), allow("bridge.use", "cad_edit.add")]
    expect(bridgeAdmission("cad_edit", { action: "add" }, policy)).toMatchObject({ ok: true })
    expect(bridgeAdmission("cad_edit", { action: "modify" }, policy)).toMatchObject({ ok: false })
    expect(scopeBridge(describeBridge(), policy).find((tool) => tool.id === "cad_edit")!.actions.map((action) => action.name)).toEqual(["add"])
  })

  test("tool.use, which already takes a tool from the in-app agent, takes it from outside too", () => {
    const policy = [deny("tool.use", "vcs_edit")]
    expect(scopeBridge(describeBridge(), policy).map((tool) => tool.id)).not.toContain("vcs_edit")
    expect((bridgeAdmission("vcs_edit", { action: "commit" }, policy) as { error: string }).error).toContain("AI policy")
  })
})

describe("read-only scope", () => {
  test("the listing keeps only read actions, and a change is refused with what to do", () => {
    const readOnly = scopeBridge(describeBridge(), [], "read")
    expect(readOnly.length).toBeGreaterThan(0)
    for (const tool of readOnly) for (const action of tool.actions) expect(action.kind, action.id).toBe("read")
    expect(readOnly.map((tool) => tool.id)).toContain("cad")
    expect(readOnly.map((tool) => tool.id)).not.toContain("cad_edit")
    expect(bridgeAdmission("cad", { action: "describe" }, [], "read")).toMatchObject({ ok: true })
    const refused = bridgeAdmission("cad_edit", { action: "add" }, [], "read") as { ok: false; error: string }
    expect(refused.ok).toBe(false)
    expect(refused.error).toContain("read-only")
    // Write mode is the default and changes nothing.
    expect(bridgeAdmission("cad_edit", { action: "add" }, [], "write")).toMatchObject({ ok: true })
  })
})
