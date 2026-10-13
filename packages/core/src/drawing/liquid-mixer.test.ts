import { describe, expect, test } from "bun:test"
import { insideLoops, sectionView } from "./section.ts"
import { generateSheet } from "./sheet.ts"
import { liquidMixerHistory, liquidMixerSheetOptions } from "./liquid-mixer.ts"
import { rebuild } from "../cad/history.ts"

const sheet = generateSheet(liquidMixerHistory(), liquidMixerSheetOptions)

describe("the Liquid mixer sheet against the reference drawing", () => {
  test("the part builds without errors and the sheet has the six views", () => {
    expect(rebuild(liquidMixerHistory()).issues.filter((i) => i.severity === "error")).toEqual([])
    expect(sheet.views.map((v) => v.name).sort()).toEqual(["detail", "front", "iso", "right", "section", "top"])
  })

  test("the hole callouts read like the reference", () => {
    expect(sheet.callouts).toContain("2 x Ø8.0 THRU ALL / ⌴ Ø13.5 ↧ 8.5")
    expect(sheet.callouts).toContain("2 x Ø8.1 ±0.1 / ⌵ 10.0 x 90°")
    expect(sheet.callouts).toContain("6 x Ø3.3 ↧ 12.0 / M4 - 6H ↧ 8.0")
    expect(sheet.callouts).toContain("Ø12.0 +0.3/-0 ↧ 100.0")
    expect(sheet.callouts).toContain("Ø18.63 ↧ 18.0 / G1/2\" - 6H ↧ 18.0")
  })

  test("the dimension values: overall sizes, R10, the Ø24 circle and its 120 degrees, the 41 between boss centres", () => {
    const texts = sheet.dimensions.map((d) => d.text)
    for (const t of ["120.0", "70.0", "45.0", "R10.0", "Ø24.0", "120.0°", "41.0"]) expect(texts).toContain(t)
  })

  test("the section hatch lies only inside the cut region", () => {
    expect(sheet.section!.loops).toBeGreaterThan(0)
    const s = sectionView(rebuild(liquidMixerHistory()).bodies[0]!.mesh, { axis: "y", at: 35, from: "-", spacing: 3 })
    expect(s.hatch.length).toBeGreaterThan(10)
    expect(s.hatch.every((h) => insideLoops((h.a.x + h.b.x) / 2, (h.a.y + h.b.y) / 2, s.loops))).toBe(true)
  })

  test("the exported SVG contains the full physical sheet and escaped callouts", () => {
    expect(sheet.svg.startsWith("<svg")).toBe(true)
    expect(sheet.svg).toContain('width="420mm" height="297mm"')
    expect(sheet.svg).toContain("G1/2&quot;")
  })

  test("short chain labels do not overlap and pitch-circle dimensions belong to the detail", () => {
    expect(sheet.warnings.filter((w) => w === "Text overlaps: '10.0' and '26.0'" || w === "Text overlaps: '26.0' and '10.0'")).toEqual([])
    const pitch = sheet.dimensions.filter((d) => d.kind === "diameter" || d.kind === "angular")
    expect(pitch).toEqual([
      { view: "detail", kind: "diameter", text: "Ø24.0", value: 24 },
      { view: "detail", kind: "angular", text: "120.0°", value: 120 }
    ])
  })
})
