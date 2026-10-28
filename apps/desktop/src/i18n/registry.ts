/**
 * The languages the app ships (spec 06-desktop-ui.md §1).
 *
 * The registry is the single place that knows a language: its code, the name in
 * English (for logs and support), the name in the language itself (what the
 * selector shows, because a reader picks their own language by its own name) and
 * the writing direction.
 */

/** The writing direction of a language. */
export type Direction = "ltr" | "rtl"

export interface LocaleInfo {
  readonly code: Locale
  /** The name of the language in English. */
  readonly name: string
  /** The name of the language in the language itself. */
  readonly endonym: string
  readonly dir: Direction
}

/**
 * The shipped languages: the ten principal ones plus Italian.
 *
 * The order is the order the selector lists them in — English first, then the
 * languages a reader is most likely to look for.
 */
export const LOCALES = {
  en: { name: "English", endonym: "English", dir: "ltr" },
  it: { name: "Italian", endonym: "Italiano", dir: "ltr" },
  de: { name: "German", endonym: "Deutsch", dir: "ltr" },
  es: { name: "Spanish", endonym: "Español", dir: "ltr" },
  fr: { name: "French", endonym: "Français", dir: "ltr" },
  pt: { name: "Portuguese (Brazil)", endonym: "Português (Brasil)", dir: "ltr" },
  ru: { name: "Russian", endonym: "Русский", dir: "ltr" },
  "zh-CN": { name: "Chinese (Simplified)", endonym: "简体中文", dir: "ltr" },
  ja: { name: "Japanese", endonym: "日本語", dir: "ltr" },
  hi: { name: "Hindi", endonym: "हिन्दी", dir: "ltr" },
  ar: { name: "Arabic", endonym: "العربية", dir: "rtl" }
} as const satisfies Record<string, Omit<LocaleInfo, "code">>

/** A shipped language. */
export type Locale = keyof typeof LOCALES

/** The language the app starts in, and the one every other table falls back to. */
export const DEFAULT_LOCALE: Locale = "en"

/** The shipped languages, in the order the selector lists them. */
export const LOCALE_CODES = Object.keys(LOCALES) as ReadonlyArray<Locale>

/** `true` when the value is a shipped language code. */
export const isLocale = (value: unknown): value is Locale =>
  typeof value === "string" && Object.hasOwn(LOCALES, value)

/** The full record of a language. */
export const localeInfo = (code: Locale): LocaleInfo => ({ code, ...LOCALES[code] })
