/**
 * The Post-Processor tab end to end over the core's conversion kernel (`cam.convertNc`): the editor's program converts for
 * Fanuc and Heidenhain Klartext and is verified by replay, the figures table shows, smoothing writes the control's own code,
 * a program the conversion refuses shows the reason and no verified note, and the post selection stays one across the ribbon,
 * the page and the tab.
 *
 * Hooks are data-testids and element ids, not visible text: the panel strings may move to i18n.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { bootLiveApp } from "./helpers/live-app.ts"

let app: Awaited<ReturnType<typeof bootLiveApp>>
let restoreTemplates = (): void => {}
beforeAll(async () => { app = await bootLiveApp(); restoreTemplates = parseTableRowTemplates() }, 60000)
afterAll(async () => { restoreTemplates(); await app.dispose() })

/**
 * happy-dom parses a `<template>` whose markup starts with a table row (`<tr>`, `<td>`, `<th>`) to an empty fragment, where a
 * browser keeps the row. Solid compiles every `<For>` row of a table to such a template (the figures table's rows), so the
 * mount would crash on `null.cloneNode`. Parse those templates inside a table, as the HTML parser's template mode does, and move
 * the row into the template's content. Scoped to this file; removed after it.
 */
function parseTableRowTemplates(): () => void {
  const proto = window.HTMLTemplateElement.prototype
  const own = Object.getOwnPropertyDescriptor(proto, "innerHTML")!
  Object.defineProperty(proto, "innerHTML", {
    configurable: true,
    get(this: HTMLTemplateElement) { return own.get!.call(this) },
    set(this: HTMLTemplateElement, html: string) {
      const match = /^\s*<(tr|td|th)\b/i.exec(html)
      if (!match) return own.set!.call(this, html)
      const row = match[1]!.toLowerCase() === "tr"
      own.set!.call(this, row ? `<table><tbody>${html}</tbody></table>` : `<table><tbody><tr>${html}</tr></tbody></table>`)
      const holder = this.content.querySelector(row ? "tbody" : "tr")!
      this.content.replaceChildren(...holder.childNodes)
    }
  })
  return () => Object.defineProperty(proto, "innerHTML", own)
}

const settle = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms))
const find = <T extends Element = HTMLElement>(selector: string): Promise<T> => app.wait(() => document.querySelector<T>(selector), 30000)
const testId = (id: string): HTMLElement | null => document.querySelector<HTMLElement>(`[data-testid="${id}"]`)
const byText = (tag: string, text: string): HTMLElement | undefined =>
  [...document.querySelectorAll<HTMLElement>(tag)].find((el) => el.textContent?.trim() === text)
const clickText = async (tag: string, text: string): Promise<void> => {
  const el = await app.wait(() => byText(tag, text), 30000)
  el.click()
  await settle()
}
const typeInto = async (el: HTMLTextAreaElement, value: string): Promise<void> => {
  el.value = value
  el.dispatchEvent(new window.Event("input", { bubbles: true }))
  await settle()
}
const setSelect = async (el: HTMLSelectElement, value: string): Promise<void> => {
  el.value = value
  el.dispatchEvent(new window.Event("change", { bubbles: true }))
  await settle()
}
const check = async (id: string, on: boolean): Promise<void> => {
  const box = await find<HTMLInputElement>(`#${id}`)
  if (box.checked !== on) box.click()
  await settle()
  expect(box.checked).toBe(on)
}
const target = (): Promise<HTMLSelectElement> => find<HTMLSelectElement>('[data-testid="advanced-controller"]')
const source = (): Promise<HTMLSelectElement> => find<HTMLSelectElement>('[data-testid="post-source"]')

/** Presses Convert and waits for the results section of this run. */
const convert = async (): Promise<HTMLElement> => {
  const button = await find<HTMLButtonElement>('[data-testid="process-gcode"]')
  await app.wait(() => !button.disabled, 30000)
  button.click()
  return find('[data-testid="post-results"]')
}

/** The button that toggles the preview: the results section's first action button (its text may be translated). */
const showPreview = async (): Promise<HTMLElement> => {
  const existing = testId("post-preview")
  if (existing) return existing
  const results = await find('[data-testid="post-results"]')
  const toggle = await app.wait(() =>
    byText("button", "Show Preview") ??
    [...results.querySelectorAll<HTMLButtonElement>(".cam-post__result-actions button, button")].find((b) => !b.disabled && /preview/i.test(b.textContent ?? "")), 30000)
  toggle.click()
  return find('[data-testid="post-preview"]')
}

/** The tab choice outlives the page (camStore), so make sure the editor is the visible tab before typing. */
const openEditor = async (): Promise<HTMLTextAreaElement> => {
  await clickText("button", "Editor G-Code")
  return app.wait(() => document.querySelector<HTMLTextAreaElement>("textarea"), 30000)
}

/** Opens the ribbon's Post tab (the ribbon keeps its own tab) and returns the chip for `id`. */
const ribbonAction = async (id: string): Promise<HTMLButtonElement> => {
  if (!document.querySelector('[data-testid="cam-ribbon-post"]')) {
    ;(await find<HTMLButtonElement>('[data-ribbon-tab="post"]')).click()
    await find('[data-testid="cam-ribbon-post"]')
  }
  return find<HTMLButtonElement>(`[data-ribbon-action="${id}"]`)
}

const openPostTab = async (): Promise<void> => {
  ;(await ribbonAction("open-post-tab")).click()
  await find('[data-testid="advanced-post-processor"]')
}

const PROGRAM = "G21\nG90\nT1 M6\nS3000 M3\nG0 X0 Y0 Z5\nG1 Z-1 F150\nG1 X10 Y0\nG1 X10 Y10\nG0 Z5\nM5\nM30"
/** Rigid tapping: written as plain moves it would break the tap, so the conversion refuses it. */
const TAPPING = "G21\nG90\nT1 M6\nS500 M3\nG0 X0 Y0 Z5\nG84 X0 Y0 Z-10 R2 F625\nG80\nM5\nM30"

const withPage = async (body: () => Promise<void>): Promise<void> => {
  const { dispose } = app.visit("/cam")
  try {
    await body()
  } finally {
    // camStore keeps the active tab for the whole process: leave the editor visible and empty for the other CAM tests.
    await typeInto(await openEditor(), "").catch(() => {})
    dispose()
  }
}

describe("Post-Processor tab", () => {
  test("the editor's program converts for Fanuc and Heidenhain Klartext, verified by replay, with figures and preview", async () => {
    await withPage(async () => {
      await typeInto(await openEditor(), PROGRAM)
      await openPostTab()

      // Nothing is converted until Convert is pressed.
      expect(testId("post-results")).toBeNull()
      expect((await target()).value).toBe("fanuc")
      expect((await source()).value).toBe("fanuc")

      await convert()
      await find('[data-testid="post-verified"]')
      expect(testId("post-errors")).toBeNull()
      // A table or an ARIA grid: one row per figure, an input and an output cell each.
      const figures = await find('[data-testid="post-figures"]')
      const rows = [...figures.querySelectorAll<HTMLElement>('tbody tr, [role="row"]')].filter((row) => row.querySelector('td, [role="cell"]'))
      expect(rows.length).toBeGreaterThanOrEqual(5)
      // Input and output are both filled for the line count: the output was replayed too.
      const lines = [...rows[0]!.querySelectorAll('td, [role="cell"]')].map((cell) => cell.textContent?.trim()).slice(-2)
      expect(lines[0]).toMatch(/^\d+$/)
      expect(lines[1]).toMatch(/^\d+$/)
      const fanuc = await showPreview()
      expect(fanuc.textContent).toContain("T1 M6")
      expect(fanuc.textContent).toContain("M30")

      // Heidenhain: the target select converts the same Fanuc program into Klartext.
      await setSelect(await target(), "heidenhain")
      await setSelect(await source(), "fanuc")
      await convert()
      await find('[data-testid="post-verified"]')
      expect(testId("post-errors")).toBeNull()
      const klartext = await showPreview()
      const text = klartext.textContent ?? ""
      expect(text).toContain("BEGIN PGM")
      expect(text).toContain("END PGM")
      expect(text).toContain("TOOL CALL 1")
      expect(text.split("\n").some((line) => /L .* R0 FMAX/.test(line))).toBe(true)
      expect(text).not.toContain("G0 ")
    })
  }, 90000)

  test("smoothing on Fanuc writes AICC (G5.1 Q1); block numbers number the output", async () => {
    await withPage(async () => {
      await typeInto(await openEditor(), PROGRAM)
      await openPostTab()
      await setSelect(await target(), "fanuc")
      await setSelect(await source(), "fanuc")

      await check("post-smoothing", true)
      await check("post-numbered", true)
      await convert()
      await find('[data-testid="post-verified"]')
      const preview = await showPreview()
      expect(preview.textContent).toContain("G5.1 Q1")
      expect(preview.textContent).toMatch(/N10 /)
    })
  }, 90000)

  test("a program the conversion refuses shows the reason and no verified note", async () => {
    await withPage(async () => {
      await typeInto(await openEditor(), TAPPING)
      await openPostTab()
      await setSelect(await target(), "grbl")
      await setSelect(await source(), "fanuc")

      await convert()
      const errors = await find('[data-testid="post-errors"]')
      expect(errors.textContent).toMatch(/tap/i)
      expect(testId("post-verified")).toBeNull()
    })
  }, 90000)

  test("the post selection is one: ribbon, page and tab follow each other", async () => {
    await withPage(async () => {
      await typeInto(await openEditor(), PROGRAM)
      await openPostTab()

      // The ribbon lists every post the core writes.
      for (const id of ["fanuc", "haas", "siemens", "heidenhain", "linuxcnc", "grbl", "generic"]) {
        expect(document.querySelector(`[data-ribbon-action="post-${id}"]`)).not.toBeNull()
      }
      const pressed = (id: string): string | null => document.querySelector(`[data-ribbon-action="post-${id}"]`)!.getAttribute("aria-pressed")

      // Ribbon -> tab.
      ;(await ribbonAction("post-siemens")).click()
      await app.wait(() => document.querySelector<HTMLSelectElement>("#post-processor-target")?.value === "siemens", 30000)
      expect(pressed("siemens")).toBe("true")
      expect(pressed("fanuc")).toBe("false")

      ;(await ribbonAction("post-heidenhain")).click()
      await app.wait(() => document.querySelector<HTMLSelectElement>("#post-processor-target")?.value === "heidenhain", 30000)
      expect(pressed("heidenhain")).toBe("true")
      expect(pressed("siemens")).toBe("false")

      // Tab -> ribbon.
      await setSelect(await target(), "linuxcnc")
      await app.wait(() => pressed("linuxcnc") === "true", 30000)
      expect(pressed("heidenhain")).toBe("false")

      // The selection survives leaving the tab and coming back.
      await openEditor()
      await openPostTab()
      expect((await target()).value).toBe("linuxcnc")

      // Leave the page on the default post for the other CAM tests.
      ;(await ribbonAction("post-fanuc")).click()
      await app.wait(() => pressed("fanuc") === "true", 30000)
    })
  }, 90000)
})
