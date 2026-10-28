/**
 * The translation tables (spec 06-desktop-ui.md §1).
 *
 * English is the source table and is imported statically, so the very first frame
 * renders without loading anything. Every other language is a pack beside it,
 * loaded on demand — the app carries one language until a reader asks for another.
 *
 * One table per vertical, so a port of one area never edits the file of another.
 * The tables of a language are merged in `locales/<code>/index.ts` and the *last*
 * file wins a key that two of them share; the tables are written so that no key
 * is shared.
 */
import enTable from "./locales/en/index.ts"
import type { Locale } from "./registry.ts"

/** Flat key -> string map; values are `"text"` or `"text with {placeholders}"`. */
export type Messages = Record<string, string>

/** Every key that exists in the shipped locale. */
export type Key = keyof typeof enTable

/** The English table, frozen so one screen cannot mutate another screen's strings. */
export const en: Messages = Object.freeze({ ...enTable }) as Messages

/**
 * The loaders of the languages other than English.
 *
 * The imports are literal so the bundler splits every language into its own
 * chunk: a reader pays for the language they picked and nothing else.
 */
export const PACKS: Record<Exclude<Locale, "en">, () => Promise<Messages>> = {
  it: () => import("./locales/it/index.ts").then((pack) => pack.default),
  de: () => import("./locales/de/index.ts").then((pack) => pack.default),
  es: () => import("./locales/es/index.ts").then((pack) => pack.default),
  fr: () => import("./locales/fr/index.ts").then((pack) => pack.default),
  pt: () => import("./locales/pt/index.ts").then((pack) => pack.default),
  ru: () => import("./locales/ru/index.ts").then((pack) => pack.default),
  "zh-CN": () => import("./locales/zh-CN/index.ts").then((pack) => pack.default),
  ja: () => import("./locales/ja/index.ts").then((pack) => pack.default),
  hi: () => import("./locales/hi/index.ts").then((pack) => pack.default),
  ar: () => import("./locales/ar/index.ts").then((pack) => pack.default)
}
