/** The visualizer reads tool changes of every control and shows an operation that changes tools inside as one operation (spec 69 G4b). */
import { afterAll, beforeAll, expect, test } from "bun:test"
import { bootLiveApp } from "./helpers/live-app.ts"
import { useCamStore } from "../src/features/cam/store/camStore.ts"

let app: Awaited<ReturnType<typeof bootLiveApp>>
beforeAll(async () => { app = await bootLiveApp() })
afterAll(async () => { await app.dispose() })

const settle = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms))
const find = <T extends Element = HTMLElement>(selector: string): Promise<T> => app.wait(() => document.querySelector<T>(selector), 30000)
const editor = (): HTMLTextAreaElement | null => document.querySelector<HTMLTextAreaElement>("textarea")
const clickToolpathTab = async (): Promise<void> => {
  const el = await app.wait(() => [...document.querySelectorAll<HTMLElement>(".workstation-workspace-tabs button")].find((button) => button.textContent?.trim() === "Toolpath"), 30000)
  el.click()
  await settle()
}

test("an operation with two tools is one operation: two toolpath rows marked 1/2 and 2/2, tool changes on the timeline", async () => {
  const { dispose } = app.visit("/cam")
  try {
    await app.wait(() => editor())
    const program = [
      "G21 G90 G17", "(OP 1: Rough and clear the corners | T1)", "T1 M6", "S8000 M3", "G0 X0 Y0 Z5", "G1 Z-2 F300", "G1 X40 F800", "G0 Z5",
      "T2", "M6", "S9000 M3", "G0 X0 Y10 Z5", "G1 Z-2 F300", "G1 X40 F800", "G0 Z5",
      "(OP 2: Finish | T2)", "G0 X0 Y20", "G1 Z-3 F300", "G1 X40 F800", "G0 Z5", "M30"
    ].join("\n")
    const box = editor()!
    box.value = program
    box.dispatchEvent(new window.Event("input", { bubbles: true }))
    await settle()
    await clickToolpathTab()
    // Three toolpaths: operation 1 has two (one per tool), operation 2 shares tool 2 with the end of operation 1 and stays its own.
    await app.wait(() => (document.querySelectorAll('[data-testid="timeline-band"]').length === 3 ? true : undefined), 30000)
    expect(document.querySelectorAll('[data-testid="timeline-tool-change"]').length).toBe(1)
    expect(useCamStore.getState().program.toolpaths.map((t) => [t.operation?.id, t.toolId])).toEqual([["op-1", "T1"], ["op-1", "T2"], ["op-2", "T2"]])
    ;(await find('[data-testid="operations-toggle"]')).click()
    await settle()
    const rows = await app.wait(() => (document.querySelectorAll('[data-testid="operation-row"]').length === 3 ? [...document.querySelectorAll('[data-testid="operation-row"]')] : undefined), 30000)
    const badges = rows.map((row) => row.querySelector('[data-testid="operation-multitool"]')?.textContent?.trim())
    expect(badges).toEqual(["1/2", "2/2", undefined])
    expect(rows[0]!.textContent).toContain("Rough and clear the corners")
  } finally { dispose() }
}, 90000)
