import { afterAll, describe, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ELEMENT_SPECS } from "../src/element-catalog.ts"
import { buildHostConfig } from "../src/nikcli/config.ts"
import { CADCAM_SKILLS, installSkills, skillMarkdown } from "../src/skills/index.ts"
import { TOOL_IDS } from "../src/tools/catalogue.ts"

const dir = mkdtempSync(join(tmpdir(), "skills-"))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe("cadcam skills", () => {
  test("names are unique kebab-case slugs and every skill is well formed", () => {
    const names = CADCAM_SKILLS.map((skill) => skill.name)
    expect(new Set(names).size).toBe(names.length)
    for (const skill of CADCAM_SKILLS) {
      expect(skill.name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
      expect(skill.description.length).toBeGreaterThan(20)
      expect(skill.body.trim().startsWith("# ")).toBe(true)
      const md = skillMarkdown(skill)
      expect(md.startsWith(`---\nname: ${skill.name}\n`)).toBe(true)
      expect(md.split("---").length).toBeGreaterThanOrEqual(3)
    }
  })

  test("skills only name tools and element types that exist", () => {
    const known = new Set<string>([...TOOL_IDS])
    const mentioned = new Set(CADCAM_SKILLS.flatMap((skill) => [...skill.body.matchAll(/`((?:cad|cam|lib|memory)_[a-z_]+)`/g)].map((m) => m[1]!)))
    for (const tool of mentioned) expect(known.has(tool)).toBe(true)
    // Every recipe type is a real element type.
    const types = new Set(Object.keys(ELEMENT_SPECS))
    for (const type of ["cube", "cylinder", "revolution", "extrusion", "sweep", "boolean-subtract", "gear", "spring", "bolt", "screw", "nut", "washer"]) expect(types.has(type)).toBe(true)
  })

  test("installSkills writes one SKILL.md each and replaces its own folders without touching others", async () => {
    await Bun.write(join(dir, "skills", "mine", "SKILL.md"), "keep me")
    const names = await installSkills(dir)
    expect(names).toEqual(CADCAM_SKILLS.map((skill) => skill.name))
    for (const name of names) expect(existsSync(join(dir, "skills", name, "SKILL.md"))).toBe(true)
    expect(readFileSync(join(dir, "skills", "mine", "SKILL.md"), "utf8")).toBe("keep me")
    await Bun.write(join(dir, "skills", names[0]!, "stale.txt"), "x")
    await installSkills(dir)
    expect(existsSync(join(dir, "skills", names[0]!, "stale.txt"))).toBe(false)
  })

  test("the prompt and the skill make 3D the default, and 2D a sketch the user asked for", async () => {
    const { systemPrompt } = await import("../src/prompts/system.ts")
    const prompt = systemPrompt()
    expect(prompt).toContain("Build everything in 3D")
    expect(prompt).toContain("cad_add_elements")
    expect(prompt).toContain("never use it to represent an object")
    expect(CADCAM_SKILLS.find((skill) => skill.name === "cad-3d-modeling")!.body).toContain("built in 3D, always")
  })

  test("the agent is allowed to load skills and still has no shell or file tools", () => {
    const config = buildHostConfig({ providers: [], toolIds: [...TOOL_IDS], systemPrompt: "x" }) as { agent: { cadcam: { permission: Record<string, string> } } }
    const permission = config.agent.cadcam.permission
    expect(permission["skill"]).toBe("allow")
    expect(permission["**"]).toBe("deny")
    for (const blocked of ["bash", "edit", "write", "webfetch"]) expect(permission[blocked]).toBeUndefined()
  })
})
