import { describe, expect, test } from "bun:test"
import { brep } from "@cadcamfun/core"
import * as THREE from "three"
import { syncLineResolution } from "../../../viewport/lines.ts"
import { useLayerStore } from "../store/layerStore.ts"
import { buildElementObject } from "./sceneHelpers.ts"
import { useCADStore } from "../store/cadStore.ts"
import { brepVertexWorld, createSubHighlight, describeSubEntity, disposeSubHighlight, nearestVertexToRay, pickSubEntity, pixelRadiusAt, sameSubEntity } from "./sub-entity.ts"

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

/** The ray the canvas keeps for the corners: through the camera at the middle of the view, with a pixel tolerance. */
const castWithRay = (object: THREE.Object3D, from: [number, number, number], to: [number, number, number]) => {
  const camera = new THREE.PerspectiveCamera(30, 800 / 600, 1, 1000)
  camera.up.set(0, 1, 0)
  camera.position.set(...from)
  camera.lookAt(new THREE.Vector3(...to))
  camera.updateMatrixWorld(true)
  syncLineResolution(object, 800, 600)
  const raycaster = new THREE.Raycaster()
  raycaster.params.Line2 = { threshold: 4 }
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera)
  return { hits: raycaster.intersectObject(object, true), picking: { ray: raycaster.ray.clone(), radiusAt: pixelRadiusAt(camera, 600) } }
}

describe("picking a corner of an exact solid", () => {
  test("the group carries the corners of the body in the scene", () => {
    const object = cube()
    const vertices = object.userData.brepVertices as Float32Array
    expect(vertices.length).toBe(8 * 3)
    const corners = new Set(Array.from({ length: 8 }, (_, i) => `${vertices[i * 3]},${vertices[i * 3 + 1]},${vertices[i * 3 + 2]}`))
    expect(corners.has("10,10,10")).toBe(true)
    expect(corners.has("0,0,0")).toBe(true)
  })

  test("a ray at a corner picks the corner, not the edges and faces that meet there", () => {
    const object = cube()
    const { hits, picking } = castWithRay(object, [10, 10, 60], [10, 10, 0])
    expect(pickSubEntity(hits)?.kind).toBe("edge") // without the corners the edge wins
    const pick = pickSubEntity(hits, picking)!
    expect(pick.kind).toBe("vertex")
    expect(pick.elementId).toBe("b")
    expect(pick.coords).toEqual({ x: 10, y: 10, z: 10 })
    expect(brepVertexWorld(pick.object, pick.index)?.toArray()).toEqual([10, 10, 10])
  })

  test("a ray a few pixels from the corner still picks it, one far away does not", () => {
    const object = cube()
    // 9 px at 60 mm with a 30 degree lens and 600 px is about 0.27 mm: 0.1 mm off is inside, 3 mm off is the edge
    const near = castWithRay(object, [10.1, 10, 60], [10.1, 10, 0])
    expect(pickSubEntity(near.hits, near.picking)?.kind).toBe("vertex")
    const far = castWithRay(object, [10, 7, 60], [10, 7, 0])
    expect(pickSubEntity(far.hits, far.picking)?.kind).toBe("edge")
  })

  test("the priority is vertex, then edge, then face", () => {
    const object = cube()
    const face = castWithRay(object, [5, 5, 60], [5, 5, 0])
    expect(pickSubEntity(face.hits, face.picking)?.kind).toBe("face")
    const edge = castWithRay(object, [10, 5, 60], [10, 5, 0])
    expect(pickSubEntity(edge.hits, edge.picking)?.kind).toBe("edge")
    const corner = castWithRay(object, [0, 0, 60], [0, 0, 0])
    expect(pickSubEntity(corner.hits, corner.picking)?.kind).toBe("vertex")
  })

  test("a corner behind the visible surface is not under the cursor", () => {
    const object = cube()
    // Looking along -Z at (10, 10): the top corner (10,10,10) is hit, never the bottom one (10,10,0) behind it.
    const { hits, picking } = castWithRay(object, [10, 10, 60], [10, 10, 0])
    expect(pickSubEntity(hits, picking)!.coords?.z).toBe(10)
    // Through the middle of the top face the nearest surface is 50 mm away and no corner is within reach.
    const middle = castWithRay(object, [5, 5, 60], [5, 5, 0])
    expect(nearestVertexToRay(object, middle.picking, middle.hits[0]!.distance + 1)).toBeUndefined()
  })

  test("the coordinates are the model's: the drawing's origin offset is removed", () => {
    useCADStore.setState({ originOffset: { x: 100, y: 0, z: 0 } })
    try {
      const object = cube()
      const { hits, picking } = castWithRay(object, [110, 10, 60], [110, 10, 0])
      const pick = pickSubEntity(hits, picking)!
      expect(pick.kind).toBe("vertex")
      expect(pick.world).toEqual({ x: 110, y: 10, z: 10 })
      expect(pick.coords).toEqual({ x: 10, y: 10, z: 10 })
    } finally { useCADStore.setState({ originOffset: { x: 0, y: 0, z: 0 } }) }
  })

  test("the chip names the corner and its position", () => {
    const object = cube()
    const { hits, picking } = castWithRay(object, [10, 10, 60], [10, 10, 0])
    const pick = pickSubEntity(hits, picking)!
    expect(describeSubEntity(pick)).toBe(`Vertex ${pick.index} · X 10 Y 10 Z 10`)
    expect(describeSubEntity(pick, { face: String, edge: String, vertex: (index) => `V${index}` })).toBe(`V${pick.index} · X 10 Y 10 Z 10`)
    expect(sameSubEntity(pick, { ...pick })).toBe(true)
    expect(sameSubEntity(pick, { ...pick, index: pick.index + 1 })).toBe(false)
  })

  test("the highlight is a dot that owns its geometry and frees it, leaving the part's", () => {
    const object = cube()
    const { hits, picking } = castWithRay(object, [10, 10, 60], [10, 10, 0])
    const pick = pickSubEntity(hits, picking)!
    const dot = createSubHighlight(pick, "picked") as THREE.Points
    expect(dot.isPoints).toBe(true)
    expect(Array.from(dot.geometry.getAttribute("position").array)).toEqual([10, 10, 10])
    expect(dot.userData.isSubHighlight).toBe(true)
    expect(new THREE.Raycaster().intersectObject(new THREE.Group().add(dot), true)).toEqual([])
    let own = false, parts = false
    dot.geometry.addEventListener("dispose", () => { own = true })
    object.traverse((child) => { if ((child as THREE.Mesh).geometry) (child as THREE.Mesh).geometry.addEventListener("dispose", () => { parts = true }) })
    disposeSubHighlight(dot)
    expect(own).toBe(true)
    expect(parts).toBe(false)
  })

  test("a primitive has no corners to pick", () => {
    const primitive = buildElementObject({ id: "c", type: "cube", layerId: layerId(), x: 0, y: 0, z: 0, width: 4, height: 4, depth: 4 } as never)!
    primitive.updateMatrixWorld(true)
    const { hits, picking } = castWithRay(primitive, [2, 2, 60], [2, 2, 0])
    expect(pickSubEntity(hits, picking)).toBeUndefined()
  })

  test("the pixel radius grows with distance for a lens and stays put for an orthographic view", () => {
    const lens = new THREE.PerspectiveCamera(30, 1, 1, 1000)
    const at = pixelRadiusAt(lens, 600, 9)
    expect(at(100)).toBeCloseTo(2 * at(50), 9)
    const flat = new THREE.OrthographicCamera(-50, 50, 50, -50, 1, 1000)
    const ortho = pixelRadiusAt(flat, 500, 10)
    expect(ortho(10)).toBeCloseTo(2, 9)
    expect(ortho(900)).toBeCloseTo(2, 9)
  })
})
