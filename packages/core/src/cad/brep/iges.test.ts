import { expect, test, setDefaultTimeout } from "bun:test"
import { writeIgesBreps, readIgesBreps, parasolidDiagnostic, makeBox, makeSphere, makeCylinder, makeCone, makeTorus, frame, massProperties, validateBrep, booleanBrep, type Brep } from "./index.ts"
import { applyPoint, compose, rotation, translation, type Transform } from "./math.ts"
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

// ---------------------------------------------------------------- transformation matrices (entity 124)

const holed = () => booleanBrep(makeBox(20, 20, 10), makeCylinder(3, 10, frame({ x: 10, y: 10, z: 0 })), "subtract").brep
const rowsOf = (tr: Transform): number[] => [tr.m[0], tr.m[1], tr.m[2], tr.t.x, tr.m[3], tr.m[4], tr.m[5], tr.t.y, tr.m[6], tr.m[7], tr.m[8], tr.t.z]
const lineOf = (data: string, section: string, n: number) => data.padEnd(72) + section + String(n).padStart(7)
const field8 = (v: string | number) => String(v).padStart(8)

/** Appends a 124 entity (rows R11 R12 R13 T1 ... T3) whose own directory entry points to `parent`; returns its DE number. */
const addMatrix = (text: string, rows: ReadonlyArray<number>, parent = 0): { text: string; id: number } => {
  const lines = text.trimEnd().split("\n")
  const d = lines.filter((l) => l[72] === "D").length, p = lines.filter((l) => l[72] === "P").length
  const id = d + 1
  const params = ["124", ...rows.map(String)]
  const pLines: string[] = []
  let current = ""
  params.forEach((v, i) => {
    const token = v + (i === params.length - 1 ? ";" : ",")
    if (current.length + token.length > 64) { pLines.push(current); current = "" }
    current += token
  })
  pLines.push(current)
  const dLines = [
    lineOf([124, p + 1, 0, 0, 0, 0, parent, 0, "00000000"].map(field8).join(""), "D", id),
    lineOf([124, 0, 0, pLines.length, 0, 0, 0, "", 0].map(field8).join(""), "D", id + 1)
  ]
  return { text: [...lines, ...dLines, ...pLines.map((l, i) => lineOf(l.padEnd(64) + field8(id), "P", p + 1 + i))].join("\n") + "\n", id }
}

/** Points the transformation field of every directory entry whose type passes `which` to `matrix`. */
const place = (text: string, which: (type: number) => boolean, matrix: number): string =>
  text.split("\n").map((l, i, all) => {
    if (l[72] !== "D" || Number(l.slice(73)) % 2 === 0 || !which(Number(l.slice(0, 8)))) return l
    void all; void i
    return l.slice(0, 48) + field8(matrix) + l.slice(56)
  }).join("\n")

const readOne = (text: string): Brep => {
  const read = readIgesBreps(text)
  expect(read.warnings).toEqual([])
  expect(read.parts).toHaveLength(1)
  const b = read.parts[0]!.brep
  expect(validateBrep(b).valid).toBe(true)
  return b
}
const expectPlaced = (b: Brep, source: Brep, tr: Transform) => {
  const got = massProperties(b), want = massProperties(source)
  expect(Math.abs(got.volume - want.volume) / want.volume).toBeLessThan(1e-6)
  const c = applyPoint(tr, want.centroid)
  expect(Math.hypot(got.centroid.x - c.x, got.centroid.y - c.y, got.centroid.z - c.z)).toBeLessThan(1e-6)
}

test("IGES places a solid by the transformation of its 186 entity", () => {
  const source = holed()
  const tr = compose(rotation({ x: 1, y: 2, z: 3 }, 0.7), translation({ x: 5, y: -3, z: 8 }))
  const m = addMatrix(writeIgesBreps([{ name: "Placed", brep: source }]), rowsOf(tr))
  expectPlaced(readOne(place(m.text, (type) => type === 186, m.id)), source, tr)
})

test("IGES places geometry and vertex lists by their own transformations, children by their parents' too", () => {
  const source = holed()
  const tr = compose(rotation({ x: 0, y: 1, z: 0 }, -1.1), translation({ x: -4, y: 2, z: 30 }))
  const m = addMatrix(writeIgesBreps([{ name: "Placed", brep: source }]), rowsOf(tr))
  // Entities the topology refers to directly; the points and directions of the planes and cylinders follow their surface.
  expectPlaced(readOne(place(m.text, (type) => [502, 110, 126, 190, 192].includes(type), m.id)), source, tr)
})

test("IGES chains a transformation through its own directory entry, and a reflection turns the solid inside out correctly", () => {
  const source = holed()
  const turn = rotation({ x: 0, y: 0, z: 1 }, Math.PI / 3), move = translation({ x: 100, y: 0, z: -5 })
  const outer = addMatrix(writeIgesBreps([{ name: "Chained", brep: source }]), rowsOf(move))
  const inner = addMatrix(outer.text, rowsOf(turn), outer.id)
  expectPlaced(readOne(place(inner.text, (type) => type === 186, inner.id)), source, compose(turn, move))
  const mirror: Transform = { m: [-1, 0, 0, 0, 1, 0, 0, 0, 1], t: { x: 0, y: 0, z: 0 } }
  const m = addMatrix(writeIgesBreps([{ name: "Mirrored", brep: source }]), rowsOf(mirror))
  const b = readOne(place(m.text, (type) => type === 186, m.id))
  expect(validateBrep(b).manifoldSolid).toBe(true)
  expectPlaced(b, source, mirror)
})

test("IGES refuses a scaling matrix and a transformation on shared topology, with the reason", () => {
  const text = writeIgesBreps([{ name: "Box", brep: makeBox(2, 3, 4) }])
  const scaled = addMatrix(text, [2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0])
  expect(readIgesBreps(place(scaled.text, (type) => type === 186, scaled.id)).warnings.join(" ")).toContain("not a rigid motion")
  const turned = addMatrix(text, rowsOf(rotation({ x: 0, y: 0, z: 1 }, 0.5)))
  const onFace = readIgesBreps(place(turned.text, (type) => type === 510, turned.id))
  expect(onFace.parts).toHaveLength(0)
  expect(onFace.warnings.join(" ")).toContain("topology entity")
})
