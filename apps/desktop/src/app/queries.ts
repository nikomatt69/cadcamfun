import { createEffect, createSignal, onCleanup, untrack } from "solid-js"
import { useApp } from "../shared/state/context.ts"
import type { Client } from "../shared/state/client.ts"
import type { Effect } from "effect"
import { onCacheInvalidated } from "../shared/state/queries.ts"

export function useRead<A>(read: (client: Client) => Effect.Effect<A, unknown>) {
  const app = useApp()
  const [data, setData] = createSignal<A>()
  const [error, setError] = createSignal<string>()
  const [loading, setLoading] = createSignal(true)
  let generation = 0
  let closed = false
  let controller: AbortController | undefined
  onCleanup(() => { closed = true; generation++; controller?.abort() })
  const refetch = async () => {
    if (closed) return
    controller?.abort()
    const request = new AbortController()
    controller = request
    const current = ++generation
    setLoading(true); setError(undefined)
    try {
      const value = await app.runtime.run(untrack(() => read(app.client)), { signal: request.signal })
      if (current === generation) setData(() => value)
    } catch (cause) { if (current === generation) setError(String(cause)) }
    finally { if (current === generation) setLoading(false) }
  }
  void refetch()
  onCacheInvalidated(app.cache, () => { void refetch() })
  return { data, error, loading, refetch }
}

/**
 * `useRead` for a read keyed by something reactive (a route param, `?projectId=`).
 *
 * Re-runs whenever `key()` changes; an empty key skips the read and clears the state.
 * Unlike `createResource`, the accessors never throw when the request fails — a rejected
 * read lands in `error()` so the screen can render it instead of crashing the tree.
 */
export function useKeyedRead<K, A>(
  key: () => K | undefined | false,
  read: (client: Client, key: K) => Effect.Effect<A, unknown>
) {
  const app = useApp()
  const [data, setData] = createSignal<A>()
  const [error, setError] = createSignal<string>()
  const [loading, setLoading] = createSignal(true)
  let generation = 0
  let closed = false
  let controller: AbortController | undefined
  onCleanup(() => { closed = true; generation++; controller?.abort() })
  const refetch = async () => {
    const k = key()
    if (k === undefined || k === false) {
      controller?.abort()
      generation += 1
      setData(undefined); setError(undefined); setLoading(false)
      return
    }
    if (closed) return
    controller?.abort()
    const request = new AbortController()
    controller = request
    const current = ++generation
    setLoading(true); setError(undefined)
    try {
      const value = await app.runtime.run(untrack(() => read(app.client, k)), { signal: request.signal })
      if (current === generation) setData(() => value)
    } catch (cause) { if (current === generation) setError(String(cause)) }
    finally { if (current === generation) setLoading(false) }
  }
  createEffect(() => { key(); void refetch() })
  onCacheInvalidated(app.cache, () => { void refetch() })
  return { data, error, loading, refetch }
}
