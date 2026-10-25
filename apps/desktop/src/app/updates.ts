/**
 * The webview half of the desktop updater (spec 10 §3). The shell checks and announces on `update://status`; installing is the
 * webview's decision because only it knows whether an editor holds unsaved work. Unsaved work is written first (the same save the
 * autosave takes), and whatever is still unwritten after that is reported to the shell, which refuses to interrupt it.
 *
 * What the dialog shows is a pure function of the shell's events (`reduceUpdate`): a check the person asked for is answered with
 * every outcome, a background check only speaks when a release is new, and a release the person put off stays quiet until a newer
 * one arrives or they ask again.
 */
import type { ProjectSession } from "../features/projects/lib/project-session.ts"

export type UpdateEvent =
  | { readonly status: "checking"; readonly manual?: boolean }
  | { readonly status: "upToDate"; readonly version: string; readonly manual?: boolean }
  | { readonly status: "available"; readonly version: string; readonly current?: string; readonly notes: string; readonly date?: string | null; readonly critical: boolean; readonly dismissible: boolean; readonly manual?: boolean }
  | { readonly status: "downloading"; readonly downloaded: number; readonly total?: number | null }
  | { readonly status: "ready"; readonly version: string }
  | { readonly status: "failed"; readonly message: string; readonly manual?: boolean }

export type AvailableUpdate = Extract<UpdateEvent, { readonly status: "available" }>

export type Invoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>

/** Narrows an event payload; anything that is not a known status is ignored. */
export const decodeUpdateEvent = (payload: unknown): UpdateEvent | undefined => {
  if (payload === null || typeof payload !== "object") return undefined
  const event = payload as { status?: unknown }
  return ["checking", "upToDate", "available", "downloading", "ready", "failed"].includes(String(event.status)) ? payload as UpdateEvent : undefined
}

/** What the update dialog is showing and what it remembers between events. */
export interface UpdateView {
  /** The state on screen (as a dialog, or as the chip when `minimized`). */
  readonly dialog: UpdateEvent | undefined
  /** The release the shell last announced: where an install that failed goes back to. */
  readonly available: AvailableUpdate | undefined
  /** The release the person put off; a background check does not bring it back. */
  readonly dismissedVersion: string | undefined
  /** A download or a pending restart that was hidden: it stays as a small chip, never forgotten. */
  readonly minimized: boolean
}

export const initialUpdateView: UpdateView = { dialog: undefined, available: undefined, dismissedVersion: undefined, minimized: false }

const show = (view: UpdateView, dialog: UpdateEvent): UpdateView => ({ ...view, dialog, minimized: false })

export const reduceUpdate = (view: UpdateView, event: UpdateEvent): UpdateView => {
  const manual = "manual" in event && event.manual === true
  switch (event.status) {
    case "checking": return manual ? show(view, event) : view
    case "upToDate": return manual ? show(view, event) : view.dialog?.status === "checking" ? { ...view, dialog: undefined } : view
    case "failed": return manual ? show(view, event) : view.dialog?.status === "checking" ? { ...view, dialog: undefined } : view
    case "available": {
      const next = { ...view, available: event }
      // A download or a pending restart is more important than another announcement of the same release.
      if (view.dialog?.status === "downloading" || view.dialog?.status === "ready") return next
      // A critical release cannot be put off, so it is always shown; any other one only when it is new to the person or asked for.
      return manual || event.critical || event.version !== view.dismissedVersion ? show(next, event) : next
    }
    case "downloading": return { ...view, dialog: event }
    case "ready": return show(view, event)
  }
}

/** "Later" / close: a release is put off, a download or a restart shrinks to the chip, anything else goes away. */
export const dismissUpdate = (view: UpdateView): UpdateView => {
  const dialog = view.dialog
  if (dialog === undefined) return view
  if (dialog.status === "available") return { ...view, dialog: undefined, dismissedVersion: dialog.version }
  if (dialog.status === "downloading" || dialog.status === "ready") return { ...view, minimized: true }
  return { ...view, dialog: undefined }
}

/** The chip was clicked: the dialog it stands for comes back. */
export const reopenUpdate = (view: UpdateView): UpdateView => ({ ...view, minimized: false })

/** An install that failed leaves the release on offer, so it can be tried again. */
export const installFailed = (view: UpdateView): UpdateView =>
  view.available === undefined ? { ...view, dialog: undefined, minimized: false } : show(view, view.available)

/** The release notes as the person reads them: the shell's `[critical]` marker is machine text. */
export const releaseNotesOf = (notes: string): string => notes.replace(/\[critical\]/gi, "").trim()

/** Download progress as a whole percent, or nothing while the total is unknown. */
export const percentOf = (downloaded: number, total: number | null | undefined): number | undefined =>
  total === undefined || total === null || total <= 0 ? undefined : Math.min(100, Math.max(0, Math.floor((downloaded / total) * 100)))

export const formatBytes = (bytes: number): string => bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(0, Math.round(bytes / 1024))} KB`

/** Writes unsaved work, then installs; the shell gets the truth about what could not be written. */
export const installPendingUpdate = async (session: Pick<ProjectSession, "flush" | "hasUnsavedWork">, invoke: Invoke): Promise<string> => {
  try { await session.flush() } catch { /* still unsaved: the shell below refuses and says so */ }
  return await invoke("install_update", { unsavedWork: session.hasUnsavedWork() }) as string
}

/** Restarts into the installed update: whatever was edited since the install is written first, and unwritten work stops the restart. */
export const restartAfterUpdate = async (session: Pick<ProjectSession, "flush" | "hasUnsavedWork">, invoke: Invoke): Promise<void> => {
  try { await session.flush() } catch { /* checked below */ }
  if (session.hasUnsavedWork()) throw { reason: "unsavedWork" }
  await invoke("restart_app")
}

/** The shell is the only one that can check, and it can only be reached from the desktop app. */
export const inDesktopShell = (): boolean => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

/** Asks the shell for a check the person wants answered (the shell then emits `update://status`). */
export const checkForUpdates = async (invoke?: Invoke): Promise<boolean> => {
  if (invoke === undefined && !inDesktopShell()) return false
  const call = invoke ?? (await import("@tauri-apps/api/core")).invoke as Invoke
  await call("check_for_updates")
  return true
}

export const openReleaseNotes = async (invoke?: Invoke): Promise<boolean> => {
  if (invoke === undefined && !inDesktopShell()) return false
  const call = invoke ?? (await import("@tauri-apps/api/core")).invoke as Invoke
  await call("open_release_notes")
  return true
}
