/**
 * The translation table and the `t()` function (spec 06-desktop-ui.md §1).
 *
 * `en` is the only locale in v6.0 and it is a *typed* table: `Key` comes from
 * `en.json`, so asking for a string nobody wrote is a type error rather than a
 * runtime `[missing]`. Values may carry `{placeholder}` slots that `t` fills.
 */
import { createContext, createMemo, createSignal, useContext, type Accessor, type JSX } from "solid-js"
import base from "./en.json" with { type: "json" }
// One table per vertical so ports of different areas never edit the same file concurrently.
import shell from "./en.shell.json" with { type: "json" }
import library from "./en.library.json" with { type: "json" }
import org from "./en.org.json" with { type: "json" }
import cad from "./en.cad.json" with { type: "json" }
import cam from "./en.cam.json" with { type: "json" }
import ai from "./en.ai.json" with { type: "json" }
import plugins from "./en.plugins.json" with { type: "json" }
import legacy from "./en.legacy.json" with { type: "json" }
import settings from "./en.settings.json" with { type: "json" }
import viewport from "./en.viewport.json" with { type: "json" }
import system from "./en.system.json" with { type: "json" }
import pricing from "./en.pricing.json" with { type: "json" }
import detail from "./en.detail.json" with { type: "json" }
import companion from "./en.companion.json" with { type: "json" }
import vcsStrings from "./en.vcs.json" with { type: "json" }

const table = { ...base, ...shell, ...library, ...org, ...cad, ...cam, ...ai, ...plugins, ...legacy, ...settings, ...viewport, ...system, ...pricing, ...detail, ...companion, ...vcsStrings }

/** The shipped locale, and the only one in v6.0. */
export type Locale = "en"

export const DEFAULT_LOCALE: Locale = "en"

/** Flat key -> string map; values are `"text"` or `"text with {placeholders}"`. */
export type Messages = Record<string, string>

/** Every key that exists in the shipped locale. */
export type Key = keyof typeof table

/** Values a caller may substitute into a message. */
export type Placeholders = Readonly<Record<string, string | number>>

/** The shipped table, frozen so one screen cannot mutate another screen's strings. */
export const en: Messages = Object.freeze({ ...table }) as Messages

const PLACEHOLDER = /\{(\w+)\}/g

/** Replaces `{name}` slots; an unknown slot is left in place so the gap stays visible. */
export const format = (message: string, values?: Placeholders): string => {
  if (values === undefined) return message
  return message.replace(PLACEHOLDER, (match, name: string) => {
    const value = values[name]
    return value === undefined ? match : String(value)
  })
}

/** Looks a key up outside of a component (tests, log lines); unknown keys echo back. */
export const translate = (key: Key, values?: Placeholders): string =>
  format(en[key] === undefined ? key : (en[key] as string), values)

export interface I18n {
  readonly locale: Accessor<Locale>
  readonly t: (key: Key, values?: Placeholders) => string
}

const createI18n = (): I18n => {
  const [locale, setLocale] = createSignal<Locale>(DEFAULT_LOCALE)
  // A memo, not a plain read: switching locale must re-render every string.
  const messages = createMemo((): Messages => en)
  return {
    locale,
    t: (key, values) => format(messages()[key] === undefined ? key : (messages()[key] as string), values),
    setLocale
  } as I18n & { setLocale: (next: Locale) => void }
}

const I18nContext = createContext<I18n>()

/**
 * The app-wide translator.
 *
 * Components render text through the *module-level* `t` so that no string is ever
 * written as a literal in JSX; the context only carries the locale, which is what
 * actually has to be reactive.
 */
export const useI18n = (): I18n => {
  const context = useContext(I18nContext)
  if (context === undefined) throw new Error("useI18n must be called inside <I18nProvider>")
  return context
}

/** Reactive `t()` for code that has to follow a locale change. */
export const useT = (): ((key: Key, values?: Placeholders) => string) => useI18n().t

/** Imperative `t()`: the default-locale translator, safe outside a component tree. */
export const t: (key: Key, values?: Placeholders) => string = (key, values) => translate(key, values)

export interface I18nProviderProps {
  readonly children: JSX.Element
}

/** Installs the locale signal; children read text through `t`/`useT`. */
export function I18nProvider(props: I18nProviderProps): JSX.Element {
  const i18n = createI18n()
  return I18nContext.Provider({
    value: i18n,
    get children() {
      return props.children
    }
  })
}
