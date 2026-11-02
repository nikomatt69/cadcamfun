/**
 * Story — the clock behind a Stageshow illustration.
 *
 * An illustration is a handful of phases (0 … n-1). `steps[i]` is how long phase `i` stays
 * on screen; after the last one the story starts again at 0, and the last phase is the
 * "reset" beat that fades the scene out so the loop has a visible cause.
 *
 * It plays only while it can be seen: paused when the element is scrolled out of view or the
 * window is hidden, and it never plays for people who asked for reduced motion — they get the
 * `poster` phase, the one frame that tells the whole story on its own.
 */
import { createSignal, onCleanup, type Accessor } from "solid-js"

export interface Story {
  /** Current phase index. */
  readonly phase: Accessor<number>
  /** Attach to the stage root: playback follows its visibility. */
  readonly watch: (el: HTMLElement) => void
}

export interface StoryOptions {
  /** Milliseconds each phase holds. */
  readonly steps: ReadonlyArray<number>
  /** The phase shown when nothing plays (reduced motion, first paint, screenshots). */
  readonly poster: number
}

export const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches

export function createStory(options: StoryOptions): Story {
  const [phase, setPhase] = createSignal(options.poster)
  let timer: ReturnType<typeof setTimeout> | undefined
  let seen = true
  let current = 0
  let playing = false

  const stop = (): void => {
    playing = false
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
  }
  const schedule = (): void => {
    if (!playing) return
    timer = setTimeout(() => {
      current = (current + 1) % options.steps.length
      setPhase(current)
      schedule()
    }, options.steps[current] ?? 1000)
  }
  const start = (): void => {
    if (playing || prefersReducedMotion()) return
    if (!seen || (typeof document !== "undefined" && document.hidden)) return
    playing = true
    // Start from the quiet opening beat, then play the story through.
    current = 0
    setPhase(0)
    schedule()
  }
  const settle = (): void => {
    stop()
    setPhase(options.poster)
  }

  const watch = (el: HTMLElement): void => {
    const motion = typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)")
      : undefined
    const sync = (): void => (seen && !document.hidden && !motion?.matches ? start() : settle())
    const observer =
      typeof IntersectionObserver === "function"
        ? new IntersectionObserver((entries) => {
            seen = entries.some((entry) => entry.isIntersecting)
            sync()
          }, { threshold: 0.25 })
        : undefined
    observer?.observe(el)
    document.addEventListener("visibilitychange", sync)
    motion?.addEventListener?.("change", sync)
    if (observer === undefined) sync()
    onCleanup(() => {
      observer?.disconnect()
      document.removeEventListener("visibilitychange", sync)
      motion?.removeEventListener?.("change", sync)
      stop()
    })
  }

  onCleanup(stop)
  return { phase, watch }
}
