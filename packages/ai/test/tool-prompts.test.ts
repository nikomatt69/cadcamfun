import { describe, expect, test } from "bun:test"
import { cam } from "@cadcamfun/core"
import { ELEMENT_TYPES } from "../src/element-catalog.ts"
import { CADCAM_SKILLS } from "../src/skills/index.ts"
import { SYSTEM_TEXTS } from "./helpers/system-texts.ts"
import { ACTION_CATALOGUE, nameOf, toolOf } from "../src/actions/catalogue.ts"
import { TOOL_IDS, buildTools } from "../src/tools/catalogue.ts"
import { TOOL_PROMPT_IDS, rawToolPrompt, toolPrompt } from "../src/tools/prompts/index.ts"
import { readdirSync } from "node:fs"
import { ACTION_EXPOSURES } from "../src/actions/catalogue.ts"

const handlers = new Proxy({} as never, { get: () => async () => ({ ok: true }) })
const tools = buildTools(handlers, "p")
/** Every action of a tool, with the parameter keys its own schema declares. */
const actionsOf = (tool: string): Array<{ name: string; keys: string[] }> =>
  ACTION_CATALOGUE.filter((action) => toolOf(action) === tool).map((action) => ({
    name: nameOf(action),
    keys: Object.keys((action.parameters as unknown as { shape: Record<string, unknown> }).shape)
  }))

describe("tool prompts (one .txt per tool, every action inside it)", () => {
  test("every tool has exactly one prompt file and nothing else is there", () => {
    const files = readdirSync(new URL("../src/tools/prompts/", import.meta.url).pathname).filter((f) => f.endsWith(".txt")).map((f) => f.slice(0, -4)).sort()
    expect(files).toEqual([...TOOL_IDS].sort())
    expect<string[]>([...TOOL_PROMPT_IDS].sort()).toEqual([...TOOL_IDS].sort())
  })

  test("the model reads the prompt as the tool's description", () => {
    for (const tool of tools) expect(tool.description).toBe(toolPrompt(tool.id as never))
  })

  test("every action of every tool is documented with its parameters, plus Parameters and Result", () => {
    for (const tool of TOOL_IDS) {
      const text = rawToolPrompt(tool as never)
      expect(text, tool).toContain("Parameters")
      expect(text, tool).toMatch(/Result|result/)
      for (const action of actionsOf(tool)) {
        expect(text, `${tool} must document the action "${action.name}"`).toContain(action.name)
        for (const key of action.keys) expect(text, `${tool}.${action.name} must document "${key}"`).toContain(key)
      }
    }
  })

  test("each prompt says what it is for and when not to use it", () => {
    for (const tool of TOOL_IDS) {
      const text = rawToolPrompt(tool as never)
      expect(text.split("\n")[0]!.length, tool).toBeGreaterThan(20)
      expect(text, tool).toContain("Do not use it")
    }
  })

  test("placeholders are filled, the catalogue is smaller than the per-verb baseline, and the element table moved to a skill", () => {
    let total = 0
    for (const id of TOOL_PROMPT_IDS) {
      const text = toolPrompt(id)
      expect(text, id).not.toContain("{{")
      expect(text.length, id).toBeLessThan(4000)
      // An exposure's prompt is read only by the specialist it is granted to, never with the main catalogue.
      if (!Object.hasOwn(ACTION_EXPOSURES, id)) total += text.length
    }
    // Spec 26 §6.6: the model-visible catalogue must cost less than 24 000 characters (the per-verb tree cost 66 684).
    // Raised to 25 000 when the exact-kernel actions (cad exact / assembly) and the kernel route of cam manufacture were added.
    // Raised to 31 000 when the mods and mods_edit tools joined (RM-11): every install carries them, not just some.
    // Raised to 31 500 when cad distance / shell (the exact gap between solids, a paper shell) joined the cad tool.
    // Raised to 31 600 when cad setups (the manual three-axis setup plan, one line) joined the cad tool.
    // Raised to 31 700 when cad hole (resize or fill one recognised hole, preview and store) joined cad and cad_edit.
    // Raised to 31 800 when cam setup_sheet (the shop sheet of a saved kernel program) joined the cam tool.
    // Raised to 32 000 when the swarf operation (a flank cut of a cone or cylinder wall) joined the cam tool, to 32 300 with the post definition input.
    // Raised to 32 500 when cad title_block / title_block_set (the drawing's title block, read and set) joined cad and cad_edit.
    expect(total).toBeLessThan(32_500)
    const modelling = CADCAM_SKILLS.find((skill) => skill.name === "cad-3d-modeling")!
    for (const type of ELEMENT_TYPES) expect(`${modelling.body}\n${CADCAM_SKILLS.map((s) => s.body).join("\n")}`).toContain(`${type}:`)
  })

  test("what the prompts promise is true: operation types, tool types, materials, offsets decode in the generator", () => {
    const create = rawToolPrompt("cam_edit")
    for (const type of ["contour", "pocket", "drill", "engrave", "profile", "threading", "3d_surface"]) {
      expect(create, type).toContain(type)
      expect(() => cam.generator.decodeSettings({ operationType: type })).not.toThrow()
    }
    const everything = [...TOOL_PROMPT_IDS.map(rawToolPrompt), ...CADCAM_SKILLS.map((s) => s.body), ...SYSTEM_TEXTS()].join("\n")
    for (const toolType of ["endmill", "ballnose", "drill", "vbit", "chamfer", "threadmill", "reamer"]) {
      expect(everything, toolType).toContain(toolType)
      expect(() => cam.generator.decodeSettings({ toolType })).not.toThrow()
    }
    for (const material of ["aluminum", "steel", "wood", "plastic", "brass", "titanium", "composite", "other"]) {
      expect(everything, material).toContain(material)
      expect(() => cam.generator.decodeSettings({ material })).not.toThrow()
    }
    for (const offset of ["inside", "outside", "center"]) {
      expect(everything, offset).toContain(offset)
      expect(() => cam.generator.decodeSettings({ offset })).not.toThrow()
    }
    expect(() => cam.generator.decodeSettings({ operationType: "face" })).toThrow()
    // Nothing the model reads names an operation that does not exist.
    expect(everything).not.toMatch(/contour, pocket, drill, face/)
  })

  test("the verification skill names every finding code the verifier can report", () => {
    const text = CADCAM_SKILLS.filter((skill) => skill.category === "cam").map((skill) => skill.body).join("\n")
    for (const code of cam.verify.VerifyCodeSchema.literals) {
      if (code === "InvalidInput") continue
      expect(text, code).toContain(code)
    }
  })
})