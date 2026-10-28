/**
 * The language of the interface: the switch that applies a language, the
 * preference that remembers it and the selector that offers it
 * (spec 06-desktop-ui.md §1).
 */
import { describe, expect, test } from "bun:test"
import { installDom } from "./helpers/dom.ts"

installDom("http://localhost/settings")

const { t, setLocale, currentLocale, LOCALE_CODES, localeInfo } = await import("../src/i18n/index.ts")
const { createSettings, decodeSettings, DEFAULT_SETTINGS } = await import("../src/shared/state/settings.ts")

describe("the language of the interface", () => {
  test("switching the language changes what the app writes", async () => {
    const english = t("settings.title")
    await setLocale("it")
    expect(currentLocale()).toBe("it")
    const italian = t("settings.title")
    expect(italian).not.toBe(english)
    expect(italian).toBe("Impostazioni")
    // A key of another vertical follows too.
    expect(t("activity.projects")).not.toBe("Projects")
    await setLocale("en")
    expect(currentLocale()).toBe("en")
    expect(t("settings.title")).toBe(english)
  })

  test("the document follows the language and its direction", async () => {
    await setLocale("it")
    expect(document.documentElement.lang).toBe("it")
    expect(document.documentElement.dir).toBe("ltr")
    await setLocale("ar")
    expect(document.documentElement.lang).toBe("ar")
    expect(document.documentElement.dir).toBe("rtl")
    await setLocale("en")
    expect(document.documentElement.dir).toBe("ltr")
  })

  test("an unknown language is refused and leaves the app alone", async () => {
    await setLocale("en")
    await expect(setLocale("kl" as never)).rejects.toThrow()
    expect(currentLocale()).toBe("en")
  })

  test("the preference keeps the language and forgets a broken one", () => {
    expect(DEFAULT_SETTINGS.locale).toBe("en")
    expect(decodeSettings({ locale: "it" }).locale).toBe("it")
    expect(decodeSettings({ locale: "zh-CN" }).locale).toBe("zh-CN")
    expect(decodeSettings({ locale: "kl" }).locale).toBe("en")
    const settings = createSettings()
    settings.update({ locale: "de" })
    expect(settings.settings().locale).toBe("de")
    expect(decodeSettings(JSON.parse(localStorage.getItem("cadcamfun.settings") ?? "{}")).locale).toBe("de")
  })

  test("the selector offers every language and stores the choice", async () => {
    const { render } = await import("solid-js/web")
    const { createFakeApi } = await import("../src/testing/fake-api.ts")
    const { runtimeForClient } = await import("../src/app/client.ts")
    const { createAppState, AppProvider } = await import("../src/shared/state/context.ts")
    const { LanguageSelector } = await import("../src/features/settings/components/language-selector.tsx")
    const client = createFakeApi()
    const runtime = runtimeForClient(client)
    const app = createAppState({ client, runtime, sidecar: "fake" })
    const root = document.createElement("div")
    document.body.append(root)
    const dispose = render(() => AppProvider({ state: app, get children() { return LanguageSelector() } }), root)
    const select = root.querySelector("select")
    expect(select).not.toBeNull()
    const options = [...(select?.querySelectorAll("option") ?? [])]
    expect(options.map((option) => option.value)).toEqual([...LOCALE_CODES])
    // Every language is offered by its own name.
    expect(options.map((option) => option.textContent)).toEqual(LOCALE_CODES.map((code) => localeInfo(code).endonym))
    if (select !== null) {
      select.value = "fr"
      select.dispatchEvent(new Event("change", { bubbles: true }))
    }
    expect(app.settings.settings().locale).toBe("fr")
    dispose()
    app.dispose()
  })
})
