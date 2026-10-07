/**
 * Skills the user loads: a `SKILL.md` (front matter `name` + `description`, then a playbook in Markdown) kept under
 * `<dataDir>/ai/skills/<name>/`. A skill is text the model reads when it decides the task fits; it cannot run anything or
 * widen the agent's permissions (those are fixed by the host config), so loading one is as safe as writing a prompt.
 * Built-in skill names are reserved, and everything is validated before it touches the disk.
 */
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { CADCAM_SKILLS, skillMarkdown, type CadCamSkill } from "./index.ts"

export const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
export const MAX_SKILL_NAME = 64
export const MAX_SKILL_DESCRIPTION = 300
export const MAX_SKILL_BODY = 20_000
export const MAX_USER_SKILLS = 50

export interface UserSkill {
  readonly name: string
  readonly description: string
  readonly body: string
}

export type SkillResult<A> = { readonly ok: true; readonly value: A } | { readonly ok: false; readonly problems: ReadonlyArray<string> }

/** Everything wrong with a skill, in one list (empty when it can be loaded). */
export const skillProblems = (skill: { readonly name: string; readonly description: string; readonly body: string }): string[] => {
  const problems: string[] = []
  if (skill.name.length === 0 || skill.name.length > MAX_SKILL_NAME || !SKILL_NAME_PATTERN.test(skill.name)) {
    problems.push(`name must be lower-case words joined by "-" (letters, digits), at most ${MAX_SKILL_NAME} characters`)
  }
  if (CADCAM_SKILLS.some((s) => s.name === skill.name)) problems.push(`"${skill.name}" is the name of a built-in skill`)
  if (skill.description.trim().length === 0) problems.push("description is required: it is what tells the model when to load the skill")
  if (skill.description.length > MAX_SKILL_DESCRIPTION) problems.push(`description is longer than ${MAX_SKILL_DESCRIPTION} characters`)
  if (/[\r\n]/.test(skill.description)) problems.push("description must be one line")
  if (skill.body.trim().length < 20) problems.push("the playbook is empty or too short to be useful")
  if (skill.body.length > MAX_SKILL_BODY) problems.push(`the playbook is longer than ${MAX_SKILL_BODY} characters`)
  return problems
}

const unquote = (value: string): string => {
  const v = value.trim()
  if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) {
    if (v.startsWith('"')) {
      try { return JSON.parse(v) as string } catch { return v.slice(1, -1) }
    }
    return v.slice(1, -1)
  }
  return v
}

/** Reads a `SKILL.md`: front matter between `---` lines, then the body. */
export const parseSkillMarkdown = (text: string): SkillResult<UserSkill> => {
  const match = /^﻿?---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text)
  if (match === null) return { ok: false, problems: ["the file must start with a front matter block: ---, name, description, ---"] }
  const fields = new Map<string, string>()
  for (const line of match[1]!.split(/\r?\n/)) {
    const colon = line.indexOf(":")
    if (colon > 0 && !line.startsWith(" ")) fields.set(line.slice(0, colon).trim(), unquote(line.slice(colon + 1)))
  }
  const skill = { name: fields.get("name") ?? "", description: fields.get("description") ?? "", body: match[2]!.trim() }
  const problems = skillProblems(skill)
  return problems.length > 0 ? { ok: false, problems } : { ok: true, value: skill }
}

export const userSkillMarkdown = (skill: UserSkill): string =>
  skillMarkdown({ name: skill.name, description: skill.description, category: "user", tags: ["user"], body: skill.body } satisfies CadCamSkill)

export interface UserSkillStore {
  readonly list: () => Promise<ReadonlyArray<UserSkill>>
  readonly save: (skill: UserSkill) => Promise<SkillResult<UserSkill>>
  readonly remove: (name: string) => Promise<boolean>
}

/** Skills kept as `<dir>/<name>/SKILL.md`. A folder that does not hold a valid skill is ignored, never deleted. */
export const createUserSkillStore = (dir: string): UserSkillStore => ({
  list: async () => {
    let names: string[]
    try { names = await readdir(dir) } catch { return [] }
    const skills: UserSkill[] = []
    for (const name of names.sort()) {
      try {
        const parsed = parseSkillMarkdown(await readFile(join(dir, name, "SKILL.md"), "utf8"))
        if (parsed.ok && parsed.value.name === name) skills.push(parsed.value)
      } catch { /* not a skill folder */ }
    }
    return skills
  },
  save: async (skill) => {
    const problems = skillProblems(skill)
    if (problems.length > 0) return { ok: false, problems }
    const known = await createUserSkillStore(dir).list()
    if (!known.some((s) => s.name === skill.name) && known.length >= MAX_USER_SKILLS) {
      return { ok: false, problems: [`at most ${MAX_USER_SKILLS} skills can be loaded; remove one first`] }
    }
    const folder = join(dir, skill.name)
    await mkdir(folder, { recursive: true })
    await writeFile(join(folder, "SKILL.md"), userSkillMarkdown(skill))
    return { ok: true, value: skill }
  },
  remove: async (name) => {
    if (!SKILL_NAME_PATTERN.test(name)) return false
    const existing = (await createUserSkillStore(dir).list()).some((s) => s.name === name)
    if (existing) await rm(join(dir, name), { recursive: true, force: true })
    return existing
  }
})
