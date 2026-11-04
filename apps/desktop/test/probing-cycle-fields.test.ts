/** Probe cycle editor fields (spec 73 §4): stable lists, defaults the core accepts, degrees through the core schema only. */
import { expect, test } from "bun:test"
import { PROBE_CYCLE_KINDS } from "../src/features/cam/lib/probing/contract.ts"
import { cycleOfSpec, defaultSpecOf, fieldsOf, getPath, setPath, specOf } from "../src/features/cam/lib/probing/cycle-fields.ts"

test("every kind has a stable field list and a default the core schema accepts", () => {
  for (const kind of PROBE_CYCLE_KINDS) {
    expect(fieldsOf(kind).length, kind).toBeGreaterThan(0)
    expect(fieldsOf(kind)).toBe(fieldsOf(kind))
    const decoded = cycleOfSpec(defaultSpecOf(kind, { x: 10, y: 20 }))
    expect(decoded.ok, `${kind}: ${decoded.ok ? "" : decoded.issues.join(",")}`).toBe(true)
    for (const field of fieldsOf(kind)) if (field.optional !== true) expect(getPath(defaultSpecOf(kind) as Record<string, unknown>, field.path), `${kind}.${field.path}`).toBeDefined()
  }
})

test("angles are degrees in the editor and radians in the core; a round trip keeps the figures", () => {
  const web = cycleOfSpec(setPath(defaultSpecOf("web"), "angle", 30))
  expect(web.ok && web.cycle.kind === "web" && web.cycle.angle).toBeCloseTo(Math.PI / 6, 12)
  const edge = cycleOfSpec(setPath(defaultSpecOf("edge"), "normalAngle", 90))
  expect(edge.ok && edge.cycle.kind === "edge" && edge.cycle.normal.y).toBeCloseTo(1, 12)
  if (edge.ok) expect(specOf(edge.cycle)).toMatchObject({ kind: "edge", normalAngle: 90 })
  if (web.ok) expect(specOf(web.cycle)).toMatchObject({ kind: "web", angle: 30 })
})

test("the core refuses what it refuses: a negative diameter, a missing figure", () => {
  expect(cycleOfSpec(setPath(defaultSpecOf("bore"), "diameter", -5)).ok).toBe(false)
  expect(cycleOfSpec(setPath(defaultSpecOf("bore"), "depth", undefined)).ok).toBe(false)
  expect(setPath({ a: { b: 1 } }, "a.c", 2)).toEqual({ a: { b: 1, c: 2 } })
})
