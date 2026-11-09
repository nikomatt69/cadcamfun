import { describe, expect, test } from "bun:test"
import * as THREE from "three"
import { brep } from "@cadcamfun/core"
import { buildElementObject } from "./sceneHelpers.ts"
import { useLayerStore } from "../store/layerStore.ts"
import { buildAnalysisOverlay, clampAnalysis, createAnalysisMaterial, DEFAULT_ANALYSIS, draftAngleDeg, draftClass, draftSummary, pullVector, removeAnalysisOverlay, updateAnalysisMaterial } from "./analysis.ts"

const layerId = () => useLayerStore.getState().activeLayer
const exact = (id: string, body: brep.Brep, x = 0) => {
  const object = buildElementObject({ id, type: "brep", layerId: layerId(), x, y: 0, z: 0, brep: body } as never)!
  object.updateMatrixWorld(true)
  return object
}

describe("draft angle and class", () => {
  test("90° facing the pull, 0° parallel, negative for an undercut; the boundary counts as drafted", () => {
    const up = pullVector("+z")
    expect(draftAngleDeg(new THREE.Vector3(0, 0, 1), up)).toBeCloseTo(90, 12)
    expect(draftAngleDeg(new THREE.Vector3(1, 0, 0), up)).toBeCloseTo(0, 12)
    expect(draftAngleDeg(new THREE.Vector3(0, 0, -2), up)).toBeCloseTo(-90, 12)
    expect(draftClass(1, 1)).toBe("positive")
    expect(draftClass(0.99, 1)).toBe("vertical")
    expect(draftClass(-1, 1)).toBe("negative")
    expect(pullVector("-x").toArray()).toEqual([-1, 0, 0])
  })
  test("settings are clamped", () => {
    expect(clampAnalysis({ mode: "draft", pull: "+y", angleDeg: 90, stripes: 1.4 })).toEqual({ mode: "draft", pull: "+y", angleDeg: 45, stripes: 2 })
    expect(clampAnalysis({ mode: "bogus" as never, pull: "up" as never, angleDeg: Number.NaN, stripes: Number.NaN })).toEqual(DEFAULT_ANALYSIS)
  })
})

describe("draft summary of drawn parts", () => {
  test("a 10 x 20 x 30 box along +Z: top positive, four walls vertical, bottom an undercut, areas exact", () => {
    const s = draftSummary([exact("b", brep.makeBox(10, 20, 30))], "+z", 1)
    expect(s.positive).toBeCloseTo(200, 6)
    expect(s.negative).toBeCloseTo(200, 6)
    expect(s.vertical).toBeCloseTo(2 * (10 * 30 + 20 * 30), 6)
    expect(s.total).toBeCloseTo(2 * (200 + 300 + 600), 6)
    const side = draftSummary([exact("b", brep.makeBox(10, 20, 30))], "+x", 1)
    expect(side.positive).toBeCloseTo(600, 6)
  })
  test("a cone drawn point-up has its whole side drafted at its half angle; a hidden part is not counted", () => {
    // Radius 10 to 0 over 10 mm: the side leans at 45°, well above a 5° minimum.
    const cone = exact("c", brep.makeCone(10, 0, 10))
    const s = draftSummary([cone], "+z", 5)
    expect(s.vertical).toBeCloseTo(0, 6)
    // The display mesh is a polygon: its disc is within half a percent of pi r^2, never above it.
    expect(s.negative).toBeLessThanOrEqual(Math.PI * 100)
    expect(s.negative).toBeGreaterThan(Math.PI * 100 * 0.995)
    expect(s.positive).toBeGreaterThan(Math.PI * 10 * Math.hypot(10, 10) * 0.98)
    cone.visible = false
    expect(draftSummary([cone], "+z", 5).total).toBe(0)
  })
})

describe("the overlay", () => {
  test("one overlay mesh per drawn face, sharing its geometry, never pickable, following and hiding with the part", () => {
    const part = exact("b", brep.makeBox(10, 10, 10))
    const material = createAnalysisMaterial({ ...DEFAULT_ANALYSIS, mode: "draft" })
    const overlay = buildAnalysisOverlay([part], material)
    const faces: THREE.Mesh[] = []
    part.traverse((object) => { if (object.userData.brepFace !== undefined) faces.push(object as THREE.Mesh) })
    expect(overlay.children.length).toBe(faces.length)
    const first = overlay.children[0] as THREE.Mesh
    expect(faces.some((face) => face.geometry === first.geometry)).toBe(true)
    const hits: THREE.Intersection[] = []
    first.raycast(new THREE.Raycaster(), hits)
    expect(hits).toEqual([])
    part.position.set(5, 0, 0)
    part.updateMatrixWorld(true)
    first.onBeforeRender(undefined as never, undefined as never, undefined as never, undefined as never, undefined as never, undefined as never)
    expect(new THREE.Vector3().setFromMatrixPosition(first.matrixWorld).x).toBeCloseTo(5, 12)
    part.visible = false
    first.onBeforeRender(undefined as never, undefined as never, undefined as never, undefined as never, undefined as never, undefined as never)
    expect(first.matrixWorld.determinant()).toBe(0)
    removeAnalysisOverlay(overlay)
    expect(overlay.children.length).toBe(0)
    // The part's own geometry and material are untouched.
    expect((faces[0]!.geometry.getAttribute("position") as THREE.BufferAttribute).count).toBeGreaterThan(0)
    material.dispose()
  })
  test("the shader uniforms follow the state", () => {
    const material = createAnalysisMaterial(DEFAULT_ANALYSIS)
    updateAnalysisMaterial(material, { mode: "zebra", pull: "-y", angleDeg: 3, stripes: 20 })
    expect(material.uniforms.uMode!.value).toBe(2)
    expect((material.uniforms.uPull!.value as THREE.Vector3).toArray()).toEqual([0, -1, 0])
    expect(material.uniforms.uStripes!.value).toBe(20)
    expect(material.clipping).toBe(true)
    material.dispose()
  })
})
