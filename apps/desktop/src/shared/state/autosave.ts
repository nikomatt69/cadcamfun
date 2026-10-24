/**
 * Save scheduling for one stored resource (a drawing, a CAM program): when it is dirty, when it is written, and what
 * happens when a write fails.
 *
 * The engine knows nothing about drawings or toolpaths. The owner gives it
 *  - `revision()`: a string that changes exactly when the content changes (a hash; cheap when nothing changed),
 *  - `save()`: writes the content and returns the revision it wrote (or nothing, meaning "the one I was asked to save").
 *
 * and gets back a reactive state plus three verbs: `touch()` (something may have changed), `saveNow()` and `baseline()`
 * (the stored copy now equals this revision: the document was opened, or saved by someone else).
 *
 * Rules that make it safe to leave on:
 *  - one write at a time; a request that arrives during a write runs after it, against the content as it is then;
 *  - an edit made *during* a write leaves the resource dirty, never "clean": the saved revision is the one that was written;
 *  - the timer is armed when the resource turns dirty and is not pushed back by further edits, so continuous editing still
 *    saves every interval and a crash loses at most one interval of work;
 *  - a failed write keeps the resource dirty, is reported, and is retried with a growing delay (unless the error says it is not
 *    `retryable`: a conflict needs the user, not another attempt).
 */
import { createSignal, type Accessor } from "solid-js"

export type SaveState = "clean" | "dirty" | "saving" | "error"
export type SaveReason = "auto" | "manual" | "flush"

/** What the owner can throw to stop automatic retries (a conflict, a missing destination). */
export interface SaveFailure extends Error { readonly retryable?: boolean }

/** Timers and the clock, injectable so the schedule can be tested without waiting. */
export interface Clock {
  readonly now: () => number
  readonly setTimeout: (run: () => void, ms: number) => unknown
  readonly clearTimeout: (handle: unknown) => void
}

const realClock: Clock = {
  now: () => Date.now(),
  setTimeout: (run, ms) => setTimeout(run, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>)
}

export interface AutosaveOptions {
  readonly revision: () => string | Promise<string>
  readonly save: (reason: SaveReason) => Promise<string | void>
  /** Automatic saves on/off; read every time the timer is armed. */
  readonly enabled: () => boolean
  readonly intervalMs: () => number
  /** False while there is nowhere to write (never saved): the resource stays dirty and the timer stays idle. */
  readonly canSave?: () => boolean
  /** Quiet period after `touch()` before the content is compared again. */
  readonly debounceMs?: number
  /** First retry delay after a failed write; doubles up to `maxRetryMs`. */
  readonly retryMs?: number
  readonly maxRetryMs?: number
  readonly clock?: Clock
}

export interface Autosave {
  readonly state: Accessor<SaveState>
  /** When the stored copy last became equal to the editor (a save, or a baseline); undefined before the first. */
  readonly savedAt: Accessor<number | undefined>
  readonly error: Accessor<string | undefined>
  /** The content may have changed (debounced). Resolves once the comparison is done. */
  touch(): Promise<void>
  /** Writes now if dirty. Rejects with the write's error. Resolves after the write (or at once when clean). */
  saveNow(reason?: SaveReason): Promise<void>
  /** Declares the stored copy equal to `revision` (default: the current one): clean, no pending timer. */
  baseline(revision?: string): Promise<void>
  /** Re-reads `enabled` / `intervalMs`: arms or disarms the timer after a setting changed. */
  reschedule(): void
  dispose(): void
}

export const createAutosave = (options: AutosaveOptions): Autosave => {
  const clock = options.clock ?? realClock
  const debounceMs = options.debounceMs ?? 400
  const retryMs = options.retryMs ?? 15_000
  const maxRetryMs = options.maxRetryMs ?? 5 * 60_000
  const [state, setState] = createSignal<SaveState>("clean")
  const [savedAt, setSavedAt] = createSignal<number | undefined>(undefined)
  const [error, setError] = createSignal<string | undefined>(undefined)

  let saved: string | undefined
  let disposed = false
  let timer: unknown
  let debounce: unknown
  let armedFor: "interval" | "retry" | undefined
  let failures = 0
  /** The write in flight, or the last queued one: requests chain behind it. */
  let tail: Promise<void> = Promise.resolve()

  const disarm = (): void => {
    if (timer !== undefined) clock.clearTimeout(timer)
    timer = undefined
    armedFor = undefined
  }

  const arm = (delay: number, kind: "interval" | "retry"): void => {
    if (disposed) return
    disarm()
    armedFor = kind
    timer = clock.setTimeout(() => {
      timer = undefined
      armedFor = undefined
      if (disposed || !options.enabled() || (options.canSave && !options.canSave())) return
      void saveNow("auto").catch(() => { /* reported through `error`; the retry is scheduled by the failure itself */ })
    }, Math.max(0, delay))
  }

  /** Arms the interval timer for a dirty resource; leaves a pending retry or interval alone (edits must not push it back). */
  const schedule = (): void => {
    if (disposed) return
    if (state() === "clean" || !options.enabled()) { disarm(); return }
    if (options.canSave && !options.canSave()) return
    if (armedFor !== undefined) return
    arm(Math.max(1_000, options.intervalMs()), "interval")
  }

  const compare = async (): Promise<void> => {
    const current = await options.revision()
    if (disposed) return
    // A write in flight owns the state: it compares again when it finishes.
    if (state() === "saving") return
    if (saved === undefined) saved = current
    if (current === saved) { setState("clean"); setError(undefined); failures = 0; disarm(); return }
    if (state() !== "error") setState("dirty")
    schedule()
  }

  const touch = (): Promise<void> => new Promise((resolve) => {
    if (debounce !== undefined) clock.clearTimeout(debounce)
    debounce = clock.setTimeout(() => { debounce = undefined; void compare().then(resolve, resolve) }, debounceMs)
  })

  const run = async (reason: SaveReason): Promise<void> => {
    if (disposed) return
    const before = await options.revision()
    if (saved === undefined) saved = before
    if (before === saved) { setState("clean"); setError(undefined); failures = 0; disarm(); return }
    disarm()
    setState("saving")
    try {
      const written = await options.save(reason)
      saved = typeof written === "string" ? written : before
      failures = 0
      setError(undefined)
      setSavedAt(clock.now())
    } catch (cause) {
      failures++
      const failure = cause instanceof Error ? cause : new Error(String(cause))
      setError(failure.message)
      setState("error")
      if ((failure as SaveFailure).retryable !== false && options.enabled() && (!options.canSave || options.canSave())) {
        arm(Math.min(maxRetryMs, retryMs * 2 ** (failures - 1)), "retry")
      }
      throw failure
    }
    // The content may have moved on while the write was running: then it is dirty again, with a fresh interval.
    const after = await options.revision()
    setState(after === saved ? "clean" : "dirty")
    schedule()
  }

  const saveNow = (reason: SaveReason = "manual"): Promise<void> => {
    const next = tail.then(() => run(reason))
    // The chain survives a failure, so one failed write does not block every later one.
    tail = next.catch(() => undefined)
    return next
  }

  const baseline = async (revision?: string): Promise<void> => {
    saved = revision ?? await options.revision()
    failures = 0
    setError(undefined)
    setSavedAt(clock.now())
    if (state() !== "saving") setState("clean")
    disarm()
    // The editor may differ from the revision it was told about.
    if (revision !== undefined) await compare()
  }

  return {
    state, savedAt, error, touch, saveNow, baseline,
    reschedule: () => {
      if (!options.enabled()) { disarm(); return }
      // A changed interval re-arms from now; a pending retry keeps its (shorter) backoff.
      if (armedFor === "interval") disarm()
      schedule()
    },
    dispose: () => {
      disposed = true
      disarm()
      if (debounce !== undefined) clock.clearTimeout(debounce)
      debounce = undefined
    }
  }
}
