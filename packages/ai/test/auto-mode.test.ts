/**
 * Auto permission mode is coherent (spec 64): it operates fully on the active drawing and its machining, and it never
 * deletes anything or touches history. Three layers say so — the permission map, the classifier text and the role prompt —
 * and each is derived from the catalogue here, so a new destructive action cannot reach Auto without all three changing.
 */
import { describe, expect, test } from "bun:test"
import { z } from "zod"
import { buildHostConfig } from "../src/nikcli/config.ts"
import { toolPermissionPattern } from "../src/nikcli/permission-modes.ts"
import { ACTION_CATALOGUE, exposedActions, nameOf, toolKind } from "../src/actions/catalogue.ts"
import { SUBAGENTS } from "../src/nikcli/agents.ts"
import { PRIMARIES } from "../src/nikcli/primaries.ts"
import { TOOL_IDS } from "../src/tools/registry.ts"

type Rule = "allow" | "deny" | "ask" | Record<string, string>
const config = buildHostConfig({ providers: [], toolIds: [...TOOL_IDS], systemPrompt: "x" }) as {
  auto_mode: { environment: string[]; allow: string[]; soft_deny: string[]; hard_deny: string[] }
  agent: Record<string, { permission: Record<string, Rule>; prompt?: string }>
}
const autoAgents = Object.entries(config.agent).filter(([name]) => name.endsWith("-auto"))
const destructive = ACTION_CATALOGUE.filter((action) => action.kind === "destructive")
const text = (lines: ReadonlyArray<string>): string => lines.join("\n").toLowerCase()

describe("the permission map", () => {
  test("every auto role exists for both primaries and every specialist", () => {
    const names = autoAgents.map(([name]) => name)
    for (const host of [...Object.values(PRIMARIES).map((spec) => spec.host), ...Object.values(SUBAGENTS).map((spec) => spec.host)]) expect(names, host).toContain(`${host}-auto`)
  })

  test("every destructive action is denied for every role that holds its tool", () => {
    expect(destructive.length).toBeGreaterThan(0)
    for (const [name, agent] of autoAgents) for (const action of destructive) {
      const tool = action.id.split(".")[0]!
      const rule = agent.permission[tool]
      if (rule === undefined) continue
      if (rule === "deny") continue
      expect(typeof rule === "object" ? rule[`action:${action.id.split(".")[1]}`] : rule, `${name} ${action.id}`).toBe("deny")
    }
  })

  test("mods are never written in Auto, and version control keeps only its safe actions", () => {
    for (const [name, agent] of autoAgents) {
      expect([undefined, "deny"], `${name} mods_edit`).toContain(agent.permission["mods_edit"] as string | undefined)
      const vcs = agent.permission["vcs_edit"]
      if (vcs === undefined) continue
      expect(vcs, `${name} vcs_edit`).toEqual({ "*": "ask", "action:restore": "deny", "action:run_workflows": "deny" })
    }
    // The tool that can restore history is held by Build alone.
    expect(autoAgents.filter(([, agent]) => agent.permission["vcs_edit"] !== undefined).map(([name]) => name)).toEqual(["cadcam-build-auto"])
  })

  test("every other action of a write tool goes to the classifier, so Auto can operate fully", () => {
    const build = config.agent["cadcam-build-auto"]!.permission
    for (const tool of ["cad_edit", "cam_edit", "parts", "library_edit", "memory_edit", "vcs_edit"]) {
      const rule = build[tool] as Record<string, string>
      expect(rule["*"], tool).toBe("ask")
      const deniedNames = Object.entries(rule).filter(([key, value]) => key !== "*" && value === "deny").map(([key]) => key.replace("action:", ""))
      // A write action a person must start (an unreviewed workflow) is denied as well as the destructive ones.
      const personOnly = new Set(["vcs_edit.run_workflows"])
      for (const action of exposedActions(tool)) {
        const name = nameOf(action)
        if (action.kind === "destructive" || personOnly.has(`${tool}.${name}`)) expect(deniedNames, `${tool}.${name}`).toContain(name)
        else expect(deniedNames, `${tool}.${name}`).not.toContain(name)
      }
    }
  })

  test("undo, redo and layer deletion are denied through the editor pattern, and a delete through its own", () => {
    const edit = config.agent["cadcam-build-auto"]!.permission["cad_edit"] as Record<string, string>
    expect(edit["action:editor:destructive"]).toBe("deny")
    for (const action of ["undo", "redo", "layer_delete"]) expect(toolPermissionPattern("cad_edit", { action: "editor", actions: [{ action }] }, "p", "cadcam-build-auto")).toBe("action:editor:destructive")
    expect(toolPermissionPattern("cad_edit", { action: "delete" }, "p", "cadcam-build-auto")).toBe("action:delete")
    expect(edit["action:delete"]).toBe("deny")
    // A view change in the same tool is not destructive.
    expect(toolPermissionPattern("cad_edit", { action: "editor", actions: [{ action: "view_fit" }] }, "p", "cadcam-build-auto")).toBe("action:editor")
  })
})

describe("the classifier text", () => {
  const hard = text(config.auto_mode.hard_deny)
  const allow = text(config.auto_mode.allow)
  const soft = text(config.auto_mode.soft_deny)

  test("hard-denies what every destructive action destroys", () => {
    const words: Record<string, string> = { drawing: "elements", component: "saved parts", library: "library rows", history: "history", mod: "extension" }
    const effects = new Set(destructive.flatMap((action) => (action as { effects?: ReadonlyArray<string> }).effects ?? []))
    for (const effect of effects) expect(hard, effect).toContain(words[effect]!)
  })

  test("allows full CAD and CAM work and does not contradict it", () => {
    for (const word of ["active drawing", "cad", "cam", "operations", "program", "stock"]) expect(allow, word).toContain(word)
    for (const phrase of ["bulk replacement", "most of a drawing", "rebuilding existing work"]) expect(soft, phrase).not.toContain(phrase)
    expect(soft).toContain("large edit the user asked for is not ungrounded")
  })

  test("keeps the work inside the active drawing of this project", () => {
    expect(hard).toContain("outside the active drawing of this project")
    expect(hard).toContain("another drawing of the project")
    expect(hard).toContain("another project")
    expect(hard).toContain("running workflows")
  })

  test("is written for CAD/CAM: none of nikcli's coding defaults is spliced in", () => {
    const all = text([...config.auto_mode.allow, ...config.auto_mode.soft_deny, ...config.auto_mode.hard_deny])
    expect(all).not.toContain("$defaults")
    for (const word of ["git push", "rm -rf", "curl |", "npm publish", "terraform", "force push", "pull request against", "docker"]) expect(all, word).not.toContain(word)
    expect(text(config.auto_mode.environment)).toContain("no shell")
  })

  test("soft rules that need the user to name something say what", () => {
    const named = config.auto_mode.soft_deny.filter((rule) => rule.includes("[named+specifics"))
    expect(named.map((rule) => rule.split(" [")[0])).toEqual(["Library Overwrite", "Datum Changes", "Sensitive Content Outbound"])
  })

  test("the model-supplied confirm flag is not permission", () => {
    expect(hard).toContain("confirm flag is not permission")
  })
})

describe("the role prompt", () => {
  test("every auto role says the same thing as the classifier", () => {
    for (const [name, agent] of autoAgents) {
      const prompt = (agent.prompt ?? "").toLowerCase()
      for (const word of ["operate fully on the active drawing", "deletion", "undo/redo", "running workflows", "version control is yours"]) expect(prompt, `${name} ${word}`).toContain(word)
    }
  })
})

describe("the scope of a call", () => {
  test("no tool takes a project or a drawing as an argument: both come from the conversation", () => {
    const names = new Set<string>()
    const walk = (value: unknown): void => {
      if (value === null || typeof value !== "object") return
      for (const [key, nested] of Object.entries(value)) {
        if (key === "properties" && nested !== null && typeof nested === "object") for (const property of Object.keys(nested)) names.add(property)
        walk(nested)
      }
    }
    for (const action of ACTION_CATALOGUE) walk(z.toJSONSchema(action.parameters as z.ZodType, { unrepresentable: "any" }))
    expect([...names].filter((name) => ["projectId", "drawingId", "project", "drawing"].includes(name))).toEqual([])
  })

  test("kinds are consistent: a tool with a destructive action is registered as destructive", () => {
    for (const tool of ["cad_edit", "parts", "library_edit", "vcs_edit", "mods_edit"]) expect(toolKind(tool), tool).toBe("destructive")
  })
})
