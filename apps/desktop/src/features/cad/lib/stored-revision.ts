/**
 * The `updatedAt` of each stored drawing as this editor last saw it (opened, read back, or saved).
 *
 * A save sends it as `baseUpdatedAt`: the sidecar refuses the write when anyone else (the assistant, the phone, another
 * window) saved the drawing since, so an editor can never silently replace work it has not seen. Without an entry the
 * editor has not read the drawing yet and must read it before it may write.
 */
const known = new Map<string, string>()

export const noteStoredRevision = (drawingId: string, updatedAt: unknown): void => {
  if (typeof updatedAt === "string" && updatedAt !== "") known.set(drawingId, updatedAt)
}
export const storedRevisionOf = (drawingId: string): string | undefined => known.get(drawingId)
export const forgetStoredRevision = (drawingId?: string): void => { if (drawingId === undefined) known.clear(); else known.delete(drawingId) }

/** Whether an error from the typed client is the sidecar's "saved elsewhere" refusal (HTTP 409 `Conflict`). */
export const isSaveConflict = (cause: unknown): boolean => {
  const seen = new Set<unknown>()
  const visit = (value: unknown, depth: number): boolean => {
    if (value === null || typeof value !== "object" || seen.has(value) || depth > 4) return false
    seen.add(value)
    const record = value as { _tag?: unknown; status?: unknown; message?: unknown; error?: unknown; cause?: unknown }
    if (record._tag === "Conflict" || record.status === 409) return true
    if (typeof record.message === "string" && record.message.includes("saved elsewhere")) return true
    return visit(record.error, depth + 1) || visit(record.cause, depth + 1)
  }
  return visit(cause, 0)
}
