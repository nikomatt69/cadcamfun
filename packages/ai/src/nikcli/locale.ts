/**
 * Locale resolution for the assistant. Mirrors nikcli's `locale/resolve.ts`
 * (spec 27 §B/§3, RM-01: every other concept — session, bus, service, provider,
 * policy, permission, effect — is consumed through the embedded host, but locale
 * is a pure, dependency-free resolver the host itself cannot supply, so the
 * shape and resolution order match nikcli's source while the code lives here).
 *
 * Why a local copy and not a direct import: spec 27 §2 says nikcli is consumed
 * only as `@nikcli-ai/sdk-next@1.428.0` and "B does not touch nikcli sources".
 * The published SDK does not expose the resolver, so we ship a faithful re‑
 * implementation: env > Intl > fallback, no network, no caching beyond a memo
 * of the system signals, and a per-call config override.
 *
 * The system prompt asks the model to "Answer in the user's language" (spec 16
 * §2.4): `service.ts` resolves the locale once and appends a deterministic
 * instruction ("Reply in <English name of language>.") so a multilingual model
 * does not silently fall back to English.
 */

export interface LocaleConfig {
  /** Explicit ISO 639-1/BCP-47 primary subtag override, e.g. `"it"`. */
  readonly language?: string
  /** Explicit ISO 3166-1 alpha-2 region override, e.g. `"IT"`. */
  readonly region?: string
  /** Full BCP-47 tag, e.g. `"it-IT"`. Wins over `language`/`region` when set. */
  readonly locale?: string
  /** IANA timezone, e.g. `"Europe/Rome"`. */
  readonly timezone?: string
  /** ISO 4217 currency, e.g. `"EUR"`. */
  readonly currency?: string
  /** Re-detect system signals. `false` pins everything to overrides + fallback. */
  readonly autoDetect?: boolean
  /**
   * When the model should reply in the resolved language.
   *  - `true` → always use the resolved language
   *  - `false` → never steer
   *  - a string → use this exact BCP-47 tag
   *  - `undefined` → steer for non-English, skip for English (the nikcli default)
   */
  readonly replyLanguage?: boolean | string
}

export interface ResolvedLocale {
  /** BCP-47 primary subtag, lowercase, e.g. `"it"`. */
  readonly language: string
  /** ISO 3166-1 alpha-2 country code, uppercase, e.g. `"IT"`. */
  readonly region: string
  /** Full BCP-47 tag, e.g. `"it-IT"`. */
  readonly locale: string
  /** IANA timezone, e.g. `"Europe/Rome"`. */
  readonly timezone: string
  /** ISO 4217 currency, e.g. `"EUR"`. */
  readonly currency: string
  /** English display name of the reply language, e.g. `"Italian"`. */
  readonly languageName: string
  /**
   * The BCP-47 tag the model should reply in, or `null` when the caller did
   * not ask for steering (English users get no extra prompt).
   */
  readonly replyLanguage: string | null
  /** Where the language/region was resolved from. */
  readonly source: "override" | "config" | "env" | "intl" | "fallback"
}

interface SystemSignals {
  readonly language?: string
  readonly region?: string
  readonly locale?: string
  readonly timezone?: string
  readonly source: "env" | "intl" | "fallback"
}

/** A handful of ISO 3166 → currency mappings nikcli ships inline; expanded to cover the app's supported markets. */
const REGION_CURRENCY: Readonly<Record<string, string>> = {
  US: "USD", CA: "CAD", MX: "MXN",
  GB: "GBP", IE: "EUR", EU: "EUR", DE: "EUR", FR: "EUR", IT: "EUR", ES: "EUR", NL: "EUR", BE: "EUR", AT: "EUR", PT: "EUR", FI: "EUR", GR: "EUR",
  CH: "CHF", SE: "SEK", NO: "NOK", DK: "DKK", PL: "PLN", CZ: "CZK",
  JP: "JPY", CN: "CNY", KR: "KRW", IN: "INR", SG: "SGD", HK: "HKD", TW: "TWD", TH: "THB", VN: "VND", ID: "IDR", MY: "MYR", PH: "PHP",
  AU: "AUD", NZ: "NZD",
  BR: "BRL", AR: "ARS", CL: "CLP", CO: "COP",
  ZA: "ZAR", AE: "AED", SA: "SAR", IL: "ILS", TR: "TRY", EG: "EGP", NG: "NGN",
  RU: "RUB", UA: "UAH"
}

const currencyForRegion = (region: string): string => REGION_CURRENCY[region] ?? "USD"

let signalsCache: SystemSignals | null = null
let displayNames: Intl.DisplayNames | null = null

/** Parse a POSIX/BCP-47 string like `"it_IT.UTF-8"`, `"it-IT"`, `"C"`, `"POSIX"`. */
const parseLocaleString = (value: string): { language?: string; region?: string } => {
  const cleaned = value.split(".")[0]?.split("@")[0]?.trim()
  if (!cleaned || cleaned === "C" || cleaned === "POSIX") return {}
  const [lang, region] = cleaned.replace("_", "-").split("-")
  return {
    ...(lang ? { language: lang.toLowerCase() } : {}),
    ...(region ? { region: region.toUpperCase() } : {})
  }
}

const detectSystemSignals = (): SystemSignals => {
  const envRaw = process.env.LC_ALL ?? process.env.LC_MESSAGES ?? process.env.LANG ?? process.env.LANGUAGE ?? ""
  const fromEnv = parseLocaleString(envRaw.split(":")[0] ?? "")
  const envTimezone = process.env.TZ

  let intlLocale: string | undefined
  let intlTimezone: string | undefined
  try {
    const opts = Intl.DateTimeFormat().resolvedOptions()
    intlLocale = opts.locale
    intlTimezone = opts.timeZone
  } catch {
    // Intl is unavailable in some constrained runtimes; degrade gracefully.
  }

  const intlParsed = intlLocale ? parseLocaleString(intlLocale) : {}
  const language = fromEnv.language ?? intlParsed.language
  const region = fromEnv.region ?? intlParsed.region
  const timezone = envTimezone ?? intlTimezone
  const locale = language && region ? `${language}-${region}` : intlLocale

  if (!language && !region) {
    return { timezone, source: "fallback" as const }
  }
  return {
    ...(language ? { language } : {}),
    ...(region ? { region } : {}),
    ...(locale ? { locale } : {}),
    ...(timezone ? { timezone } : {}),
    source: fromEnv.language ? ("env" as const) : ("intl" as const)
  }
}

const getSignals = (): SystemSignals => {
  if (!signalsCache) signalsCache = Object.freeze(detectSystemSignals())
  return signalsCache
}

/** English name of a language tag, via Intl (no static table). Memoised. */
const languageNameOf = (language: string): string => {
  try {
    if (!displayNames) displayNames = new Intl.DisplayNames(["en"], { type: "language" })
    return displayNames.of(language) ?? language
  } catch {
    return language
  }
}

const ENGLISH_OVERRIDE_KEYS = ["NIKCLI_LOCALE", "NIKCLI_LANGUAGE", "NIKCLI_REGION"] as const

/** Read env-only overrides nikcli ships with (`NIKCLI_LOCALE`/LANGUAGE/REGION). */
const readEnvOverrides = (): { language?: string; region?: string; locale?: string } => {
  const raw = process.env.NIKCLI_LOCALE
  const parsed = raw ? parseLocaleString(raw) : {}
  return {
    ...(process.env.NIKCLI_LANGUAGE ? { language: process.env.NIKCLI_LANGUAGE.toLowerCase() } : parsed.language ? { language: parsed.language } : {}),
    ...(process.env.NIKCLI_REGION ? { region: process.env.NIKCLI_REGION.toUpperCase() } : parsed.region ? { region: parsed.region } : {}),
    ...(raw ? { locale: raw } : {})
  }
}

/**
 * Resolve the active locale from env, Intl and a per-call override.
 * Resolution order (first non-empty wins, per axis):
 *   1. env overrides (`NIKCLI_LOCALE` / `NIKCLI_LANGUAGE` / `NIKCLI_REGION`)
 *   2. `config.locale.*`
 *   3. system signals (env LC_ALL > LC_MESSAGES > LANG > LANGUAGE, then Intl) when `autoDetect !== false`
 *   4. fallback: `en-US`, `UTC`, `USD`
 *
 * System signals are skipped together with `autoDetect: false` (the nikcli
 * contract: the env and Intl paths are the same "detect" step). When signals
 * are skipped, the only sources of language/region/timezone are the override,
 * the config, or the fallback.
 */
export const resolveLocale = (cfg?: LocaleConfig): ResolvedLocale => {
  const autoDetect = cfg?.autoDetect !== false
  const signals: SystemSignals = autoDetect ? getSignals() : { source: "fallback" }
  const override = readEnvOverrides()
  const cfgParsed = cfg?.locale ? parseLocaleString(cfg.locale) : {}

  const language = (
    override.language ??
    cfg?.language ??
    cfgParsed.language ??
    (autoDetect ? signals.language : undefined) ??
    "en"
  ).toLowerCase()
  const region = (
    override.region ??
    cfg?.region ??
    cfgParsed.region ??
    (autoDetect ? signals.region : undefined) ??
    "US"
  ).toUpperCase()
  const locale = override.locale ?? cfg?.locale ?? `${language}-${region}`
  const timezone = cfg?.timezone ?? (autoDetect ? signals.timezone : undefined) ?? "UTC"
  const currency = cfg?.currency ?? currencyForRegion(region)

  const hasOverride = !!(override.language || override.region || override.locale)
  const source: ResolvedLocale["source"] = hasOverride
    ? "override"
    : cfg?.language || cfg?.region || cfg?.locale
      ? "config"
      : signals.source

  let replyLanguage: string | null
  if (typeof cfg?.replyLanguage === "string") replyLanguage = cfg.replyLanguage.toLowerCase()
  else if (cfg?.replyLanguage === true) replyLanguage = language
  else if (cfg?.replyLanguage === false) replyLanguage = null
  else replyLanguage = language !== "en" ? language : null

  return {
    language,
    region,
    locale,
    timezone,
    currency,
    languageName: languageNameOf(replyLanguage ?? language),
    replyLanguage,
    source
  }
}

/** Test seam: clear the memoised system signals so env/Intl can be re-detected. */
export const __resetLocaleCache = (): void => {
  signalsCache = null
  displayNames = null
}

/** The env vars that participate in resolution; cleared by tests. */
export const LOCALE_ENV_KEYS: ReadonlyArray<string> = [...ENGLISH_OVERRIDE_KEYS, "LC_ALL", "LC_MESSAGES", "LANG", "LANGUAGE", "TZ"]
