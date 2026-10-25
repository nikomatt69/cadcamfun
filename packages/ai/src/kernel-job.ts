/**
 * Heavy pure kernel work in a scoped worker with a deadline on the whole job (AI-11 Step 10). One worker per job: the deadline
 * or the caller's abort terminates it, so a cancelled job ends at once, holds no thread and leaves nothing behind (the jobs
 * are pure; whatever persists is written by the caller after the result arrives). `runKernelJobInline` runs the same
 * function on the calling thread, for tests of equivalence and for hosts without workers.
 *
 * Around the worker: at most `KERNEL_WORKERS` run at once and a few more wait; identical requests share one run and the last
 * results are kept; every job leaves a line in a short history; a shutdown stops what runs.
 */
import { availableParallelism, totalmem } from "node:os"
import { Effect } from "effect"
import { cam } from "@cadcamfun/core"
import { BoundedCache } from "@cadcamfun/util/bounded-cache"
import { Semaphore } from "@cadcamfun/util/semaphore"
import { SingleFlight } from "@cadcamfun/util/single-flight"
import { KERNEL_JOBS, type KernelJobName, type KernelJobProgress, type KernelJobs } from "./kernel-jobs.ts"

// ---------------------------------------------------------------- errors

export class KernelJobError extends Error {
  readonly _tag = "KernelJobError"
  constructor(readonly job: KernelJobName, readonly reason: "deadline" | "cancelled" | "failed" | "crashed" | "busy", message: string) {
    super(message)
    this.name = "KernelJobError"
  }

  /**
   * Whether the message is for the person who asked: a deadline, a cancel, a full queue and a worker the system killed say what
   * to change. A failure inside the job or a crash with a stack message is the host's business and stays out of responses.
   */
  get explained(): boolean {
    return this.reason === "deadline" || this.reason === "cancelled" || this.reason === "busy" || (this.reason === "crashed" && /worker exit code/.test(this.message))
  }
}

// ---------------------------------------------------------------- limits

/** Default deadline of one job, worker start included: five minutes, so a very large part still gets its program. */
export const KERNEL_JOB_DEADLINE_MS = 300_000
/** Workers that may run at once: each can hold gigabytes for minutes, so a burst of requests waits instead of exhausting the memory. */
export const KERNEL_WORKERS = Math.max(1, Math.min(3, availableParallelism() - 1))
/** Jobs that may wait for a worker; one more is refused at once with the reason `busy`. */
export const KERNEL_QUEUE_LIMIT = 16
/** Results kept for identical requests: bounded by entries and by the bytes of program text they hold. */
export const KERNEL_CACHE_ENTRIES = 24
export const KERNEL_CACHE_BYTES = 256 * 1024 * 1024
/** Share of the machine's memory the process may hold before the result cache is given up to make room for a worker. */
export const KERNEL_MEMORY_SHARE = 0.6
/** Time a terminated worker may take to close before it is counted as leaked, ms. */
export const KERNEL_LEAK_GRACE_MS = 5_000
/** Jobs kept in the history. */
export const KERNEL_HISTORY_SIZE = 200

// ---------------------------------------------------------------- history and counters

/** How a job ended, for the history: a failure reason, or a result (`cached` was answered without running). */
export type KernelJobOutcome = KernelJobError["reason"] | "completed" | "cached"

/** One line of the job history: what ran, for how long and how large the program was. Nothing from the job's input or output text. */
export interface KernelJobRecord {
  readonly id: string
  readonly job: KernelJobName
  readonly outcome: KernelJobOutcome
  /** Time spent waiting for a worker, ms. */
  readonly waitedMs: number
  /** Time the worker ran, ms. */
  readonly ranMs: number
  /** Program size, bytes of NC text (0 when the job has none). */
  readonly bytes: number
  /** Motions in the program (0 when the job has none or it failed). */
  readonly moves: number
  /** When it finished, ms since the epoch. */
  readonly at: number
}

const history: KernelJobRecord[] = []
let jobSequence = 0

/** What happened to the jobs since the process started (counts only, for diagnostics). */
const counters = { started: 0, completed: 0, failed: 0, timedOut: 0, aborted: 0, workerExited: 0, workerLeaks: 0, cacheHits: 0, joined: 0, busy: 0, memoryEvictions: 0 }

const outputSize = (name: KernelJobName, value: unknown): { readonly bytes: number; readonly moves: number } => {
  if (name === "cam-manufacture") {
    const r = value as KernelJobs["cam-manufacture"]["output"]
    return r.status === "ok" ? { bytes: r.value.nc.length, moves: r.value.program.toolpaths.reduce((n, t) => n + t.moves.length, 0) } : { bytes: 0, moves: 0 }
  }
  if (name === "cam-generate") {
    const r = (value as KernelJobs["cam-generate"]["output"]).response
    return { bytes: r.gcode.length, moves: r.stats.lines }
  }
  return { bytes: 0, moves: 0 }
}

const record = (job: KernelJobName, outcome: KernelJobOutcome, times: { readonly waitedMs: number; readonly ranMs: number }, value?: unknown, id = `k${++jobSequence}`): void => {
  history.push({ id, job, outcome, ...times, ...(value === undefined ? { bytes: 0, moves: 0 } : outputSize(job, value)), at: Date.now() })
  if (history.length > KERNEL_HISTORY_SIZE) history.splice(0, history.length - KERNEL_HISTORY_SIZE)
}

/** The last jobs (`KERNEL_HISTORY_SIZE`), oldest first. */
export const kernelJobHistory = (): ReadonlyArray<KernelJobRecord> => [...history]

// ---------------------------------------------------------------- queue, shared runs and cache

const slots = new Semaphore(KERNEL_WORKERS)
const flights = new SingleFlight<string, unknown, KernelJobProgress>()
const results = new BoundedCache<string, { readonly value: unknown; readonly bytes: number }>({ maxEntries: KERNEL_CACHE_ENTRIES, maxBytes: KERNEL_CACHE_BYTES, sizeOf: (e) => e.bytes })
/** Workers running now, so a shutdown can stop them; and whether the process is going down. */
const active = new Set<() => void>()
let closing = false

/** The jobs whose result is a pure function of the input, so an identical request can share a run or take the last result. */
const CACHEABLE: ReadonlySet<KernelJobName> = new Set(["cam-manufacture", "cam-plan", "cam-generate", "cad-analyze", "cad-step", "cad-setups", "cad-hole", "cad-assembly", "cad-sheet"])

/** What a result holds in memory, roughly: the program text dominates (the IR and the claims weigh a few times its size). */
const bytesOf = (name: KernelJobName, value: unknown): number => {
  if (name === "cam-manufacture") {
    const r = value as KernelJobs["cam-manufacture"]["output"]
    return r.status === "ok" ? r.value.nc.length * 3 + 100_000 : 20_000
  }
  if (name === "cam-generate") return (value as KernelJobs["cam-generate"]["output"]).response.gcode.length * 3 + 100_000
  // A STEP file is text of the size of the model; the other CAD results are reports and edited scenes of a few hundred kilobytes.
  if (name === "cad-step") return ((value as KernelJobs["cad-step"]["output"]).step?.length ?? 0) * 2 + 100_000
  if (name === "cad-hole") return JSON.stringify(value).length * 2 + 50_000
  if (name === "cad-sheet") return (value as KernelJobs["cad-sheet"]["output"]).svg.length * 3 + 100_000
  return 200_000
}

/**
 * Identity of a request: the job, the input and the algorithm that will run. The cache lives in this process only, so a new build
 * starts empty; the algorithm names guard the rest. Undefined when the input has no canonical form (then it just runs).
 */
const keyOf = (name: KernelJobName, input: unknown): string | undefined => {
  if (!CACHEABLE.has(name)) return undefined
  try {
    return cam.kernel.sha256(cam.kernel.canonicalJson({ name, input, algorithm: [cam.kernel.KERNEL_ALGORITHM, cam.kernel.PRINT_ALGORITHM] }))
  } catch {
    return undefined
  }
}

/** What the job queue and the result cache are doing: for diagnostics and tests. */
export const kernelJobStats = () => ({
  workers: KERNEL_WORKERS, running: slots.active, waiting: slots.waiting, inFlight: flights.running,
  cached: results.size, cachedBytes: results.bytes, hits: results.hits, misses: results.misses,
  counters: { ...counters }, rssBytes: process.memoryUsage().rss, closing
})

/** Empties the result cache (a changed library or setting that the request does not carry). */
export const clearKernelJobCache = (): void => results.clear()

/**
 * Stops taking jobs and stops the ones running: their workers are terminated at once and their callers get a `cancelled` error.
 * Synchronous, so it fits a shutdown finalizer; the process is about to exit and has no time to wait for a worker.
 */
export const shutdownKernelJobs = (): void => {
  closing = true
  for (const stop of [...active]) stop()
  results.clear()
}

/** Takes jobs again after `shutdownKernelJobs` (a host that restarts its services, and the tests). */
export const reopenKernelJobs = (): void => { closing = false }

// ---------------------------------------------------------------- the worker

/**
 * Where the worker module is. In a compiled sidecar every entry point lives under the executable's virtual root
 * (`/$bunfs/root/` or `B:/~BUN/root/`) at its path from the repository root, which `compile-sidecar.ts` sets as the build root.
 */
export const kernelWorkerUrl = (moduleUrl: string = import.meta.url): string => {
  const embedded = /^(.*[\\/](?:\$bunfs|~BUN)[\\/]root[\\/])/.exec(moduleUrl)
  return embedded !== null ? new URL("packages/ai/src/kernel-worker.ts", embedded[1]).href : new URL("./kernel-worker.ts", moduleUrl).href
}

export const runKernelJobInline = <K extends KernelJobName>(name: K, input: KernelJobs[K]["input"]): KernelJobs[K]["output"] =>
  (KERNEL_JOBS[name] as (value: KernelJobs[K]["input"]) => KernelJobs[K]["output"])(input)

export interface RunOptions {
  readonly deadlineMs?: number
  readonly signal?: AbortSignal
  readonly onProgress?: (progress: KernelJobProgress) => void
  /** A different worker module (tests of a worker that dies); the kernel's own by default. */
  readonly workerUrl?: string
}

const spawn = <K extends KernelJobName>(name: K, input: KernelJobs[K]["input"], options: RunOptions, id: string): Promise<KernelJobs[K]["output"]> => new Promise((resolve, reject) => {
  if (options.signal?.aborted) return reject(new KernelJobError(name, "cancelled", `Kernel job ${name} was cancelled before it started.`))
  // The job's id and name in the worker's environment, so a line the worker logs can be tied to the record of its job.
  const worker = new Worker(options.workerUrl ?? kernelWorkerUrl(), { env: { ...process.env, CADCAMFUN_JOB_ID: id, CADCAMFUN_JOB_NAME: name } as Record<string, string> })
  let done = false
  let closed = false
  let leakTimer: ReturnType<typeof setTimeout> | undefined
  const stop = (): void => finish(() => reject(new KernelJobError(name, "cancelled", `Kernel job ${name} was stopped: the server is shutting down.`)))
  active.add(stop)
  const finish = (settle: () => void) => {
    if (done) return
    done = true
    clearTimeout(timer)
    active.delete(stop)
    options.signal?.removeEventListener("abort", onAbort)
    worker.terminate()
    // A terminated worker closes within moments; one that has not after the grace is a leak, counted so a diagnostics view shows it.
    if (!closed) {
      leakTimer = setTimeout(() => { counters.workerLeaks++ }, KERNEL_LEAK_GRACE_MS)
      leakTimer.unref?.()
    }
    settle()
  }
  const deadlineMs = options.deadlineMs ?? KERNEL_JOB_DEADLINE_MS
  const timer = setTimeout(() => finish(() => reject(new KernelJobError(name, "deadline", `Kernel job ${name} passed its ${deadlineMs} ms deadline and was stopped.`))), deadlineMs)
  const onAbort = () => finish(() => reject(new KernelJobError(name, "cancelled", `Kernel job ${name} was cancelled.`)))
  options.signal?.addEventListener("abort", onAbort, { once: true })
  worker.onmessage = (event: MessageEvent<{ progress: KernelJobProgress } | { ok: true; value: KernelJobs[K]["output"] } | { ok: false; error: string }>) => {
    const message = event.data
    if ("progress" in message) { if (!done) options.onProgress?.(message.progress); return }
    finish(() => message.ok ? resolve(message.value) : reject(new KernelJobError(name, "failed", message.error)))
  }
  worker.onerror = (event) => finish(() => reject(new KernelJobError(name, "crashed", `Kernel job ${name} crashed: ${event.message}`)))
  // A worker the system kills (out of memory) closes without an answer or an error event: say so now, not at the deadline.
  worker.addEventListener("close", (event) => {
    closed = true
    clearTimeout(leakTimer)
    if (done) return
    counters.workerExited++
    const code = (event as unknown as { readonly code?: number }).code ?? "unknown"
    finish(() => reject(new KernelJobError(name, "crashed", `Kernel job ${name} stopped before it answered (worker exit code ${code}): it ran out of memory or crashed. Reduce the part, the layer height or the stepover, or split the job.`)))
  })
  worker.postMessage({ name, input })
})

/** One job in its own worker, in a slot: the deadline counts from the moment the worker starts, not from the wait for a slot. */
const execute = async <K extends KernelJobName>(name: K, input: KernelJobs[K]["input"], options: RunOptions): Promise<KernelJobs[K]["output"]> => {
  const id = `k${++jobSequence}`
  const queuedAt = performance.now()
  const refuse = (reason: "cancelled" | "busy", message: string): never => {
    counters[reason === "busy" ? "busy" : "aborted"]++
    record(name, reason, { waitedMs: Math.round(performance.now() - queuedAt), ranMs: 0 }, undefined, id)
    throw new KernelJobError(name, reason, message)
  }
  if (closing) refuse("cancelled", `Kernel job ${name} was refused: the server is shutting down.`)
  if (slots.waiting >= KERNEL_QUEUE_LIMIT) refuse("busy", `Kernel job ${name} was refused: ${slots.waiting} jobs are already waiting for one of the ${KERNEL_WORKERS} workers. Try again when one has finished.`)
  if (slots.active >= KERNEL_WORKERS) options.onProgress?.({ stage: "queued", ahead: slots.waiting })
  const release = await slots.acquire(options.signal).catch(() => refuse("cancelled", `Kernel job ${name} was cancelled while it waited for a worker.`))
  const ranFrom = performance.now()
  const times = () => ({ waitedMs: Math.round(ranFrom - queuedAt), ranMs: Math.round(performance.now() - ranFrom) })
  try {
    if (closing) throw new KernelJobError(name, "cancelled", `Kernel job ${name} was stopped: the server is shutting down.`)
    // A worker is about to take memory: when the process already holds more than its share, the cached programs go first.
    if (results.size > 0 && process.memoryUsage().rss > totalmem() * KERNEL_MEMORY_SHARE) { results.clear(); counters.memoryEvictions++ }
    counters.started++
    const value = await spawn(name, input, options, id)
    counters.completed++
    record(name, "completed", times(), value, id)
    return value
  } catch (error) {
    const reason = error instanceof KernelJobError ? error.reason : "failed"
    counters[reason === "deadline" ? "timedOut" : reason === "cancelled" ? "aborted" : "failed"]++
    record(name, reason, times(), undefined, id)
    throw error
  } finally {
    release()
  }
}

// ---------------------------------------------------------------- running a job

/**
 * Runs a kernel job. At most `KERNEL_WORKERS` run at once and the rest wait their turn. A job that is a pure function of its input
 * (the CAM and exact CAD jobs) and is already running for another caller is joined, not run again, and the caller gets the same
 * progress; one that ran lately is answered from the result cache. The result is shared between callers: read it, never change
 * it. A deadline or a crash is never cached. The deadline of a joined run is the one its first caller gave.
 */
export const runKernelJob = <K extends KernelJobName>(name: K, input: KernelJobs[K]["input"], options: RunOptions = {}): Promise<KernelJobs[K]["output"]> => {
  if (options.signal?.aborted) return Promise.reject(new KernelJobError(name, "cancelled", `Kernel job ${name} was cancelled before it started.`))
  const key = keyOf(name, input)
  if (key === undefined) return execute(name, input, options)
  const hit = results.get(key)
  if (hit !== undefined) {
    counters.cacheHits++
    record(name, "cached", { waitedMs: 0, ranMs: 0 }, hit.value)
    return Promise.resolve(hit.value as KernelJobs[K]["output"])
  }
  if (flights.has(key)) counters.joined++
  const shared = flights.join(key, (flight) => execute(name, input, { ...(options.deadlineMs !== undefined ? { deadlineMs: options.deadlineMs } : {}), signal: flight.signal, onProgress: flight.emit }).then((value) => {
    results.set(key, { value, bytes: bytesOf(name, value) })
    return value
  }), { ...(options.signal !== undefined ? { signal: options.signal } : {}), ...(options.onProgress !== undefined ? { onProgress: options.onProgress } : {}) })
  // A caller that leaves is told it was cancelled, in the job's own error type.
  return shared.then(
    (value) => value as KernelJobs[K]["output"],
    (error: unknown) => { throw options.signal?.aborted === true && !(error instanceof KernelJobError) ? new KernelJobError(name, "cancelled", `Kernel job ${name} was cancelled.`) : error }
  )
}

/**
 * `runKernelJob` as an Effect: the failure is a typed `KernelJobError`, and interrupting the effect stops the job and waits until
 * its worker is terminated, so a request that is dropped has released its worker by the time the fiber is gone.
 */
export const runKernelJobEffect = <K extends KernelJobName>(
  name: K,
  input: KernelJobs[K]["input"],
  options: Pick<RunOptions, "deadlineMs" | "onProgress"> = {}
): Effect.Effect<KernelJobs[K]["output"], KernelJobError> =>
  Effect.callback<KernelJobs[K]["output"], KernelJobError>((resume, signal) => {
    const job = runKernelJob(name, input, { ...options, signal })
    job.then(
      (value) => resume(Effect.succeed(value)),
      (error: unknown) => resume(Effect.fail(error instanceof KernelJobError ? error : new KernelJobError(name, "failed", error instanceof Error ? error.message : String(error))))
    )
    // On interruption the signal aborts the job; the effect finishes only once the job has settled (its worker terminated).
    return Effect.promise(() => job.then(() => undefined, () => undefined))
  })
