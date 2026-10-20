import { useCallback, useEffect, useRef, useState } from "react"
import { readWithBackoff } from "./throttle"
import { readCache, writeCache } from "./offline-cache"

/**
 * The newest value of one thing (`scope`, e.g. a drawing id) across its revisions: while a new commit's payload loads,
 * the previous one stays on screen instead of a skeleton, so a model the assistant is changing updates in place.
 * Another scope never inherits it, so a project or drawing switch still starts empty.
 */
export function useRetained<T>(value: T | undefined, scope: string): T | undefined {
  const kept = useRef<{ scope: string; value: T } | undefined>(undefined)
  if (value !== undefined) kept.current = { scope, value }
  else if (kept.current?.scope !== scope) kept.current = undefined
  return value ?? kept.current?.value
}

export interface ResourceOptions {
  /**
   * Saves the loaded value under this key and falls back to it when the desktop cannot be reached. A list the
   * phone remembers is worth more than an empty screen with an error on it.
   */
  readonly cacheKey?: string
}

export interface Resource<T> {
  data: T | undefined
  error: string | undefined
  loading: boolean
  /** True when what is on screen is the saved copy, not a fresh answer. */
  stale: boolean
  reload: () => Promise<void>
}

/** Initial data and explicit refreshes share one cancellable request owner. */
export function useResource<T>(fetcher: (signal: AbortSignal) => Promise<T>, key: string, options: ResourceOptions = {}): Resource<T> {
  const [data, setData] = useState<T | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [stale, setStale] = useState(false)
  const generation = useRef(0)
  const controller = useRef<AbortController | null>(null)
  const mounted = useRef(true)
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher
  const cacheKey = options.cacheKey

  const load = useCallback(async () => {
    if (!mounted.current) return
    const version = ++generation.current
    controller.current?.abort()
    const request = new AbortController()
    controller.current = request
    setLoading(true)
    setError(undefined)
    try {
      // A read may be refused because the device sent too much too fast: the gateway's own back-off is
      // honoured once, so a burst of parallel screens does not turn into a visible failure.
      const next = await readWithBackoff(() => fetcherRef.current(request.signal), { signal: request.signal })
      if (!mounted.current || request.signal.aborted || version !== generation.current) return
      setData(next)
      setStale(false)
      if (cacheKey) writeCache(cacheKey, next)
    } catch (err) {
      if (!mounted.current || request.signal.aborted || version !== generation.current) return
      setError(err instanceof Error ? err.message : "Request failed")
      // The desktop is out of reach: show what the phone last saw, and say that it is the saved copy.
      if (cacheKey) {
        const cached = await readCache<T>(cacheKey)
        if (cached !== undefined && mounted.current && !request.signal.aborted && version === generation.current) {
          setData(cached)
          setStale(true)
        }
      }
    } finally {
      if (mounted.current && version === generation.current) {
        controller.current = null
        setLoading(false)
      }
    }
  }, [cacheKey])

  useEffect(() => {
    mounted.current = true
    setData(undefined)
    setError(undefined)
    setStale(false)
    void load()
    return () => {
      mounted.current = false
      generation.current += 1
      controller.current?.abort()
      controller.current = null
    }
  }, [key, fetcher, load])

  return { data, error, loading, stale, reload: load }
}
