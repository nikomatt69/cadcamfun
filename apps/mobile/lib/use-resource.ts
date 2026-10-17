import { useCallback, useEffect, useRef, useState } from "react"

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

/** Initial data and explicit refreshes share one cancellable request owner. */
export function useResource<T>(fetcher: (signal: AbortSignal) => Promise<T>, key: string): {
  data: T | undefined
  error: string | undefined
  loading: boolean
  reload: () => Promise<void>
} {
  const [data, setData] = useState<T | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const generation = useRef(0)
  const controller = useRef<AbortController | null>(null)
  const mounted = useRef(true)
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  const load = useCallback(async () => {
    if (!mounted.current) return
    const version = ++generation.current
    controller.current?.abort()
    const request = new AbortController()
    controller.current = request
    setLoading(true)
    setError(undefined)
    try {
      const next = await fetcherRef.current(request.signal)
      if (mounted.current && !request.signal.aborted && version === generation.current) setData(next)
    } catch (err) {
      if (mounted.current && !request.signal.aborted && version === generation.current) setError(err instanceof Error ? err.message : "Request failed")
    } finally {
      if (mounted.current && version === generation.current) {
        controller.current = null
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    mounted.current = true
    setData(undefined)
    setError(undefined)
    void load()
    return () => {
      mounted.current = false
      generation.current += 1
      controller.current?.abort()
      controller.current = null
    }
  }, [key, fetcher, load])

  return { data, error, loading, reload: load }
}
