import { expect, test } from "bun:test"
import * as THREE from "three"
import { cam, plateTemplate } from "@cadcamfun/core"
import { ELEMENT_SPECS, ELEMENT_TYPES, normalizeElement } from "../../../packages/ai/src/element-catalog.ts"
import { buildElementObject } from "../src/cad/lib/sceneHelpers.ts"
import { useLayerStore } from "../src/cad/store/layerStore.ts"

/** Every type the assistant can create. The types that cannot be defaulted take the catalogue's own sample of the field they need. */
const needs: Record<string, Record<string, unknown>> = {
  component: { elements: [{ type: "cube" }, { type: "cylinder", x: 80 }] }, group: { elements: [{ type: "sphere" }] },
  parametric: { history: plateTemplate() }
}
const made = (): Array<Record<string, unknown>> => ELEMENT_TYPES.filter((type) => !type.startsWith("boolean-")).flatMap((type) => {
  const spec = ELEMENT_SPECS[type] as { readonly defaults: Record<string, unknown>; readonly required?: ReadonlyArray<string> }
  const sample = Object.fromEntries((spec.required ?? []).map((key) => [key, spec.defaults[key]]))
  const result = normalizeElement({ type, ...sample, ...(needs[type] ?? {}) })
  return result.ok ? [{ id: `t-${type}`, layerId: useLayerStore.getState().activeLayer, ...result.element }] : []
})

const drawn = (element: Record<string, unknown>): THREE.Box3 => new THREE.Box3().setFromObject(buildElementObject(element as never)!)

test("every type in the catalogue can be created with its defaults and is drawn as something with volume or length", () => {
  const types = new Set(made().map((e) => String(e["type"])))
  for (const type of ELEMENT_TYPES) if (!type.startsWith("boolean-")) expect(types.has(type)).toBe(true)
  const empty = made().filter((e) => drawn(e).isEmpty() || !Number.isFinite(drawn(e).getSize(new THREE.Vector3()).length())).map((e) => e["type"])
  expect(empty).toEqual([])
})

test("what the assistant reads as an element's bounds is what the editor draws", () => {
  // Curves and sweeps are boxed by their points; the others are exact to the mesh.
  const hulls = ["spline", "bezier", "nurbs", "sweep", "loft"]
  const solids = ["cube", "sphere", "cylinder", "cone", "torus", "pyramid", "prism", "hemisphere", "ellipsoid", "capsule", "extrusion", "revolution", "parametric", "gear",
    "wall", "floor", "roof", "column", "stair", "door", "window", "spring", "bolt", "screw", "nut", "washer", "text3d", ...hulls]
  const off: string[] = []
  for (const element of made()) {
    const type = String(element["type"])
    if (!solids.includes(type)) continue
    const bounds = cam.generator.elementBounds(element as never)
    const box = drawn(element)
    // Chordal meshes sit inside the exact shape by a fraction of a millimetre; a wrong axis or size is far off.
    const slack = 1.5
    const pairs: Array<[string, number, number]> = [
      ["min.x", bounds.min.x, box.min.x], ["max.x", bounds.max.x, box.max.x], ["min.y", bounds.min.y, box.min.y], ["max.y", bounds.max.y, box.max.y],
      ["min.z", bounds.min.z, box.min.z], ["max.z", bounds.max.z, box.max.z]
    ]
    for (const [name, said, seen] of pairs) {
      // A regular prism is boxed by its circumscribed circle: wider than the drawing on X, never narrower.
      const wide = (type === "prism" && name.endsWith("x")) || hulls.includes(type)
      const wider = wide ? (name.startsWith("min") ? said <= seen + slack : said >= seen - slack) : false
      if (!wider && !(Math.abs(said - seen) <= slack)) off.push(`${type} ${name}: bounds ${said.toFixed(2)}, drawn ${seen.toFixed(2)}`)
    }
  }
  expect(off).toEqual([])
})

test("architecture and standard parts stand on Z with the size the catalogue promises", () => {
  const find = (type: string) => made().find((e) => e["type"] === type)!
  const size = (type: string) => drawn(find(type)).getSize(new THREE.Vector3())
  const wall = size("wall"), column = size("column"), spring = size("spring"), stair = size("stair"), floor = size("floor"), roof = size("roof")
  expect(wall.z).toBeCloseTo(Number(find("wall")["height"]), 3)
  expect(wall.x).toBeCloseTo(Number(find("wall")["length"]), 3)
  expect(column.z).toBeCloseTo(Number(find("column")["height"]), 3)
  expect(stair.z).toBeCloseTo(Number(find("stair")["height"]), 3)
  expect(stair.y).toBeCloseTo(Number(find("stair")["depth"]), 3)
  expect(floor.z).toBeCloseTo(Number(find("floor")["thickness"]), 3)
  expect(floor.y).toBeCloseTo(Number(find("floor")["depth"]), 3)
  expect(roof.z).toBeCloseTo(Number(find("roof")["height"]), 3)
  expect(spring.z).toBeGreaterThan(Number(find("spring")["height"]))
})

test("a sweep carries its profile along the path: a square bar is square, no profile is a round tube", () => {
  const along = { type: "sweep", path: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 100 }] }
  const bar = normalizeElement({ ...along, profile: [{ x: -5, y: -5 }, { x: 5, y: -5 }, { x: 5, y: 5 }, { x: -5, y: 5 }] })
  const tube = normalizeElement({ ...along, radius: 8 })
  if (!bar.ok || !tube.ok) throw new Error("sweep refused")
  const barSize = drawn({ id: "bar", layerId: useLayerStore.getState().activeLayer, ...bar.element }).getSize(new THREE.Vector3())
  expect([barSize.x, barSize.y, barSize.z]).toEqual([10, 10, 100].map((v) => expect.closeTo(v, 3)))
  const tubeSize = drawn({ id: "tube", layerId: useLayerStore.getState().activeLayer, ...tube.element }).getSize(new THREE.Vector3())
  expect(tubeSize.x).toBeCloseTo(16, 0)
  expect(tubeSize.z).toBeCloseTo(100, 3)
})

test("a bolt is one piece: the shaft reaches the head, and the whole is as long as its length", () => {
  const bolt = made().find((e) => e["type"] === "bolt")!
  const object = buildElementObject(bolt as never)!
  const spans: Array<[number, number]> = []
  object.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (mesh.geometry && child.type === "Mesh") { const box = new THREE.Box3().setFromObject(mesh); spans.push([box.min.z, box.max.z]) }
  })
  spans.sort((a, b) => a[0] - b[0])
  // Every part starts before the previous one ends: no gap along the axis.
  let reach = spans[0]![1]
  for (const [lo, hi] of spans.slice(1)) { expect(lo).toBeLessThanOrEqual(reach + 1e-6); reach = Math.max(reach, hi) }
  // The thread's tube end sticks out by its own radius (0.05 d).
  expect(reach - spans[0]![0]).toBeCloseTo(Number(bolt["length"]), 0)
})
