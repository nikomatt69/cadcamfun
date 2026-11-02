import { describe, expect, test } from "bun:test"
import { emptyPmiSet, pmiDrawingData, pmiErrors, pmiFingerprint, pmiSetOf, validatePmiSet, type PmiSet } from "./pmi.ts"

const ref = { body: "part", kind: "face" as const, key: "plate.top" }
const valid: PmiSet = {
  version: 1,
  captures: [{ id: "c1", name: "Front", annotationIds: ["d1", "s1", "g1"] }],
  annotations: [
    { id: "d1", captureId: "c1", refs: [ref], kind: "datum", letter: "A" },
    { id: "s1", captureId: "c1", refs: [ref], kind: "dimensional-size", nominal: 10, upper: 0.1, lower: -0.1 },
    { id: "g1", captureId: "c1", refs: [ref], kind: "geometric-tolerance", gdt: { kind: "position", value: 0.1, diameter: true, datums: ["A"] } }
  ]
}

describe("validatePmiSet", () => {
  test("accepts a valid set and empty set", () => {
    expect(validatePmiSet(valid)).toEqual([])
    expect(validatePmiSet(emptyPmiSet())).toEqual([])
  })
  test("flags duplicate datum, unknown datum, bad tolerance, capture mismatch, orphan refs", () => {
    const bad: PmiSet = {
      version: 1,
      captures: [{ id: "c1", name: "F", annotationIds: ["d1"] }],
      annotations: [
        { id: "d1", captureId: "c1", refs: [ref], kind: "datum", letter: "A" },
        { id: "d2", captureId: "c1", refs: [ref], kind: "datum", letter: "A" },
        { id: "s1", captureId: "c1", refs: [], kind: "dimensional-size", nominal: 10, upper: -1, lower: 1 },
        { id: "g1", captureId: "c1", refs: [ref], kind: "geometric-tolerance", gdt: { kind: "flatness", value: 0.1, diameter: true } }
      ]
    }
    const codes = validatePmiSet(bad).map((i) => i.code)
    expect(codes).toContain("duplicate-datum")
    expect(codes).toContain("bad-tolerance")
    expect(codes).toContain("no-refs")
    expect(codes).toContain("bad-gdt")
    expect(codes).toContain("capture-mismatch")
  })
  test("unknown GD&T datum unless supplied as known", () => {
    const s: PmiSet = { version: 1, captures: [{ id: "c1", name: "F", annotationIds: ["g1"] }], annotations: [{ id: "g1", captureId: "c1", refs: [ref], kind: "geometric-tolerance", gdt: { kind: "position", value: 0.1, datums: ["B"] } }] }
    expect(validatePmiSet(s).map((i) => i.code)).toContain("unknown-datum")
    expect(validatePmiSet(s, ["B"])).toEqual([])
  })
  test("never throws on damaged data", () => {
    expect(validatePmiSet(null as never).length).toBeGreaterThan(0)
    expect(pmiErrors({ version: 1, annotations: "x", captures: [] }).length).toBeGreaterThan(0)
    expect(pmiErrors(undefined)).toEqual([])
  })
})

describe("fingerprint and drawing derivation", () => {
  test("fingerprint is order/plane independent but value sensitive", () => {
    const reordered: PmiSet = { ...valid, annotations: [...valid.annotations].reverse() }
    expect(pmiFingerprint(reordered)).toBe(pmiFingerprint(valid))
    const changed: PmiSet = { ...valid, annotations: valid.annotations.map((a) => a.kind === "dimensional-size" ? { ...a, nominal: 11 } : a) }
    expect(pmiFingerprint(changed)).not.toBe(pmiFingerprint(valid))
  })
  test("drawing data reuses GD&T and dimension text", () => {
    const d = pmiDrawingData(valid)
    expect(d.datums).toEqual([{ annotationId: "d1", letter: "A" }])
    expect(d.dimensions[0]?.text).toContain("10")
    expect(d.gdt[0]?.spec.kind).toBe("position")
  })
  test("pmiSetOf reads Drawing.data", () => {
    expect(pmiSetOf({ pmi: valid })).toEqual(valid)
    expect(pmiSetOf({})).toEqual(emptyPmiSet())
    expect(pmiSetOf(null)).toEqual(emptyPmiSet())
  })
})
