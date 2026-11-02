/**
 * PMI in the CAD toolbar (spec 49 P1, like FEA): the `EnhancedToolbar` button opens the PMI
 * dialog in a Portal next to the cursor, one toolbar dialog at a time, and the panel is not
 * mounted a second time in the drawing inspector.
 */
import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const toolbar = readFileSync(join(import.meta.dir, "../src/features/cad/components/EnhancedToolbar.tsx"), "utf8")
const cadPage = readFileSync(join(import.meta.dir, "../src/features/cad/screens/CadPage.tsx"), "utf8")

test("the CAD toolbar has a PMI button next to FEA opening a positioned dialog", () => {
  expect(toolbar).toContain('data-testid="cad-pmi-toolbar-button"')
  expect(toolbar).toContain('title={t("cad.pmi.title")}')
  expect(toolbar).toContain("<Ruler size={16} />")
  expect(toolbar).toContain('data-testid="cad-pmi-dialog"')
  expect(toolbar).toContain("<PmiPanel embedded />")
  // The dialog carries the panel design tokens, so panel buttons/inputs stay readable in the Portal.
  expect(toolbar).toContain('class="panel fixed z-[9999]')
  // FEA keeps its own button and dialog.
  expect(toolbar).toContain('title={t("cad.tb.openFea")}')
  expect(toolbar).toContain("<SimulationPanel />")
})

test("FEA and PMI toolbar dialogs are mutually exclusive and close on Escape", () => {
  expect(toolbar).toContain("setPmiPosition(null)\n    setSimulationPosition(dialogPosition(event,")
  expect(toolbar).toContain("setSimulationPosition(null)\n    setPmiPosition(dialogPosition(event,")
  expect(toolbar).toContain('setSimulationPosition(null); setPmiPosition(null); setShowElementsPopup(false)')
})

test("PMI texts always follow the panel design tokens, never ad-hoc shell colours", () => {
  const panel = readFileSync(join(import.meta.dir, "../src/features/pmi/components/PmiPanel.tsx"), "utf8")
  const form = readFileSync(join(import.meta.dir, "../src/features/pmi/components/PmiAnnotationForm.tsx"), "utf8")
  for (const source of [panel, form]) {
    expect(source).not.toMatch(/text-gray-|border-gray-|text-red-|border-amber-|teal-/)
    expect(source).toContain("var(--panel-text-muted)")
    expect(source).toContain("panel-label")
  }
  // The panel carries its tokens wherever it mounts, and the toolbar toggle is the shared one.
  expect(panel).toContain('class="panel"')
  expect(toolbar).toContain("pmiPosition() ? TOGGLE_ON : TOGGLE_OFF")
  expect(toolbar).not.toContain("teal")
})

test("the PMI panel lives only in the toolbar dialog; the viewport overlay stays on the canvas", () => {
  expect(cadPage).not.toContain("<PmiPanel />")
  expect(cadPage).toContain("<PmiViewportOverlay")
  expect(cadPage).toContain("<DrawingPanel />")
})
