import { expect, test } from "bun:test"
import * as THREE from "three"
import { CUBE_DIRECTIONS, cubeKey, cameraBasis, normalize, viewDirection, type Vec3 } from "./camera-nav.ts"
import { CUBE_FACES, CUBE_ZONES, basisElements, cubeFace, cubeMatrix, faceHandedness, faceMatrix, matrix3dCss, multiply, signNames, toCssWorld } from "./view-cube-model.ts"

const SIDE = 56
const apply = (m: readonly number[], p: readonly [number, number, number]): [number, number, number] =>
  [m[0]! * p[0] + m[4]! * p[1] + m[8]! * p[2] + m[12]!, m[1]! * p[0] + m[5]! * p[1] + m[9]! * p[2] + m[13]!, m[2]! * p[0] + m[6]! * p[1] + m[10]! * p[2] + m[14]!]
const det3 = (m: readonly number[]): number =>
  m[0]! * (m[5]! * m[10]! - m[9]! * m[6]!) - m[4]! * (m[1]! * m[10]! - m[9]! * m[2]!) + m[8]! * (m[1]! * m[6]! - m[5]! * m[2]!)

test("every face has right x up = normal, so a face read from outside is not mirrored", () => {
  for (const face of CUBE_FACES) {
    const h = faceHandedness(face)
    for (let i = 0; i < 3; i++) expect(h[i]).toBeCloseTo(face.normal[i]!, 12)
  }
  expect(CUBE_FACES.map((f) => f.name).sort()).toEqual(["back", "bottom", "front", "left", "right", "top"])
})

test("54 zones: each face has a centre, 4 edges and 4 corners; together they reach all 26 snap targets", () => {
  expect(CUBE_ZONES.length).toBe(54)
  for (const face of CUBE_FACES) {
    const zones = CUBE_ZONES.filter((z) => z.face === face.name)
    expect(zones.filter((z) => z.kind === "face").length).toBe(1)
    expect(zones.filter((z) => z.kind === "edge").length).toBe(4)
    expect(zones.filter((z) => z.kind === "corner").length).toBe(4)
    // The centre is the face normal itself.
    expect(zones.find((z) => z.kind === "face")!.sign).toEqual(face.normal)
  }
  const reached = new Map<string, number>()
  for (const zone of CUBE_ZONES) reached.set(cubeKey(zone.sign), (reached.get(cubeKey(zone.sign)) ?? 0) + 1)
  expect(reached.size).toBe(26)
  for (const entry of CUBE_DIRECTIONS) expect(reached.get(entry.key)).toBe(entry.kind === "face" ? 1 : entry.kind === "edge" ? 2 : 3)
  // A zone's kind agrees with the number of non-zero signs of its target.
  for (const zone of CUBE_ZONES) expect(Math.abs(zone.sign[0]) + Math.abs(zone.sign[1]) + Math.abs(zone.sign[2])).toBe(zone.kind === "face" ? 1 : zone.kind === "edge" ? 2 : 3)
})

test("on the front face seen from the front, the top-right zone is the top-right-front corner, the bottom edge zone the front-bottom edge", () => {
  const front = cubeFace("front")
  const at = (col: number, row: number) => CUBE_ZONES.find((z) => z.face === "front" && z.col === col && z.row === row)!.sign
  expect(at(1, -1)).toEqual([1, -1, 1])
  expect(at(-1, 1)).toEqual([-1, -1, -1])
  expect(at(0, 1)).toEqual([0, -1, -1])
  expect(at(-1, 0)).toEqual([-1, -1, 0])
  expect(front.normal).toEqual([0, -1, 0])
})

test("the cube matrix is a proper rotation for any camera, and the matrix3d string is well formed", () => {
  const next = (() => { let s = 5; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296 })()
  for (let i = 0; i < 50; i++) {
    const direction = normalize([next() - 0.5, next() - 0.5, next() - 0.5])
    const m = cubeMatrix(basisElements(direction))
    expect(det3(m)).toBeCloseTo(1, 9)
    for (let c = 0; c < 3; c++) expect(Math.hypot(m[c * 4]!, m[c * 4 + 1]!, m[c * 4 + 2]!)).toBeCloseTo(1, 9)
  }
  expect(matrix3dCss(cubeMatrix(basisElements(viewDirection("front"))))).toMatch(/^matrix3d\((-?[\d.e-]+,){15}-?[\d.e-]+\)$/)
})

test("the cube matrix follows the real camera: it equals F * V * A for a three.js camera", () => {
  const camera = new THREE.PerspectiveCamera()
  camera.up.set(0, 0, 1)
  camera.position.set(120, -80, 60)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld()
  const mine = cubeMatrix(camera.matrixWorld.elements)
  const rotation = new THREE.Matrix3().setFromMatrix4(camera.matrixWorldInverse.copy(camera.matrixWorld).invert())
  for (const [x, y, z] of [[1, 0, 0], [0, 1, 0], [0, 0, 1], [0.3, -0.7, 0.2]] as const) {
    // A css-world point is a world point mirrored by A; the camera sees the world point; css then flips y.
    const world = toCssWorld([x, y, z])
    const cam = new THREE.Vector3(...world).applyMatrix3(rotation)
    const out = apply(mine, [x, y, z])
    expect(out[0]).toBeCloseTo(cam.x, 9); expect(out[1]).toBeCloseTo(-cam.y, 9); expect(out[2]).toBeCloseTo(cam.z, 9)
  }
})

test("seen from its own named view each face lies flat to the screen, upright, facing the viewer", () => {
  for (const face of CUBE_FACES) {
    const cube = cubeMatrix(basisElements(viewDirection(face.name)))
    const total = multiply(cube, faceMatrix(face, SIDE))
    // Local x runs to the screen right, local y down the screen, local z at the viewer (the poles carry the 0.006 degree tilt).
    expect(total[0]).toBeCloseTo(1, 3); expect(total[1]).toBeCloseTo(0, 3); expect(total[2]).toBeCloseTo(0, 3)
    expect(total[4]).toBeCloseTo(0, 3); expect(total[5]).toBeCloseTo(1, 3); expect(total[6]).toBeCloseTo(0, 3)
    expect(total[8]).toBeCloseTo(0, 3); expect(total[9]).toBeCloseTo(0, 3); expect(total[10]).toBeCloseTo(1, 3)
    expect(total[14]).toBeCloseTo(SIDE / 2, 3)
  }
})

test("an isometric camera shows exactly the three faces on its side", () => {
  const cube = cubeMatrix(basisElements(viewDirection("isometric")))
  const visible = CUBE_FACES.filter((face) => multiply(cube, faceMatrix(face, SIDE))[10]! > 0).map((f) => f.name).sort()
  expect(visible).toEqual(["front", "right", "top"])
})

test("zones sit where their snap target lies on screen", () => {
  // From any view, a zone's centre projects to the side of the cube's centre that its snap target points to.
  for (const name of ["front", "isometric", "right", "top"] as const) {
    const direction = viewDirection(name)
    const basis = cameraBasis(direction)
    const cube = cubeMatrix(basisElements(direction))
    for (const zone of CUBE_ZONES) {
      const face = cubeFace(zone.face)
      const total = multiply(cube, faceMatrix(face, SIDE))
      if (total[10]! <= 0) continue // a hidden face has no screen position
      const [x, y] = apply(total, [zone.col * SIDE / 3, zone.row * SIDE / 3, 0])
      const target = normalize(zone.sign as Vec3)
      const right = target[0] * basis.right[0] + target[1] * basis.right[1] + target[2] * basis.right[2]
      const up = target[0] * basis.up[0] + target[1] * basis.up[1] + target[2] * basis.up[2]
      // Screen x grows right, css y grows down.
      if (Math.abs(right) > 0.3) expect(Math.sign(x)).toBe(Math.sign(right))
      if (Math.abs(up) > 0.3) expect(Math.sign(-y)).toBe(Math.sign(up))
    }
  }
})

test("labels name the faces a target lies on, vertical axis first", () => {
  expect(signNames([0, -1, 1])).toEqual(["top", "front"])
  expect(signNames([1, 1, -1])).toEqual(["bottom", "back", "right"])
  expect(signNames([-1, 0, 0])).toEqual(["left"])
})
