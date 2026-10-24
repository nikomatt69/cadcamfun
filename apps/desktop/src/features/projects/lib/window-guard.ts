import { t } from "../../../i18n/index.ts"
import type { ProjectSession } from "./project-session.ts"

export interface GuardOptions {
  /** How long the final save may take before the close is refused. */
  readonly timeoutMs?: number
  /** A second close request within this long is the user insisting: the window closes whatever happened. */
  readonly insistMs?: number
  readonly now?: () => number
}

/**
 * The handler for the desktop window's close request. A window with nothing unsaved closes at once; otherwise the close is held,
 * the unsaved work is written, and the window is destroyed. If the write fails (or takes too long) the user is told and the window
 * stays open, but a second close request shortly after closes it anyway — the window is never trapped.
 */
export const closeGuard = (
  session: Pick<ProjectSession, "hasUnsavedWork" | "flush">,
  win: { readonly destroy: () => Promise<void> },
  report: (message: string) => void,
  options: GuardOptions = {}
): (event: { readonly preventDefault: () => void }) => Promise<void> => {
  const timeoutMs = options.timeoutMs ?? 8_000, insistMs = options.insistMs ?? 20_000, now = options.now ?? Date.now
  let refusedAt = Number.NEGATIVE_INFINITY
  return async (event) => {
    if (!session.hasUnsavedWork()) return
    event.preventDefault()
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([session.flush(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(t("save.closeTimeout"))), timeoutMs) })])
      await win.destroy()
    } catch (cause) {
      if (now() - refusedAt < insistMs) { await win.destroy(); return }
      refusedAt = now()
      report(t("save.closeBlocked", { message: cause instanceof Error ? cause.message : String(cause) }))
    } finally {
      if (timer !== undefined) clearTimeout(timer)
    }
  }
}
