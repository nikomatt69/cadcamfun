/**
 * The CAD property editor and the custom element templates read their texts through `t()` when asked (spec 06 §1):
 * a label follows the language, the field ids do not, and a definition made from a template keeps the words of
 * the language it was made in.
 */
import { describe, expect, test } from "bun:test"
import { installDom } from "./helpers/dom.ts"

installDom("http://localhost/cad")

const { setLocale, LOCALE_CODES } = await import("../src/i18n/index.ts")
const { getFieldsForElementType, numberRulesFor } = await import("../src/features/cad/lib/propertyFields.ts")
const { createDefinitionFromTemplate, customElementTemplates } = await import("../src/features/cad/lib/customElements/templates.ts")

const labels = (type: string): string[] => getFieldsForElementType(type).map((field) => field.label)

describe("property field labels", () => {
  test("English stays as written and a language changes the labels but not the ids", async () => {
    await setLocale("en")
    expect(labels("torus")).toContain("Outer Radius")
    const ids = getFieldsForElementType("torus").map((field) => field.name)
    await setLocale("de")
    expect(labels("torus")).toContain("Außenradius")
    expect(getFieldsForElementType("torus").map((field) => field.name)).toEqual(ids)
    await setLocale("en")
  })

  test("option labels follow the language and font names stay as written", async () => {
    await setLocale("it")
    const grid = getFieldsForElementType("grid").find((field) => field.name === "plane")
    expect(grid?.options?.map((option) => option.label)).toEqual(["Piano XY", "Piano XZ", "Piano YZ"])
    const text = getFieldsForElementType("text").find((field) => field.name === "font")
    expect(text?.options?.map((option) => option.label)).toEqual(["Arial", "Helvetica", "Times New Roman"])
    await setLocale("en")
  })

  test("an angle keeps its degree rule in every language", async () => {
    for (const code of LOCALE_CODES) {
      await setLocale(code)
      const angle = getFieldsForElementType("rectangle").find((field) => field.name === "angle")
      expect(angle && numberRulesFor(angle).degrees, code).toBe(true)
    }
    await setLocale("en")
  })
})

describe("custom element templates", () => {
  test("a definition takes the words of the language it was made in, not a live link", async () => {
    await setLocale("fr")
    const made = createDefinitionFromTemplate("basicBox")
    await setLocale("en")
    expect(made?.name).toBe("Boîte paramétrique")
    expect(made?.parameters.width?.label).toBe("Largeur")
    expect(Object.getOwnPropertyDescriptor(made?.parameters.width, "label")?.get).toBeUndefined()
    expect(customElementTemplates.basicBox?.name).toBe("Parametric Box")
    expect(createDefinitionFromTemplate("basicBox")?.parameters.width?.label).toBe("Width")
  })
})
