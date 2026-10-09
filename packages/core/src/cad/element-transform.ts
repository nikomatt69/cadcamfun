/**
 * Moves, turns and scales an editor element the way the editor's gizmo does (`commitDrag` in the desktop), so an element the
 * assistant transformed is exactly where a person would have put it. An element with a point (`x`/`y`/`z`, or the two ends of a
 * line) is moved by writing that point; every other element is moved with `translateX/Y/Z`. A turn is stored as `rotation`
 * (Euler angles in degrees, order XYZ, applied about the element's centre) and a scale as `scale` (per axis, about the centre).
 * A transform about another point also moves the element's centre, which is the `centre` argument: its centre as drawn now.
 */
export interface Point3 { readonly x: number; readonly y: number; readonly z: number }

export interface ElementTransform {
  /** Scale first (about `about`, default the element's centre)... */
  readonly scale?: { readonly factor: number | Point3; readonly about?: Point3 }
  /** ...then turn by `degrees` about the world `axis` (about `about`, default the element's centre)... */
  readonly rotate?: { readonly axis: "x" | "y" | "z"; readonly degrees: number; readonly about?: Point3 }
  /** ...then move. */
  readonly move?: Point3
}

type Fields = Record<string, unknown>
interface Quat { readonly x: number; readonly y: number; readonly z: number; readonly w: number }

const DEG = Math.PI / 180
const num = (value: unknown, fallback = 0): number => (typeof value === "number" && Number.isFinite(value) ? value : fallback)

const mul = (a: Quat, b: Quat): Quat => ({
  x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
  y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
  z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z
})
const fromAxis = (axis: "x" | "y" | "z", degrees: number): Quat => {
  const s = Math.sin((degrees * DEG) / 2)
  return { x: axis === "x" ? s : 0, y: axis === "y" ? s : 0, z: axis === "z" ? s : 0, w: Math.cos((degrees * DEG) / 2) }
}
/** Three.js `Quaternion.setFromEuler` for order XYZ. */
const fromEuler = (r: Point3): Quat => {
  const c1 = Math.cos((r.x * DEG) / 2), c2 = Math.cos((r.y * DEG) / 2), c3 = Math.cos((r.z * DEG) / 2)
  const s1 = Math.sin((r.x * DEG) / 2), s2 = Math.sin((r.y * DEG) / 2), s3 = Math.sin((r.z * DEG) / 2)
  return { x: s1 * c2 * c3 + c1 * s2 * s3, y: c1 * s2 * c3 - s1 * c2 * s3, z: c1 * c2 * s3 + s1 * s2 * c3, w: c1 * c2 * c3 - s1 * s2 * s3 }
}
/** Three.js `Euler.setFromQuaternion` for order XYZ, in degrees. */
const toEuler = ({ x, y, z, w }: Quat): Point3 => {
  const m11 = 1 - 2 * (y * y + z * z), m12 = 2 * (x * y - w * z), m13 = 2 * (x * z + w * y)
  const m22 = 1 - 2 * (x * x + z * z), m23 = 2 * (y * z - w * x), m32 = 2 * (y * z + w * x), m33 = 1 - 2 * (x * x + y * y)
  const ey = Math.asin(Math.max(-1, Math.min(1, m13)))
  const regular = Math.abs(m13) < 0.9999999
  return { x: (regular ? Math.atan2(-m23, m33) : Math.atan2(m32, m22)) / DEG, y: ey / DEG, z: (regular ? Math.atan2(-m12, m11) : 0) / DEG }
}
const rotateVector = (v: Point3, q: Quat): Point3 => {
  // v' = q v q^-1
  const p = mul(mul(q, { x: v.x, y: v.y, z: v.z, w: 0 }), { x: -q.x, y: -q.y, z: -q.z, w: q.w })
  return { x: p.x, y: p.y, z: p.z }
}
const add = (a: Point3, b: Point3): Point3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z })
const sub = (a: Point3, b: Point3): Point3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })

const rotationOf = (e: Fields): Point3 => {
  const r = (e["rotation"] ?? {}) as Record<string, unknown>
  return { x: num(r["x"]), y: num(r["y"]), z: num(r["z"]) }
}
const scaleOf = (e: Fields): Point3 => {
  const s = (e["scale"] ?? {}) as Record<string, unknown>
  return { x: num(s["x"], 1), y: num(s["y"], 1), z: num(s["z"], 1) }
}

/** The element moved by `d`: its point(s) when it has them, `translateX/Y/Z` otherwise (the editor's rule). */
export const shiftElement = (e: Fields, d: Point3): Fields => {
  if ("x" in e && "y" in e) return { ...e, x: num(e["x"]) + d.x, y: num(e["y"]) + d.y, z: num(e["z"]) + d.z }
  if ("x1" in e && "x2" in e) {
    return { ...e, x1: num(e["x1"]) + d.x, y1: num(e["y1"]) + d.y, z1: num(e["z1"]) + d.z, x2: num(e["x2"]) + d.x, y2: num(e["y2"]) + d.y, z2: num(e["z2"]) + d.z }
  }
  return { ...e, translateX: num(e["translateX"]) + d.x, translateY: num(e["translateY"]) + d.y, translateZ: num(e["translateZ"]) + d.z }
}

const SMALL = 1e-9

/**
 * The element after `transform`. `centre` is where the element's centre is now (its bounds' middle, with any `translate*` it
 * carries); it is the pivot unless the transform names another and the point the move of a turn or scale about another pivot is measured from.
 */
export const transformElement = (element: Fields, transform: ElementTransform, centre: Point3): Fields => {
  let e = element
  let c = centre
  if (transform.scale !== undefined) {
    const f = typeof transform.scale.factor === "number" ? { x: transform.scale.factor, y: transform.scale.factor, z: transform.scale.factor } : transform.scale.factor
    const pivot = transform.scale.about ?? c
    const next = add(pivot, { x: (c.x - pivot.x) * f.x, y: (c.y - pivot.y) * f.y, z: (c.z - pivot.z) * f.z })
    const s = scaleOf(e)
    e = { ...e, scale: { x: s.x * f.x, y: s.y * f.y, z: s.z * f.z } }
    if (Math.abs(next.x - c.x) + Math.abs(next.y - c.y) + Math.abs(next.z - c.z) > SMALL) e = shiftElement(e, sub(next, c))
    c = next
  }
  if (transform.rotate !== undefined && Math.abs(transform.rotate.degrees) > SMALL) {
    const q = fromAxis(transform.rotate.axis, transform.rotate.degrees)
    const pivot = transform.rotate.about ?? c
    const next = add(pivot, rotateVector(sub(c, pivot), q))
    e = { ...e, rotation: toEuler(mul(q, fromEuler(rotationOf(e)))) }
    if (Math.abs(next.x - c.x) + Math.abs(next.y - c.y) + Math.abs(next.z - c.z) > SMALL) e = shiftElement(e, sub(next, c))
    c = next
  }
  if (transform.move !== undefined && (transform.move.x !== 0 || transform.move.y !== 0 || transform.move.z !== 0)) e = shiftElement(e, transform.move)
  return e
}
