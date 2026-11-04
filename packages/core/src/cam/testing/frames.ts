/**
 * The frames a control's tilted-plane words define (spec 32 §4.3, spec 73 §5.11), shared by the reference interpreter and the probe
 * replay: program coordinates p reach the work offset as M·p + t. Angles are degrees, lengths are in the program's unit times `unit`.
 *
 *   G68.2 X Y Z I J K    the feature frame's origin and its Euler angles (Z, then X', then Z'')
 *   G68 X Y R            a rotation about the tool axis through (X, Y) (planar)
 *   CYCLE800(...)        Siemens swivel plane, axis by axis
 *   PLANE SPATIAL ...    Heidenhain, rotations about the fixed X, Y, Z axes in that order
 */
export interface P3 { readonly x: number; readonly y: number; readonly z: number }
export type Mat3 = readonly [number, number, number, number, number, number, number, number, number]
export interface Frame { readonly m: Mat3; readonly t: P3; readonly planar: boolean }

export const IDENTITY3: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1]
export const mul3 = (m: Mat3, p: P3): P3 => ({ x: m[0] * p.x + m[1] * p.y + m[2] * p.z, y: m[3] * p.x + m[4] * p.y + m[5] * p.z, z: m[6] * p.x + m[7] * p.y + m[8] * p.z })
export const mulT3 = (m: Mat3, p: P3): P3 => ({ x: m[0] * p.x + m[3] * p.y + m[6] * p.z, y: m[1] * p.x + m[4] * p.y + m[7] * p.z, z: m[2] * p.x + m[5] * p.y + m[8] * p.z })
export const mulM3 = (a: Mat3, b: Mat3): Mat3 => {
  const out: number[] = []
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) out.push(a[r * 3]! * b[c]! + a[r * 3 + 1]! * b[3 + c]! + a[r * 3 + 2]! * b[6 + c]!)
  return out as unknown as Mat3
}
/** A right-handed rotation about a frame axis, degrees. */
export const rot3 = (axis: "x" | "y" | "z", degrees: number): Mat3 => {
  const a = (degrees * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a)
  return axis === "x" ? [1, 0, 0, 0, c, -s, 0, s, c] : axis === "y" ? [c, 0, s, 0, 1, 0, -s, 0, c] : [c, -s, 0, s, c, 0, 0, 0, 1]
}
/** `inner` expressed in `outer`: p -> outer(inner(p)). */
export const compose = (outer: Frame, inner: Frame): Frame => {
  const t = mul3(outer.m, inner.t)
  return { m: mulM3(outer.m, inner.m), t: { x: t.x + outer.t.x, y: t.y + outer.t.y, z: t.z + outer.t.z }, planar: outer.planar && inner.planar }
}

/** `G68.2 X Y Z I J K`: `get` reads a word's value (undefined when absent). */
export const frameOfG682 = (get: (letter: string) => number | undefined, unit: number): Frame => {
  const m = mulM3(mulM3(rot3("z", get("I") ?? 0), rot3("x", get("J") ?? 0)), rot3("z", get("K") ?? 0))
  return { m, t: { x: (get("X") ?? 0) * unit, y: (get("Y") ?? 0) * unit, z: (get("Z") ?? 0) * unit }, planar: false }
}

/** `G68 X Y R` about the point (cx, cy). */
export const frameOfG68 = (cx: number, cy: number, degrees: number): Frame => {
  const m = rot3("z", degrees)
  const c = mul3(m, { x: cx, y: cy, z: 0 })
  return { m, t: { x: cx - c.x, y: cy - c.y, z: 0 }, planar: true }
}

/** `PLANE SPATIAL SPA SPB SPC`; undefined when the words are not all there. */
export const frameOfPlaneSpatial = (code: string): Frame | undefined => {
  const angle = (name: string): number | undefined => { const m = new RegExp(`\\b${name}([+-]?(?:\\d+\\.?\\d*|\\.\\d+))`).exec(code); return m === null ? undefined : Number(m[1]) }
  const spa = angle("SPA"), spb = angle("SPB"), spc = angle("SPC")
  if (!/^PLANE SPATIAL\b/.test(code) || spa === undefined || spb === undefined || spc === undefined) return undefined
  return { m: mulM3(mulM3(rot3("z", spc), rot3("y", spb)), rot3("x", spa)), t: { x: 0, y: 0, z: 0 }, planar: false }
}

/**
 * Siemens `CYCLE800(...)` arguments: the new frame (`undefined`: the plane is cancelled), composed on `previous` when the call is additive,
 * or the unsupported mode. The mode's bit pairs name the rotation axes, first in the low bits.
 */
export const frameOfCycle800 = (args: string, unit: number, previous: Frame | undefined): { readonly frame: Frame | undefined } | { readonly error: string } => {
  const a = args.split(",").map((s) => Number(s.replace(/"[^"]*"/g, "").trim()))
  const at = (i: number): number => (Number.isFinite(a[i]) ? a[i]! : 0)
  if (args.trim() === "" || a.slice(4, 13).every((v) => !Number.isFinite(v) || v === 0)) return { frame: undefined }
  const mode = Math.round(at(3))
  if ((mode >> 6) & 3) return { error: `unsupported CYCLE800 mode ${mode} (only axis-by-axis)` }
  const axisOf = (bits: number): "x" | "y" | "z" | undefined => (bits === 1 ? "x" : bits === 2 ? "y" : bits === 3 ? "z" : undefined)
  let m = IDENTITY3
  ;[at(7), at(8), at(9)].forEach((angle, i) => { const axis = axisOf((mode >> (2 * i)) & 3); if (axis !== undefined) m = mulM3(m, rot3(axis, angle)) })
  const before = { x: at(4) * unit, y: at(5) * unit, z: at(6) * unit }, after = mul3(m, { x: at(10) * unit, y: at(11) * unit, z: at(12) * unit })
  const additive = Math.round(at(2)) % 10 === 1 && previous !== undefined
  const own: Frame = { m, t: { x: before.x + after.x, y: before.y + after.y, z: before.z + after.z }, planar: false }
  return { frame: additive ? compose(previous!, own) : own }
}
