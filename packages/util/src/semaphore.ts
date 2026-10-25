/**
 * A counting semaphore with a FIFO queue. A caller that gives up while waiting (its signal aborts) leaves the queue without
 * ever holding a slot, so an abandoned request never blocks the ones behind it.
 */
export class Semaphore {
  private free: number
  private readonly queue: Array<{ readonly grant: () => void; readonly cancel: () => void }> = []

  constructor(readonly size: number) {
    if (!Number.isInteger(size) || size < 1) throw new RangeError("A semaphore needs a whole number of slots, at least 1")
    this.free = size
  }

  /** Callers waiting for a slot. */
  get waiting(): number { return this.queue.length }

  /** Slots in use. */
  get active(): number { return this.size - this.free }

  /** Waits for a slot; resolves with the function that gives it back (once). Rejects with the signal's reason if it aborts first. */
  acquire(signal?: AbortSignal): Promise<() => void> {
    if (signal?.aborted) return Promise.reject(signal.reason ?? new Error("aborted"))
    const release = (() => {
      let released = false
      return () => {
        if (released) return
        released = true
        const next = this.queue.shift()
        if (next === undefined) this.free++
        else next.grant()
      }
    })()
    if (this.free > 0) {
      this.free--
      return Promise.resolve(release)
    }
    return new Promise((resolve, reject) => {
      const entry = {
        grant: () => { signal?.removeEventListener("abort", onAbort); resolve(release) },
        cancel: () => reject(signal?.reason ?? new Error("aborted"))
      }
      const onAbort = () => {
        const at = this.queue.indexOf(entry)
        if (at >= 0) { this.queue.splice(at, 1); entry.cancel() }
      }
      signal?.addEventListener("abort", onAbort, { once: true })
      this.queue.push(entry)
    })
  }

  /** Runs `work` in a slot and gives the slot back however it ends. */
  async run<T>(work: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    const release = await this.acquire(signal)
    try { return await work() } finally { release() }
  }
}
