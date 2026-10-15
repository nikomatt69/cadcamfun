/**
 * The kernel worker: runs one `KERNEL_JOBS` entry per message off the sidecar's main thread, so a heavy rebuild never stops the
 * timers, heartbeats and other requests that thread serves. Compiled into the sidecar as its own entry point
 * (`scripts/compile-sidecar.ts`).
 */
import { KERNEL_JOBS, type KernelJobName } from "./kernel-jobs.ts"

declare const self: Worker

self.onmessage = (event: MessageEvent<{ readonly name: KernelJobName; readonly input: unknown }>) => {
  const { name, input } = event.data
  try {
    const job = KERNEL_JOBS[name] as ((value: unknown) => unknown) | undefined
    if (job === undefined) throw new Error(`Unknown kernel job '${String(name)}'`)
    self.postMessage({ ok: true, value: job(input) })
  } catch (error) {
    self.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) })
  }
}
