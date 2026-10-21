import { expect, test } from "bun:test"
import { model } from "../cad/script.ts"
import { meshOf } from "../cad/solid.ts"
import { projectView } from "./project.ts"
import { generateSheet } from "./sheet.ts"

test("isometric hidden-line removal retains visible edges while principal views can show hidden geometry", () => {
  const mesh = meshOf({ _tag: "Box", origin: { x: 0, y: 0, z: 0 }, size: { x: 20, y: 15, z: 10 } })
  const full = projectView(mesh, "iso")
  const visible = projectView(mesh, "iso", { hidden: false })
  expect(full.hidden.length).toBeGreaterThan(0)
  expect(visible.visible).toEqual(full.visible)
  expect(visible.hidden).toEqual([])
  const sheet = generateSheet({ mesh }, { views: ["front"], iso: true })
  // A box seen from the front hides its back edges behind coincident front edges; the only other panel is the isometric.
  expect(sheet.drawing.entities.filter((e) => e.layerId === "hidden")).toEqual([])
})

test("invalid direct sheet options and partially failed histories cannot produce exports", () => {
  const m = model()
  m.extrude(m.sketch("XY").rectangle([0, 0], 20, 15), { depth: 10 })
  const history = m.build()
  for (const options of [{ scale: 0 }, { scale: NaN }, { views: [] }, { detail: { centre: { x: NaN, y: 0, z: 0 }, radius: 2, factor: 2 } }]) {
    expect(() => generateSheet(history, options as never)).toThrow()
  }
  const failed = { ...history, features: [...history.features, { type: "hole", id: "broken", plane: "XY", at: [5, 5], diameter: -2, depth: 5 }] }
  expect(() => generateSheet(failed as never)).toThrow("failed to rebuild")
})

test("GD&T frames, datum features and balloons are drawn on the sheet and reported", () => {
  const m = model()
  m.extrude(m.sketch("XY").rectangle([0, 0], 40, 25), { depth: 10 })
  const history = m.build()
  const base = generateSheet(history, { views: ["front", "top"] })
  const sheet = generateSheet(history, {
    views: ["front", "top"],
    datums: [{ letter: "A", at: { x: 20, y: 0, z: 0 }, view: "front", side: "down" }],
    gdt: [
      { spec: { kind: "perpendicularity", value: 0.05, datums: ["A"] }, at: { x: 40, y: 0, z: 5 }, view: "front" },
      { spec: { kind: "position", value: 0.1, diameter: true, modifier: "M", datums: ["A", "B"] }, at: { x: 20, y: 12, z: 10 }, view: "top" }
    ],
    balloons: [{ text: "3", at: { x: 5, y: 0, z: 5 }, view: "front" }]
  })
  const texts = sheet.drawing.entities.filter((e) => e.layerId === "text").map((e) => (e as { text?: string }).text)
  expect(texts).toContain("Ø0.1 (M)")
  expect(texts).toContain("0.05")
  expect(texts).toContain("A")
  expect(texts).toContain("3")
  const added = sheet.drawing.entities.length - base.drawing.entities.length
  expect(added).toBeGreaterThan(25)
  expect(sheet.dimensions.map((d) => d.text)).toEqual(expect.arrayContaining(["perpendicularity | 0.05 | A", "position | Ø0.1 (M) | A | B", "datum A", "item 3"]))
  // The frame refers to datum B, which no datum feature defines: said, not hidden.
  expect(sheet.warnings.some((w) => w.includes("datum B"))).toBe(true)
  expect(sheet.svg).toContain("<svg")
  for (const bad of [{ gdt: [{ spec: { kind: "parallelism", value: 0.1 }, at: { x: 0, y: 0, z: 0 } }] }, { datums: [{ letter: "a", at: { x: 0, y: 0, z: 0 } }] }, { datums: [{ letter: "A", at: { x: 0, y: 0, z: 0 } }, { letter: "A", at: { x: 1, y: 0, z: 0 } }] }]) {
    expect(() => generateSheet(history, bad as never)).toThrow()
  }
})
