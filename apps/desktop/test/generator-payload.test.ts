/**
 * The toolpath generator must work whatever the editor holds: the request body is always plain JSON.
 * (Regression: "Expected JSON value at [geometry][selectedElements][0][elements]" stopped it.)
 */
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test"
import { cam } from "@cadcamfun/core"
import { makeToolpathGenerator } from "../src/features/cam/api/generator.ts"
import { geometryOf } from "../src/features/cam/lib/job.ts"
import { toJsonSafe, toJsonSafeRecord } from "../src/shared/state/json-safe.ts"
import { bootLiveApp } from "./helpers/live-app.ts"
import { resetStores } from "./helpers/reset-stores.ts"

describe("toJsonSafe", () => {
  test("plain JSON passes through unchanged", () => {
    const value = { a: 1, b: "x", c: [1, 2, { d: null }], e: true, f: { g: [] } }
    expect(toJsonSafe(value)).toEqual(value)
  })

  test("what JSON cannot hold is dropped, in objects and in arrays", () => {
    const value = { u: undefined, n: NaN, i: Infinity, f: () => 1, s: Symbol("x"), list: [1, undefined, NaN, "ok", () => 2, { z: undefined, k: 2 }], big: 10n }
    expect(toJsonSafe(value)).toEqual({ list: [1, 0, "ok", { k: 2 }], big: 10 })
    expect(JSON.parse(JSON.stringify(toJsonSafe(value)))).toEqual(toJsonSafe(value))
  })

  test("typed arrays, sets, maps and dates become plain data", () => {
    expect(toJsonSafe({ t: new Float32Array([1.5, 2]), s: new Set([1, 2]), m: new Map([["a", 1]]), d: new Date("2026-01-02T03:04:05.000Z") }))
      .toEqual({ t: [1.5, 2], s: [1, 2], m: { a: 1 }, d: "2026-01-02T03:04:05.000Z" })
    expect(toJsonSafe({ d: new Date("nope") })).toEqual({})
  })

  test("cycles are cut, shared references are kept, class instances keep their own fields, toJSON is honoured", () => {
    const cyclic: Record<string, unknown> = { name: "c" }
    cyclic["self"] = cyclic
    expect(toJsonSafe(cyclic)).toEqual({ name: "c" })
    const shared = { v: 1 }
    expect(toJsonSafe({ a: shared, b: shared })).toEqual({ a: { v: 1 }, b: { v: 1 } })
    class Point { constructor(public x: number, public y: number) {} }
    expect(toJsonSafe({ p: new Point(1, 2) })).toEqual({ p: { x: 1, y: 2 } })
    expect(toJsonSafe({ w: { toJSON: () => ({ ok: 1 }) } })).toEqual({ w: { ok: 1 } })
  })

  test("depth is bounded and the record variant always answers an object", () => {
    let deep: Record<string, unknown> = { leaf: 1 }
    for (let i = 0; i < 100; i++) deep = { next: deep }
    expect(() => JSON.stringify(toJsonSafe(deep))).not.toThrow()
    expect(toJsonSafeRecord({ a: undefined } as Record<string, unknown>)).toEqual({})
  })
})

let app: Awaited<ReturnType<typeof bootLiveApp>>
beforeAll(async () => { app = await bootLiveApp() }, 60000)
afterAll(async () => { await app.dispose() })
afterEach(() => resetStores())

describe("the generator with an awkward element", () => {
  const awkward = () => {
    const cycle: Record<string, unknown> = { type: "circle", x: 0, y: 0, radius: 5 }
    cycle["parent"] = cycle
    return { id: "g1", type: "component", name: "Library part", layerId: "l", x: 0, y: 0, z: 0, width: 40, height: 30, depth: 10,
      elements: [undefined, { type: "rectangle", x: 0, y: 0, width: 40, height: 30, radius: NaN, tag: undefined }, cycle, new Float32Array([1, 2, 3])] }
  }
  const sources = (element: Record<string, unknown>) => ({
    elements: [element], selectedElement: element, selectedIds: [String(element["id"])],
    workpiece: { width: 100, height: 100, depth: 20, radius: 0, material: "aluminum" }, workpieceElementId: null, stockAllowance: 1
  })
  const form = { geometryType: "selected" as const, rectangleWidth: 100, rectangleHeight: 50, circleRadius: 25, polygonSides: 6, polygonRadius: 30, customPath: "" }

  test("the geometry of a job is always plain JSON", () => {
    const geometry = geometryOf(form, sources(awkward()) as never)
    expect(() => JSON.stringify(geometry)).not.toThrow()
    expect(JSON.parse(JSON.stringify(geometry))).toEqual(geometry)
    const first = geometry.selectedElements[0] as { elements: unknown[] }
    expect(first.elements.some((e) => e === undefined)).toBe(false)
  })

  test("the sidecar generates G-code for it, through the real typed client", async () => {
    const generator = makeToolpathGenerator(app.client)
    const geometry = geometryOf(form, sources(awkward()) as never)
    const response = await app.state.runtime.run(generator.generate({ settings: cam.generator.DEFAULT_SETTINGS, geometry: geometry as never, printer: cam.generator.DEFAULT_PRINTER_EXTRAS }))
    expect(response.gcode.length).toBeGreaterThan(0)
    expect(response.stats.lines).toBeGreaterThan(0)
  })

  test("and the same body unsanitised is what used to fail", async () => {
    const generator = makeToolpathGenerator(app.client)
    const raw = { ...geometryOf(form, sources({ id: "g2", type: "component", x: 0, y: 0, elements: [undefined] }) as never), selectedElements: [{ id: "g2", type: "component", x: 0, y: 0, elements: [undefined] }] }
    await expect(app.state.runtime.run(generator.generate({ settings: cam.generator.DEFAULT_SETTINGS, geometry: raw as never, printer: cam.generator.DEFAULT_PRINTER_EXTRAS }))).rejects.toMatchObject({ message: expect.stringContaining("Expected JSON value") })
  })
})
