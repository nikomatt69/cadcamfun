/**
 * `.reference/src/components/LanguageSelector.tsx` plus the two pieces of
 * `contexts/LanguageContext.tsx` the settings screen reads: the supported locales and
 * the selection persisted under `localStorage.preferredLanguage`.
 *
 * v6 ships a single locale (`en`), so the selector stores the preference exactly like
 * the legacy context did but the table itself is not swapped at runtime — see the
 * "Translation Information" note on the Language tab.
 */
import { For, createSignal, type Accessor, type JSX } from "solid-js"
import Globe from "lucide-solid/icons/globe"

export const SUPPORTED_LANGUAGES = {
  en: "English",
  fr: "Français",
  es: "Español",
  it: "Italiano"
} as const

export type LanguageCode = keyof typeof SUPPORTED_LANGUAGES

const STORAGE_KEY = "preferredLanguage"

const readStoredLanguage = (): LanguageCode => {
  if (typeof window === "undefined") return "en"
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return stored !== null && stored in SUPPORTED_LANGUAGES ? (stored as LanguageCode) : "en"
  } catch {
    return "en"
  }
}

const [language, setLanguageSignal] = createSignal<LanguageCode>(readStoredLanguage())

/** The persisted language choice, shared by every consumer (one module-level signal). */
export function useLanguage(): { readonly language: Accessor<LanguageCode>; readonly setLanguage: (next: LanguageCode) => void } {
  const setLanguage = (next: LanguageCode): void => {
    setLanguageSignal(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* storage unavailable — the selection still applies for this session */
    }
  }
  return { language, setLanguage }
}

/** The legacy `<select>` + icon overlay, restyled to the design system inputs. */
export function LanguageSelector(): JSX.Element {
  const { language, setLanguage } = useLanguage()
  return (
    <div class="relative">
      <select
        value={language()}
        onChange={(e) => setLanguage(e.currentTarget.value as LanguageCode)}
        class="block w-full rounded-md border border-slate-200/70 bg-white/80 py-2 pl-10 pr-4 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700/50 dark:bg-slate-800/60 dark:text-slate-100"
      >
        <For each={Object.entries(SUPPORTED_LANGUAGES)}>{([code, name]) => <option value={code}>{name}</option>}</For>
      </select>
      <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
        <Globe class="h-4 w-4 text-slate-400 dark:text-slate-500" aria-hidden="true" />
      </div>
    </div>
  )
}
