import { describe, expect, test } from "bun:test"
import * as THREE from "three"
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js"
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js"
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js"
import { applyDisplayMode, DISPLAY_MODES, GHOST_OPACITY, hasEdgeLines, isDisplayMode, planFor, XRAY_OPACITY } from "./display-mode.ts"

/** A solid the way `solidObject` draws one: a mesh with an `edges` group holding a thick line. */
const solid = (extra: { opacity?: number } = {}): THREE.Mesh => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x4285f4, ...(extra.opacity === undefined ? {} : { transparent: true, opacity: extra.opacity }) }))
  const edges = new THREE.Group()
  edges.name = "edges"
  const line = new LineSegments2(new LineSegmentsGeometry().setPositions([0, 0, 0, 1, 0, 0]), new LineMaterial({ color: 0x59606a }))
  edges.add(line)
  mesh.add(edges)
  return mesh
}
const primitive = (): THREE.Mesh => new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial())
const material = (object: THREE.Object3D): THREE.MeshStandardMaterial => (object as THREE.Mesh).material as THREE.MeshStandardMaterial
const edgesOf = (object: THREE.Object3D): THREE.Object3D => object.children.find((child) => child.name === "edges")!

describe("display modes", () => {
  test("the catalogue of modes", () => {
    expect(DISPLAY_MODES.every(isDisplayMode)).toBe(true)
    expect(isDisplayMode("realistic")).toBe(false)
  })

  test("shaded-edges is the look an element already has: nothing to change", () => {
    const mesh = solid()
    expect(applyDisplayMode(mesh, "shaded-edges")).toBe(false)
    expect(edgesOf(mesh).visible).toBe(true)
  })

  test("shaded hides the edges", () => {
    const mesh = solid()
    expect(applyDisplayMode(mesh, "shaded")).toBe(true)
    expect(edgesOf(mesh).visible).toBe(false)
    expect(material(mesh).wireframe).toBe(false)
  })

  test("hidden-line keeps the faces in the depth buffer, draws no colour, and keeps the edges", () => {
    const mesh = solid()
    applyDisplayMode(mesh, "hidden-line")
    expect(material(mesh).colorWrite).toBe(false)
    expect(material(mesh).depthWrite).toBe(true)
    expect(mesh.renderOrder).toBeLessThan(0)
    expect(edgesOf(mesh).visible).toBe(true)
  })

  test("hidden-line of a primitive without edge lines does not make it vanish (found in a real WebGL render)", () => {
    const mesh = primitive()
    applyDisplayMode(mesh, "hidden-line")
    expect(material(mesh).colorWrite).toBe(true)
    expect(planFor("hidden-line", false)).toEqual({ fill: "solid", opacity: 1, edges: false })
    expect(planFor("hidden-line", true).fill).toBe("depth-only")
  })

  test("wireframe of a solid with edges shows the edges only, through the part", () => {
    const mesh = solid()
    applyDisplayMode(mesh, "wireframe")
    expect(material(mesh).colorWrite).toBe(false)
    expect(material(mesh).depthWrite).toBe(false)
    expect(edgesOf(mesh).visible).toBe(true)
  })

  test("wireframe of a primitive without edge lines falls back to its triangles", () => {
    const mesh = primitive()
    expect(hasEdgeLines(mesh)).toBe(false)
    applyDisplayMode(mesh, "wireframe")
    expect(material(mesh).wireframe).toBe(true)
    expect(material(mesh).colorWrite).toBe(true)
  })

  test("xray makes the faces translucent without hiding what is behind them", () => {
    const mesh = solid()
    applyDisplayMode(mesh, "xray")
    expect(material(mesh).transparent).toBe(true)
    expect(material(mesh).opacity).toBeCloseTo(XRAY_OPACITY)
    expect(material(mesh).depthWrite).toBe(false)
    expect(edgesOf(mesh).visible).toBe(true)
  })

  test("a material that was already translucent keeps its own opacity as the base", () => {
    const mesh = solid({ opacity: 0.5 })
    applyDisplayMode(mesh, "xray")
    expect(material(mesh).opacity).toBeCloseTo(0.5 * XRAY_OPACITY)
    applyDisplayMode(mesh, "shaded-edges")
    expect(material(mesh).opacity).toBe(0.5)
    expect(material(mesh).transparent).toBe(true)
  })

  test("modes never compound: returning to shaded-edges restores the original look", () => {
    const mesh = solid()
    for (const mode of ["wireframe", "xray", "hidden-line", "shaded"] as const) applyDisplayMode(mesh, mode)
    applyDisplayMode(mesh, "shaded-edges")
    const m = material(mesh)
    expect([m.wireframe, m.transparent, m.opacity, m.depthWrite, m.colorWrite]).toEqual([false, false, 1, true, true])
    expect(mesh.renderOrder).toBe(0)
    expect(edgesOf(mesh).visible).toBe(true)
  })

  test("the thick edge lines are never dressed as faces", () => {
    const mesh = solid()
    applyDisplayMode(mesh, "hidden-line")
    const line = edgesOf(mesh).children[0] as LineSegments2
    expect((line.material as LineMaterial).colorWrite).toBe(true)
  })

  test("ghost fades the parts that are not selected and leaves the selected ones", () => {
    const selected = solid(), others = solid()
    applyDisplayMode(selected, "ghost", false)
    applyDisplayMode(others, "ghost", true)
    expect(material(selected).opacity).toBe(1)
    expect(edgesOf(selected).visible).toBe(true)
    expect(material(others).opacity).toBeCloseTo(GHOST_OPACITY)
    expect(edgesOf(others).visible).toBe(false)
    // The selection changes: the same part goes back.
    applyDisplayMode(others, "ghost", false)
    expect(material(others).opacity).toBe(1)
    expect(edgesOf(others).visible).toBe(true)
  })

  test("edge lines that arrive after the mode was applied inherit it from their group", () => {
    const mesh = solid()
    applyDisplayMode(mesh, "shaded")
    const late = new LineSegments2(new LineSegmentsGeometry().setPositions([0, 0, 0, 0, 1, 0]), new LineMaterial())
    edgesOf(mesh).add(late)
    let visible = true
    for (let node: THREE.Object3D | null = late; node; node = node.parent) if (!node.visible) visible = false
    expect(visible).toBe(false)
  })

  test("planFor is total", () => {
    for (const mode of DISPLAY_MODES) for (const hasEdges of [true, false]) expect(planFor(mode, hasEdges).fill).toBeDefined()
  })

  test("a B-rep: faces share one material, the pickable edges follow the mode", () => {
    const group = new THREE.Group()
    const shared = new THREE.MeshStandardMaterial()
    for (let face = 0; face < 3; face++) { const piece = new THREE.Mesh(new THREE.BufferGeometry(), shared); piece.userData.brepFace = face; group.add(piece) }
    const edge = new LineSegments2(new LineSegmentsGeometry().setPositions([0, 0, 0, 1, 1, 1]), new LineMaterial())
    edge.userData.brepEdge = 0
    group.add(edge)
    applyDisplayMode(group, "wireframe")
    expect(shared.colorWrite).toBe(false)
    expect(edge.visible).toBe(true)
    applyDisplayMode(group, "shaded")
    expect(edge.visible).toBe(false)
    expect(shared.colorWrite).toBe(true)
  })
})
