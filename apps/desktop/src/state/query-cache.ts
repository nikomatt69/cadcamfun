/**
 * A very small query cache (spec 06-desktop-ui.md §1).
 *
 * The server owns the data, so the UI keeps no authoritative copy: this only
 * remembers the last successful value per `endpoint + params` so that navigating
 * back to a screen paints instantly, plus the in-flight promise so two components
 * asking for the same key share one request.
 *
 * Keys are built by {@link queryKey} (a stable serialisation), never by string
 * concatenation in a component, so `/projects` and `/projects?limit=10` can never
 * collide by accident.
 */

export type QueryParams = Readonly<Record<string, unknown>> | undefined

/** Stable key for an endpoint and its params: sorted, undefined-dropping JSON. */
export const queryKey = (endpoint: string, params?: QueryParams): string => {
  if (params === undefined) return endpoint
  const entries = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => [key, value] as const)
  return entries.length === 0 ? endpoint : `${endpoint}?${JSON.stringify(Object.fromEntries(entries))}`
}

export type QueryState<T> =
  | { readonly _tag: "loading" }
  | { readonly _tag: "success"; readonly value: T }
  | { readonly _tag: "error"; readonly error: unknown }

export interface CacheEntry<T> {
  readonly state: QueryState<T>
  /** When the entry was last written, in epoch milliseconds. */
  readonly at: number
}

export interface QueryCache {
  /** Reads one key; `undefined` when nothing was cached for it. */
  readonly peek: <T>(key: string) => CacheEntry<T> | undefined
  /** Cached value only when the entry succeeded, so `undefined` always means "reload". */
  readonly value: <T>(key: string) => T | undefined
  readonly keys: () => ReadonlyArray<string>
  /**
   * Runs `effect`, storing the result under `key`. An in-flight call for the same key
   * is shared, and a failed call is *not* cached: the next visit retries.
   */
  run<T>(key: string, effect: () => Promise<T>, now?: () => number): Promise<T>
  /** Drops one key, or everything when no key is given. */
  invalidate(key?: string): void
  /** Re-runs nothing on its own: callers re-run `run` after invalidating. */
  readonly size: () => number
}

export interface QueryCacheOptions {
  /** Entries older than this are treated as absent by `peekStale`. */
  readonly maxAgeMs?: number
  readonly now?: () => number
}

export const createQueryCache = (options: QueryCacheOptions = {}): QueryCache => {
  const now = options.now ?? (() => Date.now())
  const entries = new Map<string, CacheEntry<unknown>>()
  const inFlight = new Map<string, Promise<unknown>>()

  const cache: QueryCache = {
    peek: <T,>(key: string): CacheEntry<T> | undefined => entries.get(key) as CacheEntry<T> | undefined,
    value: <T,>(key: string): T | undefined => {
      const entry = entries.get(key)
      if (entry === undefined || entry.state._tag !== "success") return undefined
      return entry.state.value as T
    },
    keys: () => [...entries.keys()],
    size: () => entries.size,
    invalidate: (key?: string) => {
      if (key === undefined) {
        entries.clear()
        inFlight.clear()
        return
      }
      entries.delete(key)
      inFlight.delete(key)
    },
    run: <T,>(key: string, effect: () => Promise<T>, at?: () => number): Promise<T> => {
      const pending = inFlight.get(key)
      if (pending !== undefined) return pending as Promise<T>
      const request = effect()
        .then((value) => {
          entries.set(key, { state: { _tag: "success", value }, at: at?.() ?? now() })
          return value
        })
        .finally(() => {
          inFlight.delete(key)
        })
      inFlight.set(key, request)
      return request
    }
  }
  return cache
}

/** Drops a cache entry whose key starts with `prefix`; `/projects` drops `/projects?limit=1`. */
export const invalidatePrefix = (cache: QueryCache, prefix: string): void => {
  for (const key of cache.keys()) if (key === prefix || key.startsWith(`${prefix}?`)) cache.invalidate(key)
}
