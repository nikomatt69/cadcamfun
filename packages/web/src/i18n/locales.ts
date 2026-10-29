/**
 * The languages of the documentation — the same eleven the desktop app ships
 * (`apps/desktop/src/i18n/registry.ts`). English is the source language and
 * the canonical URL space (`/docs/...`); every other language lives under a
 * prefix (`/it/docs/...`, `/zh-CN/docs/...`, Arabic under `/ar/...` is RTL).
 *
 * Detection order (first hit wins): explicit `?lang=` / URL prefix (the
 * reader's own choice, stored in a cookie) > Cloudflare country
 * (`CF-IPCountry`, from the visitor's IP) > `Accept-Language` > English.
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
  ar: { name: "Arabic", endonym: "العربية", dir: "rtl" },
} as const

export type Locale = keyof typeof LOCALES
export type Direction = (typeof LOCALES)[Locale]["dir"]
export const DEFAULT_LOCALE: Locale = "en"
export const LOCALE_CODES = Object.keys(LOCALES) as ReadonlyArray<Locale>
export const LOCALE_COOKIE = "cadcamfun_locale"

export const isLocale = (value: unknown): value is Locale =>
  typeof value === "string" && Object.hasOwn(LOCALES, value)

export const localeInfo = (code: Locale) => ({ code, ...LOCALES[code] })

/** ISO 3166-1 alpha-2 country → shipped language. Unlisted countries read English. */
const COUNTRY_LOCALE: Readonly<Record<string, Locale>> = {
  IT: "it", SM: "it", VA: "it",
  DE: "de", AT: "de", CH: "de", LI: "de",
  ES: "es", MX: "es", AR: "es", CO: "es", CL: "es", PE: "es", VE: "es", EC: "es", GT: "es", CU: "es", BO: "es", DO: "es", HN: "es", PY: "es", SV: "es", NI: "es", CR: "es", PA: "es", UY: "es", GQ: "es",
  FR: "fr", BE: "fr", LU: "fr", MC: "fr", SN: "fr", CI: "fr", ML: "fr", BF: "fr", NE: "fr", GN: "fr", TD: "fr", CG: "fr", GA: "fr", CM: "fr", DJ: "fr", MG: "fr", HT: "fr", TG: "fr", BJ: "fr", CF: "fr", KM: "fr",
  PT: "pt", BR: "pt", AO: "pt", MZ: "pt", CV: "pt", ST: "pt", TL: "pt",
  RU: "ru", BY: "ru", KZ: "ru", KG: "ru", MD: "ru", TJ: "ru", TM: "ru", UZ: "ru", UA: "ru",
  CN: "zh-CN", SG: "zh-CN", TW: "zh-CN", HK: "zh-CN", MO: "zh-CN",
  JP: "ja",
  IN: "hi",
  EG: "ar", SA: "ar", AE: "ar", QA: "ar", KW: "ar", OM: "ar", BH: "ar", YE: "ar", IQ: "ar", JO: "ar", LB: "ar", SY: "ar", PS: "ar", SD: "ar", LY: "ar", TN: "ar", DZ: "ar", MA: "ar", MR: "ar", SO: "ar",
}

export const localeFromCountry = (country: string | null | undefined): Locale | null => {
  if (!country) return null
  return COUNTRY_LOCALE[country.trim().toUpperCase()] ?? null
}

/** Map any BCP-47 tag (`pt-BR`, `zh-Hans-CN`, `EN-us`) to a shipped language. */
export const localeFromTag = (tag: string | null | undefined): Locale | null => {
  if (!tag) return null
  const cleaned = tag.trim()
  if (isLocale(cleaned)) return cleaned
  const primary = cleaned.split("-")[0]?.toLowerCase()
  if (!primary) return null
  if (primary === "zh") return "zh-CN"
  return LOCALE_CODES.find((code) => code === primary) ?? null
}

/** Best shipped language from an `Accept-Language` header, honouring q-values. */
/** Explicit `?lang=` wins, then the saved cookie, otherwise English. */
export const localeFromChoice = (chosen: string | null | undefined, cookie: string | null | undefined): Locale =>
  (isLocale(chosen) ? chosen : null) ?? (isLocale(cookie) ? cookie : null) ?? DEFAULT_LOCALE

export const localeFromAcceptLanguage = (header: string | null | undefined): Locale | null => {
  if (!header) return null
  const ranked = header.split(",").map((part, index) => {
    const [tag, ...params] = part.split(";")
    const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="))
    return { tag: tag?.trim() ?? "", q: q ? Number(q.slice(2)) || 0 : 1, index }
  }).filter((entry) => entry.tag && entry.q > 0).sort((a, b) => b.q - a.q || a.index - b.index)
  for (const entry of ranked) {
    const hit = localeFromTag(entry.tag)
    if (hit) return hit
  }
  return null
}

export interface LocaleSignals {
  readonly cookie?: string | null
  readonly country?: string | null
  readonly acceptLanguage?: string | null
}

/** The reader's language: saved choice, then country, then browser, then English. */
export const resolveLocale = (signals: LocaleSignals): Locale =>
  (isLocale(signals.cookie) ? signals.cookie : null) ??
  localeFromCountry(signals.country) ??
  localeFromAcceptLanguage(signals.acceptLanguage) ??
  DEFAULT_LOCALE

/** `/docs/cam` → `/it/docs/cam`; English and non-docs paths stay untouched. */
export const localizePath = (pathname: string, locale: Locale): string => {
  if (locale === DEFAULT_LOCALE) return pathname
  if (pathname !== "/docs" && !pathname.startsWith("/docs/")) return pathname
  return `/${locale}${pathname}`
}

/** `/it/docs/cam` → `{ locale: "it", pathname: "/docs/cam" }`; unprefixed → English. */
export const splitLocalePath = (pathname: string): { locale: Locale; pathname: string } => {
  const [first, ...rest] = pathname.split("/").filter(Boolean)
  if (first && isLocale(first) && first !== DEFAULT_LOCALE) {
    const bare = `/${rest.join("/")}`
    return { locale: first, pathname: bare === "/" ? "/docs" : bare }
  }
  return { locale: DEFAULT_LOCALE, pathname }
}

export const isDocsPath = (pathname: string): boolean =>
  pathname === "/docs" || pathname.startsWith("/docs/")
