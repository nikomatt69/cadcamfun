/**
 * The translation tables and the `t()` function (spec 06-desktop-ui.md §1).
 *
 * English is the source table and every other language is a pack beside it. The
 * pack of a language is loaded the first time a reader picks it and then kept in
 * memory, so switching back and forth is free.
 *
 * `t()` reads the table of the current language from a signal, so a screen that
 * renders a string re-renders when the language changes. That is why the
 * translator lives in the module and not in a context: the language has to reach
 * every screen, and a context would only reach the ones below its provider.
 */
import { createSignal, type Accessor } from "solid-js"
import { DEFAULT_LOCALE, isLocale, localeInfo, type Locale } from "./registry.ts"
import { PACKS, en, type Key, type Messages } from "./packs.ts"

export { DEFAULT_LOCALE, LOCALES, LOCALE_CODES, isLocale, localeInfo } from "./registry.ts"
export type { Direction, Locale, LocaleInfo } from "./registry.ts"
export { en } from "./packs.ts"
export type { Key, Messages } from "./packs.ts"

/** Values a caller may substitute into a message. */
export type Placeholders = Readonly<Record<string, string | number>>

const PLACEHOLDER = /\{(\w+)\}/g

/** Replaces `{name}` slots; an unknown slot is left in place so the gap stays visible. */
export const format = (message: string, values?: Placeholders): string => {
  if (values === undefined) return message
  return message.replace(PLACEHOLDER, (match, name: string) => {
    const value = values[name]
    return value === undefined ? match : String(value)
  })
}

const [locale, setLocaleSignal] = createSignal<Locale>(DEFAULT_LOCALE)
const [messages, setMessages] = createSignal<Messages>(en)
const [loading, setLoading] = createSignal(false)

/** The packs already loaded, so a language is fetched once. */
const packs = new Map<Locale, Messages>()

/** The language the app renders in. */
export const currentLocale: Accessor<Locale> = locale

/** `true` while a language pack is being loaded. */
export const isLoading: Accessor<boolean> = loading

/** Tells the document which language and direction the app renders in. */
const applyDocument = (code: Locale): void => {
  if (typeof document === "undefined") return
  const info = localeInfo(code)
  document.documentElement.lang = code
  document.documentElement.dir = info.dir
}

/** The pack of a language that is being loaded; two readers share one load. */
const pending = new Map<Locale, Promise<Messages>>()

/** Loads the pack of a language; English is already in memory. */
const loadPack = (code: Locale): Promise<Messages> => {
  if (code === "en") return Promise.resolve(en)
  const cached = packs.get(code)
  if (cached !== undefined) return Promise.resolve(cached)
  const loading = pending.get(code)
  if (loading !== undefined) return loading
  const promise = PACKS[code]()
    .then((table) => {
      packs.set(code, table)
      return table
    })
    .finally(() => { pending.delete(code) })
  pending.set(code, promise)
  return promise
}

/**
 * Switches the language.
 *
 * The table and the locale change together, so no screen ever shows the strings
 * of one language under the name of another. A pack that fails to load leaves the
 * current language alone and rejects, so the caller can tell the reader.
 */
let requested = 0
export const setLocale = async (next: Locale): Promise<void> => {
  if (!isLocale(next)) throw new Error(`Unknown language: ${String(next)}`)
  // The language is already the one on screen: nothing to load, nothing to swap.
  if (next === locale()) return
  const token = ++requested
  setLoading(true)
  try {
    const table = await loadPack(next)
    if (token !== requested) return
    setMessages(table)
    setLocaleSignal(next)
    applyDocument(next)
  } finally {
    if (token === requested) setLoading(false)
  }
}

/**
 * The translator.
 *
 * It reads the table of the current language, so a component that renders a
 * string re-renders when the language changes.
 */
export const t = (key: Key, values?: Placeholders): string => {
  const table = messages()
  const value = table[key]
  return format(value === undefined ? key : value, values)
}

/** Looks a key up outside of a component (tests, log lines); unknown keys echo back. */
export const translate = (key: Key, values?: Placeholders): string => t(key, values)

export interface I18n {
  /** The language the app renders in. */
  readonly locale: Accessor<Locale>
  /** `true` while a language pack is being loaded. */
  readonly loading: Accessor<boolean>
  readonly t: (key: Key, values?: Placeholders) => string
  /** Switches the language; the pack is loaded on the way. */
  readonly setLocale: (next: Locale) => Promise<void>
}

/** The app-wide translator. */
export const i18n: I18n = { locale, loading: isLoading, t, setLocale }

/** The translator of the app; the locale is global, so no provider is needed. */
export const useI18n = (): I18n => i18n

/** Reactive `t()` for code that has to follow a language change. */
export const useT = (): ((key: Key, values?: Placeholders) => string) => t
