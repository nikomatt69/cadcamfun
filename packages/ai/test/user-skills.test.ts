import { afterAll, describe, expect, test } from "bun:test"
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { CADCAM_SKILLS, installSkills } from "../src/skills/index.ts"
import { createUserSkillStore, parseSkillMarkdown, skillProblems, userSkillMarkdown } from "../src/skills/user.ts"

const dir = mkdtempSync(join(tmpdir(), "user-skills-"))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

const playbook = "When the part is aluminium, finish with a 0.2 mm radial pass at 12000 rpm, then verify the toolpath."

describe("user skills", () => {
  test("a SKILL.md round-trips through the parser", () => {
    const skill = { name: "alu-finish", description: "Finishing passes for aluminium parts", body: playbook }
    const parsed = parseSkillMarkdown(userSkillMarkdown(skill))
    expect(parsed).toEqual({ ok: true, value: skill })
  })

  test("a skill is refused with every reason at once", () => {
    expect(skillProblems({ name: "Bad Name", description: "", body: "x" }).length).toBeGreaterThanOrEqual(3)
    expect(skillProblems({ name: "cad-3d-modeling", description: "x", body: playbook })[0]).toContain("built-in")
    expect(skillProblems({ name: "ok", description: "two\nlines", body: playbook })).toContain("description must be one line")
    expect(skillProblems({ name: "ok", description: "fine", body: "y".repeat(20_001) }).join()).toContain("longer than")
    expect(parseSkillMarkdown("no front matter here")).toMatchObject({ ok: false })
  })

  test("the store saves, lists and removes; foreign folders are ignored and never deleted", async () => {
    const store = createUserSkillStore(join(dir, "store"))
    expect(await store.list()).toEqual([])
    const saved = await store.save({ name: "alu-finish", description: "Finishing aluminium", body: playbook })
    expect(saved.ok).toBe(true)
    expect(await store.save({ name: "Bad", description: "", body: "" })).toMatchObject({ ok: false })
    await Bun.write(join(dir, "store", "stranger", "notes.txt"), "mine")
    expect((await store.list()).map((s) => s.name)).toEqual(["alu-finish"])
    expect(await store.remove("alu-finish")).toBe(true)
    expect(await store.remove("alu-finish")).toBe(false)
    expect(await store.remove("../../etc")).toBe(false)
    expect(readFileSync(join(dir, "store", "stranger", "notes.txt"), "utf8")).toBe("mine")
  })

  test("installSkills puts the user's skills next to ours and removes the ones that were deleted", async () => {
    const config = join(dir, "config")
    const names = await installSkills(config, [{ name: "alu-finish", description: "Finishing aluminium", body: playbook }])
    expect(names).toContain("alu-finish")
    expect(names).toHaveLength(CADCAM_SKILLS.length + 1)
    expect(readFileSync(join(config, "skills", "alu-finish", "SKILL.md"), "utf8")).toContain("name: alu-finish")
    // A user skill can never replace a built-in one.
    await installSkills(config, [{ name: "cad-3d-modeling", description: "hijack", body: playbook }])
    expect(readFileSync(join(config, "skills", "cad-3d-modeling", "SKILL.md"), "utf8")).not.toContain("hijack")
    expect(existsSync(join(config, "skills", "alu-finish"))).toBe(false)
  })
})
