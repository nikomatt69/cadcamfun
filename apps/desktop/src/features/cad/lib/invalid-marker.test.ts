import { describe, expect, test } from "bun:test"
import * as THREE from "three"
import { useLayerStore } from "../store/layerStore.ts"
import { invalidReason } from "./invalid-marker.ts"
import { buildElementObject } from "./sceneHelpers.ts"

const layerId = () => useLayerStore.getState().activeLayer

describe("an element that cannot be drawn is a visible marker", () => {
  test("an unknown type gives a red marker with the reason, at the element position", () => {
    const object = buildElementObject({ id: "u", type: "hologram", layerId: layerId(), x: 30, y: 0, z: 0 } as never)!
    expect(object).not.toBeNull()
    expect(object.userData.isInvalidMarker).toBe(true)
    expect(String(object.userData.invalidReason)).toContain("hologram")
    expect(object.userData.elementId).toBe("u")
    expect(new THREE.Box3().setFromObject(object).getCenter(new THREE.Vector3()).x).toBeCloseTo(30)
  })

  test("a history that builds no body says so", () => {
    const element = { id: "p", type: "parametric", layerId: layerId(), history: { parameters: {}, features: [] } }
    expect(invalidReason(element)).toContain("builds no body")
    expect(buildElementObject(element as never)!.userData.isInvalidMarker).toBe(true)
  })

  test("a parametric element without a history, a B-rep without faces and a one-operand Boolean each explain themselves", () => {
    expect(invalidReason({ type: "parametric" })).toContain("no feature history")
    expect(invalidReason({ type: "brep", brep: { faces: [] } }).length).toBeGreaterThan(0)
    expect(invalidReason({ type: "boolean-union", operands: ["a"] })).toContain("two operands")
  })

  test("a builder that throws still leaves a marker, not a hole in the drawing", () => {
    const element = { id: "c", type: "path3d", layerId: layerId(), points: [null, null] }
    const object = buildElementObject(element as never)
    expect(object!.userData.isInvalidMarker).toBe(true)
  })

  test("a drawable element is not marked", () => {
    const object = buildElementObject({ id: "k", type: "cube", layerId: layerId(), x: 0, y: 0, z: 0, width: 2, height: 2, depth: 2 } as never)!
    expect(object.userData.isInvalidMarker).toBeUndefined()
  })

  test("the marker is sized from the element when it states a size", () => {
    const object = buildElementObject({ id: "u", type: "hologram", layerId: layerId(), x: 0, y: 0, z: 0, width: 40 } as never)!
    expect(new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3()).x).toBeCloseTo(40)
  })
})
