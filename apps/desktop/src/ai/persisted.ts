/**
 * Tiny localStorage-backed JSON helper, used by the AI store (spec 06-desktop-ui.md
 * §1; spec 08-ai.md §6 storage rule: nikcli state stays in the project data dir).
 *
 * No third-party storage primitive is needed: the AI store persists at most one
 * small JSON blob per workspace (model choice, included-context flag, recent
 * sessions). `try/catch` keeps the desktop boot path safe when the window has no
 * `localStorage` (Tauri tests, node-side unit tests).
 */
export const loadPersisted = <A,>(fallback: A): A => {
  if (typeof localStorage === "undefined") return fallback
  try {
    const raw = localStorage.getItem("cadcamfun/ai/store-v1")
    if (raw === null) return fallback
    return JSON.parse(raw) as A
  } catch {
    return fallback
  }
}

export const savePersisted = (value: unknown): void => {
  if (typeof localStorage === "undefined") return
  try {
    localStorage.setItem("cadcamfun/ai/store-v1", JSON.stringify(value))
  } catch {
    // quota / private mode — silently drop. The store keeps the in-memory copy.
  }
}