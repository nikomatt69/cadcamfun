/**
 * Heavy pure kernel work in a scoped worker with a deadline on the whole job (AI-11 Step 10). One worker per job: the deadline
 * or the caller's abort terminates it, so a cancelled job ends at once, holds no thread and leaves nothing behind (the jobs
 * are pure; whatever persists is written by the caller after the result arrives). `runKernelJobInline` runs the same
 * function on the calling thread, for tests of equivalence and for hosts without workers.
 */
import { availableParallelism, totalmem } from "node:os"
import { cam } from "@cadcamfun/core"
import { BoundedCache } from "@cadcamfun/util/bounded-cache"
import { Semaphore } from "@cadcamfun/util/semaphore"
import { SingleFlight } from "@cadcamfun/util/single-flight"
import { KERNEL_JOBS, type KernelJobName, type KernelJobProgress, type KernelJobs } from "./kernel-jobs.ts"

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

/** Default deadline of one job, worker start included: five minutes, so a very large part still gets its program. */
export const KERNEL_JOB_DEADLINE_MS = 300_000

/** Workers that may run at once: each can hold gigabytes for minutes, so a burst of requests waits instead of exhausting the memory. */
export const KERNEL_WORKERS = Math.max(1, Math.min(3, availableParallelism() - 1))

/** Jobs that may wait for a worker; one more is refused at once with the reason `busy`. */
export const KERNEL_QUEUE_LIMIT = 16

/** Results kept for identical requests: bounded by entries and by the bytes of program text they hold. */
export const KERNEL_CACHE_ENTRIES = 24
export const KERNEL_CACHE_BYTES = 256 * 1024 * 1024

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

const slots = new Semaphore(KERNEL_WORKERS)

/** Share of the machine's memory the process may hold before the result cache is given up to make room for a worker. */
export const KERNEL_MEMORY_SHARE = 0.6

/** What happened to the jobs since the process started (for diagnostics; counts only, nothing is derived from them). */
const counters = { started: 0, completed: 0, failed: 0, timedOut: 0, aborted: 0, workerExited: 0, cacheHits: 0, joined: 0, busy: 0, memoryEvictions: 0 }

/** The jobs whose result is a pure function of the input, so an identical request can share a run or take the last result. */
const CACHEABLE: ReadonlySet<KernelJobName> = new Set(["cam-manufacture", "cam-plan", "cam-generate"])

interface Entry { readonly value: unknown; readonly bytes: number }
const results = new BoundedCache<string, Entry>({ maxEntries: KERNEL_CACHE_ENTRIES, maxBytes: KERNEL_CACHE_BYTES, sizeOf: (e) => e.bytes })
const flights = new SingleFlight<string, unknown, KernelJobProgress>()

/** What a result holds in memory, roughly: the program text dominates (the IR and the claims weigh a few times its size). */
const bytesOf = (name: KernelJobName, value: unknown): number => {
  if (name === "cam-manufacture") {
    const r = value as KernelJobs["cam-manufacture"]["output"]
    return r.status === "ok" ? r.value.nc.length * 3 + 100_000 : 20_000
  }
  if (name === "cam-generate") return (value as KernelJobs["cam-generate"]["output"]).response.gcode.length * 3 + 100_000
  return 50_000
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
  counters: { ...counters }, rssBytes: process.memoryUsage().rss
})

/** Empties the result cache (a changed library or setting that the request does not carry). */
export const clearKernelJobCache = (): void => results.clear()

interface RunOptions {
  readonly deadlineMs?: number
  readonly signal?: AbortSignal
  readonly onProgress?: (progress: KernelJobProgress) => void
  /** A different worker module (tests of a worker that dies); the kernel's own by default. */
  readonly workerUrl?: string
}

/** One job in its own worker, in a slot: the deadline counts from the moment the worker starts, not from the wait for a slot. */
const execute = async <K extends KernelJobName>(name: K, input: KernelJobs[K]["input"], options: RunOptions): Promise<KernelJobs[K]["output"]> => {
  if (slots.waiting >= KERNEL_QUEUE_LIMIT) counters.busy++
  if (slots.waiting >= KERNEL_QUEUE_LIMIT) throw new KernelJobError(name, "busy", `Kernel job ${name} was refused: ${slots.waiting} jobs are already waiting for one of the ${KERNEL_WORKERS} workers. Try again when one has finished.`)
  const release = await slots.acquire(options.signal).catch(() => { throw new KernelJobError(name, "cancelled", `Kernel job ${name} was cancelled while it waited for a worker.`) })
  try {
    // A worker is about to take memory: when the process already holds more than its share, the cached programs go first.
    if (results.size > 0 && process.memoryUsage().rss > totalmem() * KERNEL_MEMORY_SHARE) { results.clear(); counters.memoryEvictions++ }
    counters.started++
    const value = await spawn(name, input, options)
    counters.completed++
    return value
  } catch (error) {
    if (error instanceof KernelJobError) {
      if (error.reason === "deadline") counters.timedOut++
      else if (error.reason === "cancelled") counters.aborted++
      else counters.failed++
    } else counters.failed++
    throw error
  } finally {
    release()
  }
}

const spawn = <K extends KernelJobName>(name: K, input: KernelJobs[K]["input"], options: RunOptions): Promise<KernelJobs[K]["output"]> => new Promise((resolve, reject) => {
  if (options.signal?.aborted) return reject(new KernelJobError(name, "cancelled", `Kernel job ${name} was cancelled before it started.`))
  const worker = new Worker(options.workerUrl ?? kernelWorkerUrl())
  let done = false
  const finish = (settle: () => void) => {
    if (done) return
    done = true
    clearTimeout(timer)
    options.signal?.removeEventListener("abort", onAbort)
    worker.terminate()
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
    if (done) return
    counters.workerExited++
    finish(() => reject(new KernelJobError(name, "crashed", `Kernel job ${name} stopped before it answered (worker exit code ${String((event as unknown as { code?: number }).code ?? "unknown")}): it ran out of memory or crashed. Reduce the part, the layer height or the stepover, or split the job.`)))
  })
  worker.postMessage({ name, input })
})

/**
 * Runs a kernel job. At most `KERNEL_WORKERS` run at once and the rest wait their turn. A CAM job (a pure function of its input)
 * that is already running for another caller is joined, not run again, and the caller gets the same progress; one that ran lately
 * is answered from the result cache. The result is shared between callers: read it, never change it. A deadline or a crash is
 * never cached. The deadline of a joined run is the one its first caller gave.
 */
export const runKernelJob = <K extends KernelJobName>(name: K, input: KernelJobs[K]["input"], options: RunOptions = {}): Promise<KernelJobs[K]["output"]> => {
  if (options.signal?.aborted) return Promise.reject(new KernelJobError(name, "cancelled", `Kernel job ${name} was cancelled before it started.`))
  const key = keyOf(name, input)
  if (key === undefined) return execute(name, input, options)
  const hit = results.get(key)
  if (hit !== undefined) { counters.cacheHits++; return Promise.resolve(hit.value as KernelJobs[K]["output"]) }
  if (flights.running > 0 && flights.has(key)) counters.joined++
  return flights.join(key, (flight) => execute(name, input, { ...(options.deadlineMs !== undefined ? { deadlineMs: options.deadlineMs } : {}), signal: flight.signal, onProgress: flight.emit }).then((value) => {
    results.set(key, { value, bytes: bytesOf(name, value) })
    return value
  }), { ...(options.signal !== undefined ? { signal: options.signal } : {}), ...(options.onProgress !== undefined ? { onProgress: options.onProgress } : {}) }).then(
    (value) => value as KernelJobs[K]["output"],
    (error: unknown) => { throw options.signal?.aborted === true && !(error instanceof KernelJobError) ? new KernelJobError(name, "cancelled", `Kernel job ${name} was cancelled.`) : error }
  )
}
