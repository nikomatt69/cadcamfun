import { createContext, useContext, useSyncExternalStore } from 'react'

// Static stages settle motion parts too, even without an OS preference.
export const StillContext = createContext(false)

const QUERY = '(prefers-reduced-motion: reduce)'

function currentPreference(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(QUERY).matches
}

function subscribePreference(notify: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {}
  const query = window.matchMedia(QUERY)
  query.addEventListener('change', notify)
  return () => query.removeEventListener('change', notify)
}

const serverPreference = () => false

/** Whether the viewer asked for reduced motion. A stage shows its still; parts skip their tweens. */
export function useReducedMotion() {
  const still = useContext(StillContext)
  const reduced = useSyncExternalStore(subscribePreference, currentPreference, serverPreference)
  return still || reduced
}
