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
import { agentSystemPrompt, MODE_PROMPTS, modelFamilyPrompt, type ModelFamily } from "./system.ts"
import * as workflows from "./workflows.ts"

/** Where a text goes: always in the system prompt, as a tool's description, loaded on demand, or in a one-shot call. */
export type PromptKind = "static" | "description" | "skill" | "workflow"

export interface PromptEntry {
  readonly source: string
  readonly kind: PromptKind
  readonly text: string
}

/** A model id per family, to read each family's style block through the same function a turn uses. */
const FAMILY_SAMPLES: Readonly<Record<Exclude<ModelFamily, "claude">, string>> = { codex: "gpt-5", autonomous: "o3", gemini: "gemini-2.5-pro", other: "local-model" }

const isTemplate = (value: unknown): value is workflows.PromptTemplate =>
  typeof value === "object" && value !== null && "system" in value && "user" in value && "variables" in value

export const promptCorpus = (): ReadonlyArray<PromptEntry> => [
  { source: "system", kind: "static", text: agentSystemPrompt() },
  ...Object.entries(MODE_PROMPTS).map(([mode, text]) => ({ source: `mode/${mode}`, kind: "static" as const, text })),
  ...Object.entries(FAMILY_SAMPLES).map(([family, model]) => ({ source: `family/${family}`, kind: "static" as const, text: modelFamilyPrompt(model) })),
  ...SUBAGENT_IDS.map((role) => ({ source: `specialist/${role}`, kind: "static" as const, text: specialistPrompt(role) })),
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
  /** All tool descriptions together (they are sent as a set). */
  descriptions: 27_000,
  /** One tool description. */
  description: 4_000,
  /** One skill body. */
  skill: 17_000,
  /** All skill descriptions together (the `skill` tool lists them on every request). */
  skillDescriptions: 2_600,
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
