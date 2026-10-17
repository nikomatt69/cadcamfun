import { useCallback, useEffect, useRef, useState } from "react"
import * as Clipboard from "expo-clipboard"

/** Copy failures stay actionable; stale completions and timers cannot update an unmounted row. */
export function useCopiedFeedback(timeoutMs = 1600): {
  copied: boolean
  error: string | undefined
  copy: (text: string) => Promise<boolean>
} {
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mounted = useRef(true)
  const generation = useRef(0)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      generation.current += 1
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])
  const copy = useCallback(async (text: string): Promise<boolean> => {
    if (!mounted.current) return false
    const version = ++generation.current
    if (timer.current) clearTimeout(timer.current)
    setCopied(false)
    setError(undefined)
    try {
      const accepted = await Clipboard.setStringAsync(text)
      if (accepted === false) throw new Error("The clipboard did not accept the text.")
      if (!mounted.current || version !== generation.current) return false
      setCopied(true)
      timer.current = setTimeout(() => { timer.current = null; setCopied(false) }, timeoutMs)
      return true
    } catch (cause) {
      if (mounted.current && version === generation.current) {
        setError(cause instanceof Error ? cause.message : "Could not copy the text. Try again.")
      }
      return false
    }
  }, [timeoutMs])
  return { copied, error, copy }
}
