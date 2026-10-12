/**
 * A typed read/write helper over the query cache (spec 06-desktop-ui.md §1).
 *
 * `useQuery` is the only way a screen reads data: it keys the cache by endpoint plus
 * params, exposes the three states a screen has to render, and never lets two components
 * build two different caches for the same endpoint. Writes go through `useMutation`,
 * which invalidates the prefixes a write can affect so the next read is fresh.
 */
import { createSignal, type Accessor } from "solid-js"
import { Effect } from "effect"
import { invalidatePrefix, queryKey, type QueryCache, type QueryState } from "./query-cache.ts"
import { ApiClient, type Client } from "./client.ts"

/** An effect that needs the app's typed API client. */
export type ClientEffect<A> = Effect.Effect<A, unknown, ApiClient>

export interface Query<T> {
  readonly state: Accessor<QueryState<T>>
  readonly data: Accessor<T | undefined>
  readonly error: Accessor<unknown>
  /** Re-runs the read, bypassing the cache. */
  refetch(): void
}

export interface QueryOptions {
  /** When false the query stays `loading` and never fetches (e.g. no id yet). */
  readonly enabled?: boolean
  readonly cache?: QueryCache
}

/**
 * What a screen needs to run a query or a mutation. `run` is the app runtime's, widened
 * at this boundary: the screen always hands it a *concrete* `ClientEffect<A>`, and the
 * cache write below stores an already-resolved value, so neither site needs the union.
 */
export interface QueryRuntime {
  readonly run: (effect: ClientEffect<unknown>) => Promise<unknown>
  readonly cache: QueryCache
}

/** A value read out of a loosely typed API row (library, plugins, toolpaths). */
export interface Row {
  readonly id?: string
  readonly name?: string
  readonly [key: string]: unknown
}

export const asRows = <T,>(value: unknown): ReadonlyArray<T> => (Array.isArray(value) ? (value as T[]) : [])

/**
 * Runs `effect` and exposes its state. The effect takes the client, so a screen writes
 * `(client) => client.projects.list()` — the same shape the generated client has.
 */
export const useQuery = <T,>(
  endpoint: string,
  params: Readonly<Record<string, unknown>> | undefined,
  effect: (client: Client) => ClientEffect<T>,
  runtime: QueryRuntime,
  options: QueryOptions = {}
): Query<T> => {
  const key = queryKey(endpoint, params)
  const enabled = options.enabled ?? true
  const cache = options.cache ?? runtime.cache
  const [state, setState] = createSignal<QueryState<T>>({ _tag: "loading" })

  const fetchIt = (): void => {
    if (!enabled) return
    const cached = cache.peek<T>(key)
    if (cached !== undefined && cached.state._tag === "success") {
      setState({ _tag: "success", value: cached.state.value })
      return
    }
    setState({ _tag: "loading" })
    // A screen hands over `(client) => Effect`; bind the client through the
    // `ApiClient` service so `runtime.run` always receives a concrete effect —
    // passing the raw function makes Effect reject with "Not a valid effect".
    void runtime
      .run(Effect.flatMap(Effect.service(ApiClient), (client) => effect(client)))
      .then((value: unknown) => {
        setState({ _tag: "success", value: value as T })
        // A resolved promise stores the value under the key and marks the key in-flight
        // for any component that asks for the same endpoint+params in the same tick.
        void cache.run(key, () => Promise.resolve(value))
      })
      .catch((error: unknown) => setState({ _tag: "error", error }))
  }

  fetchIt()

  return {
    state,
    data: () => {
      const current = state()
      return current._tag === "success" ? current.value : undefined
    },
    error: () => {
      const current = state()
      return current._tag === "error" ? current.error : undefined
    },
    refetch: fetchIt
  }
}

export interface Mutation<Args extends ReadonlyArray<unknown>, A> {
  readonly mutate: (...args: Args) => Promise<A>
  readonly pending: Accessor<boolean>
  readonly error: Accessor<unknown>
}

/**
 * A write. `invalidates` lists the endpoint prefixes the write makes stale, so the next
 * `useQuery` on any of them refetches instead of showing the pre-write value.
 */
export const useMutation = <Args extends ReadonlyArray<unknown>, A>(
  effect: (client: Client, ...args: Args) => ClientEffect<A>,
  runtime: QueryRuntime,
  invalidates: ReadonlyArray<string>,
  cache: QueryCache | undefined
): Mutation<Args, A> => {
  const [pending, setPending] = createSignal(false)
  const [error, setError] = createSignal<unknown>(undefined)

  const mutate = async (...args: Args): Promise<A> => {
    setPending(true)
    setError(undefined)
    // Same binding as `useQuery`: the client comes from the service, not from
    // the call site, so the write runs as a concrete effect.
    try {
      const value = (await runtime.run(
        Effect.flatMap(Effect.service(ApiClient), (client) => effect(client, ...args))
      )) as A
      if (cache !== undefined) for (const prefix of invalidates) invalidatePrefix(cache, prefix)
      return value
    } catch (cause: unknown) {
      setError(cause)
      throw cause
    } finally {
      setPending(false)
    }
  }

  return { mutate, pending, error }
}
