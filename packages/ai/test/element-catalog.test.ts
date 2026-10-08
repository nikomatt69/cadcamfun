import { describe, expect, test } from "bun:test"
import { plateTemplate } from "@cadcamfun/core"
import { ELEMENT_SPECS, ELEMENT_TYPES, chordError, elementCatalogueLines, elementCatalogueText, normalizeElement, segmentsFor } from "../src/element-catalog.ts"

describe("element catalogue", () => {
  test("every type normalises from just its name (or tells what it still needs)", () => {
    for (const type of ELEMENT_TYPES) {
      const spec = ELEMENT_SPECS[type] as { required?: ReadonlyArray<string> }
      const result = normalizeElement({ type })
      if (spec.required?.length) expect(result.ok).toBe(false)
      else expect(result.ok).toBe(true)
    }
  })

  test("defaults fill the rest and the caller's values win", () => {
    const r = normalizeElement({ type: "cylinder", radius: 7, z: 3, color: "#ff0000", name: "Wheel" })
    expect(r).toEqual({ ok: true, element: { type: "cylinder", x: 0, y: 0, z: 3, radius: 7, height: 100, color: "#ff0000", name: "Wheel" } })
  })

  test("a revolved profile (a bottle) keeps its points", () => {
    const profile = [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 150 }, { x: 10, y: 200 }, { x: 10, y: 260 }]
    const r = normalizeElement({ type: "revolution", profile, axis: "y" })
    expect(r.ok && r.element["profile"]).toEqual(profile)
    expect(normalizeElement({ type: "revolution", profile: [{ x: 1, y: 1 }] })).toMatchObject({ ok: false })
  })

  test("wrong types, missing requirements, unknown types and non-positive sizes are explained", () => {
    expect(normalizeElement({ type: "sphere", radius: "big" })).toEqual({ ok: false, error: "sphere.radius must be number, got string" })
    expect(normalizeElement({ type: "sweep" })).toEqual({ ok: false, error: 'sweep needs "path"' })
    expect(normalizeElement({ type: "teapot" })).toMatchObject({ ok: false })
    expect(normalizeElement({ type: "cube", width: -1 })).toEqual({ ok: false, error: "cube.width must be positive" })
    expect(normalizeElement({ type: "cube", width: Infinity })).toMatchObject({ ok: false })
  })

  test("loft counts, boolean operands and extrusion profiles", () => {
    expect(normalizeElement({ type: "loft", profiles: [{ radius: 1 }, { radius: 2 }], positions: [{ x: 0, y: 0, z: 0 }] })).toMatchObject({ ok: false })
    expect(normalizeElement({ type: "boolean-subtract", operands: [0] })).toMatchObject({ ok: false })
    expect(normalizeElement({ type: "boolean-subtract", operands: [0, 1] })).toMatchObject({ ok: true })
    const ex = normalizeElement({ type: "extrusion", profile: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }], depth: 5 })
    expect(ex.ok && ex.element["shape"]).toBe("profile")
  })

  test("unknown fields are dropped, the catalogue text lists every type", () => {
    const r = normalizeElement({ type: "cube", evil: "x", __proto__: { a: 1 } as never })
    expect(r.ok && "evil" in r.element).toBe(false)
    for (const type of ELEMENT_TYPES) expect(elementCatalogueText()).toContain(type)
  })
})

describe("precision", () => {
  test("segments follow the tolerance: the chord never deviates more than asked", () => {
    for (const [radius, tolerance] of [[50, 0.001], [50, 0.01], [3, 0.0005], [250, 0.002], [10, 0.1]] as const) {
      const n = segmentsFor(radius, tolerance)
      expect(chordError(radius, n)).toBeLessThanOrEqual(tolerance * (1 + 1e-9))
      if (n > 8) expect(chordError(radius, n - 1)).toBeGreaterThan(tolerance)
    }
    expect(segmentsFor(50, 0.001)).toBe(497)
    expect(segmentsFor(1, 5)).toBe(8)
    expect(segmentsFor(0, 0.001)).toBe(8)
  })

  test("tolerance sets the tessellation of each round type, and is kept on the element", () => {
    const circle = normalizeElement({ type: "circle", radius: 50, tolerance: 0.001 })
    expect(circle.ok && circle.element).toMatchObject({ segments: 497, tolerance: 0.001, radius: 50 })
    const cyl = normalizeElement({ type: "cylinder", radius: 12.5, height: 30, tolerance: 0.001 })
    expect(cyl.ok && chordError(12.5, (cyl.element as { segments: number }).segments)).toBeLessThanOrEqual(0.001)
    const torus = normalizeElement({ type: "torus", radius: 40, tubeRadius: 5, tolerance: 0.002 })
    expect(torus.ok && torus.element).toMatchObject({ tubularSegments: expect.any(Number), radialSegments: expect.any(Number) })
    const bottle = normalizeElement({ type: "revolution", profile: [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 100 }], tolerance: 0.001 })
    expect(bottle.ok && (bottle.element as { segments: number }).segments).toBe(segmentsFor(30, 0.001))
    const capsule = normalizeElement({ type: "capsule", radius: 8, height: 40, tolerance: 0.001 })
    expect(capsule.ok && capsule.element).toMatchObject({ radialSegments: segmentsFor(8, 0.001) })
  })

  test("a request finer than the mesh cap is honoured as far as possible and says so", () => {
    const sphere = normalizeElement({ type: "sphere", radius: 200, tolerance: 0.0005 })
    expect(sphere.ok && (sphere.element as { segments: number }).segments).toBe(512)
    expect(sphere.ok && sphere.warning).toContain("finest mesh")
    expect(normalizeElement({ type: "sphere", radius: 10, tolerance: 0.001 })).not.toHaveProperty("warning")
  })

  test("bad tolerance or segments are rejected, decimals are never rounded", () => {
    expect(normalizeElement({ type: "circle", radius: 5, tolerance: 0 })).toMatchObject({ ok: false })
    expect(normalizeElement({ type: "circle", radius: 5, tolerance: -1 })).toMatchObject({ ok: false })
    expect(normalizeElement({ type: "circle", radius: 5, segments: 2 })).toMatchObject({ ok: false })
    expect(normalizeElement({ type: "circle", radius: 5, segments: 64.5 })).toMatchObject({ ok: false })
    const exact = normalizeElement({ type: "cylinder", radius: 12.50525, height: 30.0001, x: 0.0005 })
    expect(exact.ok && exact.element).toMatchObject({ radius: 12.50525, height: 30.0001, x: 0.0005 })
  })
})

describe("parametric elements", () => {
  const history = () => structuredClone(plateTemplate())

  test("a history that builds is accepted as it is, with no warning", () => {
    const r = normalizeElement({ type: "parametric", history: history() })
    expect(r).toMatchObject({ ok: true })
    expect((r as { warning?: string }).warning).toBeUndefined()
  })

  test("the history is required and must have parameters and features", () => {
    expect(normalizeElement({ type: "parametric" })).toMatchObject({ ok: false, error: 'parametric needs "history"' })
    expect(normalizeElement({ type: "parametric", history: { parameters: {} } })).toMatchObject({ ok: false })
    expect(normalizeElement({ type: "parametric", history: "plate" })).toMatchObject({ ok: false })
  })

  test("a history that builds nothing is refused with the reasons, so the model can fix it", () => {
    const r = normalizeElement({ type: "parametric", history: { parameters: { w: 10 }, features: [{ id: "e", type: "extrude", sketch: "nowhere", depth: "ghost", operation: "new" }] } })
    expect(r).toMatchObject({ ok: false })
    expect((r as { error: string }).error).toContain("builds no solid")
    expect((r as { error: string }).error).toContain("nowhere")
    expect(normalizeElement({ type: "parametric", history: { parameters: {}, features: [] } })).toMatchObject({ ok: false })
  })

  test("a history that builds with problems is accepted with the problems as a warning", () => {
    const h = history()
    const broken = { ...h, parameters: { ...h.parameters, unused: "1 +" } }
    const r = normalizeElement({ type: "parametric", history: broken })
    expect(r).toMatchObject({ ok: true })
    expect((r as { warning: string }).warning).toContain("parameter unused")
  })

  test("it is in the catalogue the prompt is made from", () => {
    expect(elementCatalogueLines()).toContain("- parametric:")
    expect(elementCatalogueText()).toContain("parametric (")
  })
})
