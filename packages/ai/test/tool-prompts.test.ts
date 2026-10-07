import { describe, expect, test } from "bun:test"
import { cam } from "@cadcamfun/core"
import { ELEMENT_TYPES } from "../src/element-catalog.ts"
import { CADCAM_SKILLS } from "../src/skills/index.ts"
import { SYSTEM_TEXTS } from "./helpers/system-texts.ts"
import { TOOL_IDS, buildTools } from "../src/tools/catalogue.ts"
import { TOOL_PROMPT_IDS, rawToolPrompt, toolPrompt } from "../src/tools/prompts/index.ts"
import { readdirSync } from "node:fs"

const handlers = new Proxy({} as never, { get: () => async () => ({ ok: true }) })
const tools = buildTools(handlers, "p")
const keysOf = (tool: (typeof tools)[number]): string[] => Object.keys(((tool.parameters as unknown) as { shape: Record<string, unknown> }).shape)

describe("tool prompts (one .txt per tool)", () => {
  test("every tool has exactly one prompt file and nothing else is there", () => {
    const files = readdirSync(new URL("../src/tools/prompts/", import.meta.url).pathname).filter((f) => f.endsWith(".txt")).map((f) => f.slice(0, -4)).sort()
    expect(files).toEqual([...TOOL_IDS].sort())
    expect([...TOOL_PROMPT_IDS].sort()).toEqual([...TOOL_IDS].sort())
  })

  test("the model reads the prompt as the tool's description", () => {
    for (const tool of tools) expect(tool.description).toBe(toolPrompt(tool.id as never))
  })

  test("every parameter of every tool is documented, with a Parameters and a Result section", () => {
    for (const tool of tools) {
      const text = rawToolPrompt(tool.id as never)
      expect(text).toContain("Parameters")
      expect(text).toMatch(/Result|result/)
      for (const key of keysOf(tool)) expect(text, `${tool.id} must document "${key}"`).toContain(key)
    }
  })

  test("each prompt says what it is for and when not to use it (where there is a neighbour to confuse it with)", () => {
    for (const tool of tools) {
      const text = rawToolPrompt(tool.id as never)
      expect(text.split("\n")[0]!.length).toBeGreaterThan(20)
    }
    for (const id of ["cad_add_elements", "cad_add_entities", "cad_modify_entities", "cad_delete_entities", "cam_create_operation", "cam_update_operation", "cam_analyze_gcode", "cam_verify_toolpath", "cad_describe_drawing"] as const) {
      expect(rawToolPrompt(id), id).toContain("Do not use it")
    }
  })

  test("placeholders are filled, sizes stay reasonable, and the element catalogue is complete", () => {
    for (const id of TOOL_PROMPT_IDS) {
      const text = toolPrompt(id)
      expect(text, id).not.toContain("{{")
      expect(text.length, id).toBeLessThan(9000)
    }
    for (const type of ELEMENT_TYPES) expect(toolPrompt("cad_add_elements")).toContain(`- ${type}:`)
  })

  test("what the prompts promise is true: operation types, tool types, materials, offsets decode in the generator", () => {
    const create = rawToolPrompt("cam_create_operation")
    for (const type of ["contour", "pocket", "drill", "engrave", "profile", "threading", "3d_surface"]) {
      expect(create).toContain(type)
      expect(() => cam.generator.decodeSettings({ operationType: type })).not.toThrow()
    }
    for (const toolType of ["endmill", "ballnose", "drill", "vbit", "chamfer", "threadmill", "reamer"]) {
      expect(create).toContain(toolType)
      expect(() => cam.generator.decodeSettings({ toolType })).not.toThrow()
    }
    for (const material of ["aluminum", "steel", "wood", "plastic", "brass", "titanium", "composite", "other"]) {
      expect(create).toContain(material)
      expect(() => cam.generator.decodeSettings({ material })).not.toThrow()
    }
    for (const offset of ["inside", "outside", "center"]) expect(() => cam.generator.decodeSettings({ offset })).not.toThrow()
    expect(() => cam.generator.decodeSettings({ operationType: "face" })).toThrow()
    // Nothing the model reads names an operation that does not exist.
    const everything = [...TOOL_PROMPT_IDS.map(rawToolPrompt), ...CADCAM_SKILLS.map((s) => s.body), ...SYSTEM_TEXTS()].join("\n")
    expect(everything).not.toMatch(/contour, pocket, drill, face/)
  })

  test("the verification prompt names every finding code the verifier can report", () => {
    const text = rawToolPrompt("cam_verify_toolpath")
    for (const code of cam.verify.VerifyCodeSchema.literals) {
      if (code === "InvalidInput") continue
      expect(text, code).toContain(code)
    }
  })
})
