/**
 * The built-in structural parts: each one places as a parametric part with the library's own measures (it used to be a
 * generic 50 mm cube), with real holes where the section is hollow, and its preview is drawn.
 */
import { describe, expect, test } from "bun:test"
import { cam } from "@cadcamfun/core"
import { Box3, Vector3 } from "three"
import { predefinedComponents } from "../src/features/cad/lib/predefinedLibraries.ts"
import { isLegacyPart, legacyPartElement } from "../src/features/cad/lib/library-parts.ts"
import { transformLibraryItemToCADElement, createComponentPreview } from "../src/features/cad/lib/libraryTransform.ts"
import { buildElementObject, disposeObject } from "../src/features/cad/lib/sceneHelpers.ts"
import { componentBounds } from "../src/features/cad/lib/component-assembly.ts"

const byName = (name: string) => predefinedComponents.find((part) => part.name === name)! as any
const placed = (name: string, at = { x: 0, y: 0, z: 0 }) => transformLibraryItemToCADElement(byName(name), at)
const meshOf = (element: any) => cam.model.elementMesh({ ...element, x: 0, y: 0, z: 0 })!
const extents = (element: any): number[] => {
  const box = cam.model.meshBounds(meshOf(element))
  return [box.max[0]! - box.min[0]!, box.max[1]! - box.min[1]!, box.max[2]! - box.min[2]!].map((value) => Math.round(value * 1e6) / 1e6)
}

describe("the built-in structural parts", () => {
  test("every one of them is a legacy part and becomes a parametric element that builds a solid", () => {
    const parts = predefinedComponents.filter((part) => isLegacyPart((part.data as any)?.geometry?.elements ?? []))
    expect(parts.length).toBeGreaterThanOrEqual(12)
    expect(parts.length).toBe(predefinedComponents.length)
    for (const part of parts) {
      const element = legacyPartElement(part.name, (part.data as any).geometry.elements)
      expect(element, part.name).toBeDefined()
      const mesh = cam.model.elementMesh({ ...(element as any), x: 0, y: 0, z: 0 })
      expect(mesh, `${part.name} builds no solid`).toBeDefined()
      expect(cam.model.volumeOf(mesh!), `${part.name} has no volume`).toBeGreaterThan(0)
    }
  })

  test("the measures are the library's: a plate, a T-slot, a beam", () => {
    // 100 x 50 x 5: width along X, length along Y, thickness up Z.
    const plate = predefinedComponents.find((part) => (part.data as any)?.geometry?.elements?.length === 1 && (part.data as any).geometry.elements[0].type === "box" && (part.data as any).geometry.elements[0].length === 50)!
    expect(extents(placed(plate.name))).toEqual([100, 50, 5])
    // T-Slot 20: a 20 x 20 section, 100 long.
    expect(extents(placed("T-Slot Extrusion 20mm"))).toEqual([20, 100, 20])
    expect(extents(placed("T-Slot Extrusion 40x40mm"))).toEqual([40, 100, 40])
  })

  test("a rectangular tube is really hollow: its volume is the section minus the bore", () => {
    const tube = placed("Rectangular Tube 60x40x3mm")
    expect(tube.type).toBe("parametric")
    expect(extents(tube)).toEqual([60, 100, 40])
    expect(cam.model.volumeOf(meshOf(tube))).toBeCloseTo(60 * 40 * 100 - 54 * 34 * 100, 3)
  })

  test("a round tube has its bore, a gusset is a triangle 5 thick", () => {
    const round = placed("Structural Tube 30mm")
    expect(extents(round)[0]).toBeCloseTo(30, 0)
    // The round faces are polygons, so the volume is the ring's to within a fraction of a percent.
    expect(Math.abs(cam.model.volumeOf(meshOf(round)) / (Math.PI * (15 ** 2 - 13 ** 2) * 100) - 1)).toBeLessThan(0.005)
    const gusset = placed("Gusset Plate 100x100x5mm")
    expect(extents(gusset)).toEqual([100, 100, 5])
    expect(cam.model.volumeOf(meshOf(gusset))).toBeCloseTo((100 * 100 / 2) * 5, 3)
  })

  test("parts made of several solids keep them together: the H-beam is one body of three plates", () => {
    const beam = placed("H-Beam 150x75x5mm")
    expect(extents(beam)).toEqual([75, 300, 150])
    expect(cam.model.volumeOf(meshOf(beam))).toBeCloseTo((75 * 5 + 140 * 5 + 75 * 5) * 300, 2)
  })

  test("the angle and the U-channel stand on the work plane with their section in X and Z", () => {
    const channel = placed("U-Channel 80x40x4mm")
    // The library's own measures: a 4 flange and 72 webs make 76 up, 80 along.
    expect(extents(channel)).toEqual([40, 80, 76])
    expect(cam.model.volumeOf(meshOf(channel))).toBeCloseTo((40 * 4 + 2 * 4 * 72) * 80, 2)
  })

  test("the preview of each part is drawn (the extrusions had none)", () => {
    for (const part of predefinedComponents.filter((candidate) => isLegacyPart((candidate.data as any)?.geometry?.elements ?? []))) {
      const preview = createComponentPreview(part)
      expect(preview, `${part.name} has no preview`).not.toBeNull()
      expect(preview!.children.length, `${part.name} preview is empty`).toBeGreaterThan(0)
      disposeObject(preview!)
    }
  })

  test("placing sets the pose and leaves a part from the editor alone", () => {
    const at = placed("T-Slot Extrusion 20mm", { x: 40, y: 20, z: 0 })
    expect(at).toMatchObject({ type: "parametric", name: "T-Slot Extrusion 20mm" })
    const own = { name: "mine", data: { geometry: { elements: [{ id: "c", type: "cube", x: 5, y: 5, z: 5, width: 10, height: 10, depth: 10 }] } } }
    expect(legacyPartElement("mine", own.data.geometry.elements)).toBeUndefined()
    expect(transformLibraryItemToCADElement(own, { x: 0, y: 0, z: 0 }).type).toBe("cube")
  })

  test("every preview matches the placed solid and is centred on the requested position", () => {
    const target = new Vector3(173, -81, 29)
    for (const part of predefinedComponents) {
      const preview = createComponentPreview(part)!
      const element = transformLibraryItemToCADElement(part, target)
      const bounds = componentBounds([element])!
      try {
        const previewBounds = new Box3().setFromObject(preview)
        const size = previewBounds.getSize(new Vector3())
        expect(previewBounds.getCenter(new Vector3()).length(), part.name).toBeLessThan(1e-4)
        for (const [actual, expected] of [[bounds.width, size.x], [bounds.height, size.y], [bounds.depth, size.z],
          [bounds.centerX, target.x], [bounds.centerY, target.y], [bounds.centerZ, target.z]]) {
          expect(actual!, part.name).toBeCloseTo(expected!, 4)
        }
      } finally { disposeObject(preview) }
    }
  })

  test("repeated placements have independent ids and histories and leave the catalogue untouched", () => {
    const part = byName("Rectangular Tube 60x40x3mm")
    const original = JSON.stringify(part)
    const first = transformLibraryItemToCADElement(part, { x: 20, y: 30, z: 40 })
    const second = transformLibraryItemToCADElement(part, { x: -20, y: -30, z: -40 })
    expect(first.id).not.toBe(second.id)
    expect(first.history).not.toBe(second.history)
    expect(first.history.features).not.toBe(second.history.features)
    Object.assign(first.history.parameters, { edited: 123 })
    expect(second.history.parameters.edited).toBeUndefined()
    expect(JSON.stringify(part)).toBe(original)
    const object = buildElementObject(second)!
    try { expect(new Box3().setFromObject(object).isEmpty()).toBe(false) }
    finally { disposeObject(object) }
  })

  test("malformed library solids are rejected instead of producing invalid parametric histories", () => {
    const box = { type: "box", width: 10, height: 20, length: 30, position: { x: 0, y: 0, z: 0 } }
    const tube = { type: "cylinder", outerDiameter: 30, innerDiameter: 26, height: 100, position: box.position }
    const invalid = [[], [null], [{ ...box, position: { x: NaN, y: 0, z: 0 } }],
      [{ ...box, width: -1 }], [{ ...box, height: 0 }], [{ ...box, length: Infinity }], [{ ...box, negative: true }],
      [{ ...tube, innerDiameter: 31 }], [{ ...tube, innerDiameter: NaN }],
      [{ type: "polygon", position: box.position, height: 5, points: [{ x: 0, y: 0, z: 0 }, null, {}] }]]
    for (const solids of invalid) expect(legacyPartElement("invalid", solids)).toBeUndefined()
  })
})
