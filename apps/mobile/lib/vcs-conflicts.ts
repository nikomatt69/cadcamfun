import { CompanionError } from "./client"

/**
 * A merge that cannot be applied cleanly names the files that disagree. The desktop answers a 409 with
 * `Merge conflicts: <path> <pointer>,<pointer>; <path> <pointer>`, so the phone reads the same sentence back
 * to the user instead of "Merge conflicts" with no way to act on it.
 */
export interface VcsConflict {
  readonly path: string
  /** The JSON pointers inside the file that disagree. */
  readonly pointers: readonly string[]
}

const PREFIX = "Merge conflicts:"

/** The conflicts in a failure message; empty when the failure was something else. */
export const parseConflicts = (message: string): readonly VcsConflict[] => {
  const body = message.startsWith(PREFIX) ? message.slice(PREFIX.length).trim() : ""
  if (!body) return []
  return body.split(";").map((part) => {
    const trimmed = part.trim()
    const space = trimmed.indexOf(" ")
    if (space < 0) return { path: trimmed, pointers: [] as readonly string[] }
    const path = trimmed.slice(0, space).trim()
    const pointers = trimmed.slice(space + 1).split(",").map((pointer) => pointer.trim()).filter(Boolean)
    return { path, pointers }
  }).filter((conflict) => conflict.path.length > 0)
}

/** The conflicts of a failed merge, or none when the failure was not a conflict. */
export const conflictsOf = (error: unknown): readonly VcsConflict[] => {
  if (!(error instanceof CompanionError) || error.status !== 409) return []
  return parseConflicts(error.message)
}

/** One sentence for the phone: which files disagree and where. */
export const conflictSummary = (conflicts: readonly VcsConflict[]): string => {
  if (conflicts.length === 0) return ""
  const files = conflicts.map((conflict) => conflict.path).join(", ")
  return `${conflicts.length === 1 ? "1 file conflicts" : `${conflicts.length} files conflict`}: ${files}`
}
