import type { HostToolSpec } from "./runtime.ts"
import { formatToolValidationError } from "../tool-validation.ts"

/** Native capabilities are owned by nikcli; the app only controls their exposure. */
export const NATIVE_TOOLS = [
  { id: "search_tools", description: "Discover and load permitted deferred tool schemas." },
  { id: "invalid", description: "Report an invalid tool name or arguments for correction." },
  { id: "code_mode", description: "Orchestrate permitted tools in nikcli's confined interpreter." },
  { id: "skill", description: "Read a registered CAD/CAM playbook." },
  { id: "question", description: "Ask the user for missing CAD/CAM requirements or decisions and await their answers." },
  { id: "todowrite", description: "Update the current work plan." },
  { id: "todoread", description: "Read the current work plan." },
  { id: "create_goal", description: "Start an objective tracked by the host." },
  { id: "get_goal", description: "Read the current objective and progress." },
  { id: "update_goal", description: "Update objective status after verification." }
] as const

export const SPECIALIST_NATIVE_TOOLS = ["search_tools", "invalid", "code_mode", "skill", "question"] as const

/** One project snapshot feeds permissions, registration and the visible catalogue. */
export class HostToolRegistry {
  readonly #projects = new Map<string, ReadonlyArray<HostToolSpec>>()
  constructor(readonly build: (projectId: string) => ReadonlyArray<HostToolSpec>) {}

  tools(projectId: string): ReadonlyArray<HostToolSpec> {
    const cached = this.#projects.get(projectId)
    if (cached) return cached
    const seen = new Set<string>(NATIVE_TOOLS.map((tool) => tool.id))
    const tools = this.build(projectId).map((tool) => {
      if (!/^[a-z][a-z0-9_]{0,79}$/.test(tool.id) || seen.has(tool.id)) throw new Error(`Invalid or duplicate host tool id: ${tool.id}`)
      seen.add(tool.id)
      return Object.freeze({ ...tool, formatValidationError: tool.formatValidationError ?? ((error) => formatToolValidationError(tool.id, error)) })
    })
    const snapshot = Object.freeze(tools)
    this.#projects.set(projectId, snapshot)
    return snapshot
  }

  ids(projectId: string): ReadonlyArray<string> { return this.tools(projectId).map((tool) => tool.id) }
  /** The tools the host asks about before every call (see `HostToolSpec.approval`). */
  approvalIds(projectId: string): ReadonlyArray<string> { return this.tools(projectId).filter((tool) => tool.approval === true).map((tool) => tool.id) }
  catalogue(projectId: string): ReadonlyArray<{ readonly id: string; readonly description: string }> {
    return [...this.tools(projectId).map(({ id, description }) => ({ id, description })), ...NATIVE_TOOLS]
  }
}
