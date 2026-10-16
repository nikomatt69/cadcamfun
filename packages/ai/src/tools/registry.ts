/**
 * The tool registry: the tools the `cadcam` agent may call, in the order the model sees them. Every one of them is
 * built from the action catalogue (`actions/catalogue.ts`) by `defineActionTool`, so a capability the model can reach
 * is declared exactly once; extension tools (`ToolDefinition`s from outside this package) are passed to `buildTools`
 * and registered next to these.
 */
import type { HostToolSpec } from "../nikcli/runtime.ts"
import { EXPOSED_TOOL_IDS } from "../actions/catalogue.ts"
import type { ActionContribution } from "../actions/action.ts"
import { toSpec, type ToolContext, type ToolDefinition } from "./define.ts"
import type { ActionTool } from "./action.ts"
import type { ToolHandlersShape } from "./handlers.ts"
import { cadTool } from "./cad.ts"
import { cadEditTool } from "./cad_edit.ts"
import { camTool } from "./cam.ts"
import { camEditTool } from "./cam_edit.ts"
import { camVerifyTool } from "./cam_verify.ts"
import { libraryTool } from "./library.ts"
import { partsTool } from "./parts.ts"
import { libraryEditTool } from "./library_edit.ts"
import { memoryTool } from "./memory.ts"
import { memoryEditTool } from "./memory_edit.ts"
import { modsTool } from "./mods.ts"
import { modsEditTool } from "./mods_edit.ts"
import { researchTool } from "./research.ts"
import { vcsTool } from "./vcs.ts"
import { vcsEditTool } from "./vcs_edit.ts"
import { agentTool } from "./agent.ts"

/** The built-in tools, in catalogue order, then the exposures. Every id is an action tool: there is no second declaration path. */
export const BUILT_IN_TOOLS: ReadonlyArray<ActionTool> = [
  cadTool, cadEditTool, camTool, camEditTool,
  libraryTool, partsTool, libraryEditTool,
  memoryTool, memoryEditTool, researchTool,
  vcsTool, vcsEditTool, agentTool,
  camVerifyTool, modsTool, modsEditTool
] as const

/** The built-in tool ids; derived from the catalogue (groups and exposures) so the two cannot drift. */
export const TOOL_IDS: ReadonlyArray<string> = [...EXPOSED_TOOL_IDS]

/**
 * The host tools of one project: the catalogue's tools plus any extension tools (an id may not repeat).
 * `contributions` are the implementations the application supplies for the actions it owns (libraries, version
 * control, delegation); a host that does not supply one answers "not available in this host".
 */
export const buildTools = (
  handlers: ToolHandlersShape,
  projectId: string,
  extensions: ReadonlyArray<ToolDefinition> = [],
  contributions: Readonly<Record<string, ActionContribution>> = {}
): ReadonlyArray<HostToolSpec> => {
  const context: ToolContext & { contributions: Readonly<Record<string, ActionContribution>> } = { handlers, projectId, contributions }
  const all: ReadonlyArray<ToolDefinition> = [...BUILT_IN_TOOLS, ...extensions]
  const seen = new Set<string>()
  for (const tool of all) {
    if (seen.has(tool.id)) throw new Error(`Duplicate tool id: ${tool.id}`)
    seen.add(tool.id)
  }
  return all.map((tool) => toSpec(tool, context))
}