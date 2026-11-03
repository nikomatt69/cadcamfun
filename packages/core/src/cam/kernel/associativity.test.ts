import { describe, expect, test } from "bun:test"
import { buildRecipe } from "../../cad/index.ts"
import { partFingerprint, programStatus, type ProgramStatus } from "./associativity.ts"

const plate = { id: "plate", type: "cube", name: "Plate", layer: "0", color: "#888", x: 50, y: 5, z: 30, width: 100, height: 10, depth: 60 }
const boss = { id: "boss", type: "cylinder", name: "Boss", x: 20, y: 15, z: 20, radius: 6, height: 10 }
const stored = (elements: ReadonlyArray<Record<string, unknown>>, extra: Record<string, unknown> = {}) => ({ request: { schemaVersion: 1, elements, material: "aluminium-6061", machine: "vmc-3ax", ...extra } })
const status = (before: ReadonlyArray<Record<string, unknown>>, after: ReadonlyArray<Record<string, unknown>>, settings?: Record<string, unknown>, extra: Record<string, unknown> = {}): ProgramStatus =>
  programStatus(stored(before, extra), settings === undefined ? { elements: after } : { elements: after, settings })

describe("partFingerprint: what changes the machined shape", () => {
  test("renaming, recolouring, moving to another layer and hiding keep the fingerprint", () => {
    const a = partFingerprint([plate, boss])
    const b = partFingerprint([{ ...plate, name: "Base plate", color: "#f00", layer: "machining", visible: false, locked: true, metadata: { by: "x" } }, boss])
    expect(b.digest).toBe(a.digest)
  })
  test("a dimension, a position, a rotation or an added element change it", () => {
    const base = partFingerprint([plate, boss]).digest
    expect(partFingerprint([{ ...plate, height: 12 }, boss]).digest).not.toBe(base)
    expect(partFingerprint([plate, { ...boss, x: 21 }]).digest).not.toBe(base)
    expect(partFingerprint([plate, { ...boss, rotation: { x: 0, y: 0, z: 5 } }]).digest).not.toBe(base)
    expect(partFingerprint([plate, boss, { ...boss, id: "boss2" }]).digest).not.toBe(base)
  })
  test("the order of the elements and float noise below a nanometre do not matter", () => {
    expect(partFingerprint([boss, plate]).digest).toBe(partFingerprint([plate, boss]).digest)
    expect(partFingerprint([{ ...plate, width: 100 + 1e-12 }, boss]).digest).toBe(partFingerprint([plate, boss]).digest)
  })
  test("an unknown field counts as geometry: it can only make a program stale, never wrongly current", () => {
    expect(partFingerprint([{ ...plate, taper: 3 }, boss]).digest).not.toBe(partFingerprint([plate, boss]).digest)
  })
  test("a parametric part: a parameter changes it, a feature name and a suppressed feature follow the timeline rule", () => {
    const history = buildRecipe("mounting_plate", { width: 120, depth: 80, thickness: 12, fastener: "M5", counterbore: true }).history
    const part = (h: unknown) => ({ id: "p", type: "parametric", history: h })
    const base = partFingerprint([part(history)]).digest
    const renamed = { ...history, features: history.features.map((f, i) => (i === 0 ? { ...f, name: "Renamed" } : f)) }
    expect(partFingerprint([part(renamed)]).digest).toBe(base)
    const thicker = { ...history, parameters: { ...history.parameters, thickness: 14 } }
    expect(partFingerprint([part(thicker)]).digest).not.toBe(base)
    const suppressed = { ...history, features: history.features.map((f, i) => (i === 1 ? { ...f, suppressed: true } : f)) }
    expect(partFingerprint([part(suppressed)]).digest).not.toBe(base)
  })
})

describe("programStatus: current, stale with a class, unknown with a reason", () => {
  test("the same drawing is current; display edits are current and named", () => {
    expect(status([plate, boss], [plate, boss])).toEqual({ status: "current", displayOnly: [] })
    expect(status([plate, boss], [{ ...plate, name: "Renamed", color: "#00f" }, boss])).toEqual({ status: "current", displayOnly: ["plate"] })
  })
  test("a changed dimension is stale as geometry and names the element", () => {
    const s = status([plate, boss], [plate, { ...boss, radius: 8 }])
    expect(s).toMatchObject({ status: "stale", class: "geometry", changed: ["boss"], added: [], removed: [] })
  })
  test("an added or removed element is stale as topology", () => {
    expect(status([plate, boss], [plate])).toMatchObject({ status: "stale", class: "topology", removed: ["boss"] })
    expect(status([plate], [plate, boss])).toMatchObject({ status: "stale", class: "topology", added: ["boss"] })
  })
  test("every element moved by one translation is rigid, with the move; a shared move plus a resize is geometry", () => {
    const moved = [{ ...plate, x: plate.x + 10, z: plate.z - 4 }, { ...boss, x: boss.x + 10, z: boss.z - 4 }]
    const s = status([plate, boss], moved)
    expect(s).toMatchObject({ status: "stale", class: "rigid", move: { x: 10, y: 0, z: -4 } })
    expect(status([plate, boss], [moved[0]!, { ...moved[1]!, radius: 7 }])).toMatchObject({ class: "geometry" })
    // One element moved, the other did not: not a rigid move of the part.
    expect(status([plate, boss], [plate, { ...boss, x: 30 }])).toMatchObject({ class: "geometry" })
  })
  test("a settings difference is its own reason, and the model class stays what the model did", () => {
    const same = status([plate, boss], [plate, boss], { material: "steel-1045", machine: "vmc-3ax" })
    expect(same).toMatchObject({ status: "stale", class: "inputs", inputs: ["material"] })
    const both = status([plate, boss], [plate, { ...boss, radius: 8 }], { material: "steel-1045" })
    expect(both).toMatchObject({ class: "geometry", inputs: expect.arrayContaining(["material"]) })
    // Settings that were not given are not compared.
    expect(status([plate, boss], [plate, boss])).toMatchObject({ status: "current" })
  })
  test("a legacy program, a request without elements and unreadable input are unknown with the reason, never current", () => {
    expect(programStatus({}, { elements: [plate] })).toMatchObject({ status: "unknown" })
    expect(programStatus({ request: { schemaVersion: 1 } }, { elements: [plate] })).toMatchObject({ status: "unknown", reason: expect.stringContaining("embed") })
    expect(programStatus({ request: { elements: [] } }, { elements: [plate] })).toMatchObject({ status: "unknown" })
    expect(programStatus({ request: { elements: [plate] } }, { elements: "nope" as never })).toMatchObject({ status: "unknown" })
    expect(programStatus({ request: { elements: [{ ...plate, width: Number.NaN }] } }, { elements: [plate] }).status).not.toBe("current")
  })
})
