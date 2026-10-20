import { useCallback, useEffect, useRef } from "react"
import { useFocusEffect } from "expo-router"

/**
 * Refreshes something while the screen is in front of the user.
 *
 * The desktop can only tell the phone about a change through a stream, and the gateway gives the phone one
 * stream per project. A list that belongs to no single project (the activity feed, the project list) would
 * need a stream per project to stay live; polling keeps it honest with one request every few seconds and
 * nothing at all while the screen is in the background.
 */
export function usePoll(callback: () => void, intervalMs: number, enabled = true): void {
  const latest = useRef(callback)
  latest.current = callback
  useFocusEffect(
    useCallback(() => {
      if (!enabled) return
      const timer = setInterval(() => latest.current(), intervalMs)
      return () => clearInterval(timer)
    }, [enabled, intervalMs]),
  )
}

/**
 * The same, but the first refresh happens at once: a screen that was in the background for a while shows
 * what changed without the user pulling to refresh.
 */
export function usePollOnFocus(callback: () => void, intervalMs: number, enabled = true): void {
  const latest = useRef(callback)
  latest.current = callback
  useEffect(() => { if (enabled) latest.current() }, [enabled])
  usePoll(callback, intervalMs, enabled)
}
