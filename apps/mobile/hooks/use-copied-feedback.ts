import { useCallback, useEffect, useRef, useState } from "react"
import * as Clipboard from "expo-clipboard"

/**
 * Copied-feedback helper (nikcli: use-copied-feedback).
 * Copies text once, shows a transient "Copied" label, then restores.
 */
export function useCopiedFeedback(timeoutMs = 1600): { copied: boolean; copy: (text: string) => Promise<void> } {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  const copy = useCallback(
    async (text: string) => {
      try {
        await Clipboard.setStringAsync(text)
        setCopied(true)
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => setCopied(false), timeoutMs)
      } catch {
        setCopied(false)
      }
    },
    [timeoutMs],
  )

  return { copied, copy }
}
