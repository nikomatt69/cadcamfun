/**
 * Geometry of the orientation cube (the view gizmo): which faces it has, how each is placed in CSS 3D, how the live camera
 * turns the cube, and which snap target each of the 9 zones of a face stands for. Pure numbers, no DOM: the component only
 * writes the matrices this module computes.
 *
 * Frames. The world is Z-up and right-handed. CSS 3D has x right, y down and z toward the viewer, which is a mirror of a
 * right-handed camera frame, so the cube lives in a "css-world" frame `cw = A * w` with the reflection
 * `A = [[1,0,0],[0,0,-1],[0,-1,0]]` (an involution). With the camera's view rotation `V` (rows: right, up, back) and the
 * y flip `F`, the cube's own transform is `F * V * A`: a proper rotation, so `matrix3d` never mirrors the labels.
 */
import { cameraBasis, cross, dot, normalize, scale, type CubeKind, type Vec3 } from "./camera-nav.ts"

export type CubeFaceName = "top" | "bottom" | "front" | "back" | "left" | "right"

export interface CubeFace {
  readonly name: CubeFaceName
  /** Outward normal, world. */
  readonly normal: Vec3
  /** World direction that reads as "right" and "up" on the face when it is viewed from outside in its own view. */
  readonly right: Vec3
  readonly up: Vec3
}

/** The six faces; `right x up = normal` for each, and the camera of each named view sees its face upright. */
export const CUBE_FACES: readonly CubeFace[] = [
  { name: "front", normal: [0, -1, 0], right: [1, 0, 0], up: [0, 0, 1] },
  { name: "back", normal: [0, 1, 0], right: [-1, 0, 0], up: [0, 0, 1] },
  { name: "right", normal: [1, 0, 0], right: [0, 1, 0], up: [0, 0, 1] },
  { name: "left", normal: [-1, 0, 0], right: [0, -1, 0], up: [0, 0, 1] },
  { name: "top", normal: [0, 0, 1], right: [1, 0, 0], up: [0, 1, 0] },
  { name: "bottom", normal: [0, 0, -1], right: [1, 0, 0], up: [0, -1, 0] }
]

/** World vector to css-world (the reflection `A`). */
export const toCssWorld = (v: Vec3): Vec3 => [v[0], -v[2], -v[1]]

/** A 4x4 matrix as the 16 numbers `matrix3d()` takes (column-major). */
export type Matrix3d = readonly number[]

const fromColumns = (x: Vec3, y: Vec3, z: Vec3, t: Vec3): Matrix3d =>
  [x[0], x[1], x[2], 0, y[0], y[1], y[2], 0, z[0], z[1], z[2], 0, t[0], t[1], t[2], 1]

/** Where a face sits on a cube of the given side length (CSS pixels): its frame in css-world, moved out by half a side. */
export const faceMatrix = (face: CubeFace, side: number): Matrix3d => {
  const x = toCssWorld(face.right)
  const y = toCssWorld(scale(face.up, -1))
  const z = toCssWorld(face.normal)
  return fromColumns(x, y, z, scale(z, side / 2))
}

/**
 * The cube's transform for the camera frame given as the first three columns of a three.js `matrixWorld.elements`
 * (right, up, back; each as world components). `F * V * A`.
 */
export const cubeMatrix = (elements: ArrayLike<number>): Matrix3d => {
  const right: Vec3 = [elements[0]!, elements[1]!, elements[2]!]
  const up: Vec3 = [elements[4]!, elements[5]!, elements[6]!]
  const back: Vec3 = [elements[8]!, elements[9]!, elements[10]!]
  // Column j of F*V*A is F*V*(A e_j); V maps a world vector to (w.right, w.up, w.back).
  const column = (e: Vec3): Vec3 => {
    const w = toCssWorld(e)
    return [dot(w, right), -dot(w, up), dot(w, back)]
  }
  return fromColumns(column([1, 0, 0]), column([0, 1, 0]), column([0, 0, 1]), [0, 0, 0])
}

/** The camera frame of an eye direction, as the elements array {@link cubeMatrix} reads. */
export const basisElements = (direction: Vec3): number[] => {
  const b = cameraBasis(direction)
  return [b.right[0], b.right[1], b.right[2], 0, b.up[0], b.up[1], b.up[2], 0, b.back[0], b.back[1], b.back[2], 0, 0, 0, 0, 1]
}

/** Multiplies two column-major 4x4 matrices (`a * b`). */
export const multiply = (a: Matrix3d, b: Matrix3d): number[] => {
  const out = new Array<number>(16).fill(0)
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let sum = 0
    for (let k = 0; k < 4; k++) sum += a[k * 4 + r]! * b[c * 4 + k]!
    out[c * 4 + r] = sum
  }
  return out
}

export const matrix3dCss = (m: Matrix3d): string => `matrix3d(${m.map((v) => (Math.abs(v) < 1e-10 ? 0 : +v.toFixed(6))).join(",")})`

// ------------------------------------------------------------------------------------------------------ zones
/** A face is cut into 3 x 3 zones: 4 corners, 4 edges and the centre. */
export interface CubeZone {
  readonly face: CubeFaceName
  /** Column and row on the face as seen from outside: -1 left/top, 0 middle, 1 right/bottom. */
  readonly col: -1 | 0 | 1
  readonly row: -1 | 0 | 1
  readonly kind: CubeKind
  /** Signs `[x, y, z]` of the snap target (the key of a {@link CubeDirection}). */
  readonly sign: Vec3
}

const FACES = new Map(CUBE_FACES.map((face) => [face.name, face]))

/** The snap target of a zone: the face normal plus the face-plane offsets of the zone, as signs. */
export const zoneSign = (face: CubeFace, col: -1 | 0 | 1, row: -1 | 0 | 1): Vec3 => {
  // Row 1 is the bottom of the face on screen, so its world offset is -up.
  const along: Vec3 = [
    face.right[0] * col - face.up[0] * row,
    face.right[1] * col - face.up[1] * row,
    face.right[2] * col - face.up[2] * row
  ]
  const sign: Vec3 = [face.normal[0] + along[0], face.normal[1] + along[1], face.normal[2] + along[2]]
  return [Math.round(sign[0]), Math.round(sign[1]), Math.round(sign[2])]
}

/** All 54 zones (6 faces x 9). */
export const CUBE_ZONES: readonly CubeZone[] = CUBE_FACES.flatMap((face) => {
  const out: CubeZone[] = []
  for (const row of [-1, 0, 1] as const) for (const col of [-1, 0, 1] as const) {
    const parts = Math.abs(col) + Math.abs(row)
    out.push({ face: face.name, col, row, kind: parts === 0 ? "face" : parts === 1 ? "edge" : "corner", sign: zoneSign(face, col, row) })
  }
  return out
})

export const cubeFace = (name: CubeFaceName): CubeFace => FACES.get(name)!

/** Unit normal check used by tests: `right x up` of a face. */
export const faceHandedness = (face: CubeFace): Vec3 => normalize(cross(face.right, face.up))
