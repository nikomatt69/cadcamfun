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
