import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { makeBox, makeCylinder, readStepBreps } from "../brep/index.ts"
import { stepToPmi } from "../../pmi/step-pmi.ts"
import type { PmiSet } from "../../pmi/pmi.ts"
import { writeStepAp242 } from "./ap242.ts"

setDefaultTimeout(60_000)

const ref = { body: "plate", kind: "face" as const, key: "plate.top" }
const pmi: PmiSet = {
  version: 1,
  captures: [{ id: "c1", name: "Front", annotationIds: ["d1", "g1"] }],
  annotations: [
    { id: "d1", captureId: "c1", refs: [ref], kind: "datum", letter: "A" },
    { id: "g1", captureId: "c1", refs: [ref], kind: "geometric-tolerance", gdt: { kind: "position", value: 0.1, diameter: true, datums: ["A"] } }
  ]
}

describe("AP242 export", () => {
  const plate = makeBox(40, 30, 8)
  const pin = makeCylinder(5, 20)
  const text = writeStepAp242([
    { name: "plate", brep: plate, colour: { r: 0.8, g: 0.1, b: 0.1 }, layer: "BODIES" },
    { name: "pin", brep: pin, layer: "BODIES" }
  ], { pmi, timestamp: "2026-01-01T00:00:00" })

  test("declares the AP242 schema and keeps ids unique", () => {
    expect(text).toContain("AP242_MANAGED_MODEL_BASED_3D_ENGINEERING_MIM_LF")
    expect(text).not.toContain("AUTOMOTIVE_DESIGN")
    const ids = [...text.matchAll(/^#(\d+)=/gm)].map((m) => m[1]!)
    expect(new Set(ids).size).toBe(ids.length)
  })
  test("colours a solid and assigns the layer to both", () => {
    expect(text).toMatch(/COLOUR_RGB\('',0\.8,0\.1,0\.1\)/)
    expect(text).toMatch(/STYLED_ITEM\('colour',\(#\d+\),#\d+\)/)
    expect(text).toMatch(/MECHANICAL_DESIGN_GEOMETRIC_PRESENTATION_REPRESENTATION/)
    const layer = /PRESENTATION_LAYER_ASSIGNMENT\('BODIES','',\((#\d+),(#\d+)\)\)/.exec(text)
    expect(layer).not.toBeNull()
    for (const id of [layer![1]!, layer![2]!]) expect(text).toMatch(new RegExp(`^${id}=(MANIFOLD_SOLID_BREP|BREP_WITH_VOIDS)`, "m"))
  })
  test("the geometry still reads back and the PMI round-trips", () => {
    const back = readStepBreps(text)
    expect(back.parts.length).toBe(2)
    const set = stepToPmi(text.split("\n").filter((l) => /DATUM|GEOMETRIC_TOLERANCE|SHAPE_ASPECT|ANNOTATION_OCCURRENCE|PMI_CAPTURE/.test(l)).map((l) => l.replace(/^#(\d+)=/, "#$1 = ")).join("\n"))
    expect(set.annotations.map((a) => a.kind).sort()).toEqual(["datum", "geometric-tolerance"])
  })
  test("a colour channel outside 0..1 is refused", () => {
    expect(() => writeStepAp242([{ name: "plate", brep: plate, colour: { r: 2, g: 0, b: 0 } }])).toThrow(/outside 0..1/)
  })
})
