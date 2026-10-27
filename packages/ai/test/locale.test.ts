import { beforeEach, describe, expect, test } from "bun:test"
import { ConfigProvider, Effect } from "effect"
import { LocaleEnvConfig, __resetLocaleCache, resolveLocale, type LocaleConfig, type LocaleEnv } from "../src/nikcli/locale.ts"

/** The locale variables of each test, passed as a value: resolution never reads `process.env`. */
let env: { -readonly [K in keyof LocaleEnv]: LocaleEnv[K] } = {}

beforeEach(() => {
  env = {}
  __resetLocaleCache()
})

describe("resolveLocale", () => {
  test("falls back to en-US / USD / UTC when nothing is set and autoDetect is off", () => {
    const resolved = resolveLocale({ autoDetect: false }, env)
    expect(resolved.language).toBe("en")
    expect(resolved.region).toBe("US")
    expect(resolved.locale).toBe("en-US")
    expect(resolved.timezone).toBe("UTC")
    expect(resolved.currency).toBe("USD")
    expect(resolved.source).toBe("fallback")
  })

  test("English at fallback is the silent default: no reply steering", () => {
    const resolved = resolveLocale({ autoDetect: false }, env)
    expect(resolved.replyLanguage).toBeNull()
  })

  test("non-English at fallback still falls back, but replyLanguage stays null per nikcli's default", () => {
    const resolved = resolveLocale({ autoDetect: false }, env)
    // Nikcli's default behaviour: English users get no extra prompt; non-English users do.
    expect(resolved.language).toBe("en")
    expect(resolved.replyLanguage).toBeNull()
  })

  test("env override beats fallback and sets replyLanguage for non-English", () => {
    env.NIKCLI_LOCALE = "it-IT"
    const resolved = resolveLocale({ autoDetect: false }, env)
    expect(resolved.language).toBe("it")
    expect(resolved.region).toBe("IT")
    expect(resolved.locale).toBe("it-IT")
    expect(resolved.currency).toBe("EUR")
    expect(resolved.source).toBe("override")
    expect(resolved.replyLanguage).toBe("it")
    expect(resolved.languageName.toLowerCase()).toBe("italian")
  })

  test("LC_ALL wins over LANG and LANGUAGE", () => {
    env.LC_ALL = "fr_FR.UTF-8"
    env.LANG = "de_DE.UTF-8"
    env.LANGUAGE = "es:en"
    // autoDetect is on (default) so system signals participate in resolution.
    const resolved = resolveLocale(undefined, env)
    expect(resolved.language).toBe("fr")
    expect(resolved.region).toBe("FR")
  })

  test("LANG beats LANGUAGE", () => {
    env.LANG = "de_DE"
    env.LANGUAGE = "es:en"
    const resolved = resolveLocale(undefined, env)
    expect(resolved.language).toBe("de")
  })

  test("config.locale wins over env", () => {
    env.LANG = "de_DE"
    const cfg: LocaleConfig = { locale: "ja-JP", timezone: "Asia/Tokyo", currency: "JPY" }
    const resolved = resolveLocale({ ...cfg, autoDetect: false }, env)
    expect(resolved.language).toBe("ja")
    expect(resolved.region).toBe("JP")
    expect(resolved.timezone).toBe("Asia/Tokyo")
    expect(resolved.currency).toBe("JPY")
    expect(resolved.source).toBe("config")
  })

  test("NIKCLI_LOCALE env override wins over config.locale", () => {
    env.NIKCLI_LOCALE = "pt-BR"
    const cfg: LocaleConfig = { locale: "ja-JP" }
    const resolved = resolveLocale({ ...cfg, autoDetect: false }, env)
    expect(resolved.language).toBe("pt")
    expect(resolved.region).toBe("BR")
    expect(resolved.currency).toBe("BRL")
    expect(resolved.source).toBe("override")
  })

  test("NIKCLI_LANGUAGE and NIKCLI_REGION override individual axes", () => {
    env.NIKCLI_LANGUAGE = "nl"
    env.NIKCLI_REGION = "NL"
    const resolved = resolveLocale({ autoDetect: false }, env)
    expect(resolved.language).toBe("nl")
    expect(resolved.region).toBe("NL")
    expect(resolved.currency).toBe("EUR")
  })

  test("replyLanguage: true forces steering on the resolved language", () => {
    const resolved = resolveLocale({ autoDetect: false, replyLanguage: true }, env)
    expect(resolved.replyLanguage).toBe("en")
  })

  test("replyLanguage: false keeps the silent default for non-English too", () => {
    env.NIKCLI_LOCALE = "it-IT"
    const resolved = resolveLocale({ autoDetect: false, replyLanguage: false }, env)
    expect(resolved.language).toBe("it")
    expect(resolved.replyLanguage).toBeNull()
  })

  test("replyLanguage string wins over the detected language", () => {
    env.NIKCLI_LOCALE = "it-IT"
    const resolved = resolveLocale({ autoDetect: false, replyLanguage: "es" }, env)
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
      const resolved = resolveLocale({ ...cfg, region }, env)
      expect(resolved.currency, region).toBe(expected)
    }
  })

  test("POSIX and C env values are ignored, Intl takes over", () => {
    env.LANG = "C"
    // autoDetect on by default; rely on Intl/DateTimeFormat fallback. We do not assert
    // a particular language (the test runner's locale may be anything) — only that
    // a deterministic value comes back.
    const resolved = resolveLocale(undefined, env)
    expect(resolved.language).toMatch(/^[a-z]{2,3}$/)
  })

  test("the environment is a value: the same env answers the same, a changed env is read again", () => {
    env.LANG = "fr_FR"
    expect(resolveLocale(undefined, env).language).toBe("fr")
    expect(resolveLocale(undefined, env).language).toBe("fr")
    expect(resolveLocale(undefined, { LANG: "de_DE" }).language).toBe("de")
  })

  test("LocaleEnvConfig reads exactly the locale variables through Effect Config", async () => {
    const read = await Effect.runPromise(Effect.provide(
      Effect.gen(function*() { return yield* LocaleEnvConfig }),
      ConfigProvider.layer(ConfigProvider.fromEnvRecord({ LANG: "it_IT.UTF-8", TZ: "Europe/Rome", NIKCLI_REGION: "CH", PATH: "/bin", LC_ALL: "" }))
    ))
    expect(read).toEqual({ LANG: "it_IT.UTF-8", TZ: "Europe/Rome", NIKCLI_REGION: "CH" })
    const resolved = resolveLocale(undefined, read)
    expect(resolved.language).toBe("it")
    expect(resolved.region).toBe("CH")
    expect(resolved.timezone).toBe("Europe/Rome")
  })
})
