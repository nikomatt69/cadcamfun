/**
 * Heavy pure kernel work in a scoped worker with a deadline on the whole job (AI-11 Step 10). One worker per job: the deadline
 * or the caller's abort terminates it, so a cancelled job ends at once, holds no thread and leaves nothing behind (the jobs
 * are pure; whatever persists is written by the caller after the result arrives). `runKernelJobInline` runs the same
 * function on the calling thread, for tests of equivalence and for hosts without workers.
 */
import { KERNEL_JOBS, type KernelJobName, type KernelJobs } from "./kernel-jobs.ts"

export class KernelJobError extends Error {
  readonly _tag = "KernelJobError"
  constructor(readonly job: KernelJobName, readonly reason: "deadline" | "cancelled" | "failed" | "crashed", message: string) {
    super(message)
    this.name = "KernelJobError"
  }
}

/** Default deadline of one job, worker start included. */
export const KERNEL_JOB_DEADLINE_MS = 120_000

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

export const runKernelJob = <K extends KernelJobName>(
  name: K,
  input: KernelJobs[K]["input"],
  options: { readonly deadlineMs?: number; readonly signal?: AbortSignal } = {}
): Promise<KernelJobs[K]["output"]> => new Promise((resolve, reject) => {
  if (options.signal?.aborted) return reject(new KernelJobError(name, "cancelled", `Kernel job ${name} was cancelled before it started.`))
  const worker = new Worker(kernelWorkerUrl())
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
  worker.onmessage = (event: MessageEvent<{ ok: true; value: KernelJobs[K]["output"] } | { ok: false; error: string }>) => {
    const message = event.data
    finish(() => message.ok ? resolve(message.value) : reject(new KernelJobError(name, "failed", message.error)))
  }
  worker.onerror = (event) => finish(() => reject(new KernelJobError(name, "crashed", `Kernel job ${name} crashed: ${event.message}`)))
  worker.postMessage({ name, input })
})
