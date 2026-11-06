/**
 * Every text the model reads, in one list (AI-11 Step 7): the base system prompt, the modes, the model-family styles, the
 * specialist prompts, the tool descriptions, the skills and the one-shot workflows. The tests walk this list to hold the
 * text to the code: every action it names exists in the catalogue, no prose uses the retired nested `action: "..."`
 * phrasing, every executable example builds, and each kind stays inside its own budget.
 */
import { ACTION_EXPOSURES, actionsOf, EXPOSED_TOOL_IDS } from "../actions/catalogue.ts"
import { SUBAGENT_IDS } from "../nikcli/agents.ts"
import { specialistPrompt } from "../nikcli/prompts/index.ts"
import { CADCAM_SKILLS } from "../skills/index.ts"
import { TOOL_PROMPT_IDS, toolPrompt } from "../tools/prompts/index.ts"
import { agentSystemPrompt, FAMILY_SAMPLE_MODELS, MODE_PROMPTS, modelFamilyPrompt } from "./system.ts"
import * as workflows from "./workflows.ts"
import delegation from "./awareness/delegation.txt" with { type: "text" }
import research from "./awareness/research.txt" with { type: "text" }
import mods from "./awareness/mods.txt" with { type: "text" }
import planMode from "./reminders/plan-mode.txt" with { type: "text" }
import buildSwitch from "./reminders/build-switch.txt" with { type: "text" }
import compaction from "../nikcli/prompts/compaction.txt" with { type: "text" }
import memory from "../nikcli/prompts/memory.txt" with { type: "text" }

/** Where a text goes: always in the system prompt, as a tool's description, loaded on demand, or in a one-shot call. */
export type PromptKind = "static" | "description" | "skill" | "workflow"

export interface PromptEntry {
  readonly source: string
  readonly kind: PromptKind
  readonly text: string
}

const isTemplate = (value: unknown): value is workflows.PromptTemplate =>
  typeof value === "object" && value !== null && "system" in value && "user" in value && "variables" in value

export const promptCorpus = (): ReadonlyArray<PromptEntry> => [
  { source: "system", kind: "static", text: agentSystemPrompt() },
  ...Object.entries(MODE_PROMPTS).map(([mode, text]) => ({ source: `mode/${mode}`, kind: "static" as const, text })),
  // One sample model id per family (`FAMILY_SAMPLE_MODELS`), read through the same function a turn uses.
  ...Object.entries(FAMILY_SAMPLE_MODELS).map(([family, model]) => ({ source: `family/${family}`, kind: "static" as const, text: modelFamilyPrompt(model) })),
  ...SUBAGENT_IDS.map((role) => ({ source: `specialist/${role}`, kind: "static" as const, text: specialistPrompt(role) })),
  ...Object.entries({ delegation, research, mods, planMode, buildSwitch, compaction, memory })
    .map(([name, text]) => ({ source: `support/${name}`, kind: "static" as const, text: text.trim() })),
  ...TOOL_PROMPT_IDS.map((tool) => ({ source: `tool/${tool}`, kind: "description" as const, text: toolPrompt(tool) })),
  ...CADCAM_SKILLS.map((skill) => ({ source: `skill/${skill.name}`, kind: "skill" as const, text: skill.body })),
  ...Object.entries(workflows).filter((entry): entry is [string, workflows.PromptTemplate] => isTemplate(entry[1]))
    .map(([name, template]) => ({ source: `workflow/${name}`, kind: "workflow" as const, text: `${template.system}\n\n${template.user}` }))
]

/**
 * Separate budgets, in characters: the static prompts are paid on every turn, descriptions on every request that lists the
 * tools, a skill only when the model loads it, a workflow only on its own call.
 */
export const PROMPT_BUDGETS = {
  /** The base system prompt with every layer. */
  system: 13_000,
  /** One mode, one family style or one specialist prompt. */
  staticEntry: 10_000,
  /** All tool descriptions together (they are sent as a set). Raised from 27 000 when the mods and mods_edit tools joined (RM-11): their two descriptions cost about 5 200 characters. Raised from 34 000 when the smoothing and timeline actions (spec 58 T7) joined: 34 279 on main. Raised to 35 600 when cad_edit parametric_edit (structural edits of a stored part) joined, to 36 000 when the build verification result (volume, bounds, attention) joined cad and cad_edit, to 36 500 when memory brain_read (the whole host memory file, paged) joined, to 37 000 when cam verify_nc (foreign NC replay) and the review's modelChange joined, to 37 300 with cam regenerate, to 37 800 with the saved-setup actions (RM-02). */
  // 38 100 since cam_edit probe / probe_run / probe_apply and the machine probing fields of library_edit (spec 73).
  descriptions: 38_200,
  /** One tool description (5 300, in step with tool-prompts.test.ts: cad and cad_edit carry the whole parametric surface; cam carries verify_nc, regenerate and the setup actions, specs 72, 59 and RM-02). */
  description: 5_300,
  /** One skill body. */
  skill: 17_000,
  /** All skill descriptions together (the `skill` tool lists them on every request). Raised from 2 600 to 3 300: 23 skills now cost 3 199 (fea-simulation, cam-turning, cam-post, cad-workflow, fusion-360-modelling joined). */
  skillDescriptions: 3_300,
  /** One workflow, system and user prompt together. */
  workflow: 3_000
} as const

export interface ActionReference {
  readonly tool: string
  readonly action: string
  readonly index: number
}

/**
 * The actions a text names: "`cad` action `check`", "cad action check", "cad_edit.parametric_create" and
 * "tools.cam_edit({ action: "verify" ...". Only names of real tools count, so prose such as "the action plan" is ignored.
 */
export const actionReferences = (text: string): ReadonlyArray<ActionReference> => {
  const tools = new Set(EXPOSED_TOOL_IDS)
  const found: ActionReference[] = []
  for (const pattern of [/`?\b([a-z_]+)`? action `?([a-z_]+)`?/g, /\b([a-z_]+)\.([a-z_]+)\b/g, /tools\.([a-z_]+)\(\{\s*action:\s*"([a-z_]+)"/g]) {
    for (const match of text.matchAll(pattern)) {
      const [, tool = "", action = ""] = match
      if (tools.has(tool)) found.push({ tool, action, index: match.index })
    }
  }
  return found
}

/** Whether a tool the model sees carries the action (an exposure carries only the actions it re-exposes). */
export const actionExists = (tool: string, action: string): boolean => {
  const exposure = ACTION_EXPOSURES[tool]
  return exposure !== undefined ? exposure.some((id) => id.endsWith(`.${action}`)) : actionsOf(tool)[action] !== undefined
}

/**
 * `action: "x"` written in prose rather than as the discriminator of a tool call: the retired nested form
 * ("`cad` action `inspect_elements` with `action: "search"`"). Every action is now a first-level action of its tool.
 */
export const nestedActionPhrases = (text: string): ReadonlyArray<string> =>
  [...text.matchAll(/action: "([a-z_]+)"/g)]
    .filter((match) => !/\(\{\s*$/.test(text.slice(Math.max(0, match.index - 40), match.index)))
    .map((match) => text.slice(Math.max(0, match.index - 60), match.index + match[0].length))

/** JSON examples a text quotes: fenced ```json blocks and inline `{"...}` spans. Placeholders such as `{...}` are not JSON. */
export const jsonExamples = (text: string): ReadonlyArray<{ readonly raw: string; readonly value: unknown }> =>
  [...text.matchAll(/`(\{"[^`]*\})`|```json\n([\s\S]*?)```/g)].flatMap((match) => {
    const raw = (match[1] ?? match[2] ?? "").trim()
    try {
      return [{ raw, value: JSON.parse(raw) as unknown }]
    } catch {
      return []
    }
  })
