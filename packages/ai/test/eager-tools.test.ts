/**
 * Which tools are in the first request and which are found with `search_tools` (spec 64). nikcli defers every registry tool
 * outside its CORE set; the model loads a deferred tool only by searching for it, and across the stored sessions it never
 * searched for `agent`, so no job ever ran in the background. The CORE set here is chosen for this application.
 */
import { expect, test } from "bun:test"
import { buildHostConfig, EAGER_TOOL_IDS } from "../src/nikcli/config.ts"
import { TOOL_PROMPT_IDS, toolPrompt } from "../src/tools/prompts/index.ts"
import { TOOL_IDS } from "../src/tools/registry.ts"

const eagerOf = (policies?: Parameters<typeof buildHostConfig>[0]["policies"]): string[] =>
  (buildHostConfig({ providers: [], toolIds: [...TOOL_IDS], systemPrompt: "x", ...(policies ? { policies } : {}) }) as { tool: { eager: string[] } }).tool.eager

test("the eager tools are the drawing reader and the delegation tool", () => {
  expect(eagerOf()).toEqual(["cad", "agent"])
})

test("every eager tool is a registered tool, and nothing that writes is eager", () => {
  for (const id of EAGER_TOOL_IDS) expect(TOOL_IDS as ReadonlyArray<string>).toContain(id)
  expect(EAGER_TOOL_IDS.filter((id) => id.endsWith("_edit"))).toEqual([])
})

test("a policy that denies a tool leaves it out of the eager set", () => {
  expect(eagerOf([{ effect: "deny", action: "tool.use", resource: "agent" }])).toEqual(["cad"])
})

// `search_tools` lists each deferred tool by the first line of its description, cut at 100 characters by the host.
test("the first line of every tool description is a complete summary within the host's index width", () => {
  for (const id of TOOL_PROMPT_IDS) {
    const first = toolPrompt(id).split("\n")[0]!.trim()
    expect(first.length, id).toBeLessThanOrEqual(100)
    expect(first.length, id).toBeGreaterThan(20)
  }
})

/**
 * nikcli's `search_tools` on a keyword: a tool matches when its id or its description contains the query; only a deferred tool
 * whose ID contains the query is loaded (at most three), a description-only match is listed to be loaded by name. The model also
 * sees the first line of every deferred description in the index, so the words a CAD/CAM user types must be in id or first line.
 */
const IDS = [...TOOL_PROMPT_IDS] as string[]
const EAGER = [...EAGER_TOOL_IDS] as string[]
const described = (id: string): string => `${id} ${toolPrompt(id as never)}`.toLowerCase()
const listed = (query: string): string[] => IDS.filter((id) => id.includes(query) || described(id).includes(query))
const loaded = (query: string): string[] => listed(query).filter((id) => id.includes(query) && !EAGER.includes(id)).slice(0, 3)
const firstLine = (id: string): string => toolPrompt(id as never).split("\n")[0]!.toLowerCase()

test("a keyword that names a tool family loads the deferred tools of that family", () => {
  expect(loaded("cad")).toEqual(["cad_edit"])
  expect(loaded("cam").sort()).toEqual(["cam", "cam_edit", "cam_verify"])
  expect(loaded("verify")).toEqual(["cam_verify"])
  expect(loaded("library").sort()).toEqual(["library", "library_edit"])
  expect(loaded("vcs").sort()).toEqual(["vcs", "vcs_edit"])
  expect(loaded("memory").sort()).toEqual(["memory", "memory_edit"])
  expect(loaded("mods").sort()).toEqual(["mods", "mods_edit"])
})

test("the words a CAD/CAM user searches for are in the first line of the tool that answers them", () => {
  const answers: Record<string, string[]> = {
    "g-code": ["cam", "cam_edit", "cam_verify"],
    toolpath: ["cam", "cam_edit", "cam_verify"],
    stock: ["cam", "cam_edit"],
    machine: ["cam", "library", "library_edit"],
    material: ["cam", "library", "library_edit"],
    cutter: ["library"],
    commit: ["vcs_edit"],
    "pull request": ["vcs", "vcs_edit"],
    component: ["library", "parts"],
    drawing: ["cad", "cad_edit"],
    web: ["research"],
    note: ["memory", "memory_edit"],
    mod: ["mods", "mods_edit"]
  }
  for (const [word, ids] of Object.entries(answers)) for (const id of ids) expect(firstLine(id), `${id} must say "${word}" in its first line`).toContain(word)
})

test("every query a model types still lists the tool that answers it", () => {
  for (const [query, id] of [["gcode", "cam"], ["g-code", "cam_edit"], ["commit", "vcs_edit"], ["stock", "cam_edit"], ["toolpath", "cam_verify"], ["machine", "library"], ["material", "library_edit"]] as const)
    expect(listed(query), query).toContain(id)
})
