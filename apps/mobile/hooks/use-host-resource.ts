import { useCallback, useEffect, useState } from "react"

/**
 * Single-resource loader with client-scoped refetch (nikcli: use-host-resource).
 *
 * Replaces the ~6 duplicated load patterns across projects/assistant/activity:
 * the caller passes a fetcher that may return undefined (e.g. client is null)
 * to skip the setState path while waiting on pairing, and wires focus/explicit
 * reloads to the returned `reload`.
 */
export function useHostResource<T>(
  fetcher: () => Promise<T> | undefined,
  deps: readonly unknown[],
): {
  data: T | undefined
  loading: boolean
  error: string | null
  reload: () => Promise<void>
} {
  const [data, setData] = useState<T | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      setError(null)
      const next = await fetcher()
      if (next !== undefined) setData(next)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => {
    setLoading(true)
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { data, loading, error, reload }
}
