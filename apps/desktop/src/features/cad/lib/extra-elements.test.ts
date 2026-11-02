import { describe, expect, test } from "bun:test"
import * as THREE from "three"
import { createThreeObject } from "./createThreeObject.ts"
import { elementTemplate } from "./elementTemplates.ts"

const ORIGIN = { x: 0, y: 0, z: 0 }
const sizeOf = (object: THREE.Object3D): THREE.Vector3 => new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3())

describe("elements the toolbar creates are drawn", () => {
  for (const type of ["text", "extrude", "grid", "tube", "lathe"]) {
    test(`the default ${type} element builds an object`, () => {
      const element = elementTemplate(type)
      expect(element).toBeDefined()
      const object = createThreeObject({ id: type, ...element }, ORIGIN)
      expect(object).not.toBeNull()
      const box = new THREE.Box3().setFromObject(object!)
      expect(box.isEmpty()).toBe(false)
    })
  }

  test("an extrusion of a square profile is as deep as asked, standing on Z", () => {
    const object = createThreeObject({ id: "e", type: "extrude", x: 0, y: 0, z: 5, depth: 50, shape: [{ x: -25, y: -25 }, { x: 25, y: -25 }, { x: 25, y: 25 }, { x: -25, y: 25 }] }, ORIGIN)!
    const size = sizeOf(object)
    expect([size.x, size.y, size.z].map(Math.round)).toEqual([50, 50, 50])
    expect(new THREE.Box3().setFromObject(object).min.z).toBeCloseTo(5)
  })

  test("a lathe stands on Z: its profile height runs along Z", () => {
    const object = createThreeObject({ id: "l", type: "lathe", x: 0, y: 0, z: 0, points: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 30 }], segments: 24 }, ORIGIN)!
    const size = sizeOf(object)
    expect(size.z).toBeCloseTo(30)
    expect(size.x).toBeCloseTo(40, 0)
  })

  test("a grid lies on the plane it names", () => {
    const flat = sizeOf(createThreeObject({ id: "g", type: "grid", x: 0, y: 0, z: 0, size: 100, divisions: 10, plane: "xy" }, ORIGIN)!)
    expect(flat.z).toBeCloseTo(0)
    expect(flat.x).toBeCloseTo(100)
    const upright = sizeOf(createThreeObject({ id: "g", type: "grid", x: 0, y: 0, z: 0, size: 100, divisions: 10, plane: "xz" }, ORIGIN)!)
    expect(upright.y).toBeCloseTo(0)
    const side = sizeOf(createThreeObject({ id: "g", type: "grid", x: 0, y: 0, z: 0, size: 100, divisions: 10, plane: "yz" }, ORIGIN)!)
    expect(side.x).toBeCloseTo(0)
  })

  test("data that cannot be drawn gives no object (the canvas marks it)", () => {
    expect(createThreeObject({ id: "t", type: "tube", path: [{ x: 0, y: 0, z: 0 }] }, ORIGIN)).toBeNull()
    expect(createThreeObject({ id: "x", type: "extrude", shape: [{ x: 0, y: 0 }] }, ORIGIN)).toBeNull()
    expect(createThreeObject({ id: "s", type: "text", text: "" }, ORIGIN)).toBeNull()
  })

  test("the origin offset shifts the element", () => {
    const object = createThreeObject({ id: "t", type: "tube", x: 0, y: 0, z: 0, path: [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }], radius: 1 }, { x: 100, y: 0, z: 0 })!
    expect(new THREE.Box3().setFromObject(object).min.x).toBeGreaterThan(95)
  })
})
