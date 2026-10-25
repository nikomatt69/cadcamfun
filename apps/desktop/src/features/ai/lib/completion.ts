/**
 * The suggestion the host offers for what is being typed.
 *
 * A machinist writing "wall thickness should be" knows how the sentence ends;
 * the model can say it faster than it can be typed. The suggestion is shown as
 * ghost text behind the cursor and taken with Tab.
 *
 * The rule that keeps this from being annoying: the suggestion only appears
 * once the question is long enough to be one, and it is dropped the moment the
 * user types on.
 */
import { createEffect, onCleanup, type Accessor } from "solid-js"

export interface CompletionOptions {
  /** What the user has typed. */
  readonly prompt: Accessor<string>
  /** Asks the host for the rest of the sentence. */
  readonly complete: (prompt: string) => Promise<string | undefined>
  /** Below this many characters there is nothing to complete. */
  readonly minimum?: number
  /** How long the user has to stop typing before the host is asked. */
  readonly delay?: number
}

export interface Completion {
  /** The text the host suggests, without what is already typed. */
  readonly suggestion: Accessor<string | undefined>
  /** Takes the suggestion; returns the text to append, or nothing. */
  readonly accept: () => string | undefined
  /** Drops the suggestion. */
  readonly dismiss: () => void
}

/** The default: a question needs a few words before it is worth completing. */
export const MIN_COMPLETION_CHARS = 12
/** How long the typing has to stop before the host is asked. */
export const COMPLETION_DELAY_MS = 700

export const createCompletion = (options: CompletionOptions): Completion => {
  const minimum = options.minimum ?? MIN_COMPLETION_CHARS
  const delay = options.delay ?? COMPLETION_DELAY_MS
  let current: string | undefined
  let request = 0

  const set = (next: string | undefined): void => { current = next }

  createEffect(() => {
    const text = options.prompt()
    if (text.trim().length < minimum) { set(undefined); return }
    const token = ++request
    const timer = setTimeout(() => {
      void options.complete(text).then((answer) => {
        // A suggestion for text the user has moved on from is worse than none.
        if (token !== request) return
        const trimmed = answer?.trim() ?? ""
        if (trimmed === "" || options.prompt().trim() !== text.trim()) { set(undefined); return }
        set(trimmed.startsWith(text.trim()) ? trimmed.slice(text.trim().length) : trimmed)
      }).catch(() => set(undefined))
    }, delay)
    onCleanup(() => clearTimeout(timer))
  })

  return {
    suggestion: () => current,
    accept: () => {
      const value = current
      current = undefined
      request += 1
      return value
    },
    dismiss: () => { current = undefined; request += 1 }
  }
}
