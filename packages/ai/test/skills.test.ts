import { afterAll, describe, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ELEMENT_SPECS } from "../src/element-catalog.ts"
import { buildHostConfig } from "../src/nikcli/config.ts"
import { CADCAM_SKILLS, installSkills, skillMarkdown } from "../src/skills/index.ts"
import { TOOL_IDS } from "../src/tools/catalogue.ts"
import { cadEditTool } from "../src/tools/cad_edit.ts"

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
    expect(prompt).toMatch(/physical parts, build in 3D/)
    expect(prompt).toContain("cad_edit action add")
    expect(prompt).toContain("never use it to represent an object")
    expect(CADCAM_SKILLS.find((skill) => skill.name === "cad-3d-modeling")!.body).toContain("built in 3D, always")
  })

  test("the documented batch program accepts structured results and preserves partial failures", async () => {
    const body = CADCAM_SKILLS.find((skill) => skill.name === "cad-3d-modeling")?.body ?? ""
    const source = body.match(/`(const elements = Array\.from[\s\S]*?)`/)?.[1]
    expect(source).toBeDefined()
    if (source === undefined) return
    // Execute the trusted checked-in example against the real input schema and a structured-output fixture.
    const evaluate = new Function("tools", `return (async () => { ${source} })()`) as
      (tools: { cad_edit: (input: unknown) => Promise<unknown> }) => Promise<unknown>
    for (const result of [
      { ok: true, ids: ["stored-pin"] },
      { ok: true, ids: ["stored-pin"], skipped: [{ index: 2, error: "Rejected fixture item" }] },
      { ok: false, error: "Drawing revision changed" }
    ]) {
      const inputs: unknown[] = []
      const actual = await evaluate({ cad_edit: async (input) => {
        const parsed = cadEditTool.parameters.parse(input)
        inputs.push(parsed)
        expect(parsed).toMatchObject({ action: "add" })
        if (typeof parsed === "object" && parsed !== null && "elements" in parsed && Array.isArray(parsed.elements)) {
          expect(parsed.elements).toHaveLength(8)
        }
        return result
      } })
      expect(inputs).toHaveLength(1)
      expect(actual).toEqual(!result.ok || "skipped" in result ? result : { ids: result.ids })
    }
  })

  test("continuation skills preserve scope, typed edits and bounded recovery", () => {
    const body = (name: string) => CADCAM_SKILLS.find((skill) => skill.name === name)?.body ?? ""
    expect(body("project-auto-memory")).toContain("do not repeat memory and drawing reads before every tool")
    expect(body("project-auto-memory")).toContain("Specialists receive your brief")
    expect(body("parametric-design")).toContain("Nested sketch.entities and sketch.constraints are arrays")
    expect(body("parametric-design")).toContain("cad action parametric_inspect, then cad_edit action parametric_update")
    expect(body("cam-operation-workflow")).toContain("Do not repeat unchanged failures")
    expect(body("version-control-cadcam")).toContain("Commit only when requested")
    expect(body("precision-and-tolerances")).toContain("not an instruction to alter nominal CAD")
  })

  test("the agent is allowed to load skills and still has no shell or file tools", () => {
    const config = buildHostConfig({ providers: [], toolIds: [...TOOL_IDS], systemPrompt: "x" }) as { agent: Record<string, { permission: Record<string, string> }> }
    for (const name of ["cadcam-build", "cadcam-plan"]) {
      const permission = config.agent[name]!.permission
      expect(permission["skill"], name).toBe("allow")
      expect(permission["**"], name).toBe("deny")
      for (const blocked of ["bash", "edit", "write", "webfetch"]) expect(permission[blocked], `${name} ${blocked}`).toBeUndefined()
    }
  })
})
