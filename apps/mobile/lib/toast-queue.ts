/** The toast queue, free of React Native so its rules can be tested. */

export type ToastKind = "info" | "success" | "error"

export interface ToastEntry {
  readonly id: number
  readonly kind: ToastKind
  readonly message: string
  /** Bumped when the same toast is raised again while it is still showing; restarts its dwell. */
  readonly stamp: number
}

/** The newest toasts stay; older ones are dropped rather than stacking down the screen. */
export const MAX_TOASTS = 3

/**
 * Adds a toast. Raising the same message and kind again while it is on screen refreshes it in place
 * (new stamp, same slot) instead of stacking identical rows - a failing retry loop must not fill the screen.
 */
export function enqueueToast(queue: readonly ToastEntry[], incoming: { id: number; kind: ToastKind; message: string }, max = MAX_TOASTS): readonly ToastEntry[] {
  const existing = queue.find((entry) => entry.kind === incoming.kind && entry.message === incoming.message)
  if (existing) return queue.map((entry) => entry.id === existing.id ? { ...entry, stamp: entry.stamp + 1 } : entry)
  return [...queue, { ...incoming, stamp: 0 }].slice(-max)
}

export function removeToast(queue: readonly ToastEntry[], id: number): readonly ToastEntry[] {
  return queue.some((entry) => entry.id === id) ? queue.filter((entry) => entry.id !== id) : queue
}

/** How long a toast stays: long enough to read, errors a little longer than confirmations. */
export function toastDwellMs(message: string, kind: ToastKind): number {
  const words = message.trim().split(/\s+/).filter(Boolean).length
  const base = Math.min(10000, Math.max(3500, 1500 + words * 350))
  return kind === "error" ? Math.min(12000, base + 1500) : base
}

/** What a screen reader says: an error is named as one, because the color and icon are not heard. */
export function toastAnnouncement(kind: ToastKind, message: string): string {
  return kind === "error" ? `Error. ${message}` : message
}
