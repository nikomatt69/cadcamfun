/**
 * The two files native Brain maintains inside a project's scratch directory, read back so the loop actually closes.
 *
 * The host's `Instruction` service would normally pick them up as project rule files
 * (`LOCAL_RULE_FILES = ["AGENTS.md", "CLAUDE.md", "CONTEXT.md", ".github/instructions/memory.instruction.md"]`,
 * `index.js:35990`) — but `isolation.ts` sets `NIKCLI_DISABLE_PROJECT_CONFIG=1` on purpose, because a CAD
 * application must never read a user's coding-agent files. That flag also hides the Brain's own output, so without
 * this module nikcli writes a memory file nobody ever reads again.
 *
 * `<project_root>/.nikcli/habits.md` was injected by the host through `Profile.reminder` as well; the `profile-reminder`
 * host patch turns that off, so this bounded read (never longer than `USER_HABITS_BUDGET`) is the one delivery, through
 * the application's context assembly, and none when a turn disables context.
 *
 * Reads are bounded, cached for `CACHE_TTL_MS`, and every failure degrades to "no block": a missing, unreadable or
 * oversized memory file must never fail a chat turn.
 */
import { join } from "node:path"
import type { ProjectHost } from "./runtime.ts"

const CACHE_TTL_MS = 30_000
/** A memory file is prose, not a database; anything larger is a runaway and is ignored rather than truncated into the prompt. */
const MAX_FILE_BYTES = 64 * 1024

export const projectMemoryFile = (directory: string): string => join(directory, ".github", "instructions", "memory.instruction.md")
export const projectHabitsFile = (directory: string): string => join(directory, ".nikcli", "habits.md")

export interface ProjectMemoryFiles {
  /** `brain/index.ts` `memoryPath` (`:273712`): what earlier sessions established about this project. */
  readonly memory: string
  /** `profile/index.ts` `Profile.habitsFile` (`:35333`): how the person working on it works. */
  readonly habits: string
}

const EMPTY: ProjectMemoryFiles = { memory: "", habits: "" }

const cache = new Map<string, { readonly at: number; readonly value: ProjectMemoryFiles }>()

const readText = async (path: string): Promise<string> => {
  const file = Bun.file(path)
  if (!(await file.exists())) return ""
  if (file.size > MAX_FILE_BYTES) return ""
  return (await file.text()).slice(0, MAX_FILE_BYTES)
}

/** Cached per project directory for `CACHE_TTL_MS`; `invalidateProjectMemoryFiles` drops it after a Brain consolidation. */
export const readProjectMemoryFiles = async (host: ProjectHost): Promise<ProjectMemoryFiles> => {
  const hit = cache.get(host.directory)
  if (hit !== undefined && Date.now() - hit.at < CACHE_TTL_MS) return hit.value
  let value: ProjectMemoryFiles
  try {
    const [memory, habits] = await Promise.all([readText(projectMemoryFile(host.directory)), readText(projectHabitsFile(host.directory))])
    value = memory.trim() === "" && habits.trim() === "" ? EMPTY : { memory, habits }
  } catch {
    // A read that throws is a missing block, never a failed turn.
    value = EMPTY
  }
  cache.set(host.directory, { at: Date.now(), value })
  return value
}

export const invalidateProjectMemoryFiles = (directory?: string): void => {
  if (directory === undefined) cache.clear()
  else cache.delete(directory)
}
