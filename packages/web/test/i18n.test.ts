import { describe, expect, test } from "bun:test"
import { LOCALE_CODES, isLocale, localeFromAcceptLanguage, localeFromCountry, localizePath, resolveLocale, splitLocalePath } from "../src/i18n/locales"
import { UI } from "../src/i18n/ui"
import { translateArticleHtml, workersAiTranslator } from "../src/i18n/translate"

describe("locale registry", () => {
  test("ships exactly the desktop app's eleven languages", () => {
    expect(LOCALE_CODES).toEqual(["en", "it", "de", "es", "fr", "pt", "ru", "zh-CN", "ja", "hi", "ar"])
    expect(isLocale("zh-CN")).toBe(true)
    expect(isLocale("uk")).toBe(false)
  })
  test("every language has every UI string", () => {
    const keys = Object.keys(UI.en)
    for (const code of LOCALE_CODES) expect(Object.keys(UI[code]).sort()).toEqual(keys.sort())
  })
})

describe("country and language detection", () => {
  test("country maps to the shipped language of that country", () => {
    expect(localeFromCountry("IT")).toBe("it")
    expect(localeFromCountry("de")).toBe("de")
    expect(localeFromCountry("BR")).toBe("pt")
    expect(localeFromCountry("CN")).toBe("zh-CN")
    expect(localeFromCountry("EG")).toBe("ar")
    expect(localeFromCountry("US")).toBeNull()
  })
  test("accept-language honours q-values and maps tags", () => {
    expect(localeFromAcceptLanguage("fr-CA,fr;q=0.9,en;q=0.8")).toBe("fr")
    expect(localeFromAcceptLanguage("en;q=0.5,it;q=0.9")).toBe("it")
    expect(localeFromAcceptLanguage("zh-Hans-CN")).toBe("zh-CN")
    expect(localeFromAcceptLanguage("xx-YY")).toBeNull()
  })
  test("precedence: saved choice, then country, then browser, then English", () => {
    expect(resolveLocale({ cookie: "ja", country: "IT", acceptLanguage: "it" })).toBe("ja")
    expect(resolveLocale({ country: "IT", acceptLanguage: "fr" })).toBe("it")
    expect(resolveLocale({ acceptLanguage: "fr" })).toBe("fr")
    expect(resolveLocale({})).toBe("en")
    expect(resolveLocale({ cookie: "bogus", country: "JP" })).toBe("ja")
  })
})

describe("localized paths", () => {
  test("prefix, strip and round-trip", () => {
    expect(localizePath("/docs/cam", "it")).toBe("/it/docs/cam")
    expect(localizePath("/docs/cam", "en")).toBe("/docs/cam")
    expect(localizePath("/download", "it")).toBe("/download")
    expect(splitLocalePath("/it/docs/cam")).toEqual({ locale: "it", pathname: "/docs/cam" })
    expect(splitLocalePath("/zh-CN/docs")).toEqual({ locale: "zh-CN", pathname: "/docs" })
    expect(splitLocalePath("/docs/cam")).toEqual({ locale: "en", pathname: "/docs/cam" })
  })
})

describe("article translation", () => {
  const shout = async (segments: ReadonlyArray<string>) => segments.map((s) => s.toUpperCase())
  test("translates text nodes, skips code, rewrites docs links", async () => {
    const out = await translateArticleHtml(`<h2>Posts</h2><p>Emit with <code>cam.post</code> now.</p><p><a href="/docs/cam">CAM</a></p>`, "it", shout)
    expect(out.translated).toBe(true)
    expect(out.html).toContain("POSTS")
    expect(out.html).toContain("<code>cam.post</code>")
    expect(out.html).not.toContain("CAM.POST")
    expect(out.html).toContain('href="/it/docs/cam"')
  })
  test("no translator leaves English and reports pending", async () => {
    const out = await translateArticleHtml(`<p>Hello</p>`, "it")
    expect(out).toEqual({ html: "<p>Hello</p>", translated: false, segments: 1 })
  })
  test("workers-AI translator batches long pages and caches segments in KV", async () => {
    const store = new Map<string, string>()
    let calls = 0
    const env = {
      AI: { run: async (_m: string, inputs: Record<string, unknown>) => {
        calls++
        const segs = JSON.parse((inputs.messages as { content: string }[])[1]!.content) as string[]
        expect(segs.length).toBeLessThanOrEqual(40)
        return { response: JSON.stringify(segs.map((s) => `[${s}]`)) }
      } },
      SESSIONS: { get: async (k: string) => store.get(k) ?? null, put: async (k: string, v: string) => { store.set(k, v) } },
    }
    const translator = workersAiTranslator(env)!
    const segments = Array.from({ length: 90 }, (_, i) => `segment ${i}`)
    const out = await translator(segments, "it")
    expect(out[0]).toBe("[segment 0]")
    expect(out[89]).toBe("[segment 89]")
    expect(calls).toBe(3)
    const again = await translator(segments, "it")
    expect(again).toEqual(out)
    expect(calls).toBe(3)
    expect(workersAiTranslator(undefined)).toBeUndefined()
    expect(workersAiTranslator({})).toBeUndefined()
  })
  test("a failing translator never breaks the page", async () => {
    const out = await translateArticleHtml(`<p>Hello</p>`, "it", async () => { throw new Error("down") })
    expect(out.translated).toBe(false)
    expect(out.html).toContain("Hello")
  })
})
