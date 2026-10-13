import { expect, setDefaultTimeout, test } from "bun:test"
import { brep, cad, cam, elementBrep, sceneToStep, stepToElements } from "@cadcamfun/core"
import * as THREE from "three"

setDefaultTimeout(60_000)

/** A drilled plate written by the kernel as STEP, read back as the drawing's `brep` element. */
const importedPlate = () => {
  const step = sceneToStep([
    { id: "a", type: "cube", width: 40, height: 30, depth: 10, x: 0, y: 0, z: 0 },
    { id: "b", type: "cylinder", radius: 5, height: 20, x: 0, y: 0, z: 0 },
    { id: "c", type: "boolean-subtract", operands: ["a", "b"], name: "plate" }
  ]).step!
  return stepToElements(step)
}

test("a STEP file imports as exact brep elements with their checks", () => {
  const imported = importedPlate()
  expect(imported.elements.map((e) => [e.type, e.name])).toEqual([["brep", "plate"]])
  expect(imported.report[0]!.valid).toBe(true)
  expect(imported.report[0]!.faces).toBe(7)
})

test("the canvas draws a brep element as pickable faces with exact normals and its B-rep edges", async () => {
  const { useElementsStore } = await import("../src/features/cad/store/elementsStore.ts")
  const { createThreeObject } = await import("../src/features/cad/lib/createThreeObject.ts")
  const imported = importedPlate()
  const [id] = useElementsStore.getState().addElements(imported.elements.map((e) => ({ ...e })))
  const element = useElementsStore.getState().elements.find((e: { id: string }) => e.id === id)
  const object = createThreeObject(element)!
  expect(object.userData["isBrep"]).toBe(true)
  const faces = object.children.filter((c) => c.userData["brepFace"] !== undefined)
  const edges = object.children.filter((c) => c.userData["brepEdge"] !== undefined)
  expect(faces.length).toBe(7)
  expect(faces.map((f) => f.userData["surface"]).sort()).toEqual(["cylinder", "plane", "plane", "plane", "plane", "plane", "plane"])
  // 12 box edges + 2 hole rims + the hole's seam.
  expect(edges.length).toBe(15)
  // Normals are the surface's: the top face points straight up.
  const top = faces.find((f) => {
    const g = (f as unknown as { geometry: { getAttribute(n: string): { array: ArrayLike<number> } } }).geometry
    const n = g.getAttribute("normal").array
    return n[2]! > 0.999
  })
  expect(top).toBeDefined()
})

test("exact analysis of drawing elements: catalogue solids, Booleans on their operands, and the reason for mesh-only ones", async () => {
  const { analyzeExact, elementStep } = await import("../src/features/cad/lib/exactModel.ts")
  const all = [
    { id: "a", type: "cube", width: 40, height: 30, depth: 10, x: 0, y: 0, z: 0 },
    { id: "b", type: "cylinder", radius: 5, height: 20, x: 0, y: 0, z: 0 },
    { id: "c", type: "boolean-subtract", operands: ["a", "b"], name: "plate" },
    { id: "g", type: "gear", moduleValue: 2, teeth: 12, thickness: 5 }
  ]
  const plate = analyzeExact(all[2]!, all)
  expect(plate.ok).toBe(true)
  if (plate.ok) {
    expect(Math.abs(plate.volume - (12000 - Math.PI * 250))).toBeLessThan(1e-6)
    expect(plate.holes).toBe(1)
    expect(plate.surfaces).toEqual({ plane: 6, cylinder: 1 })
    expect(plate.valid).toBe(true)
  }
  expect(analyzeExact(all[3]!, all).ok).toBe(false)
  expect("step" in elementStep(all[2]!, all)).toBe(true)
})

test("the exact solid of the imported element is what the CAM machines and what STEP export writes", () => {
  const imported = importedPlate()
  const element = { ...imported.elements[0]!, id: "p" }
  const again = brep.readStepBreps(sceneToStep([element]).step!)
  expect(Math.abs(brep.massProperties(again.parts[0]!.brep).volume - (12000 - Math.PI * 250))).toBeLessThan(1e-6)
})

test("CADCanvas applies B-rep and parametric gizmo transforms once, matching the kernel's placed geometry", async () => {
  const { buildElementObject, disposeObject } = await import("../src/features/cad/lib/sceneHelpers.ts")
  const { useCADStore } = await import("../src/features/cad/store/cadStore.ts")
  useCADStore.setState({ originOffset: { x: 0, y: 0, z: 0 } })
  const part = { id: "plate", type: "brep", brep: brep.makeBox(10, 6, 4), x: 20, y: 5, z: 3, translateX: 7, translateY: -2, translateZ: 1, rotation: { x: 0, y: 0, z: 90 }, scale: { x: 2, y: 2, z: 2 } }
  const exact = elementBrep(part)
  if (!exact.brep) throw new Error(exact.reason)
  const expected = cad.brepBox(exact.brep)
  const object = buildElementObject({ ...part, layerId: "default" } as never)!
  const box = new THREE.Box3().setFromObject(object)
  expect(box.min.x).toBeCloseTo(expected.lo.x, 4)
  expect(box.max.x).toBeCloseTo(expected.hi.x, 4)
  expect(box.min.y).toBeCloseTo(expected.lo.y, 4)
  expect(box.max.z).toBeCloseTo(expected.hi.z, 4)
  disposeObject(object)

  const parametric = { ...part, id: "history", type: "parametric", history: { parameters: {}, features: [{ id: "b", type: "primitive", element: "cube", params: { width: 10, height: 6, depth: 4 }, operation: "new" }] } }
  const mesh = cam.model.elementMesh(parametric)!
  const bounds = cam.model.meshBounds(mesh)
  const drawn = buildElementObject({ ...parametric, layerId: "default" } as never)!
  const actual = new THREE.Box3().setFromObject(drawn)
  expect(actual.min.x).toBeCloseTo(bounds.min[0]!, 4)
  expect(actual.max.y).toBeCloseTo(bounds.max[1]!, 4)
  disposeObject(drawn)
})

test("two canvases own separate B-rep resources and origin offsets even when tessellation is cached", async () => {
  const { createThreeObject } = await import("../src/features/cad/lib/createThreeObject.ts")
  const { disposeObject } = await import("../src/features/cad/lib/sceneHelpers.ts")
  const element = { id: "box", type: "brep", brep: brep.makeBox(10, 6, 4) }
  const first = createThreeObject(element, { x: 0, y: 0, z: 0 })!
  const second = createThreeObject(element, { x: 100, y: 20, z: 0 })!
  const a = first.children[0] as THREE.Mesh
  const b = second.children[0] as THREE.Mesh
  expect(a.geometry).not.toBe(b.geometry)
  expect(a.material).not.toBe(b.material)
  expect(new THREE.Box3().setFromObject(second).min.x - new THREE.Box3().setFromObject(first).min.x).toBeCloseTo(100, 6)
  disposeObject(first)
  expect(b.geometry.getAttribute("position").count).toBeGreaterThan(0)
  disposeObject(second)
})
