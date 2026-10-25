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
  | { readonly status: "downloaded"; readonly version: string; readonly critical?: boolean }
  | { readonly status: "installing"; readonly version: string }
  | { readonly status: "ready"; readonly version: string }
  | { readonly status: "failed"; readonly message: string; readonly manual?: boolean }

export type AvailableUpdate = Extract<UpdateEvent, { readonly status: "available" }>

export type Invoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>

let applyingCommand = false, nativeInstalling = false
export const updateBlocksClose = (): boolean => applyingCommand || nativeInstalling

/** Check the wire boundary before malformed native events can reach the dialog. */
export const decodeUpdateEvent = (payload: unknown): UpdateEvent | undefined => {
  if (payload === null || typeof payload !== "object") return undefined
  const event = payload as Record<string, unknown>
  if (event.manual !== undefined && typeof event.manual !== "boolean") return undefined
  if (event.dismissible !== undefined && typeof event.dismissible !== "boolean") return undefined
  const version = (): boolean => typeof event.version === "string" && event.version.length > 0
  const size = (value: unknown): boolean => typeof value === "number" && Number.isSafeInteger(value) && value >= 0
  let valid = false
  switch (event.status) {
    case "checking": valid = true; break
    case "upToDate": case "installing": case "ready": valid = version(); break
    case "downloaded": valid = version() && (event.critical === undefined || typeof event.critical === "boolean"); break
    case "failed": valid = typeof event.message === "string"; break
    case "downloading": valid = size(event.downloaded) && (event.total == null || size(event.total)); break
    case "available": valid = version() && typeof event.notes === "string" && typeof event.critical === "boolean"
      && typeof event.dismissible === "boolean" && (event.current === undefined || typeof event.current === "string")
      && (event.date == null || typeof event.date === "string"); break
  }
  return valid ? payload as UpdateEvent : undefined
}

/** Subscribe first, then recover a launch result; a late snapshot never replaces a live event. */
export const observeUpdates = async (
  receive: (event: UpdateEvent) => void,
  listen: (receive: (payload: unknown) => void) => Promise<() => void>,
  invoke: Invoke
): Promise<() => void> => {
  let active = true, live = false
  const deliver = (event: UpdateEvent): void => { nativeInstalling = event.status === "installing"; receive(event) }
  const stop = await listen((payload) => {
    const event = decodeUpdateEvent(payload)
    if (!active || event === undefined) return
    live = true
    deliver(event)
  })
  void invoke("get_update_status").then((payload) => {
    const event = decodeUpdateEvent(payload)
    if (active && !live && event !== undefined) deliver(event)
  }).catch(() => undefined)
  return () => { active = false; stop() }
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
  // A manual check during a download or after installation must not hide its progress/restart action.
  const active = view.dialog !== undefined && ["downloading", "downloaded", "installing", "ready"].includes(view.dialog.status)
  if (active && ["checking", "upToDate", "failed"].includes(event.status)) return view
  const manual = "manual" in event && event.manual === true
  switch (event.status) {
    case "checking": return manual ? show(view, event) : view
    case "upToDate": return manual ? show(view, event) : view.dialog?.status === "checking" ? { ...view, dialog: undefined } : view
    case "failed": return manual ? show(view, event) : view.dialog?.status === "checking" ? { ...view, dialog: undefined } : view
    case "available": {
      const next = { ...view, available: event }
      // A download or a pending restart is more important than another announcement of the same release.
      if (active) return next
      // A critical release cannot be put off, so it is always shown; any other one only when it is new to the person or asked for.
      return manual || event.critical || event.version !== view.dismissedVersion ? show(next, event) : next
    }
    case "downloading": return { ...view, dialog: event }
    case "downloaded": return show(view, event)
    case "installing": return show(view, event)
    case "ready": return show(view, event)
  }
}

/** "Later" / close: a release is put off, a download or a restart shrinks to the chip, anything else goes away. */
export const dismissUpdate = (view: UpdateView): UpdateView => {
  const dialog = view.dialog
  if (dialog === undefined) return view
  if (dialog.status === "available") return dialog.critical || !dialog.dismissible ? view : { ...view, dialog: undefined, dismissedVersion: dialog.version }
  if (dialog.status === "installing") return view
  if (dialog.status === "downloaded" && dialog.critical) return view
  if (dialog.status === "downloading" || dialog.status === "downloaded" || dialog.status === "ready") return { ...view, minimized: true }
  return { ...view, dialog: undefined }
}

/** The chip was clicked: the dialog it stands for comes back. */
export const reopenUpdate = (view: UpdateView): UpdateView => ({ ...view, minimized: false })

/** An install that failed leaves the release on offer, so it can be tried again. */
export const installFailed = (view: UpdateView): UpdateView =>
  view.dialog?.status === "downloaded" ? view : view.available === undefined ? { ...view, dialog: undefined, minimized: false } : show(view, view.available)

/** The release notes as the person reads them: the shell's `[critical]` marker is machine text. */
export const releaseNotesOf = (notes: string): string => notes.replace(/\[critical\]/gi, "").trim()

/** Download progress as a whole percent, or nothing while the total is unknown. */
export const percentOf = (downloaded: number, total: number | null | undefined): number | undefined =>
  total === undefined || total === null || total <= 0 ? undefined : Math.min(100, Math.max(0, Math.floor((downloaded / total) * 100)))

export const formatBytes = (bytes: number): string => bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(0, Math.round(bytes / 1024))} KB`

/** Writes unsaved work, then installs; the shell gets the truth about what could not be written. */
export const installPendingUpdate = async (session: Pick<ProjectSession, "flush" | "hasUnsavedWork">, invoke: Invoke): Promise<string> => {
  try { await session.flush() } catch { /* still unsaved: the shell below refuses and says so */ }
  await invoke("install_update", { unsavedWork: session.hasUnsavedWork() })
  // A long download may have overlapped further editing, especially before Windows exits into its installer.
  try { await session.flush() } catch { /* the native apply guard below refuses unsaved work */ }
  applyingCommand = true
  try { return await invoke("apply_update", { unsavedWork: session.hasUnsavedWork() }) as string }
  finally { applyingCommand = false }
}

/** Restarts into the installed update: whatever was edited since the install is written first, and unwritten work stops the restart. */
export const restartAfterUpdate = async (session: Pick<ProjectSession, "flush" | "hasUnsavedWork">, invoke: Invoke): Promise<void> => {
  try { await session.flush() } catch { /* checked below */ }
  if (session.hasUnsavedWork()) throw { reason: "unsavedWork" }
  await invoke("restart_app", { unsavedWork: false })
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
