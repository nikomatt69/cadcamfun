/**
 * Which message has its action chips open (Copy / Share / Reuse). Only one at a time, as in nikcli: a long press on
 * another message moves the chips there instead of leaving a trail of open rows. A tiny external store so a change
 * re-renders just the two bubbles involved, not every row of a long CAD turn.
 */

let active: string | null = null
const listeners = new Set<() => void>()

export const activeMessage = {
  get: (): string | null => active,
  set(id: string | null): void {
    if (active === id) return
    active = id
    for (const listener of [...listeners]) listener()
  },
  /** Closes the chips only if they are still this message's (a row that unmounts must not close another's). */
  release(id: string): void {
    if (active === id) activeMessage.set(null)
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  },
}
