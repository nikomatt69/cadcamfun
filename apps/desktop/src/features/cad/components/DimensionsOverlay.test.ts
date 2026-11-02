import { describe, expect, test } from "bun:test"
import * as THREE from "three"
import { measureDimensions, viewSignature } from "./DimensionsOverlay.tsx"

const scene = (): THREE.Scene => {
  const result = new THREE.Scene()
  const box = new THREE.Mesh(new THREE.BoxGeometry(10, 20, 30), new THREE.MeshBasicMaterial())
  box.userData.elementId = "a"
  result.add(box)
  result.updateMatrixWorld(true)
  return result
}
const camera = (): THREE.PerspectiveCamera => {
  const result = new THREE.PerspectiveCamera(50, 1.5, 1, 2000)
  result.up.set(0, 0, 1)
  result.position.set(300, -300, 240)
  result.lookAt(0, 0, 0)
  result.updateMatrixWorld(true)
  return result
}

describe("the dimensions of a selected part", () => {
  test("width is the size along X, depth along Y and height along Z (the scene is Z-up)", () => {
    const lines = measureDimensions(scene(), camera(), ["a"], 900, 600)
    const by = Object.fromEntries(lines.map((line) => [line.type, line.value]))
    expect(by).toEqual({ width: "10.00", depth: "20.00", height: "30.00" })
  })

  test("the three lines start at the same corner and end elsewhere", () => {
    const lines = measureDimensions(scene(), camera(), ["a"], 900, 600)
    expect(new Set(lines.map((line) => `${line.startX.toFixed(3)},${line.startY.toFixed(3)}`)).size).toBe(1)
    for (const line of lines) expect(Math.hypot(line.endX - line.startX, line.endY - line.startY)).toBeGreaterThan(1)
  })

  test("a part that is not selected, or not in the scene, has no dimensions", () => {
    expect(measureDimensions(scene(), camera(), ["b"], 900, 600)).toEqual([])
    expect(measureDimensions(scene(), camera(), [], 900, 600)).toEqual([])
  })

  test("a corner behind the camera gives no line", () => {
    const behind = camera()
    behind.position.set(0, 0, -100)
    behind.up.set(0, 1, 0)
    behind.lookAt(0, 0, -500)
    behind.updateMatrixWorld(true)
    expect(measureDimensions(scene(), behind, ["a"], 900, 600)).toEqual([])
  })
})

describe("when the dimensions have to be measured again", () => {
  test("the same view gives the same signature; a moved camera, a moved part or another size change it", () => {
    const s = scene(), c = camera()
    const first = viewSignature(s, c, ["a"], 900, 600)
    expect(viewSignature(s, c, ["a"], 900, 600)).toBe(first)
    expect(viewSignature(s, c, ["a"], 800, 600)).not.toBe(first)
    s.children[0]!.position.x = 5
    expect(viewSignature(s, c, ["a"], 900, 600)).not.toBe(first)
    const other = camera()
    other.position.x += 10
    expect(viewSignature(s, other, ["a"], 900, 600)).not.toBe(viewSignature(s, c, ["a"], 900, 600))
  })
})
