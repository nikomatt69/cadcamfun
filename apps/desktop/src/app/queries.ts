import { createSignal } from "solid-js"
import { useApp } from "../state/context.ts"
import type { Client } from "../state/client.ts"
import type { Effect } from "effect"

export function useRead<A>(read: (client: Client) => Effect.Effect<A, unknown>) {
  const app = useApp()
  const [data, setData] = createSignal<A>()
  const [error, setError] = createSignal<string>()
  const [loading, setLoading] = createSignal(true)
  let generation = 0
  const refetch = async () => {
    const current = ++generation
    setLoading(true); setError(undefined)
    try {
      const value = await app.runtime.run(read(app.client))
      if (current === generation) setData(() => value)
    } catch (cause) { if (current === generation) setError(String(cause)) }
    finally { if (current === generation) setLoading(false) }
  }
  void refetch()
  return { data, error, loading, refetch }
}
