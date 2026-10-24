/**
 * The recovery draft: a drawing that is not in a project yet has nowhere to be autosaved, so the editor keeps a copy in the
 * browser storage of the app. If the app is closed or crashes before the first save, the next start offers the work back.
 *
 * One slot, not one per document: a drawing in a project is recovered from its restore points, so the draft only ever holds
 * the unsaved scratch drawing.
 */
const KEY = "cadcamfun.draft.v1"

export interface Draft {
  readonly savedAt: number
  readonly elements: ReadonlyArray<Record<string, unknown>>
  readonly layers: ReadonlyArray<Record<string, unknown>>
}

const storage = (): Storage | undefined => {
  try { return globalThis.localStorage } catch { return undefined }
}

/** Stores the draft; an empty drawing clears it. Returns false when the storage refused (full, blocked). */
export const writeDraft = (draft: Omit<Draft, "savedAt">, now = Date.now()): boolean => {
  const store = storage()
  if (store === undefined) return false
  try {
    if (draft.elements.length === 0) { store.removeItem(KEY); return true }
    store.setItem(KEY, JSON.stringify({ savedAt: now, ...draft }))
    return true
  } catch {
    // A drawing larger than the quota is simply not recoverable from here; editing is never blocked by it.
    return false
  }
}

export const readDraft = (): Draft | undefined => {
  const store = storage()
  if (store === undefined) return undefined
  try {
    const raw = store.getItem(KEY)
    if (raw === null) return undefined
    const value = JSON.parse(raw) as Partial<Draft>
    if (typeof value.savedAt !== "number" || !Array.isArray(value.elements) || value.elements.length === 0) return undefined
    return { savedAt: value.savedAt, elements: value.elements, layers: Array.isArray(value.layers) ? value.layers : [] }
  } catch {
    return undefined
  }
}

export const clearDraft = (): void => {
  try { storage()?.removeItem(KEY) } catch { /* nothing to clear */ }
}
