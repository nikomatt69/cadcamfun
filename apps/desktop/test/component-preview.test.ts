import { describe, expect, test } from "bun:test"
import * as THREE from "three"
import { createComponentPreviewObject } from "../src/features/library/lib/component-preview.ts"
import type { Element } from "../src/features/cad/store/elementsStore.ts"

const element = (patch: Record<string, unknown>): Element => ({ id: "e", layerId: "default", x: 0, y: 0, z: 0, ...patch }) as unknown as Element

describe("the component preview draws what the editor draws", () => {
  test("a revolution is drawn from its profile instead of being reported as undisplayable", () => {
    const object = createComponentPreviewObject(element({ type: "revolution", profile: [{ x: 5, y: 0 }, { x: 5, y: 20 }, { x: 2, y: 30 }] }))
    expect(object).toBeInstanceOf(THREE.Mesh)
    expect(new THREE.Box3().setFromObject(object!).isEmpty()).toBe(false)
  })

  test("an extrusion inside a component is drawn with the component's other members", () => {
    const object = createComponentPreviewObject(element({ type: "component", elements: [
      element({ id: "a", type: "cube", width: 10, height: 10, depth: 10 }),
      element({ id: "b", type: "revolution", profile: [{ x: 3, y: 0 }, { x: 3, y: 12 }] })
    ] }))
    expect(object!.children.length).toBe(2)
  })

  test("an element nothing can draw is still reported, so the page says so", () => {
    expect(createComponentPreviewObject(element({ type: "revolution" }))).toBeNull()
    expect(createComponentPreviewObject(element({ type: "no-such-element" }))).toBeNull()
  })

  test("the simple primitives keep their own mapping", () => {
    const object = createComponentPreviewObject(element({ type: "cube", width: 4, height: 5, depth: 6 }))
    expect(new THREE.Box3().setFromObject(object!).getSize(new THREE.Vector3()).toArray()).toEqual([4, 5, 6])
  })
})
