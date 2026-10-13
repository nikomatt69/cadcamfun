/// <reference path="../../text.d.ts" />
/**
 * The prompt of every tool, one `.txt` file per tool (the way nikcli keeps its own tool prompts): what it is for, every
 * action it carries with every parameter of every action, the shape of the result, the errors and what to call next.
 * The text is what the model reads as the tool's description, so editing a file edits the tool.
 *
 * One prompt per tool, not per action (spec 26 §2.3): the long reference material lives in the skills
 * (`skills/index.ts`), which the model loads on demand with the `skill` tool.
 */
import cad from "./cad.txt" with { type: "text" }
import cad_edit from "./cad_edit.txt" with { type: "text" }
import cam from "./cam.txt" with { type: "text" }
import cam_edit from "./cam_edit.txt" with { type: "text" }
import library from "./library.txt" with { type: "text" }
import parts from "./parts.txt" with { type: "text" }
import library_edit from "./library_edit.txt" with { type: "text" }
import memory from "./memory.txt" with { type: "text" }
import memory_edit from "./memory_edit.txt" with { type: "text" }
import research from "./research.txt" with { type: "text" }
import vcs from "./vcs.txt" with { type: "text" }
import vcs_edit from "./vcs_edit.txt" with { type: "text" }
import agent from "./agent.txt" with { type: "text" }

const PROMPTS = {
  cad,
  cad_edit,
  cam,
  cam_edit,
  library,
  parts,
  library_edit,
  memory,
  memory_edit,
  research,
  vcs,
  vcs_edit,
  agent
} as const

export type ToolPromptId = keyof typeof PROMPTS
export const TOOL_PROMPT_IDS = Object.keys(PROMPTS) as ReadonlyArray<ToolPromptId>

export const toolPrompt = (id: ToolPromptId): string => PROMPTS[id].trim()

/** The raw text (for the tests). */
export const rawToolPrompt = (id: ToolPromptId): string => PROMPTS[id]