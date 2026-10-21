import { expect, test, setDefaultTimeout } from "bun:test"
import { writeIgesBreps, readIgesBreps, parasolidDiagnostic, makeBox, makeSphere, makeCylinder, makeCone, makeTorus, frame, massProperties, validateBrep, booleanBrep, type Brep } from "./index.ts"
setDefaultTimeout(120_000)
const check = (brep: Brep) => {
  const text = writeIgesBreps([{ name: "Roundtrip", brep }])
  expect(text.trimEnd().split("\n").every((l) => l.length === 80)).toBe(true)
  const read = readIgesBreps(text)
  expect(read.warnings).toEqual([])
  expect(read.parts).toHaveLength(1)
  const b = read.parts[0]!.brep
  expect(validateBrep(b).valid).toBe(true)
  expect(Math.abs(massProperties(b).volume - massProperties(brep).volume) / massProperties(brep).volume).toBeLessThan(1e-6)
}
test("IGES round-trips shared topology and analytic surfaces of placed primitives", () => {
  const f = frame({ x: 12, y: -7, z: 5 }, { x: 1, y: 2, z: 3 })
  for (const b of [makeBox(10, 12, 14, f), makeCylinder(4, 10, f), makeCone(4, 2, 10, f), makeSphere(5, f), makeTorus(8, 2, f)]) check(b)
})
test("IGES retains the hole of a trimmed Boolean part", () => {
  check(booleanBrep(makeBox(20, 20, 10), makeCylinder(3, 10, frame({ x: 10, y: 10, z: 0 })), "subtract").brep)
})
test("invalid data and Parasolid receive a precise refusal", () => {
  expect(() => readIgesBreps("not IGES")).toThrow("80-column")
  const text = writeIgesBreps([{ name: "Box", brep: makeBox(2, 3, 4) }])
  const bad = text.replace(/186,/, "999,")
  expect(() => readIgesBreps(bad)).toThrow("mismatch")
  expect(parasolidDiagnostic()).toMatchObject({ ok: false, format: "parasolid" })
  expect(parasolidDiagnostic().error).toContain("x_t is a text")
})
