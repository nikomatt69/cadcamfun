/**
 * The webview half of the desktop updater (spec 10 §3). The shell checks and announces on `update://status`; installing is the
 * webview's decision because only it knows whether an editor holds unsaved work. Unsaved work is written first (the same save the
 * autosave takes), and whatever is still unwritten after that is reported to the shell, which refuses to interrupt it.
 */
import type { ProjectSession } from "../features/projects/lib/project-session.ts"

export type UpdateEvent =
  | { readonly status: "checking" }
  | { readonly status: "upToDate"; readonly version: string }
  | { readonly status: "available"; readonly version: string; readonly notes: string; readonly date?: string | null; readonly critical: boolean; readonly dismissible: boolean }
  | { readonly status: "downloading"; readonly downloaded: number; readonly total?: number | null }
  | { readonly status: "ready"; readonly version: string }
  | { readonly status: "failed"; readonly message: string }

export type Invoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>

/** Narrows an event payload; anything that is not a known status is ignored. */
export const decodeUpdateEvent = (payload: unknown): UpdateEvent | undefined => {
  if (payload === null || typeof payload !== "object") return undefined
  const event = payload as { status?: unknown }
  return ["checking", "upToDate", "available", "downloading", "ready", "failed"].includes(String(event.status)) ? payload as UpdateEvent : undefined
}

/** Writes unsaved work, then installs; the shell gets the truth about what could not be written. */
export const installPendingUpdate = async (session: Pick<ProjectSession, "flush" | "hasUnsavedWork">, invoke: Invoke): Promise<string> => {
  try { await session.flush() } catch { /* still unsaved: the shell below refuses and says so */ }
  return await invoke("install_update", { unsavedWork: session.hasUnsavedWork() }) as string
}
