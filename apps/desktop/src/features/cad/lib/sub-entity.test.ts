import { describe, expect, test } from "bun:test"
import { brep } from "@cadcamfun/core"
import * as THREE from "three"
import { syncLineResolution } from "../../../viewport/lines.ts"
import { useLayerStore } from "../store/layerStore.ts"
import { buildElementObject } from "./sceneHelpers.ts"
import { createSubHighlight, describeSubEntity, disposeSubHighlight, pickSubEntity, sameSubEntity } from "./sub-entity.ts"

const layerId = () => useLayerStore.getState().activeLayer
/** A 10 mm cube at the origin as an exact solid, drawn by the canvas. */
const cube = (): THREE.Object3D => {
  const object = buildElementObject({ id: "b", type: "brep", layerId: layerId(), x: 0, y: 0, z: 0, brep: brep.makeBox(10, 10, 10) } as never)!
  object.updateMatrixWorld(true)
  return object
}
const cast = (object: THREE.Object3D, from: [number, number, number], to: [number, number, number]) => {
  // The way the canvas casts: through a camera, so a thick line is picked within a few pixels of the ray.
  const camera = new THREE.PerspectiveCamera(30, 800 / 600, 1, 1000)
  camera.up.set(0, 1, 0)
  camera.position.set(...from)
  camera.lookAt(new THREE.Vector3(...to))
  camera.updateMatrixWorld(true)
  syncLineResolution(object, 800, 600)
  const raycaster = new THREE.Raycaster()
  raycaster.params.Line2 = { threshold: 4 }
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera)
  return raycaster.intersectObject(object, true)
}

describe("picking a face or an edge of an exact solid", () => {
  test("a ray at the middle of a face picks that face", () => {
    const object = cube()
    const pick = pickSubEntity(cast(object, [5, 5, 50], [5, 5, 0]))
    expect(pick?.kind).toBe("face")
    expect(pick?.elementId).toBe("b")
    expect(pick?.surface).toBe("plane")
  })

  test("a ray along an edge picks the edge, not the faces that meet there", () => {
    const object = cube()
    // straight down onto the top rim at x = 10, y = 5: the edge between the top and the +X face
    const pick = pickSubEntity(cast(object, [10, 5, 50], [10, 5, 0]))
    expect(pick?.kind).toBe("edge")
  })

  test("an edge behind the face in front is not under the cursor", () => {
    const object = cube()
    // down through the middle of the top face: the bottom rim lines are far behind it
    const hits = cast(object, [2, 5, 50], [2, 5, 0])
    expect(pickSubEntity(hits)?.kind).toBe("face")
  })

  test("a miss, and a part that is not a B-rep, give nothing", () => {
    expect(pickSubEntity([])).toBeUndefined()
    const primitive = buildElementObject({ id: "c", type: "cube", layerId: layerId(), x: 0, y: 0, z: 0, width: 4, height: 4, depth: 4 } as never)!
    primitive.updateMatrixWorld(true)
    expect(pickSubEntity(cast(primitive, [0, 0, 50], [0, 0, 0]))).toBeUndefined()
  })

  test("the pick has a name and compares by entity", () => {
    const object = cube()
    const a = pickSubEntity(cast(object, [5, 5, 50], [5, 5, 0]))!
    const b = pickSubEntity(cast(object, [6, 4, 50], [6, 4, 0]))!
    expect(sameSubEntity(a, b)).toBe(true)
    expect(describeSubEntity(a)).toMatch(/^Face \d+ · top · plane$/)
    expect(sameSubEntity(a, undefined)).toBe(false)
  })
})

describe("the highlight of a pick", () => {
  test("a face is a translucent copy that shares the geometry and the placement", () => {
    const object = cube()
    object.position.x = 7
    object.updateMatrixWorld(true)
    const pick = pickSubEntity(cast(object, [12, 5, 50], [12, 5, 0]))!
    const overlay = createSubHighlight(pick, "hover") as THREE.Mesh
    expect(overlay.geometry).toBe((pick.object as THREE.Mesh).geometry)
    expect(overlay.matrix.elements[12]).toBeCloseTo(7)
    expect((overlay.material as THREE.MeshBasicMaterial).transparent).toBe(true)
    expect(overlay.userData.isSubHighlight).toBe(true)
  })

  test("an edge is a thick line copy", () => {
    const object = cube()
    const pick = pickSubEntity(cast(object, [10, 5, 50], [10, 5, 0]))!
    const overlay = createSubHighlight(pick, "picked")
    expect(overlay.userData.isSubHighlight).toBe(true)
    expect(overlay.constructor.name === "LineSegments2" || (overlay as { isLineSegments?: boolean }).isLineSegments === true).toBe(true)
  })

  test("a highlight is never picked, and freeing it leaves the part's geometry", () => {
    const object = cube()
    const pick = pickSubEntity(cast(object, [5, 5, 50], [5, 5, 0]))!
    const overlay = createSubHighlight(pick, "hover")
    const holder = new THREE.Group().add(overlay)
    expect(cast(holder, [5, 5, 50], [5, 5, 0])).toEqual([])
    let freedGeometry = false
    ;(pick.object as THREE.Mesh).geometry.addEventListener("dispose", () => { freedGeometry = true })
    disposeSubHighlight(overlay)
    expect(overlay.parent).toBeNull()
    expect(freedGeometry).toBe(false)
    expect(() => disposeSubHighlight(undefined)).not.toThrow()
  })
})
