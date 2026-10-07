/**
 * The CAM "Verify" tab end to end (live sidecar handlers): the report for the code in the editor, the holder
 * fields, the stale marker and the pure helpers behind them.
 */
import { afterAll, beforeAll, describe, expect, test, afterEach } from "bun:test"
import { buildVerifyRequest, DEFAULT_HOLDER, heightColour, sortedIssues, toolOverrides } from "../src/cam/lib/verifyJob.ts"
import { cam } from "@cadcamfun/core"
import { bootLiveApp } from "./helpers/live-app.ts"
import { resetStores } from "./helpers/reset-stores.ts"

afterEach(() => resetStores())

describe("verify job helpers", () => {
  test("blank holder fields mean 'not modelled', never a zero-size tool", () => {
    expect(toolOverrides(DEFAULT_HOLDER)).toEqual({})
    expect(toolOverrides({ ...DEFAULT_HOLDER, cuttingLength: 12, stickout: 30, holderDiameter: 40, holderLength: 0 }))
      .toEqual({ cuttingLength: 12, stickout: 30, holderDiameter: 40 })
  })

  test("the request comes from the generator job and refuses empty code and non-mill jobs", () => {
    const settings = cam.generator.decodeSettings({ toolDiameter: 8 })
    const job = { settings, geometry: { ...cam.generator.DEFAULT_GEOMETRY, stock: { width: 60, height: 40, depth: 12, x: 0, y: 0, topZ: 0, allowance: 1 } }, printer: cam.generator.DEFAULT_PRINTER_EXTRAS } as never
    expect(buildVerifyRequest(job, "  ")).toEqual({ ok: false, error: "Generate or paste G-code first" })
    const built = buildVerifyRequest(job, "G0 X0", { ...DEFAULT_HOLDER, holderDiameter: 30, tolerance: 0.1 })
    expect(built.ok && built.request.stock).toEqual({ minX: -30, maxX: 30, minY: -20, maxY: 20, minZ: -12, maxZ: 0 })
    expect(built.ok && built.request.tool).toMatchObject({ diameter: 8, holderDiameter: 30, holderLength: 40 })
    expect(built.ok && built.request.tolerance).toBe(0.1)
    const lathe = { ...(job as { settings: object }), settings: cam.generator.decodeSettings({ machineType: "lathe", operationType: "turning" }) } as never
    expect(buildVerifyRequest(lathe, "G0 X0").ok).toBe(false)
  })

  test("issues sort errors first and keep discovery order within a severity", () => {
    const issue = (code: string, severity: "error" | "warning" | "info") => ({ code, severity, message: code, count: 1 }) as never
    expect(sortedIssues([issue("a", "info"), issue("b", "error"), issue("c", "warning"), issue("d", "error")]).map((i) => (i as { code: string }).code)).toEqual(["b", "d", "c", "a"])
  })

  test("height colours stay valid at the ends and for a flat map", () => {
    expect(heightColour(0, -10, 0)).toMatch(/^rgb\(\d+,\d+,\d+\)$/)
    expect(heightColour(-10, -10, 0)).not.toBe(heightColour(0, -10, 0))
    expect(heightColour(5, 5, 5)).toMatch(/^rgb/)
  })
})

let app: Awaited<ReturnType<typeof bootLiveApp>>
beforeAll(async () => { app = await bootLiveApp() }, 60000)
afterAll(async () => { await app.dispose() })

const settle = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms))
const click = async (el: Element | null | undefined): Promise<void> => { (el as HTMLElement).click(); await settle() }
const find = <T extends Element = HTMLElement>(selector: string): Promise<T> => app.wait(() => document.querySelector<T>(selector), 30000)
const byText = (tag: string, text: string): HTMLElement | undefined =>
  [...document.querySelectorAll<HTMLElement>(tag)].find((el) => el.textContent?.trim() === text)
const clickText = async (tag: string, text: string): Promise<void> => {
  const el = await app.wait(() => byText(tag, text), 30000)
  el.click()
  await settle()
}
const editor = (): HTMLTextAreaElement | null => document.querySelector<HTMLTextAreaElement>("textarea")
const type = async (el: HTMLTextAreaElement, value: string): Promise<void> => {
  el.value = value
  el.dispatchEvent(new window.Event("input", { bubbles: true }))
  await settle()
}
const runVerify = async (): Promise<void> => {
  const button = await app.wait(() => byText("button", "Verify G-code") ?? undefined, 30000) as HTMLButtonElement
  await app.wait(() => !button.disabled, 5000)
  button.click()
  await app.wait(() => document.querySelector('[data-testid="verify-report"]'), 30000)
}

describe("CAM page: Verify tab", () => {
  test("a rapid into the stock is reported with its line; a clean program passes; an edit marks the report stale", async () => {
    const { dispose } = app.visit("/cam")
    try {
      await app.wait(() => editor())
      await type(editor()!, "G21\nG90\nG0 X0 Y0 Z5\nG0 Z-2\nM30")
      await clickText("button", "Verify")
      await find('[data-testid="verify-panel"]')
      expect(document.querySelector('[data-testid="toolpath-generator"]')).toBeNull()
      await runVerify()
      const bad = document.querySelector('[data-testid="verify-report"] [role="status"]') as HTMLElement
      expect(bad.getAttribute("data-ok")).toBe("false")
      const issue = document.querySelector('[data-testid="verify-issues"] [data-code="RapidInMaterial"]')
      expect(issue?.textContent).toContain("line 4")
      expect(document.querySelector('[data-testid="verify-map"]')).not.toBeNull()
      // Errors offer the assistant: one click opens the panel with the findings.
      app.state.setPanelOpen(false)
      await click(await find('[data-testid="verify-ask-ai"]'))
      expect(app.state.panelOpen()).toBe(true)
      app.state.setPanelOpen(false)

      // Back to the editor, fix the program, verify again.
      await clickText("button", "Editor G-Code")
      await type(editor()!, "G21\nG90\nG0 X0 Y0 Z5\nG1 Z-1 F100\nG0 Z5\nM30")
      await clickText("button", "Verify")
      expect(document.querySelector('[data-testid="verify-stale"]')).not.toBeNull()
      await runVerify()
      await app.wait(() => document.querySelector('[data-testid="verify-report"] [role="status"]')?.getAttribute("data-ok") === "true", 30000)
      expect(document.querySelector('[data-testid="verify-stale"]')).toBeNull()
      expect(document.querySelector('[data-testid="verify-stats"]')?.textContent).toContain("mm³")
    } finally { dispose() }
  }, 90000)

  test("without G-code the button is disabled and says why", async () => {
    const { dispose } = app.visit("/cam")
    try {
      await app.wait(() => editor())
      await type(editor()!, "")
      await clickText("button", "Verify")
      await find('[data-testid="verify-panel"]')
      expect((byText("button", "Verify G-code") as HTMLButtonElement).disabled).toBe(true)
      expect(document.querySelector('[data-testid="verify-panel"]')?.textContent).toContain("Generate or paste G-code first.")
    } finally { dispose() }
  }, 60000)
})
