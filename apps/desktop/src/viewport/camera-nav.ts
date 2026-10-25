/**
 * Camera navigation maths shared by the CAD canvas and the 3D preview (spec 06 §viewport).
 *
 * Everything here is pure: plain `[x, y, z]` tuples in and out, no three.js objects, no DOM, no clock. The hosts own the
 * cameras and call these functions with numbers, so the behaviour is testable without WebGL and identical in both views.
 *
 * Conventions (the scene is Z-up, millimetres):
 *  - A *direction* is the unit vector from the orbit target to the eye. "Front" is the eye at -Y looking along +Y.
 *  - A camera always keeps `up = +Z`; the two poles (top and bottom) are reached with a tiny tilt toward -Y so the look-at
 *    stays defined and the screen-up of the top view is +Y (and of the bottom view -Y, so +X stays on the right).
 */

export type Vec3 = readonly [number, number, number]

export const WORLD_UP: Vec3 = [0, 0, 1]

/** Eye tilt off the exact pole, in radians of the unit direction (0.006 degrees: invisible, keeps `lookAt(up = Z)` defined). */
export const POLE_TILT = 1e-4

// ------------------------------------------------------------------------------------------------------ vector helpers
export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s]
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
export const length = (a: Vec3): number => Math.hypot(a[0], a[1], a[2])
export const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
export const normalize = (a: Vec3): Vec3 => {
  const l = length(a)
  return l > 1e-12 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 1]
}
const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))

// ------------------------------------------------------------------------------------------------------ views and basis
export type ViewName = "top" | "bottom" | "front" | "back" | "left" | "right" | "isometric" | "perspective"

const RAW_VIEW: Record<ViewName, Vec3> = {
  perspective: [1, -1, 0.8], isometric: [1, -1, 1],
  top: [0, 0, 1], bottom: [0, 0, -1], front: [0, -1, 0], back: [0, 1, 0], right: [1, 0, 0], left: [-1, 0, 0]
}

/** Gives an exact pole direction its tilt; any other direction is returned normalised. */
export const withPoleTilt = (direction: Vec3): Vec3 => {
  const d = normalize(direction)
  return Math.abs(d[0]) < 1e-9 && Math.abs(d[1]) < 1e-9 ? normalize([0, -POLE_TILT, Math.sign(d[2]) || 1]) : d
}

/** The eye direction (target to eye) of a named view, with the pole tilt applied. */
export const viewDirection = (view: ViewName): Vec3 => withPoleTilt(RAW_VIEW[view])

export interface CameraBasis {
  /** World direction of screen right. */
  readonly right: Vec3
  /** World direction of screen up. */
  readonly up: Vec3
  /** World direction toward the viewer (the eye direction). */
  readonly back: Vec3
}

/** The camera frame `lookAt(target)` produces for an eye in `direction` with `up = Z`. */
export const cameraBasis = (direction: Vec3, up: Vec3 = WORLD_UP): CameraBasis => {
  const back = normalize(direction)
  const right = normalize(cross(up, back))
  return { right, up: cross(back, right), back }
}

// ------------------------------------------------------------------------------------------------------ cube directions
export type CubeKind = "face" | "edge" | "corner"

export interface CubeDirection {
  /** `"x,y,z"` of the signs, e.g. `"0,-1,1"` for the edge between the front and the top. */
  readonly key: string
  readonly kind: CubeKind
  readonly sign: Vec3
  /** Unit eye direction that snaps the camera to this face, edge or corner. */
  readonly direction: Vec3
}

export const cubeKey = (sign: Vec3): string => `${sign[0]},${sign[1]},${sign[2]}`

const buildCubeDirections = (): readonly CubeDirection[] => {
  const out: CubeDirection[] = []
  for (const x of [-1, 0, 1]) for (const y of [-1, 0, 1]) for (const z of [-1, 0, 1]) {
    const nonZero = Math.abs(x) + Math.abs(y) + Math.abs(z)
    if (nonZero === 0) continue
    const sign: Vec3 = [x, y, z]
    out.push({ key: cubeKey(sign), kind: nonZero === 1 ? "face" : nonZero === 2 ? "edge" : "corner", sign, direction: withPoleTilt(sign) })
  }
  return out
}

/** The 26 snap targets of an orientation cube: 6 faces, 12 edges, 8 corners. */
export const CUBE_DIRECTIONS: readonly CubeDirection[] = buildCubeDirections()

const BY_KEY = new Map(CUBE_DIRECTIONS.map((entry) => [entry.key, entry]))

/** The snap target for the signs of a face, edge or corner; `undefined` for the cube centre `0,0,0`. */
export const cubeDirection = (sign: Vec3): CubeDirection | undefined => BY_KEY.get(cubeKey(sign))

/**
 * The cube region the camera looks at the part from, when it is aligned with one (within `tolerance`, the sine of the angle);
 * `undefined` for a free orbit position. Used to mark the current face.
 */
export const alignedCubeKey = (direction: Vec3, tolerance = 0.02): string | undefined => {
  const d = normalize(direction)
  let best: CubeDirection | undefined
  let bestDot = -Infinity
  for (const entry of CUBE_DIRECTIONS) {
    const c = dot(d, normalize(entry.sign))
    if (c > bestDot) { bestDot = c; best = entry }
  }
  if (!best) return undefined
  const sin = Math.sqrt(Math.max(0, 1 - bestDot * bestDot))
  return sin <= tolerance ? best.key : undefined
}

// ------------------------------------------------------------------------------------------------------ transitions
/** A camera placement: where it looks, from which side, and how far away. */
export interface ViewPose {
  readonly target: Vec3
  /** Unit vector from the target to the eye. */
  readonly direction: Vec3
  /** Eye to target distance (for an orthographic camera it only places the eye; the zoom is the host's). */
  readonly distance: number
  /** Orthographic zoom, when the camera has one. */
  readonly zoom?: number
}

export const poseEye = (pose: ViewPose): Vec3 => add(pose.target, scale(pose.direction, pose.distance))

/** Rotates `a` toward `b` along the great circle; an antipodal pair swings about world Z (or X at the poles). */
export const slerpDirection = (a: Vec3, b: Vec3, t: number): Vec3 => {
  const from = normalize(a), to = normalize(b)
  const c = clamp(dot(from, to), -1, 1)
  if (c > 1 - 1e-12) return to
  let axis: Vec3
  let angle: number
  if (c < -1 + 1e-9) {
    axis = Math.abs(from[2]) < 0.999 ? WORLD_UP : [1, 0, 0]
    angle = Math.PI
  } else {
    axis = normalize(cross(from, to))
    angle = Math.acos(c)
  }
  // Rodrigues rotation of `from` about `axis` by `angle * t`.
  const theta = angle * t
  const cosT = Math.cos(theta), sinT = Math.sin(theta)
  const k = cross(axis, from), d = dot(axis, from)
  return normalize([
    from[0] * cosT + k[0] * sinT + axis[0] * d * (1 - cosT),
    from[1] * cosT + k[1] * sinT + axis[1] * d * (1 - cosT),
    from[2] * cosT + k[2] * sinT + axis[2] * d * (1 - cosT)
  ])
}

export const easeInOutCubic = (t: number): number => {
  const x = clamp(t, 0, 1)
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2
}

/** Shortest and longest transition, in milliseconds. */
export const TRANSITION_MIN_MS = 140
export const TRANSITION_MAX_MS = 320

/** A short move: longer for a bigger turn, never over a third of a second; zero when the user asks for reduced motion. */
export const transitionDuration = (from: ViewPose, to: ViewPose, reducedMotion: boolean): number => {
  if (reducedMotion) return 0
  const angle = Math.acos(clamp(dot(normalize(from.direction), normalize(to.direction)), -1, 1))
  return Math.round(TRANSITION_MIN_MS + (TRANSITION_MAX_MS - TRANSITION_MIN_MS) * (angle / Math.PI))
}

export interface ViewTransition {
  readonly from: ViewPose
  readonly to: ViewPose
  /** Clock value (ms) at which it started. */
  readonly start: number
  readonly duration: number
}

export const startTransition = (from: ViewPose, to: ViewPose, now: number, reducedMotion: boolean): ViewTransition =>
  ({ from, to, start: now, duration: transitionDuration(from, to, reducedMotion) })

export interface TransitionSample {
  readonly pose: ViewPose
  readonly done: boolean
}

/**
 * The pose at `now`. The direction follows the great circle, the distance and the zoom change geometrically (so a zoom
 * feels even), the target moves in a straight line. A duration of zero lands on the end pose at once.
 */
export const sampleTransition = (transition: ViewTransition, now: number): TransitionSample => {
  const { from, to, start, duration } = transition
  if (duration <= 0 || now - start >= duration) return { pose: to, done: true }
  const t = easeInOutCubic((now - start) / duration)
  const distance = from.distance > 0 && to.distance > 0 ? from.distance * Math.pow(to.distance / from.distance, t) : from.distance + (to.distance - from.distance) * t
  const zoom = from.zoom !== undefined && to.zoom !== undefined && from.zoom > 0 && to.zoom > 0 ? from.zoom * Math.pow(to.zoom / from.zoom, t) : to.zoom
  return {
    pose: { target: lerp(from.target, to.target, t), direction: slerpDirection(from.direction, to.direction, t), distance, ...(zoom !== undefined ? { zoom } : {}) },
    done: false
  }
}

/** A transition that begins where the running one is now: a new click mid-move redirects it instead of jumping. */
export const redirectTransition = (running: ViewTransition | undefined, current: ViewPose, to: ViewPose, now: number, reducedMotion: boolean): ViewTransition =>
  startTransition(running ? sampleTransition(running, now).pose : current, to, now, reducedMotion)

// ------------------------------------------------------------------------------------------------------ orbit
const POLAR_MIN = 1e-3

/**
 * Turns an eye direction about the target: `dAzimuth` about world Z (positive moves the eye toward +X from the front),
 * `dPolar` toward the poles (positive moves the eye up). The polar angle stops short of the poles, as OrbitControls does.
 */
export const orbitDirection = (direction: Vec3, dAzimuth: number, dPolar: number): Vec3 => {
  const d = normalize(direction)
  const polar = Math.acos(clamp(d[2], -1, 1))
  const azimuth = Math.atan2(d[1], d[0])
  const nextPolar = clamp(polar - dPolar, POLAR_MIN, Math.PI - POLAR_MIN)
  const nextAzimuth = azimuth + dAzimuth
  const s = Math.sin(nextPolar)
  return [s * Math.cos(nextAzimuth), s * Math.sin(nextAzimuth), Math.cos(nextPolar)]
}

// ------------------------------------------------------------------------------------------------------ zoom and pivot
/** Wheel units to a zoom factor below 1 (the same law as OrbitControls: `0.95 ^ (speed * |delta| / 100)`). */
export const wheelZoomFactor = (deltaY: number, deltaMode: number, zoomSpeed = 1.5): number => {
  const pixels = deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * 400 : deltaY
  return Math.pow(0.95, zoomSpeed * Math.abs(pixels * 0.01))
}

/** Limits a distance factor so the eye distance stays inside `[min, max]`. */
export const clampDistanceFactor = (distance: number, factor: number, min: number, max: number): number => {
  if (!(distance > 0)) return 1
  return clamp(distance * factor, min, max) / distance
}

export interface EyeTarget { readonly position: Vec3; readonly target: Vec3 }

/**
 * Perspective zoom toward a point: eye and target are scaled about the pivot by `factor` (below 1 zooms in), so the camera
 * keeps looking in the same direction and the pivot stays under the same pixel.
 */
export const dollyAboutPoint = (view: EyeTarget, pivot: Vec3, factor: number): EyeTarget => ({
  position: add(pivot, scale(sub(view.position, pivot), factor)),
  target: add(pivot, scale(sub(view.target, pivot), factor))
})

export interface OrthoZoomInput {
  readonly position: Vec3
  readonly target: Vec3
  readonly basis: CameraBasis
  /** Half the visible width and height at zoom 1 (world units). */
  readonly halfWidth: number
  readonly halfHeight: number
  readonly zoom: number
  /** Cursor in normalised device coordinates, -1..1, y up. */
  readonly ndc: readonly [number, number]
  /** Zoom multiplier: above 1 zooms in. */
  readonly factor: number
}

export interface OrthoZoomResult extends EyeTarget { readonly zoom: number }

/** Orthographic zoom toward the cursor: the world point under the cursor stays under it. */
export const orthoZoomAboutCursor = (input: OrthoZoomInput): OrthoZoomResult => {
  const { position, target, basis, halfWidth, halfHeight, zoom, ndc, factor } = input
  // Offset of the cursor from the view centre, in the view plane, at the current zoom.
  const offset = add(scale(basis.right, ndc[0] * halfWidth / zoom), scale(basis.up, ndc[1] * halfHeight / zoom))
  const shift = scale(offset, 1 - 1 / factor)
  return { position: add(position, shift), target: add(target, shift), zoom: zoom * factor }
}

/** Where a ray meets the plane through `point` with normal `normal`; `undefined` when parallel or behind the origin. */
export const intersectRayPlane = (origin: Vec3, direction: Vec3, point: Vec3, normal: Vec3): Vec3 | undefined => {
  const denom = dot(direction, normal)
  if (Math.abs(denom) < 1e-12) return undefined
  const t = dot(sub(point, origin), normal) / denom
  return t > 0 ? add(origin, scale(direction, t)) : undefined
}

/**
 * Moves the orbit target onto the line of sight through `pivot` without turning the camera: the picture does not change,
 * but orbiting now turns about the pivot. `undefined` when the pivot is behind the eye or closer than `minDistance`.
 */
export const retargetAlongView = (position: Vec3, target: Vec3, pivot: Vec3, minDistance = 1e-3): Vec3 | undefined => {
  const forward = normalize(sub(target, position))
  const depth = dot(sub(pivot, position), forward)
  return depth > minDistance ? add(position, scale(forward, depth)) : undefined
}

// ------------------------------------------------------------------------------------------------------ framing
export interface Box { readonly min: Vec3; readonly max: Vec3 }

export const boxCorners = (box: Box): Vec3[] => {
  const out: Vec3[] = []
  for (const x of [box.min[0], box.max[0]]) for (const y of [box.min[1], box.max[1]]) for (const z of [box.min[2], box.max[2]]) out.push([x, y, z])
  return out
}

export const boxCenter = (box: Box): Vec3 => scale(add(box.min, box.max), 0.5)

export interface Framing {
  readonly target: Vec3
  readonly distance: number
}

/**
 * The target and the eye distance that fit `box` into a perspective view from `direction`: every corner lies inside the
 * frustum with `margin` to spare (1.15 leaves 15 percent), and the eye is outside the box.
 */
export const fitBoxPerspective = (box: Box, direction: Vec3, fovDeg: number, aspect: number, margin = 1.15): Framing => {
  const basis = cameraBasis(direction)
  const center = boxCenter(box)
  const tanHalf = Math.tan((fovDeg * Math.PI) / 360)
  const tanHalfWide = tanHalf * Math.max(aspect, 1e-6)
  let distance = 0
  for (const corner of boxCorners(box)) {
    const rel = sub(corner, center)
    const x = Math.abs(dot(rel, basis.right)) * margin, y = Math.abs(dot(rel, basis.up)) * margin
    const k = dot(rel, basis.back)
    distance = Math.max(distance, k + Math.max(y / tanHalf, x / tanHalfWide))
  }
  return { target: center, distance: Math.max(distance, 1e-3) }
}

/** Half the visible height an orthographic view needs to show `box` from `direction`, with `margin`. */
export const fitBoxOrthoHalfHeight = (box: Box, direction: Vec3, aspect: number, margin = 1.15): number => {
  const basis = cameraBasis(direction)
  const center = boxCenter(box)
  let half = 0
  for (const corner of boxCorners(box)) {
    const rel = sub(corner, center)
    half = Math.max(half, Math.abs(dot(rel, basis.up)), Math.abs(dot(rel, basis.right)) / Math.max(aspect, 1e-6))
  }
  return Math.max(half * margin, 1e-6)
}

/** The orthographic zoom (frustum half height `baseHalfHeight` at zoom 1) that shows a half height of `halfHeight`. */
export const orthoZoomForHalfHeight = (baseHalfHeight: number, halfHeight: number): number => baseHalfHeight / Math.max(halfHeight, 1e-9)

// ------------------------------------------------------------------------------------------------------ projections
const tanHalfFov = (fovDeg: number): number => Math.tan((fovDeg * Math.PI) / 360)

/** The orthographic zoom that shows the same slice of the target plane as a perspective camera at `distance`. */
export const orthoZoomFor = (baseHalfHeight: number, distance: number, fovDeg: number): number =>
  orthoZoomForHalfHeight(baseHalfHeight, distance * tanHalfFov(fovDeg))

/** The perspective eye distance that shows the same slice of the target plane as an orthographic camera at `zoom`. */
export const perspectiveDistanceFor = (baseHalfHeight: number, zoom: number, fovDeg: number): number =>
  baseHalfHeight / Math.max(zoom, 1e-9) / tanHalfFov(fovDeg)

/** Dolly zoom: the distance that keeps the target plane's framing when the field of view changes (an "orthographic" camera is a very narrow one). */
export const dollyZoomDistance = (distance: number, fromFovDeg: number, toFovDeg: number): number =>
  distance * tanHalfFov(fromFovDeg) / tanHalfFov(toFovDeg)

/** The field of view a perspective camera uses to stand in for an orthographic one. */
export const FLAT_FOV_DEG = 2

// ------------------------------------------------------------------------------------------------------ clip planes
export interface ClipInput {
  readonly eye: Vec3
  readonly target: Vec3
  /** Bounding sphere of what is drawn (a baseline radius for the grid belongs in it). */
  readonly center: Vec3
  readonly radius: number
  /** A camera whose depth is linear (orthographic) has no precision problem and may start behind the eye. */
  readonly orthographic?: boolean
  /** Unit vector the camera looks along; required for an orthographic camera. */
  readonly forward?: Vec3
}

export interface Clip { readonly near: number; readonly far: number }

/** Largest far/near ratio the depth buffer is asked to resolve; beyond it the target would be clipped first. */
export const MAX_DEPTH_RATIO = 1e6

/**
 * Near and far planes that follow the camera: far reaches the back of the scene, near sits at half the distance to the
 * nearest point of the scene (or half the distance to the orbit target when the eye is inside the scene), so a part a few
 * millimetres across in a machine a few metres across both get depth resolution where they are looked at.
 *
 * Invariants: `0 < near < far`, the scene sphere and the target are inside `[near, far]`, and `far / near` stays under
 * {@link MAX_DEPTH_RATIO} unless that would clip the target.
 */
export const adaptiveClip = (input: ClipInput): Clip => {
  const { eye, target, center, radius } = input
  const R = Math.max(radius, 0)
  const toTarget = Math.max(length(sub(target, eye)), 1e-6)
  const toCenter = length(sub(center, eye))
  if (input.orthographic) {
    const forward = normalize(input.forward ?? sub(target, eye))
    const depth = dot(sub(center, eye), forward)
    const reach = Math.max(R, toTarget) * 1.05 + 1e-3
    const targetDepth = dot(sub(target, eye), forward)
    return { near: Math.min(depth, targetDepth) - reach, far: Math.max(depth, targetDepth) + reach }
  }
  const far = Math.max((toCenter + R) * 1.02, toTarget * 1.5, 1e-3)
  const surface = toCenter - R
  const ideal = Math.min(toTarget * 0.5, surface > 0 ? surface * 0.5 : Infinity)
  const near = Math.min(Math.max(ideal, far / MAX_DEPTH_RATIO), toTarget * 0.9)
  return { near, far }
}
