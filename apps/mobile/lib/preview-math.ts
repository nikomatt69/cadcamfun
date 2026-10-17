/**
 * Camera, picking and G-code sync for the phone preview. Pure: the Metal view only draws what this returns.
 * Z is up, matching the desktop kernel.
 */

export interface Vec3 {
  readonly 0: number
  readonly 1: number
  readonly 2: number
}

export interface Bounds {
  readonly min: readonly [number, number, number]
  readonly max: readonly [number, number, number]
}

export interface Orbit {
  readonly yaw: number
  readonly pitch: number
  readonly distance: number
  readonly target: readonly [number, number, number]
}

export interface Ray {
  readonly origin: readonly [number, number, number]
  readonly direction: readonly [number, number, number]
}

export interface MeshPartSpan {
  readonly id: string
  readonly triangleStart: number
  readonly triangleCount: number
}

export const DEFAULT_FOV = Math.PI / 4

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))

export const add = (a: readonly [number, number, number], b: readonly [number, number, number]): [number, number, number] =>
  [a[0] + b[0], a[1] + b[1], a[2] + b[2]]

export const sub = (a: readonly [number, number, number], b: readonly [number, number, number]): [number, number, number] =>
  [a[0] - b[0], a[1] - b[1], a[2] - b[2]]

export const scale = (a: readonly [number, number, number], k: number): [number, number, number] => [a[0] * k, a[1] * k, a[2] * k]

export const dot = (a: readonly [number, number, number], b: readonly [number, number, number]): number =>
  a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

export const cross = (a: readonly [number, number, number], b: readonly [number, number, number]): [number, number, number] => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]

export const length = (a: readonly [number, number, number]): number => Math.hypot(a[0], a[1], a[2])

export const normalize = (a: readonly [number, number, number]): [number, number, number] => {
  const len = length(a)
  return len < 1e-12 ? [0, 0, 1] : [a[0] / len, a[1] / len, a[2] / len]
}

export const boundsCenter = (bounds: Bounds): [number, number, number] => [
  (bounds.min[0] + bounds.max[0]) / 2,
  (bounds.min[1] + bounds.max[1]) / 2,
  (bounds.min[2] + bounds.max[2]) / 2,
]

export const boundsRadius = (bounds: Bounds): number => {
  const half = scale(sub(bounds.max, bounds.min), 0.5)
  return Math.max(length(half), 1e-3)
}

/** Frame the bounds with Z up and a slight top view. */
export const fitOrbit = (bounds: Bounds, fovY = DEFAULT_FOV): Orbit => {
  const radius = boundsRadius(bounds)
  return {
    yaw: Math.PI / 4,
    pitch: 0.55,
    distance: (radius / Math.tan(fovY / 2)) * 1.6,
    target: boundsCenter(bounds),
  }
}

/** Just short of straight down, so a top view keeps a stable screen-right axis. */
export const MAX_PITCH = Math.PI / 2 - 0.02

export const orbitDrag = (orbit: Orbit, dx: number, dy: number): Orbit => ({
  ...orbit,
  yaw: orbit.yaw - dx * 0.008,
  pitch: clamp(orbit.pitch + dy * 0.008, -MAX_PITCH, MAX_PITCH),
})

export type StandardView = "iso" | "top" | "front" | "right"
export const STANDARD_VIEWS: readonly { readonly id: StandardView; readonly label: string }[] = [
  { id: "iso", label: "Isometric" },
  { id: "top", label: "Top" },
  { id: "front", label: "Front" },
  { id: "right", label: "Right" },
]

/** Desktop view-cube faces, Z up: front looks along +Y, right along -X, top shows X to the right and Y up. */
export const viewOrbit = (bounds: Bounds, view: StandardView, fovY = DEFAULT_FOV): Orbit => {
  const fit = fitOrbit(bounds, fovY)
  switch (view) {
    case "iso": return fit
    case "top": return { ...fit, yaw: -Math.PI / 2, pitch: MAX_PITCH }
    case "front": return { ...fit, yaw: -Math.PI / 2, pitch: 0 }
    case "right": return { ...fit, yaw: 0, pitch: 0 }
  }
}

/** 1, 2 or 5 times a power of ten: grid spacing that reads as a round number of millimetres. */
export const niceStep = (span: number, cells = 10): number => {
  const raw = Math.max(span, 1e-6) / Math.max(cells, 1)
  const power = 10 ** Math.floor(Math.log10(raw))
  const unit = raw / power
  return (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10) * power
}

export const orbitZoom = (orbit: Orbit, factor: number): Orbit => ({
  ...orbit,
  distance: clamp(orbit.distance * factor, 1e-4, 1e8),
})

export interface CameraBasis {
  readonly eye: readonly [number, number, number]
  readonly forward: readonly [number, number, number]
  readonly right: readonly [number, number, number]
  readonly up: readonly [number, number, number]
}

/** Eye sits on a Z-up orbit. `forward` points at the target. */
export const cameraBasis = (orbit: Orbit): CameraBasis => {
  const horizontal = Math.cos(orbit.pitch)
  const eye: [number, number, number] = [
    orbit.target[0] + orbit.distance * horizontal * Math.cos(orbit.yaw),
    orbit.target[1] + orbit.distance * horizontal * Math.sin(orbit.yaw),
    orbit.target[2] + orbit.distance * Math.sin(orbit.pitch),
  ]
  const forward = normalize(sub(orbit.target, eye))
  let right = cross(forward, [0, 0, 1])
  if (length(right) < 1e-6) right = [1, 0, 0]
  right = normalize(right)
  const up = normalize(cross(right, forward))
  return { eye, forward, right, up }
}

export const orbitPan = (orbit: Orbit, dx: number, dy: number, viewHeight: number): Orbit => {
  const { right, up } = cameraBasis(orbit)
  const span = orbit.distance / Math.max(viewHeight, 1)
  const shift = add(scale(right, -dx * span), scale(up, dy * span))
  return { ...orbit, target: add(orbit.target, shift) }
}

export const screenToNdc = (x: number, y: number, width: number, height: number): { nx: number; ny: number } => ({
  nx: (x / Math.max(width, 1)) * 2 - 1,
  ny: 1 - (y / Math.max(height, 1)) * 2,
})

/** Ray through NDC `nx`/`ny` (-1..1). The centre ray looks straight at the orbit target. */
export const rayFromScreen = (orbit: Orbit, aspect: number, nx: number, ny: number, fovY = DEFAULT_FOV): Ray => {
  const { eye, forward, right, up } = cameraBasis(orbit)
  const tan = Math.tan(fovY / 2)
  const direction = normalize(add(forward, add(scale(right, nx * tan * aspect), scale(up, ny * tan))))
  return { origin: eye, direction }
}

const lookAt = (eye: readonly [number, number, number], target: readonly [number, number, number], up: readonly [number, number, number]): number[] => {
  const z = normalize(sub(eye, target))
  let x = cross(up, z)
  if (length(x) < 1e-8) x = [1, 0, 0]
  x = normalize(x)
  const y = cross(z, x)
  return [
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -dot(x, eye), -dot(y, eye), -dot(z, eye), 1,
  ]
}

const perspective = (fovY: number, aspect: number, near: number, far: number): number[] => {
  const f = 1 / Math.tan(fovY / 2)
  const nf = 1 / (near - far)
  const safeAspect = aspect > 1e-6 ? aspect : 1
  return [
    f / safeAspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ]
}

export const multiplyMat4 = (a: readonly number[], b: readonly number[]): number[] => {
  const out = new Array<number>(16).fill(0)
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0
      for (let k = 0; k < 4; k++) sum += a[k * 4 + row]! * b[col * 4 + k]!
      out[col * 4 + row] = sum
    }
  }
  return out
}

/** Column-major projection-view matrix for the GL uniform. */
export const mvpOf = (orbit: Orbit, aspect: number, fovY = DEFAULT_FOV): number[] => {
  const { eye, up } = cameraBasis(orbit)
  const near = Math.max(orbit.distance * 0.01, 1e-3)
  const far = orbit.distance * 50
  return multiplyMat4(perspective(fovY, aspect, near, far), lookAt(eye, orbit.target, up))
}

export const transformPoint = (m: readonly number[], p: readonly [number, number, number]): { x: number; y: number; z: number } => {
  const x = p[0], y = p[1], z = p[2]
  const w = m[3]! * x + m[7]! * y + m[11]! * z + m[15]!
  const inv = Math.abs(w) < 1e-12 ? 1 : 1 / w
  return {
    x: (m[0]! * x + m[4]! * y + m[8]! * z + m[12]!) * inv,
    y: (m[1]! * x + m[5]! * y + m[9]! * z + m[13]!) * inv,
    z: (m[2]! * x + m[6]! * y + m[10]! * z + m[14]!) * inv,
  }
}

/** Closest part whose triangle the ray hits, or undefined. */
export const hitMeshPart = (
  ray: Ray,
  positions: readonly number[],
  indices: readonly number[],
  parts: readonly MeshPartSpan[],
): string | undefined => {
  let best = Number.POSITIVE_INFINITY
  let id: string | undefined
  for (const part of parts) {
    if (part.triangleCount <= 0) continue
    const start = part.triangleStart * 3
    const end = start + part.triangleCount * 3
    for (let t = start; t < end; t += 3) {
      const ia = indices[t]! * 3
      const ib = indices[t + 1]! * 3
      const ic = indices[t + 2]! * 3
      const hit = rayTriangle(ray, positions, ia, ib, ic)
      if (hit !== undefined && hit < best) {
        best = hit
        id = part.id
      }
    }
  }
  return id
}

const rayTriangle = (ray: Ray, positions: readonly number[], ia: number, ib: number, ic: number): number | undefined => {
  const ax = positions[ia]!, ay = positions[ia + 1]!, az = positions[ia + 2]!
  const bx = positions[ib]!, by = positions[ib + 1]!, bz = positions[ib + 2]!
  const cx = positions[ic]!, cy = positions[ic + 1]!, cz = positions[ic + 2]!
  const e1: [number, number, number] = [bx - ax, by - ay, bz - az]
  const e2: [number, number, number] = [cx - ax, cy - ay, cz - az]
  const p = cross(ray.direction, e2)
  const det = dot(e1, p)
  if (Math.abs(det) < 1e-9) return undefined
  const inv = 1 / det
  const s = sub(ray.origin, [ax, ay, az])
  const u = dot(s, p) * inv
  if (u < 0 || u > 1) return undefined
  const q = cross(s, e1)
  const v = dot(ray.direction, q) * inv
  if (v < 0 || u + v > 1) return undefined
  const distance = dot(e2, q) * inv
  return distance > 1e-6 ? distance : undefined
}

/** Twelve edges of an axis-aligned box, used as the stock wireframe. */
export const boxEdges = (bounds: Bounds): ReadonlyArray<{ from: readonly [number, number, number]; to: readonly [number, number, number] }> => {
  const [x0, y0, z0] = bounds.min
  const [x1, y1, z1] = bounds.max
  const p: ReadonlyArray<readonly [number, number, number]> = [
    [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
    [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1],
  ]
  const edges = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]] as const
  return edges.map(([a, b]) => ({ from: p[a]!, to: p[b]! }))
}

/**
 * Segment whose G-code line is `line`, or the latest segment that started before it
 * (a comment sits on the move that preceded it).
 */
export const segmentIndexForLine = (segments: readonly { readonly line: number }[], line: number): number => {
  if (segments.length === 0) return 0
  let before = 0
  for (let i = 0; i < segments.length; i++) {
    if (segments[i]!.line === line) return i
    if (segments[i]!.line < line) before = i
  }
  return before
}

export const clampPlayhead = (index: number, count: number): number => {
  if (count <= 0) return 0
  return clamp(Math.trunc(index), 0, count - 1)
}

/** Prompt the existing assistant uses to propose a component. The phone does not write geometry itself. */
export const defineComponentPrompt = (drawing: { readonly id: string; readonly name: string }, elementIds: readonly string[]): string => {
  const which = elementIds.length > 0
    ? `Selected element ids: ${elementIds.join(", ")}.`
    : "No element is selected; use the whole design."
  return `Define a reusable component from design "${drawing.name}" (${drawing.id}). ${which} Propose it on an ai/ branch and open a pull request. Do not edit main.`
}

export const changeComponentPrompt = (component: { readonly id: string; readonly name: string }): string =>
  `Review component "${component.name}" (${component.id}) and propose one precise change on an ai/ branch, then open a pull request. Do not edit main.`
