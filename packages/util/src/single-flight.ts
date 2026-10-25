/**
 * Identical concurrent work runs once. The first caller of a key starts it; later callers of the same key join the run in
 * flight and get the same result and the same progress. Each caller has its own abort: leaving only stops that caller's wait,
 * and the shared run is aborted when the last caller has left.
 */
export interface Flight<P> {
  /** Aborts when every caller has left. */
  readonly signal: AbortSignal
  /** Sends a progress frame to every caller still waiting. */
  readonly emit: (progress: P) => void
}

export class SingleFlight<K, V, P = never> {
  private readonly flights = new Map<K, { readonly promise: Promise<V>; readonly callers: Set<(p: P) => void>; readonly controller: AbortController }>()

  /** Runs in flight. */
  get running(): number { return this.flights.size }

  /** Whether a live run is in flight for the key (one every caller has left does not count). */
  has(key: K): boolean {
    const flight = this.flights.get(key)
    return flight !== undefined && !flight.controller.signal.aborted
  }

  join(key: K, start: (flight: Flight<P>) => Promise<V>, caller: { readonly signal?: AbortSignal; readonly onProgress?: (progress: P) => void } = {}): Promise<V> {
    if (caller.signal?.aborted) return Promise.reject(caller.signal.reason ?? new Error("aborted"))
    const send = caller.onProgress ?? (() => undefined)
    let shared = this.flights.get(key)
    // A run every caller has left is being aborted: a new caller starts its own instead of joining a dying one.
    if (shared?.controller.signal.aborted === true) { this.flights.delete(key); shared = undefined }
    if (shared === undefined) {
      const controller = new AbortController()
      const callers = new Set<(p: P) => void>([send])
      // Started at once, with the first caller already listening: the run has its abort listener in place before anyone can
      // leave, and its first frame is not lost. A throw becomes a rejection.
      const promise = (() => {
        try { return start({ signal: controller.signal, emit: (p) => { for (const to of [...callers]) to(p) } }) } catch (error) { return Promise.reject(error) }
      })()
      const created = { promise, callers, controller }
      shared = created
      this.flights.set(key, created)
      const done = () => { if (this.flights.get(key) === created) this.flights.delete(key) }
      promise.then(done, done)
    } else shared.callers.add(send)
    const flight = shared
    return new Promise<V>((resolve, reject) => {
      const leave = (): void => {
        flight.callers.delete(send)
        caller.signal?.removeEventListener("abort", onAbort)
      }
      const onAbort = (): void => {
        leave()
        if (flight.callers.size === 0) flight.controller.abort(caller.signal?.reason)
        reject(caller.signal?.reason ?? new Error("aborted"))
      }
      caller.signal?.addEventListener("abort", onAbort, { once: true })
      flight.promise.then((value) => { leave(); resolve(value) }, (error) => { leave(); reject(error) })
    })
  }
}
