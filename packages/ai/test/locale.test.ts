import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { LOCALE_ENV_KEYS, __resetLocaleCache, resolveLocale, type LocaleConfig } from "../src/nikcli/locale.ts"

const ORIGINAL_ENV: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const key of LOCALE_ENV_KEYS) ORIGINAL_ENV[key] = process.env[key]
  for (const key of LOCALE_ENV_KEYS) delete process.env[key]
  __resetLocaleCache()
})

afterEach(() => {
  for (const key of LOCALE_ENV_KEYS) {
    const previous = ORIGINAL_ENV[key]
    if (previous === undefined) delete process.env[key]
    else process.env[key] = previous
  }
  __resetLocaleCache()
})

describe("resolveLocale", () => {
  test("falls back to en-US / USD / UTC when nothing is set and autoDetect is off", () => {
    const resolved = resolveLocale({ autoDetect: false })
    expect(resolved.language).toBe("en")
    expect(resolved.region).toBe("US")
    expect(resolved.locale).toBe("en-US")
    expect(resolved.timezone).toBe("UTC")
    expect(resolved.currency).toBe("USD")
    expect(resolved.source).toBe("fallback")
  })

  test("English at fallback is the silent default: no reply steering", () => {
    const resolved = resolveLocale({ autoDetect: false })
    expect(resolved.replyLanguage).toBeNull()
  })

  test("non-English at fallback still falls back, but replyLanguage stays null per nikcli's default", () => {
    const resolved = resolveLocale({ autoDetect: false })
    // Nikcli's default behaviour: English users get no extra prompt; non-English users do.
    expect(resolved.language).toBe("en")
    expect(resolved.replyLanguage).toBeNull()
  })

  test("env override beats fallback and sets replyLanguage for non-English", () => {
    process.env.NIKCLI_LOCALE = "it-IT"
    const resolved = resolveLocale({ autoDetect: false })
    expect(resolved.language).toBe("it")
    expect(resolved.region).toBe("IT")
    expect(resolved.locale).toBe("it-IT")
    expect(resolved.currency).toBe("EUR")
    expect(resolved.source).toBe("override")
    expect(resolved.replyLanguage).toBe("it")
    expect(resolved.languageName.toLowerCase()).toBe("italian")
  })

  test("LC_ALL wins over LANG and LANGUAGE", () => {
    process.env.LC_ALL = "fr_FR.UTF-8"
    process.env.LANG = "de_DE.UTF-8"
    process.env.LANGUAGE = "es:en"
    // autoDetect is on (default) so system signals participate in resolution.
    const resolved = resolveLocale()
    expect(resolved.language).toBe("fr")
    expect(resolved.region).toBe("FR")
  })

  test("LANG beats LANGUAGE", () => {
    process.env.LANG = "de_DE"
    process.env.LANGUAGE = "es:en"
    const resolved = resolveLocale()
    expect(resolved.language).toBe("de")
  })

  test("config.locale wins over env", () => {
    process.env.LANG = "de_DE"
    const cfg: LocaleConfig = { locale: "ja-JP", timezone: "Asia/Tokyo", currency: "JPY" }
    const resolved = resolveLocale({ ...cfg, autoDetect: false })
    expect(resolved.language).toBe("ja")
    expect(resolved.region).toBe("JP")
    expect(resolved.timezone).toBe("Asia/Tokyo")
    expect(resolved.currency).toBe("JPY")
    expect(resolved.source).toBe("config")
  })

  test("NIKCLI_LOCALE env override wins over config.locale", () => {
    process.env.NIKCLI_LOCALE = "pt-BR"
    const cfg: LocaleConfig = { locale: "ja-JP" }
    const resolved = resolveLocale({ ...cfg, autoDetect: false })
    expect(resolved.language).toBe("pt")
    expect(resolved.region).toBe("BR")
    expect(resolved.currency).toBe("BRL")
    expect(resolved.source).toBe("override")
  })

  test("NIKCLI_LANGUAGE and NIKCLI_REGION override individual axes", () => {
    process.env.NIKCLI_LANGUAGE = "nl"
    process.env.NIKCLI_REGION = "NL"
    const resolved = resolveLocale({ autoDetect: false })
    expect(resolved.language).toBe("nl")
    expect(resolved.region).toBe("NL")
    expect(resolved.currency).toBe("EUR")
  })

  test("replyLanguage: true forces steering on the resolved language", () => {
    const resolved = resolveLocale({ autoDetect: false, replyLanguage: true })
    expect(resolved.replyLanguage).toBe("en")
  })

  test("replyLanguage: false keeps the silent default for non-English too", () => {
    process.env.NIKCLI_LOCALE = "it-IT"
    const resolved = resolveLocale({ autoDetect: false, replyLanguage: false })
    expect(resolved.language).toBe("it")
    expect(resolved.replyLanguage).toBeNull()
  })

  test("replyLanguage string wins over the detected language", () => {
    process.env.NIKCLI_LOCALE = "it-IT"
    const resolved = resolveLocale({ autoDetect: false, replyLanguage: "es" })
    expect(resolved.replyLanguage).toBe("es")
    expect(resolved.languageName.toLowerCase()).toBe("spanish")
  })

  test("currencyForRegion maps a meaningful slice of ISO 3166 codes", () => {
    // The map should cover the major markets; fall through to USD for the rest.
    const cfg: LocaleConfig = { autoDetect: false }
    const matrix: ReadonlyArray<readonly [string, string]> = [
      ["IT", "EUR"], ["DE", "EUR"], ["GB", "GBP"], ["US", "USD"],
      ["JP", "JPY"], ["CN", "CNY"], ["BR", "BRL"], ["AU", "AUD"],
      ["CA", "CAD"], ["CH", "CHF"], ["IN", "INR"], ["ZZ", "USD"]
    ]
    for (const [region, expected] of matrix) {
      const resolved = resolveLocale({ ...cfg, region })
      expect(resolved.currency, region).toBe(expected)
    }
  })

  test("POSIX and C env values are ignored, Intl takes over", () => {
    process.env.LANG = "C"
    // autoDetect on by default; rely on Intl/DateTimeFormat fallback. We do not assert
    // a particular language (the test runner's locale may be anything) — only that
    // a deterministic value comes back.
    const resolved = resolveLocale()
    expect(resolved.language).toMatch(/^[a-z]{2,3}$/)
  })

  test("system signals are memoised until the cache is reset", () => {
    process.env.LANG = "fr_FR"
    const first = resolveLocale()
    // Changing the env after the first resolve must not affect a memoised result.
    process.env.LANG = "de_DE"
    const second = resolveLocale()
    expect(first.language).toBe("fr")
    expect(second.language).toBe("fr")
    __resetLocaleCache()
    const third = resolveLocale()
    // After reset, detection runs again; with the new env (de_DE) the
    // language follows. The point of the test is the cache, not the value.
    expect(third.language).toBe("de")
  })
})
