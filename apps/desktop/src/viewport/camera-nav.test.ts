import { expect, test } from "bun:test"
import * as THREE from "three"
import {
  CUBE_DIRECTIONS, FLAT_FOV_DEG, MAX_DEPTH_RATIO, POLE_TILT, WORLD_UP, adaptiveClip, alignedCubeKey, cameraBasis, clampDistanceFactor, cross, cubeDirection, dollyAboutPoint,
  dollyZoomDistance, dot, easeInOutCubic, fitBoxOrthoHalfHeight, fitBoxPerspective, intersectRayPlane, length, normalize, orbitDirection, orthoZoomAboutCursor,
  orthoZoomFor, perspectiveDistanceFor, poseEye, redirectTransition, pivotOrbitShift, boxCenter, sampleTransition, slerpDirection, startTransition, sub, transitionDuration,
  viewDirection, wheelZoomFactor, boxCorners, type Box, type Vec3, type ViewPose
} from "./camera-nav.ts"

const close = (a: Vec3, b: Vec3, digits = 6) => { for (let i = 0; i < 3; i++) expect(a[i]).toBeCloseTo(b[i]!, digits) }

/** What three.js's own lookAt gives, to hold the maths against the real camera. */
const threeBasis = (direction: Vec3): { right: Vec3; up: Vec3; back: Vec3 } => {
  const camera = new THREE.PerspectiveCamera()
  camera.up.set(0, 0, 1)
  camera.position.set(...direction)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld()
  const e = camera.matrixWorld.elements
  return { right: [e[0]!, e[1]!, e[2]!], up: [e[4]!, e[5]!, e[6]!], back: [e[8]!, e[9]!, e[10]!] }
}

test("the 26 snap targets are 6 faces, 12 edges and 8 corners, all unit vectors on distinct keys", () => {
  expect(CUBE_DIRECTIONS.length).toBe(26)
  expect(CUBE_DIRECTIONS.filter((d) => d.kind === "face").length).toBe(6)
  expect(CUBE_DIRECTIONS.filter((d) => d.kind === "edge").length).toBe(12)
  expect(CUBE_DIRECTIONS.filter((d) => d.kind === "corner").length).toBe(8)
  expect(new Set(CUBE_DIRECTIONS.map((d) => d.key)).size).toBe(26)
  for (const entry of CUBE_DIRECTIONS) {
    expect(length(entry.direction)).toBeCloseTo(1, 12)
    // The camera looks at the target from the side its signs name.
    for (let axis = 0; axis < 3; axis++) {
      if (entry.sign[axis] === 0 && axis < 2 && entry.kind !== "face") expect(Math.abs(entry.direction[axis]!)).toBeLessThan(1e-9)
      if (entry.sign[axis] !== 0 && !(entry.kind === "face" && axis < 2 && Math.abs(entry.direction[axis]!) < 1e-3)) expect(Math.sign(entry.direction[axis]!)).toBe(entry.sign[axis]!)
    }
  }
  expect(cubeDirection([0, 0, 0])).toBeUndefined()
})

test("each face, edge and corner snaps to a camera frame three.js agrees with, with +Z up", () => {
  for (const entry of CUBE_DIRECTIONS) {
    const mine = cameraBasis(entry.direction)
    const theirs = threeBasis(entry.direction)
    close(mine.right, theirs.right); close(mine.up, theirs.up); close(mine.back, theirs.back)
    // Right-handed and level: screen up never points below the horizon (Z up) except at the bottom pole.
    close(cross(mine.right, mine.up), mine.back)
    if (entry.key !== "0,0,-1") expect(mine.up[2]).toBeGreaterThanOrEqual(-1e-9)
  }
})

test("the named views look from the documented side with the documented screen axes", () => {
  const view = (name: Parameters<typeof viewDirection>[0]) => cameraBasis(viewDirection(name))
  const front = view("front"); close(front.right, [1, 0, 0]); close(front.up, [0, 0, 1])
  const back = view("back"); close(back.right, [-1, 0, 0]); close(back.up, [0, 0, 1])
  const right = view("right"); close(right.right, [0, 1, 0]); close(right.up, [0, 0, 1])
  const left = view("left"); close(left.right, [0, -1, 0]); close(left.up, [0, 0, 1])
  const top = view("top"); close(top.right, [1, 0, 0], 3); close(top.up, [0, 1, 0], 3)
  // The bottom keeps +X on the right and turns the screen up to -Y (the top view flipped about X), as CAD packages do.
  const bottom = view("bottom"); close(bottom.right, [1, 0, 0], 3); close(bottom.up, [0, -1, 0], 3)
  expect(Math.abs(viewDirection("top")[1])).toBeCloseTo(POLE_TILT, 8)
})

test("the current face is recognised only when the camera is aligned", () => {
  expect(alignedCubeKey(viewDirection("front"))).toBe("0,-1,0")
  expect(alignedCubeKey(viewDirection("top"))).toBe("0,0,1")
  expect(alignedCubeKey(viewDirection("isometric"))).toBe("1,-1,1")
  expect(alignedCubeKey(normalize([0.3, -1, 0.2]))).toBeUndefined()
})

test("a transition starts and ends exactly on its poses and stays on the great circle", () => {
  const from: ViewPose = { target: [0, 0, 0], direction: viewDirection("front"), distance: 100 }
  const to: ViewPose = { target: [10, 20, 30], direction: viewDirection("right"), distance: 400 }
  const transition = startTransition(from, to, 1000, false)
  expect(transition.duration).toBeGreaterThan(0)
  expect(transition.duration).toBeLessThanOrEqual(320)
  const start = sampleTransition(transition, 1000)
  close(start.pose.direction, from.direction, 9); expect(start.pose.distance).toBeCloseTo(100, 9); expect(start.done).toBe(false)
  const end = sampleTransition(transition, 1000 + transition.duration)
  expect(end.done).toBe(true); expect(end.pose).toBe(to)
  let previous = 0
  for (let step = 1; step < 20; step++) {
    const sample = sampleTransition(transition, 1000 + (transition.duration * step) / 20).pose
    expect(length(sample.direction)).toBeCloseTo(1, 9)
    // The eye turns monotonically from front toward right, on the equator (no detour over the poles).
    const angle = Math.acos(Math.min(1, dot(sample.direction, from.direction)))
    expect(angle).toBeGreaterThanOrEqual(previous - 1e-9)
    previous = angle
    expect(Math.abs(sample.direction[2])).toBeLessThan(1e-3)
    expect(sample.distance).toBeGreaterThanOrEqual(100 - 1e-9); expect(sample.distance).toBeLessThanOrEqual(400 + 1e-9)
  }
  expect(easeInOutCubic(0)).toBe(0); expect(easeInOutCubic(1)).toBe(1); expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 12)
})

test("reduced motion lands on the end pose at once, and a longer turn takes longer, within the short window", () => {
  const front: ViewPose = { target: [0, 0, 0], direction: viewDirection("front"), distance: 50 }
  const back: ViewPose = { ...front, direction: viewDirection("back") }
  const right: ViewPose = { ...front, direction: viewDirection("right") }
  expect(transitionDuration(front, back, true)).toBe(0)
  const jump = startTransition(front, back, 5, true)
  expect(sampleTransition(jump, 5)).toEqual({ pose: back, done: true })
  expect(transitionDuration(front, back, false)).toBeGreaterThan(transitionDuration(front, right, false))
  expect(transitionDuration(front, back, false)).toBeLessThanOrEqual(320)
  expect(transitionDuration(front, front, false)).toBeLessThanOrEqual(140)
})

test("a click during a transition redirects it from where it is, with no jump", () => {
  const a: ViewPose = { target: [0, 0, 0], direction: viewDirection("front"), distance: 100 }
  const b: ViewPose = { target: [0, 0, 0], direction: viewDirection("right"), distance: 100 }
  const c: ViewPose = { target: [0, 0, 0], direction: viewDirection("top"), distance: 100 }
  const first = startTransition(a, b, 0, false)
  const mid = sampleTransition(first, first.duration / 2).pose
  const redirected = redirectTransition(first, a, c, first.duration / 2, false)
  const at = sampleTransition(redirected, first.duration / 2).pose
  close(at.direction, mid.direction, 9)
  expect(at.distance).toBeCloseTo(mid.distance, 9)
  close(sampleTransition(redirected, first.duration / 2 + redirected.duration).pose.direction, c.direction, 9)
})

test("antipodal views swing about the vertical axis, and top to bottom about X (through the Y axis)", () => {
  const halfway = slerpDirection([0, -1, 0], [0, 1, 0], 0.5)
  expect(Math.abs(halfway[2])).toBeLessThan(1e-9)
  expect(Math.abs(halfway[0])).toBeCloseTo(1, 9)
  const pole = slerpDirection([0, 0, 1], [0, 0, -1], 0.5)
  expect(Math.abs(pole[2])).toBeLessThan(1e-9)
  expect(Math.abs(pole[1])).toBeCloseTo(1, 9)
  close(slerpDirection([1, 0, 0], [1, 0, 0], 0.3), [1, 0, 0])
})

test("orbiting keeps the eye on the sphere, stops short of the poles and turns about Z", () => {
  const eye = orbitDirection([0, -1, 0], Math.PI / 2, 0)
  close(eye, [1, 0, 0], 9)
  const up = orbitDirection([0, -1, 0], 0, 0.3)
  expect(up[2]).toBeGreaterThan(0)
  const pole = orbitDirection([0, -1, 0.2], 0, 10)
  expect(pole[2]).toBeLessThan(1); expect(pole[2]).toBeGreaterThan(0.99)
  expect(length(pole)).toBeCloseTo(1, 12)
})

test("zooming toward the cursor keeps the point under the cursor on the same pixel (perspective)", () => {
  const camera = new THREE.PerspectiveCamera(50, 1.6, 0.1, 1000)
  camera.up.set(0, 0, 1)
  const target = new THREE.Vector3(5, 5, 5)
  camera.position.set(300, -200, 150)
  camera.lookAt(target)
  camera.updateMatrixWorld(); camera.updateProjectionMatrix()
  const pivot = new THREE.Vector3(30, 10, 20)
  const before = pivot.clone().project(camera)
  for (const factor of [0.5, 0.9, 1.4]) {
    const next = dollyAboutPoint({ position: camera.position.toArray() as unknown as Vec3, target: target.toArray() as unknown as Vec3 }, pivot.toArray() as unknown as Vec3, factor)
    const moved = camera.clone()
    moved.position.set(...next.position); moved.lookAt(new THREE.Vector3(...next.target))
    moved.updateMatrixWorld(); moved.updateProjectionMatrix()
    const after = pivot.clone().project(moved)
    expect(after.x).toBeCloseTo(before.x, 9); expect(after.y).toBeCloseTo(before.y, 9)
    // The camera still looks in the same direction.
    close(normalize(sub(next.target, next.position)), normalize(sub(target.toArray() as unknown as Vec3, camera.position.toArray() as unknown as Vec3)), 9)
    expect(length(sub(next.target, next.position))).toBeCloseTo(length(sub(target.toArray() as unknown as Vec3, camera.position.toArray() as unknown as Vec3)) * factor, 9)
  }
  expect(clampDistanceFactor(100, 0.001, 1, 5000)).toBeCloseTo(0.01, 12)
  expect(clampDistanceFactor(100, 1000, 1, 5000)).toBeCloseTo(50, 12)
})

test("zooming toward the cursor keeps the world point under the cursor (orthographic)", () => {
  const camera = new THREE.OrthographicCamera(-80, 80, 50, -50, -1000, 1000)
  camera.up.set(0, 0, 1)
  camera.position.set(100, -100, 80)
  const target = new THREE.Vector3(0, 0, 0)
  camera.lookAt(target)
  camera.zoom = 1.5
  camera.updateMatrixWorld(); camera.updateProjectionMatrix()
  const ndc: [number, number] = [0.6, -0.4]
  // The world point on the view plane through the target that the cursor is over.
  const probe = new THREE.Vector3(ndc[0], ndc[1], 0).unproject(camera)
  const basis = cameraBasis(normalize(camera.position.toArray() as unknown as Vec3))
  const result = orthoZoomAboutCursor({ position: camera.position.toArray() as unknown as Vec3, target: [0, 0, 0], basis, halfWidth: 80, halfHeight: 50, zoom: 1.5, ndc, factor: 1.3 })
  expect(result.zoom).toBeCloseTo(1.95, 12)
  const moved = camera.clone()
  moved.position.set(...result.position); moved.zoom = result.zoom
  moved.updateMatrixWorld(); moved.updateProjectionMatrix()
  const after = probe.clone().project(moved)
  expect(after.x).toBeCloseTo(ndc[0], 9); expect(after.y).toBeCloseTo(ndc[1], 9)
})

test("orbiting about a pivot keeps the pivot under the same pixel", () => {
  const camera = new THREE.PerspectiveCamera(45, 1.3, 0.1, 5000)
  camera.up.set(0, 0, 1)
  camera.position.set(200, -150, 120)
  const target = new THREE.Vector3(0, 0, 0)
  camera.lookAt(target); camera.updateMatrixWorld()
  const pivot = new THREE.Vector3(40, 30, 10)
  const before = pivot.clone().project(camera)
  const beforeLocal = camera.worldToLocal(pivot.clone())
  for (const [azimuth, polar] of [[0.4, 0], [-1.2, 0.3], [2.5, -0.5]]) {
    // What OrbitControls does: turn the eye about the target (azimuth about Z, polar toward the poles), then look at the target.
    const orbit = camera.clone()
    const offset = orbit.position.clone().sub(target)
    const direction = orbitDirection(offset.toArray() as unknown as Vec3, azimuth!, polar!)
    orbit.position.copy(target).addScaledVector(new THREE.Vector3(...direction), offset.length())
    orbit.lookAt(target); orbit.updateMatrixWorld()
    const shift = pivotOrbitShift(pivot.toArray() as unknown as Vec3, target.toArray() as unknown as Vec3, camera.quaternion.toArray() as unknown as [number, number, number, number], orbit.quaternion.toArray() as unknown as [number, number, number, number])
    orbit.position.add(new THREE.Vector3(...shift)); orbit.updateMatrixWorld()
    const after = pivot.clone().project(orbit)
    expect(after.x).toBeCloseTo(before.x, 9); expect(after.y).toBeCloseTo(before.y, 9); expect(after.z).toBeCloseTo(before.z, 9)
    const local = orbit.worldToLocal(pivot.clone())
    expect(local.distanceTo(beforeLocal)).toBeLessThan(1e-9)
  }
  // A pivot at the target changes nothing.
  close(pivotOrbitShift([0, 0, 0], [0, 0, 0], [0, 0, 0, 1], [0.3, 0.2, 0.1, 0.9273618]), [0, 0, 0], 12)
})

test("a ray meets the target plane in front of it only", () => {
  close(intersectRayPlane([0, 0, 10], [0, 0, -1], [0, 0, 0], [0, 0, 1])!, [0, 0, 0])
  expect(intersectRayPlane([0, 0, 10], [0, 0, 1], [0, 0, 0], [0, 0, 1])).toBeUndefined()
  expect(intersectRayPlane([0, 0, 10], [1, 0, 0], [0, 0, 0], [0, 0, 1])).toBeUndefined()
})

test("wheel zoom follows the OrbitControls law", () => {
  expect(wheelZoomFactor(100, 0)).toBeCloseTo(Math.pow(0.95, 1.5), 12)
  expect(wheelZoomFactor(-100, 0)).toBeCloseTo(Math.pow(0.95, 1.5), 12)
  expect(wheelZoomFactor(3, 1)).toBeCloseTo(Math.pow(0.95, 1.5 * 0.48), 12)
  expect(wheelZoomFactor(0, 0)).toBe(1)
})

const boxOf = (min: Vec3, max: Vec3): Box => ({ min, max })

test("fitting a box leaves every corner inside the frustum with the margin, for any direction and aspect", () => {
  const box = boxOf([-40, -10, 0], [60, 30, 25])
  for (const aspect of [0.5, 1, 1.78]) for (const entry of CUBE_DIRECTIONS) {
    const margin = 1.15
    const framing = fitBoxPerspective(box, entry.direction, 45, aspect, margin)
    const camera = new THREE.PerspectiveCamera(45, aspect, 0.01, 100000)
    camera.up.set(0, 0, 1)
    const eye = poseEye({ target: framing.target, direction: entry.direction, distance: framing.distance })
    camera.position.set(...eye); camera.lookAt(new THREE.Vector3(...framing.target))
    camera.updateMatrixWorld(); camera.updateProjectionMatrix()
    let widest = 0
    for (const corner of boxCorners(box)) {
      const p = new THREE.Vector3(...corner).project(camera)
      expect(Math.abs(p.x)).toBeLessThanOrEqual(1 / margin + 1e-9)
      expect(Math.abs(p.y)).toBeLessThanOrEqual(1 / margin + 1e-9)
      widest = Math.max(widest, Math.abs(p.x), Math.abs(p.y))
    }
    // Tight: some corner reaches the margin line.
    expect(widest).toBeGreaterThan(1 / margin - 1e-6)
    // The eye is outside the box.
    expect(framing.distance).toBeGreaterThan(0)
  }
})

test("an orthographic fit shows the whole box", () => {
  const box = boxOf([-40, -10, 0], [60, 30, 25])
  for (const aspect of [0.6, 1.5]) {
    const half = fitBoxOrthoHalfHeight(box, viewDirection("isometric"), aspect, 1.1)
    const camera = new THREE.OrthographicCamera(-half * aspect, half * aspect, half, -half, -1000, 1000)
    camera.up.set(0, 0, 1)
    const center = boxCenter(box)
    camera.position.set(...poseEye({ target: center, direction: viewDirection("isometric"), distance: 300 }))
    camera.lookAt(...center); camera.updateMatrixWorld(); camera.updateProjectionMatrix()
    for (const corner of boxCorners(box)) {
      const p = new THREE.Vector3(...corner).project(camera)
      expect(Math.abs(p.x)).toBeLessThanOrEqual(1 / 1.1 + 1e-9); expect(Math.abs(p.y)).toBeLessThanOrEqual(1 / 1.1 + 1e-9)
    }
  }
})

test("switching projection keeps the framing of the target plane, both ways", () => {
  const fov = 45, baseHalfHeight = 70, distance = 250
  const zoom = orthoZoomFor(baseHalfHeight, distance, fov)
  // Orthographic half-height equals what the perspective camera sees at the target.
  expect(baseHalfHeight / zoom).toBeCloseTo(distance * Math.tan((fov * Math.PI) / 360), 9)
  expect(perspectiveDistanceFor(baseHalfHeight, zoom, fov)).toBeCloseTo(distance, 9)
  // A point on the target plane projects to the same NDC y in both cameras.
  const perspective = new THREE.PerspectiveCamera(fov, 1.5, 0.1, 5000)
  perspective.up.set(0, 0, 1); perspective.position.set(0, -distance, 0); perspective.lookAt(0, 0, 0); perspective.updateMatrixWorld(); perspective.updateProjectionMatrix()
  const ortho = new THREE.OrthographicCamera(-baseHalfHeight * 1.5, baseHalfHeight * 1.5, baseHalfHeight, -baseHalfHeight, 0.1, 5000)
  ortho.up.set(0, 0, 1); ortho.position.set(0, -distance, 0); ortho.zoom = zoom; ortho.lookAt(0, 0, 0); ortho.updateMatrixWorld(); ortho.updateProjectionMatrix()
  for (const point of [new THREE.Vector3(30, 0, 20), new THREE.Vector3(-55, 0, -35)]) {
    const a = point.clone().project(perspective), b = point.clone().project(ortho)
    expect(a.x).toBeCloseTo(b.x, 9); expect(a.y).toBeCloseTo(b.y, 9)
  }
  // The dolly-zoom stand-in for an orthographic camera in a perspective-only view keeps the same framing.
  const flat = dollyZoomDistance(distance, fov, FLAT_FOV_DEG)
  expect(flat * Math.tan((FLAT_FOV_DEG * Math.PI) / 360)).toBeCloseTo(distance * Math.tan((fov * Math.PI) / 360), 9)
  expect(dollyZoomDistance(flat, FLAT_FOV_DEG, fov)).toBeCloseTo(distance, 9)
})

test("clip planes: a millimetre part and a metre machine both keep depth range where they are looked at", () => {
  const scenes: Array<{ name: string; radius: number; eyeDistance: number; targetDistance: number }> = [
    { name: "part", radius: 50, eyeDistance: 150, targetDistance: 150 },
    { name: "part close", radius: 50, eyeDistance: 3, targetDistance: 3 },
    { name: "machine", radius: 1500, eyeDistance: 4500, targetDistance: 4500 },
    { name: "machine, detail", radius: 1500, eyeDistance: 8, targetDistance: 8 },
    { name: "eye inside the machine", radius: 1500, eyeDistance: 600, targetDistance: 700 },
    { name: "far away", radius: 50, eyeDistance: 40000, targetDistance: 40000 },
    { name: "tiny focus", radius: 1500, eyeDistance: 0.05, targetDistance: 0.05 }
  ]
  for (const s of scenes) {
    const eye: Vec3 = [s.eyeDistance, 0, 0]
    const target: Vec3 = [s.eyeDistance - s.targetDistance, 0, 0]
    const center: Vec3 = [0, 0, 0]
    const { near, far } = adaptiveClip({ eye, target, center, radius: s.radius })
    expect(near).toBeGreaterThan(0)
    expect(far).toBeGreaterThan(near)
    // The target is visible, and so is the far side of the scene.
    expect(near).toBeLessThan(s.targetDistance)
    expect(far).toBeGreaterThanOrEqual(s.eyeDistance + s.radius)
    expect(far).toBeGreaterThanOrEqual(s.targetDistance)
    // The depth buffer is not asked for the impossible, unless that would clip the target itself.
    if (s.targetDistance * 0.9 >= far / MAX_DEPTH_RATIO) expect(far / near).toBeLessThanOrEqual(MAX_DEPTH_RATIO * 1.0000001)
    // The depth precision at the focus is sub-micron-relative: resolution z^2 / (near * 2^24).
    const resolution = (s.targetDistance * s.targetDistance) / (near * 2 ** 24)
    expect(resolution / s.targetDistance).toBeLessThan(1e-6)
  }
  // Zoomed out on a small part the ratio is tiny; zoomed in on a machine detail it stays far below the 24-bit limit.
  const part = adaptiveClip({ eye: [150, 0, 0], target: [0, 0, 0], center: [0, 0, 0], radius: 50 })
  expect(part.far / part.near).toBeLessThan(10)
  const detail = adaptiveClip({ eye: [8, 0, 0], target: [0, 0, 0], center: [0, 0, 0], radius: 1500 })
  expect(detail.far / detail.near).toBeLessThan(5000)
})

test("orthographic clip planes enclose the scene along the view axis and may start behind the eye", () => {
  const eye: Vec3 = [0, -300, 0]
  const { near, far } = adaptiveClip({ eye, target: [0, 0, 0], center: [0, 0, 0], radius: 1500, orthographic: true, forward: [0, 1, 0] })
  expect(near).toBeLessThan(300 - 1500)
  expect(far).toBeGreaterThan(300 + 1500)
  expect(WORLD_UP).toEqual([0, 0, 1])
})
