import { describe, expect, test } from "bun:test"
import * as THREE from "three"
import { applyDetailLevel, LOD_MIN_PARTS, LOD_MIN_PIXELS, LOD_RESTORE_PIXELS, pixelDiameter } from "./detail-level.ts"
import { applyDisplayMode } from "./display-mode.ts"

/** A part of the given size with an `edges` group, at x. */
const part = (size: number, x: number): THREE.Mesh => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), new THREE.MeshStandardMaterial())
  mesh.position.x = x
  const edges = new THREE.Group()
  edges.name = "edges"
  mesh.add(edges)
  mesh.updateMatrixWorld(true)
  return mesh
}
const camera = (distance: number): THREE.PerspectiveCamera => {
  const result = new THREE.PerspectiveCamera(50, 1, 0.1, 1e6)
  result.position.set(0, -distance, 0)
  result.up.set(0, 0, 1)
  result.lookAt(0, 0, 0)
  result.updateMatrixWorld(true)
  return result
}
const edgesOf = (object: THREE.Object3D) => object.children.find((child) => child.name === "edges")!
const many = (size: number, count = LOD_MIN_PARTS): THREE.Mesh[] => Array.from({ length: count }, (_, i) => part(size, i * size * 2))

describe("level of detail", () => {
  test("pixel size of a sphere shrinks with distance", () => {
    expect(pixelDiameter(10, 100, 50, 800)).toBeGreaterThan(pixelDiameter(10, 400, 50, 800))
    expect(pixelDiameter(10, 0, 50, 800)).toBe(Infinity)
  })

  test("a small drawing keeps every edge, however far away", () => {
    const parts = many(1, LOD_MIN_PARTS - 1)
    expect(applyDetailLevel(parts, camera(50_000), 800)).toBe(false)
    expect(parts.every((p) => edgesOf(p).visible)).toBe(true)
  })

  test("in a large drawing the parts that are tiny on screen lose their edges, and get them back close up", () => {
    const parts = many(1)
    const far = camera(100_000)
    expect(applyDetailLevel(parts, far, 800)).toBe(true)
    expect(parts.every((p) => !edgesOf(p).visible)).toBe(true)
    expect(applyDetailLevel(parts, far, 800)).toBe(false)
    // close up on the first part: it is large on screen again, the ones far along the row are still tiny
    expect(applyDetailLevel(parts, camera(5), 800)).toBe(true)
    expect(edgesOf(parts[0]!).visible).toBe(true)
    expect(edgesOf(parts[parts.length - 1]!).visible).toBe(false)
  })

  test("a big part among tiny ones keeps its edges", () => {
    const parts = many(1)
    const big = part(5_000, -20_000)
    applyDetailLevel([...parts, big], camera(50_000), 800)
    expect(edgesOf(big).visible).toBe(true)
    expect(edgesOf(parts[0]!).visible).toBe(false)
  })

  test("hysteresis: just above the hide threshold it stays hidden until it clearly grows", () => {
    expect(LOD_RESTORE_PIXELS).toBeGreaterThan(LOD_MIN_PIXELS)
    const parts = many(1)
    // pick distances so the box's bounding sphere is a bit under, then between, the two thresholds
    const radius = Math.sqrt(3) / 2
    const distanceFor = (pixels: number) => (2 * radius * 800) / (pixels * 2 * Math.tan((50 * Math.PI) / 360))
    applyDetailLevel(parts, camera(distanceFor(LOD_MIN_PIXELS - 2)), 800)
    expect(edgesOf(parts[0]!).visible).toBe(false)
    applyDetailLevel(parts, camera(distanceFor((LOD_MIN_PIXELS + LOD_RESTORE_PIXELS) / 2)), 800)
    expect(edgesOf(parts[0]!).visible).toBe(false)
    applyDetailLevel(parts, camera(distanceFor(LOD_RESTORE_PIXELS + 4)), 800)
    expect(edgesOf(parts[0]!).visible).toBe(true)
  })

  test("the visual style keeps the last word: edges the style hides stay hidden when the level of detail restores", () => {
    const parts = many(1)
    for (const p of parts) applyDisplayMode(p, "shaded")
    applyDetailLevel(parts, camera(100_000), 800)
    applyDetailLevel(parts, camera(5), 800)
    expect(parts.every((p) => !edgesOf(p).visible)).toBe(true)
  })

  test("a style applied while an edge set is hidden by distance does not bring it back", () => {
    const parts = many(1)
    applyDetailLevel(parts, camera(100_000), 800)
    for (const p of parts) applyDisplayMode(p, "hidden-line")
    expect(parts.every((p) => !edgesOf(p).visible)).toBe(true)
    applyDetailLevel(parts, camera(5), 800)
    expect(edgesOf(parts[0]!).visible).toBe(true)
  })

  test("an orthographic camera measures by zoom", () => {
    const parts = many(1)
    const ortho = new THREE.OrthographicCamera(-5000, 5000, 5000, -5000, 0.1, 1e6)
    ortho.position.set(0, -1000, 0)
    ortho.lookAt(0, 0, 0)
    ortho.updateMatrixWorld(true)
    expect(applyDetailLevel(parts, ortho, 800)).toBe(true)
    ortho.zoom = 5000
    ortho.updateProjectionMatrix()
    expect(applyDetailLevel(parts, ortho, 800)).toBe(true)
    expect(parts.every((p) => edgesOf(p).visible)).toBe(true)
  })
})
