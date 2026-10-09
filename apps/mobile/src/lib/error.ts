/**
 * Extract a readable message from anything thrown.
 *
 * Tauri commands that return `Result<T, E>` serialise `E` to the JS side as a plain object (often
 * `{ kind: "...", message: "..." }`). The naive `String(e)` then produces the useless `[object Object]`,
 * which is the most common cause of a "nothing happened" bug: the error fires, the UI shows a generic
 * blob, and the user thinks the screen froze.
 */
export const errorMessage = (e: unknown): string => {
  if (e === undefined || e === null) return "Unknown error"
  if (typeof e === "string") return e
  if (typeof e === "number") return String(e)
  if (e instanceof Error && e.message) return e.message
  if (typeof e === "object") {
    const obj = e as Record<string, unknown>
    for (const k of ["message", "error", "reason", "detail"] as const) {
      const v = obj[k]
      if (typeof v === "string" && v.length > 0) return v
    }
    try {
      return JSON.stringify(e)
    } catch {
      return "Unknown error"
    }
  }
  return String(e)
}