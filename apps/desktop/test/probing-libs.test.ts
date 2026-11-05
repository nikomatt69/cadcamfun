/** Pure probing libs of the desktop (spec 73 §4): inspection status / order / CSV and the work-offset table. */
import { describe, expect, test } from "bun:test"
import { stockElementOf } from "../src/features/cam/lib/probing/part-solids.ts"
import { cam } from "@cadcamfun/core"
import { inspectionCsv, sortInspection, statusOf, summarizeInspection } from "../src/features/cam/lib/probing/inspection.ts"
import { applyMeasured, diffRows, entriesOfRows, extendedOffsetsOf, offsetFamilyOf, offsetRefusal, offsetRowsOf, rotationViaOf, withRowValue } from "../src/features/cam/lib/probing/work-offsets.ts"
import { expectedOfContacts } from "../src/features/cam/lib/probing/simulation.ts"
import { targetsOf } from "../src/features/cam/lib/probing/probe-targets.ts"
import { parseOffsetRef } from "../src/features/cam/lib/probing/contract.ts"
import { contextOf, resolveSettings } from "../src/features/cam/lib/probing/resolve.ts"
import type { InspectionVerdict } from "../src/features/cam/lib/probing/contract.ts"

const v = (name: string, deviation: number, over: Partial<InspectionVerdict> = {}): InspectionVerdict => ({
  name, kind: "size", nominal: 20, measured: 20 + deviation, deviation, lower: -0.05, upper: 0.05, pass: deviation >= -0.05 && deviation <= 0.05, ...over
})

test("inspection: warn band near a limit, fail first, summary, CSV with 3 decimals and degrees for angles", () => {
  expect(statusOf(v("a", 0.01))).toBe("pass")
  expect(statusOf(v("b", 0.045))).toBe("warn")
  expect(statusOf(v("c", -0.041))).toBe("warn")
  expect(statusOf(v("d", 0.06))).toBe("fail")
  expect(statusOf(v("e", 0.045), 0.95)).toBe("pass")
  const list = [v("a", 0.01), v("warn", 0.045), v("fail", -0.07), v("tp", 0.03, { kind: "true-position", lower: 0, upper: 0.1, pass: true })]
  expect(sortInspection(list).map((x) => x.name)).toEqual(["fail", "warn", "tp", "a"])
  expect(summarizeInspection(list)).toEqual({ total: 4, pass: 2, warn: 1, fail: 1, status: "fail" })
  expect(summarizeInspection([]).status).toBe("empty")
  const angle = v("Angle, \"A\"", 0.5 * Math.PI / 180, { kind: "angle", nominal: Math.PI / 2, measured: Math.PI / 2 + 0.5 * Math.PI / 180, lower: -Math.PI / 180, upper: Math.PI / 180, pass: true })
  const csv = inspectionCsv([v("Ø20", -0.0004), angle])
  expect(csv.split("\n")[0]).toBe("name,kind,nominal,measured,deviation,lower,upper,status")
  expect(csv).toContain("Ø20,size,20.000,20.000,0.000,-0.050,0.050,pass")
  expect(csv).toContain("\"Angle, \"\"A\"\"\",angle,90.000,90.500,0.500,-1.000,1.000,pass")
})

const profile = (config: Record<string, unknown>) => cam.kernel.profileOfConfig(config, "mill")

test("work offsets: family from the post, control bounds, rows from the profile with the setup's own values", () => {
  expect(offsetFamilyOf({ post: "siemens" })).toBe("siemens")
  expect(offsetFamilyOf({ controller: "Haas NGC" })).toBe("haas")
  expect(offsetFamilyOf({})).toBe("fanuc")
  expect(offsetRefusal("G54.1 P48", "fanuc")).toBeUndefined()
  expect(offsetRefusal("G54.1 P49", "fanuc")).toContain("48 extended")
  expect(offsetRefusal("G54.1 P49", "fanuc", { extended: 300 })).toBeUndefined()
  expect(offsetRefusal("G58", "siemens")).toContain("programmable")
  expect(offsetRefusal("g54", "fanuc")).toContain("not a work offset")
  expect(extendedOffsetsOf("fanuc")).toHaveLength(48)
  expect(extendedOffsetsOf("siemens")[0]).toBe("G505")
  expect(extendedOffsetsOf("grbl")).toEqual([])
  const p = profile({ post: "fanuc", workOffsetTable: { entries: { G54: { x: -300, y: -200, z: -400 }, "G54.1 P3": { x: 1, y: 2, z: 3 } }, bySetup: { s1: { G55: { x: 5, y: 6, z: 7 } } } } })
  const rows = offsetRowsOf(p)
  expect(rows.map((r) => r.key)).toEqual(["G54", "G55", "G56", "G57", "G58", "G59", "G54.1 P3"])
  expect(rows[0]).toEqual({ key: "G54", entry: { x: -300, y: -200, z: -400 }, source: "machine" })
  const setup = offsetRowsOf(p, "s1")
  expect(setup.find((r) => r.key === "G55")).toEqual({ key: "G55", entry: { x: 5, y: 6, z: 7 }, source: "setup" })
  expect(entriesOfRows(setup, "setup")).toEqual({ G55: { x: 5, y: 6, z: 7 } })
  expect(Object.keys(entriesOfRows(rows, "machine"))).toHaveLength(7)
  const siemens = offsetRowsOf(profile({ post: "siemens" }))
  expect(siemens.map((r) => r.key)).toEqual(["G54", "G55", "G56", "G57"])
})

test("work offsets: measured updates (radians) land in the rows (degrees), the diff lists what Save changes", () => {
  const rows = offsetRowsOf(profile({ post: "fanuc", workOffsetTable: { entries: { G54: { x: -300, y: -200, z: -400 } } } }))
  const g54 = cam.probing.parseOffsetRef("G54")!
  const p3 = cam.probing.parseOffsetRef("G54.1 P3")!
  const next = applyMeasured(rows, [
    { ref: g54, axis: "X", before: -300, after: -299.7 },
    { ref: g54, axis: "R", before: 0, after: 0.3 * Math.PI / 180 },
    { ref: p3, axis: "Z", before: 0, after: -12.5 }
  ], "machine")
  const changed = next.find((r) => r.key === "G54")!.entry
  expect(changed.x).toBeCloseTo(-299.7, 9)
  expect(changed.rotation).toBeCloseTo(0.3, 9)
  expect(next.find((r) => r.key === "G54.1 P3")?.entry.z).toBe(-12.5)
  const diff = diffRows(rows, next)
  expect(diff.map((d) => `${d.key}.${d.axis}`)).toEqual(["G54.x", "G54.rotation", "G54.1 P3.z"])
  expect(diff[0]!.delta).toBeCloseTo(0.3, 9)
  expect(diffRows(rows, withRowValue(rows, "G54", "x", -300.0001, "machine"))).toEqual([])
  expect(withRowValue(withRowValue(rows, "G54", "c", 1.5, "machine"), "G54", "c", undefined, "machine").find((r) => r.key === "G54")!.entry).toEqual({ x: -300, y: -200, z: -400 })
})

test("the planning context carries the machine's work zero, so a tool setter cycle plans in the editor", () => {
  const p = profile({ post: "fanuc", probing: { stylusDiameter: 4 }, workOffsetTable: { entries: { G54: { x: 100, y: 200, z: -300 } } } })
  const settings = resolveSettings({ profile: p, workOffset: "G54" })
  expect(contextOf(settings, { profile: p }).workOrigin).toEqual({ x: 100, y: 200, z: -300 })
  expect(contextOf(resolveSettings({ profile: p, workOffset: "G55" }), { profile: p }).workOrigin).toBeUndefined()
})

describe("the stock as a part", () => {
  const stock = { x: 10, y: 20, width: 100, height: 200, depth: 20, topZ: 5 }
  test("its top is the stock top", () => {
    const block = stockElementOf(stock)!
    expect(block).toMatchObject({ type: "cube", x: 10, y: 20, z: -5, width: 100, height: 200, depth: 20 })
    expect(cam.generator.elementBounds(block as never).max.z).toBeCloseTo(5, 9)
  })
  test("a stock without depth is no part", () => {
    expect(stockElementOf({ ...stock, depth: 0 })).toBeUndefined()
  })
})

describe("a rotation reaches the control it can", () => {
  const ref = parseOffsetRef("G54")!
  test("Fanuc keeps no rotation in the offset: G68; Siemens and LinuxCNC keep one", () => {
    expect(rotationViaOf(ref, "fanuc")).toBe("g68")
    expect(rotationViaOf(ref, "haas")).toBe("g68")
    expect(rotationViaOf(ref, "siemens")).toBe("offset-r")
    expect(rotationViaOf(parseOffsetRef("G55")!, "linuxcnc")).toBe("offset-r")
  })
})

describe("contacts and planned touches", () => {
  const planned = (name: string) => ({ name, expected: { x: 0, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 } })
  test("a double touch gives each planned touch to both of its contacts", () => {
    const [a, b] = [planned("a"), planned("b")]
    expect(expectedOfContacts(4, [a, b]).map((e) => e.name)).toEqual(["a", "a", "b", "b"])
  })
  test("one contact a touch stays as it is; counts that do not divide are not matched", () => {
    const list = [planned("a"), planned("b")]
    expect(expectedOfContacts(2, list)).toBe(list)
    expect(expectedOfContacts(3, list)).toEqual([])
  })
})

test("a feature that is not at Z0 keeps its height: a round or a corner target carries its top in work coordinates", () => {
  const origin = { x: 200, y: 100, z: 50 }
  const elements = [{ id: "pin", type: "cylinder", x: 215, y: 105, z: 55, radius: 12, height: 10 }, { id: "plate", type: "cube", x: 200, y: 100, z: 40, width: 120, height: 80, depth: 20 }] as never
  const targets = targetsOf(elements, { origin })
  const boss = targets.find((t) => t.id === "pin:boss")!
  expect(boss.patch).toMatchObject({ centre: { x: 15, y: 5 }, diameter: 24, top: 10 })
  expect(targets.find((t) => t.id === "plate:corner:left front")!.patch).toMatchObject({ top: 0 })
})
