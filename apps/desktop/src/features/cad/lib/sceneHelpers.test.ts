import { beforeEach, describe, expect, test } from "bun:test"
import * as THREE from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import { useElementsStore } from "../store/elementsStore.ts"
import { useLayerStore } from "../store/layerStore.ts"
import { applyDragDelta, disposeObject, booleanElement, buildElementObject, commitDrag, fitCameraToObjects, type DragStart } from "./sceneHelpers.ts"

const layerId = () => useLayerStore.getState().activeLayer
const reset = () => useElementsStore.setState({ elements: [], selectedElement: null, history: [[]], currentHistoryIndex: 0 })
const cube = (id: string, x: number, extra: Record<string, unknown> = {}) =>
  ({ id, type: "cube", layerId: layerId(), x, y: 0, z: 0, width: 2, height: 2, depth: 2, ...extra })
const dragOf = (ids: string[]): DragStart => ({
  pivotMatrix: new THREE.Matrix4(),
  items: ids.map((id) => {
    const object = buildElementObject(useElementsStore.getState().elements.find((element) => element.id === id)!)!
    object.updateMatrix()
    return { id, object, matrix: object.matrix.clone(), center: (object.userData.pivot as THREE.Vector3).clone() }
  })
})

beforeEach(reset)

describe("element objects", () => {
  test("carry the element id and their centre", () => {
    const object = buildElementObject(cube("a", 4) as never)!
    expect(object.userData.elementId).toBe("a")
    expect((object.userData.pivot as THREE.Vector3).x).toBeCloseTo(4)
  })

  test("rotation and scale fields transform the object around its centre", () => {
    const object = buildElementObject(cube("a", 4, { rotation: { x: 0, y: 0, z: 90 }, scale: { x: 2, y: 1, z: 1 } }) as never)!
    const box = new THREE.Box3().setFromObject(object)
    // scaled 2x along world X, then turned 90 degrees about Z: the long side ends up along Y
    expect(box.getSize(new THREE.Vector3()).y).toBeCloseTo(4)
    expect(box.getCenter(new THREE.Vector3()).x).toBeCloseTo(4)
  })
})

describe("committing a gizmo drag", () => {
  test("a translation moves the elements by the same delta in one history step", () => {
    useElementsStore.setState({ elements: [cube("a", 0), cube("b", 10)] as never, history: [[]], currentHistoryIndex: 0 })
    const start = dragOf(["a", "b"])
    const delta = new THREE.Matrix4().makeTranslation(3, 2, 1)
    applyDragDelta(start, delta)
    expect(start.items[0]!.object.position.x).toBeCloseTo(3)
    commitDrag(start, delta)
    const { elements, currentHistoryIndex } = useElementsStore.getState()
    expect(elements.map((e) => [e.x, e.y, e.z])).toEqual([[3, 2, 1], [13, 2, 1]])
    expect(currentHistoryIndex).toBe(1)
  })

  test("a rotation about the group centre orbits the elements and turns each one", () => {
    useElementsStore.setState({ elements: [cube("a", -5), cube("b", 5)] as never, history: [[]], currentHistoryIndex: 0 })
    const start = dragOf(["a", "b"])
    const delta = new THREE.Matrix4().makeRotationZ(Math.PI / 2)
    commitDrag(start, delta)
    const [a, b] = useElementsStore.getState().elements
    expect(a!.x).toBeCloseTo(0); expect(a!.y).toBeCloseTo(-5)
    expect(b!.x).toBeCloseTo(0); expect(b!.y).toBeCloseTo(5)
    expect((a!.rotation as { z: number }).z).toBeCloseTo(90)
  })

  test("scale ratios accumulate", () => {
    useElementsStore.setState({ elements: [cube("a", 0, { scale: { x: 2, y: 1, z: 1 } })] as never, history: [[]], currentHistoryIndex: 0 })
    commitDrag(dragOf(["a"]), new THREE.Matrix4().makeScale(1.5, 1, 1))
    expect((useElementsStore.getState().elements[0]!.scale as { x: number }).x).toBeCloseTo(3)
  })

  test("elements without a point get a translate offset instead", () => {
    useElementsStore.setState({ elements: [{ id: "p", type: "polygon", layerId: layerId(), points: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 2, y: 3 }] }] as never, history: [[]], currentHistoryIndex: 0 })
    commitDrag(dragOf(["p"]), new THREE.Matrix4().makeTranslation(2, 0, 0))
    expect(useElementsStore.getState().elements[0]!.translateX).toBeCloseTo(2)
  })
})

describe("boolean operations", () => {
  const objects = () => [buildElementObject(cube("a", 0) as never)!, buildElementObject(cube("b", 1) as never)!]

  test("union yields a mesh element covering both operands", () => {
    const result = booleanElement("union", objects(), "layer")!
    expect(result.type).toBe("mesh")
    const xs = (result.vertices as { x: number }[]).map((v) => v.x)
    expect(Math.min(...xs)).toBeCloseTo(-1)
    expect(Math.max(...xs)).toBeCloseTo(2)
  })

  test("intersect keeps only the overlap and subtract trims the base", () => {
    const overlap = (booleanElement("intersect", objects(), "layer")!.vertices as { x: number }[]).map((v) => v.x)
    expect(Math.min(...overlap)).toBeCloseTo(0)
    expect(Math.max(...overlap)).toBeCloseTo(1)
    const rest = (booleanElement("subtract", objects(), "layer")!.vertices as { x: number }[]).map((v) => v.x)
    expect(Math.max(...rest)).toBeCloseTo(0)
  })

  test("needs two meshes", () => {
    expect(booleanElement("union", [buildElementObject(cube("a", 0) as never)!], "layer")).toBeNull()
  })

  test("the result is renderable as an element", () => {
    const result = booleanElement("union", objects(), "layer")!
    const object = buildElementObject({ id: "r", layerId: "layer", ...result } as never)!
    expect(new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3()).x).toBeCloseTo(3)
  })
})

describe("the Z-up view the assistant builds for", () => {
  test("a camera with Z up keeps its up axis through orbit updates and fit-to-view", () => {
    const camera = new THREE.PerspectiveCamera(75, 1, 0.01, 5000)
    camera.up.set(0, 0, 1)
    camera.position.set(300, -300, 240)
    const orbit = new OrbitControls(camera, Object.assign(new EventTarget(), {
      getRootNode: () => new EventTarget(), style: {}, setPointerCapture: () => {}, releasePointerCapture: () => {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 })
    }) as unknown as HTMLElement)
    orbit.update()
    const tower = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 100))
    tower.position.set(0, 0, 50)
    tower.updateMatrixWorld(true)
    const center = fitCameraToObjects(camera, orbit.target, [tower])!
    orbit.target.copy(center)
    orbit.update()
    // The screen's up direction is the world's +Z, so a part standing along Z stands upright on screen.
    const screenUp = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion)
    expect(screenUp.z).toBeGreaterThan(0.5)
    expect(Math.abs(screenUp.x) + Math.abs(screenUp.y)).toBeLessThan(1.2)
    expect(camera.position.z).toBeGreaterThan(center.z)
    orbit.dispose()
  })
})

describe("fit-to-view frames the whole part from outside it", () => {
  test("a cube looked at along its corner diagonal is framed from beyond its corner, with every vertex in front of the eye", () => {
    const camera = new THREE.PerspectiveCamera(75, 1.6, 0.01, 5000)
    camera.up.set(0, 0, 1)
    camera.position.set(300, -300, 300)
    const cube = new THREE.Mesh(new THREE.BoxGeometry(100, 100, 100))
    cube.updateMatrixWorld(true)
    const center = fitCameraToObjects(camera, new THREE.Vector3(), [cube])!
    camera.updateMatrixWorld(true)
    const eye = camera.position
    const corner = new THREE.Vector3(50, -50, 50)
    expect(eye.distanceTo(center)).toBeGreaterThan(corner.length())
    for (const sx of [-50, 50]) for (const sy of [-50, 50]) for (const sz of [-50, 50]) {
      const ndc = new THREE.Vector3(sx, sy, sz).project(camera)
      expect(Math.abs(ndc.x)).toBeLessThanOrEqual(1)
      expect(Math.abs(ndc.y)).toBeLessThanOrEqual(1)
      expect(ndc.z).toBeLessThan(1)
    }
  })
})

describe("every element is drawn Z-up, the way the assistant and the toolpath see it", () => {
  const size = (element: Record<string, unknown>): THREE.Vector3 => {
    const object = buildElementObject({ id: "e", layerId: "layer", x: 0, y: 0, z: 0, ...element } as never)!
    return new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3())
  }
  const box = (element: Record<string, unknown>): THREE.Box3 =>
    new THREE.Box3().setFromObject(buildElementObject({ id: "e", layerId: "layer", x: 0, y: 0, z: 0, ...element } as never)!)

  test("a wall is long on X, thick on Y and tall on Z, standing on the ground", () => {
    const s = size({ type: "wall", length: 300, height: 100, thickness: 20 })
    expect([s.x, s.y, s.z]).toEqual([300, 20, 100].map((v) => expect.closeTo(v, 5)))
    expect(box({ type: "wall", length: 300, height: 100, thickness: 20 }).min.z).toBeCloseTo(0, 5)
  })

  test("a floor and a roof use their width and depth; both are flat on XY", () => {
    const floor = size({ type: "floor", width: 300, depth: 200, thickness: 10 })
    expect([floor.x, floor.y, floor.z]).toEqual([300, 200, 10].map((v) => expect.closeTo(v, 5)))
    const roof = size({ type: "roof", width: 300, depth: 200, height: 80, style: "pitched" })
    expect([roof.x, roof.y, roof.z]).toEqual([300, 200, 80].map((v) => expect.closeTo(v, 5)))
  })

  test("a column, a stair and a spring rise along Z", () => {
    const column = size({ type: "column", radius: 20, height: 200 })
    expect(column.z).toBeCloseTo(200, 5)
    expect(column.x).toBeCloseTo(40, 0)
    const stair = size({ type: "stair", width: 100, height: 150, depth: 200, steps: 10 })
    expect([stair.x, stair.y, stair.z]).toEqual([100, 200, 150].map((v) => expect.closeTo(v, 5)))
    const spring = size({ type: "spring", radius: 30, wireRadius: 5, turns: 5, height: 100 })
    expect(spring.z).toBeGreaterThan(100)
    expect(spring.z).toBeLessThan(115)
    expect(spring.x).toBeGreaterThan(60)
  })

  test("a bolt stands on Z with its head up; a nut and a washer are rings with a bore and a thickness", () => {
    const bolt = box({ type: "bolt", size: "M8", length: 50 })
    expect(bolt.getSize(new THREE.Vector3()).z).toBeGreaterThan(45)
    expect(bolt.getSize(new THREE.Vector3()).x).toBeLessThan(20)
    const washer = size({ type: "washer", size: "M8", outerDiameter: 16, thickness: 1.5 })
    expect([washer.x, washer.z]).toEqual([16, 1.5].map((v) => expect.closeTo(v, 3)))
    const nut = buildElementObject({ id: "n", layerId: "layer", type: "nut", size: "M8", x: 0, y: 0, z: 0 } as never)!
    const geometry = (nut as THREE.Mesh).geometry
    // The bore cuts vertices on the circle of the bolt's radius: a solid hexagonal prism has none.
    const p = geometry.getAttribute("position")
    let bore = 0
    for (let i = 0; i < p.count; i++) if (Math.abs(Math.hypot(p.getX(i), p.getY(i)) - 4) < 1e-6) bore++
    expect(bore).toBeGreaterThan(0)
  })

  test("a rotation on a washer or a bolt is applied once", () => {
    const washer = size({ type: "washer", size: "M8", outerDiameter: 16, thickness: 1.5, rotation: { x: 90, y: 0, z: 0 } })
    expect(washer.y).toBeCloseTo(1.5, 3)
    expect(washer.z).toBeCloseTo(16, 3)
  })

  test("a lathe about X lies along X, about Y stands on Z", () => {
    const profile = [{ x: 10, y: 0 }, { x: 10, y: 20 }]
    const alongX = size({ type: "revolution", profile, axis: "x" })
    expect(alongX.x).toBeCloseTo(20, 5)
    const stood = size({ type: "revolution", profile, axis: "y" })
    expect(stood.z).toBeCloseTo(20, 5)
  })
})


test("scene disposal releases shared geometry, materials and sprite textures once", () => {
  const scene = new THREE.Scene()
  const geometry = new THREE.BoxGeometry()
  const texture = new THREE.Texture()
  const material = new THREE.MeshBasicMaterial({ map: texture })
  const spriteMaterial = new THREE.SpriteMaterial({ map: texture })
  scene.add(new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, material), new THREE.Sprite(spriteMaterial))
  const disposed = { geometry: 0, material: 0, sprite: 0, texture: 0 }
  geometry.addEventListener("dispose", () => disposed.geometry++)
  material.addEventListener("dispose", () => disposed.material++)
  spriteMaterial.addEventListener("dispose", () => disposed.sprite++)
  texture.addEventListener("dispose", () => disposed.texture++)
  disposeObject(scene)
  expect(disposed).toEqual({ geometry: 1, material: 1, sprite: 1, texture: 1 })
})
