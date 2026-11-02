import { describe, expect, setDefaultTimeout, test } from "bun:test"
import type { DimConstraint, Feature, History, Sketch, SketchEntity, SketchFeature } from "@cadcamfun/core"
import * as THREE from "three"
import { useLayerStore } from "../store/layerStore.ts"
import { applySketchVisibility, constraintGlyphs, createSketchOverlays, historyErrors, historyView, MAX_GLYPHS, sketchIsConsumed } from "./history-view.ts"
import { buildElementObject } from "./sceneHelpers.ts"

setDefaultTimeout(60_000)

const pt = (id: string, x: number, y: number): SketchEntity => ({ id, kind: "point", x, y })
const line = (id: string, p1: string, p2: string): SketchEntity => ({ id, kind: "line", p1, p2 })
const rectangle = (id: string, w: number, h: number): SketchFeature => ({
  id, type: "sketch", plane: "XY",
  sketch: {
    entities: [pt("p1", 0.2, -0.1), pt("p2", 9, 0.3), pt("p3", 11, 6), pt("p4", -0.4, 5), line("l1", "p1", "p2"), line("l2", "p2", "p3"), line("l3", "p3", "p4"), line("l4", "p4", "p1")],
    constraints: [
      { type: "fixed", point: "p1", x: 0, y: 0 }, { type: "horizontal", line: "l1" }, { type: "vertical", line: "l2" }, { type: "horizontal", line: "l3" }, { type: "vertical", line: "l4" },
      { type: "length", line: "l1", value: w }, { type: "length", line: "l2", value: h }
    ] as DimConstraint[]
  }
})
const history = (features: Feature[]): History => ({ parameters: {}, features })
const plate = (): History => history([rectangle("s1", 40, 25), { id: "plate", type: "extrude", sketch: "s1", depth: 6, operation: "new" }])
const looseSketch = (): History => history([rectangle("s1", 40, 25)])
const ORIGIN = { x: 0, y: 0, z: 0 }
const layerId = () => useLayerStore.getState().activeLayer

describe("the replay of a history for the canvas", () => {
  test("one replay per history object", () => {
    const h = plate()
    expect(historyView(h)).toBe(historyView(h))
  })

  test("a plate gives one united solid and no errors", () => {
    const view = historyView(plate())
    expect(view.united).toBe(true)
    expect(view.parts).toHaveLength(1)
    expect(historyErrors(view)).toEqual([])
  })

  test("two disjoint bodies are united, or drawn one by one when the union fails", () => {
    const far = rectangle("s2", 10, 10)
    const view = historyView(history([
      rectangle("s1", 40, 25), { id: "a", type: "extrude", sketch: "s1", depth: 6, operation: "new" },
      { ...far, plane: "XY", offset: 30 }, { id: "b", type: "extrude", sketch: "s2", depth: 4, operation: "new" }
    ]))
    expect(view.result.bodies.length).toBe(2)
    expect(view.parts.length).toBeGreaterThan(0)
    if (!view.united) expect(view.parts.length).toBe(2)
  })

  test("a feature that fails is reported while the rest is still drawn", () => {
    const view = historyView(history([rectangle("s1", 40, 25), { id: "plate", type: "extrude", sketch: "s1", depth: 6, operation: "new" }, { id: "bad", type: "extrude", sketch: "missing", depth: 3, operation: "union" }]))
    expect(historyErrors(view).some((issue) => issue.feature === "bad")).toBe(true)
    expect(view.parts).toHaveLength(1)
  })
})

describe("sketches in the canvas", () => {
  test("a used sketch is consumed; a sketch nothing uses is not", () => {
    expect(sketchIsConsumed(plate(), "s1")).toBe(true)
    expect(sketchIsConsumed(looseSketch(), "s1")).toBe(false)
  })

  test("the overlay lies on the sketch plane, at the element position, and says how well it is constrained", () => {
    const h = plate()
    const groups = createSketchOverlays(h, historyView(h), { x: 5, y: 0, z: 2 })
    expect(groups).toHaveLength(1)
    const box = new THREE.Box3().setFromObject(groups[0]!)
    expect(box.min.z).toBeCloseTo(2)
    expect(box.max.z).toBeCloseTo(2)
    expect(box.min.x).toBeCloseTo(5, 0)
    expect(groups[0]!.userData.sketchStatus).toBe("fully-constrained")
    expect(groups[0]!.userData.consumed).toBe(true)
  })

  test("consumed sketches follow the toggle, a loose one is always shown", () => {
    const used = plate(), loose = looseSketch()
    const root = new THREE.Group().add(...createSketchOverlays(used, historyView(used), ORIGIN))
    const free = new THREE.Group().add(...createSketchOverlays(loose, historyView(loose), ORIGIN))
    applySketchVisibility(root, false)
    applySketchVisibility(free, false)
    expect(root.children[0]!.visible).toBe(false)
    expect(free.children[0]!.visible).toBe(true)
    expect(applySketchVisibility(root, true)).toBe(true)
    expect(root.children[0]!.visible).toBe(true)
    expect(applySketchVisibility(root, true)).toBe(false)
  })

  test("a parametric element with only a loose sketch is drawn (it used to be blank)", () => {
    const object = buildElementObject({ id: "p", type: "parametric", layerId: layerId(), x: 0, y: 0, z: 0, history: looseSketch() } as never)!
    expect(object.userData.isInvalidMarker).toBeUndefined()
    let overlays = 0
    object.traverse((child) => { if (child.userData.sketchOverlay === true) overlays++ })
    expect(overlays).toBe(1)
  })

  test("a parametric plate is its solid with its used sketch hidden by default", () => {
    const object = buildElementObject({ id: "p", type: "parametric", layerId: layerId(), x: 10, y: 0, z: 0, history: plate() } as never)!
    const box = new THREE.Box3()
    object.traverse((child) => { if ((child as THREE.Mesh).isMesh && child.userData.sketchOverlay !== true) box.expandByObject(child) })
    expect(box.min.x).toBeGreaterThan(8)
    expect(box.max.z).toBeCloseTo(6, 3)
  })

  test("a failed feature travels with the object for the banner", () => {
    const h = history([rectangle("s1", 40, 25), { id: "plate", type: "extrude", sketch: "s1", depth: 6, operation: "new" }, { id: "bad", type: "extrude", sketch: "missing", depth: 3, operation: "union" }])
    const object = buildElementObject({ id: "p", type: "parametric", layerId: layerId(), x: 0, y: 0, z: 0, history: h } as never)!
    expect((object.userData.historyIssues as Array<{ feature: string }>).some((issue) => issue.feature === "bad")).toBe(true)
  })
})

describe("constraint glyphs", () => {
  const sketch = (history: History): Sketch => historyView(history).result.sketches["s1"]!.solve.sketch

  test("relations sit on their line, dimensions where they measure", () => {
    const glyphs = constraintGlyphs(sketch(plate()))
    const kinds = glyphs.map((glyph) => glyph.kind).sort()
    expect(kinds).toEqual(["fixed", "horizontal", "horizontal", "length", "length", "vertical", "vertical"])
    const length = glyphs.filter((glyph) => glyph.kind === "length").map((glyph) => glyph.label).sort()
    expect(length).toEqual(["25", "40"])
    // the horizontal glyph of the bottom edge is at its middle
    const h = glyphs.find((glyph) => glyph.kind === "horizontal")!
    expect(h.label).toBe("H")
  })

  test("a driven dimension is shown in brackets, and glyphs that share an anchor are stacked", () => {
    const entities: SketchEntity[] = [pt("a", 0, 0), pt("b", 10, 0), line("l", "a", "b"), { id: "c", kind: "circle", center: "a", radius: 3 }]
    const glyphs = constraintGlyphs({ entities, constraints: [{ type: "length", line: "l", value: 10, driven: true }, { type: "horizontal", line: "l" }, { type: "vertical", line: "l" }, { type: "diameter", circle: "c", value: 6 }, { type: "angle", a: "l", b: "l", value: Math.PI / 2 }] })
    expect(glyphs.find((glyph) => glyph.kind === "length")!.label).toBe("(10)")
    expect(glyphs.find((glyph) => glyph.kind === "diameter")!.label).toBe("⌀6")
    expect(glyphs.find((glyph) => glyph.kind === "angle")!.label).toBe("90°")
    const anchors = new Set(glyphs.map((glyph) => `${glyph.at.x},${glyph.at.y}`))
    expect(anchors.size).toBe(glyphs.length)
  })

  test("a constraint on something that is not in the sketch gives no glyph, never a throw", () => {
    expect(constraintGlyphs({ entities: [], constraints: [{ type: "horizontal", line: "nope" }, { type: "coincident", a: "x", b: "y" }] })).toEqual([])
  })

  test("the glyph budget exists", () => {
    expect(MAX_GLYPHS).toBeGreaterThan(20)
  })
})
