import { describe, expect, test } from "bun:test"
import { pmiToStep, stepToPmi } from "./step-pmi.ts"
import { validatePmiSet, type PmiSet } from "./pmi.ts"

const ref = { body: "part", kind: "face" as const, key: "plate.top" }
const set: PmiSet = {
  version: 1,
  captures: [{ id: "c1", name: "Front", annotationIds: ["d1", "s1", "l1", "g1", "t1", "n1"] }],
  annotations: [
    { id: "d1", captureId: "c1", refs: [ref], kind: "datum", letter: "A" },
    { id: "s1", captureId: "c1", refs: [ref], kind: "dimensional-size", nominal: 10, upper: 0.1, lower: -0.1 },
    { id: "l1", captureId: "c1", refs: [ref], kind: "dimensional-location", nominal: 25, upper: 0.2, lower: -0.2 },
    { id: "g1", captureId: "c1", refs: [ref], kind: "geometric-tolerance", gdt: { kind: "position", value: 0.1, diameter: true, modifier: "M", datums: ["A"] } },
    { id: "t1", captureId: "c1", refs: [ref], kind: "surface-texture", ra: 1.6, lay: "=" },
    { id: "n1", captureId: "c1", refs: [], kind: "note", text: "Deburr all edges" }
  ]
}

describe("STEP PMI codec", () => {
  test("emits AP242 entity names and annotation fallback", () => {
    const text = pmiToStep(set)
    for (const e of ["DIMENSIONAL_SIZE", "DIMENSIONAL_LOCATION", "GEOMETRIC_TOLERANCE", "DATUM", "SHAPE_ASPECT", "ANNOTATION_OCCURRENCE"]) expect(text).toContain(e)
  })
  test("round-trips the semantic subset", () => {
    const back = stepToPmi(pmiToStep(set))
    expect(validatePmiSet(back)).toEqual([])
    expect(back.annotations.length).toBe(set.annotations.length)
    const g = back.annotations.find((a) => a.id === "g1")
    expect(g?.kind).toBe("geometric-tolerance")
    if (g?.kind === "geometric-tolerance") { expect(g.gdt.value).toBe(0.1); expect(g.gdt.datums).toEqual(["A"]) }
    const s = back.annotations.find((a) => a.id === "s1")
    if (s?.kind === "dimensional-size") expect([s.nominal, s.upper, s.lower]).toEqual([10, 0.1, -0.1])
  })
})
