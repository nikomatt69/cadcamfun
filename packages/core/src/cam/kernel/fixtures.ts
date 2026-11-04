/**
 * Fixture bodies and the holding decision (spec 69 C3). Builders turn the usual workholding (vise, clamp, parallels, pallet, a round
 * or meshed fixture) into the axis-aligned boxes the kernel checks the tool assembly against; `holdingOf` decides whether those bodies
 * actually hold the stock, which is what makes `setup-workholding` decidable rather than assumed.
 *
 *   boxes     a body that is not a box (a cylinder, a mesh) is given by its bounding box. That only errs towards a collision, never away.
 *   holding   the stock is held when two `jaw` bodies press on opposite faces of it (each with at least `MIN_CONTACT` mm² of contact),
 *             or a `clamp` presses on one face while a body carries or presses on the opposite one. Contact is a face within
 *             `TOUCH` of the stock face with area overlap; the friction and the clamping force are not computed - the claim says
 *             geometry holds the stock, not that the cut forces are within what the clamping can take.
 */
import type { Vec3 } from "../../cad/vec.ts"
import type { FixtureBody, StockBox } from "./contracts.ts"

/** A body counts as touching a stock face when it is this close to it, mm. */
export const TOUCH = 0.05
/** Least contact area for a body to hold, mm². */
export const MIN_CONTACT = 50

type Axis = "x" | "y" | "z"
const AXES: ReadonlyArray<Axis> = ["x", "y", "z"]
const other = (a: Axis): [Axis, Axis] => (a === "x" ? ["y", "z"] : a === "y" ? ["x", "z"] : ["x", "y"])

const box = (id: string, a: Vec3, b: Vec3, role?: FixtureBody["role"]): FixtureBody => ({
  id, min: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), z: Math.min(a.z, b.z) }, max: { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y), z: Math.max(a.z, b.z) },
  ...(role !== undefined ? { role } : {})
})

/** Parallels, a pallet plate or a tombstone face: carries the stock from below. */
export const supportBody = (id: string, min: Vec3, max: Vec3): FixtureBody => box(id, min, max, "support")

/** A strap clamp or toe clamp pressing on a face of the stock. */
export const clampBody = (id: string, min: Vec3, max: Vec3): FixtureBody => box(id, min, max, "clamp")

/** A round fixture (a collet pad, a boss) by its bounding box. */
export const cylinderBody = (id: string, center: { readonly x: number; readonly y: number }, radius: number, z0: number, z1: number, role?: FixtureBody["role"]): FixtureBody =>
  box(id, { x: center.x - radius, y: center.y - radius, z: z0 }, { x: center.x + radius, y: center.y + radius, z: z1 }, role)

/** A meshed fixture (a soft jaw, a vacuum plate) by the bounding box of its triangles. */
export const meshBody = (id: string, mesh: { readonly positions: ArrayLike<number> }, role?: FixtureBody["role"]): FixtureBody => {
  const p = mesh.positions
  const lo = { x: Infinity, y: Infinity, z: Infinity }, hi = { x: -Infinity, y: -Infinity, z: -Infinity }
  for (let i = 0; i + 2 < p.length; i += 3) {
    lo.x = Math.min(lo.x, p[i]!); lo.y = Math.min(lo.y, p[i + 1]!); lo.z = Math.min(lo.z, p[i + 2]!)
    hi.x = Math.max(hi.x, p[i]!); hi.y = Math.max(hi.y, p[i + 1]!); hi.z = Math.max(hi.z, p[i + 2]!)
  }
  return box(id, lo, hi, role)
}

export interface ViseOptions {
  readonly id: string
  /** The stock the vise holds (CAD world). */
  readonly stock: StockBox
  /** The jaws close on the faces normal to this axis (default `x`). */
  readonly axis?: "x" | "y"
  /** How far the jaws rise above the stock bottom, mm (the grip height). */
  readonly gripHeight: number
  /** Jaw thickness, mm (default 20) and how far they extend past the stock sideways, mm (default 10). */
  readonly jawThickness?: number
  readonly overhang?: number
  /** A jaw opening wider than the stock by this much does not touch it (default 0: closed on the stock). */
  readonly slack?: number
  /** Height of the vise bed under the stock bottom, mm (default 30); 0 omits it. */
  readonly bedHeight?: number
}

/** A vise as three bodies: fixed jaw, moving jaw and bed. The jaws close on the stock faces, `slack` opens them. */
export const viseBodies = (o: ViseOptions): ReadonlyArray<FixtureBody> => {
  const axis = o.axis ?? "x", t = o.jawThickness ?? 20, over = o.overhang ?? 10, slack = o.slack ?? 0, bed = o.bedHeight ?? 30
  const s = o.stock
  const across = axis, along = axis === "x" ? "y" : "x"
  const z0 = s.min.z, z1 = s.min.z + o.gripHeight
  const lo = (p: Vec3, a: "x" | "y"): number => p[a]
  // z of the jaw top: the grip height above the stock bottom
  const make = (name: string, side: -1 | 1): FixtureBody => {
    const face = side < 0 ? lo(s.min, across) - slack : lo(s.max, across) + slack
    const a: Record<Axis, number> = { x: 0, y: 0, z: z0 }, b: Record<Axis, number> = { x: 0, y: 0, z: z1 }
    a[across] = face; b[across] = face + side * t
    a[along] = s.min[along] - over; b[along] = s.max[along] + over
    return box(`${o.id}-${name}`, { x: a.x, y: a.y, z: a.z }, { x: b.x, y: b.y, z: b.z }, "jaw")
  }
  const out: FixtureBody[] = [make("fixed", -1), make("moving", 1)]
  if (bed > 0) {
    const jawMin = Math.min(out[0]!.min[across], out[1]!.min[across]), jawMax = Math.max(out[0]!.max[across], out[1]!.max[across])
    const a: Record<Axis, number> = { x: 0, y: 0, z: z0 - bed }, b: Record<Axis, number> = { x: 0, y: 0, z: z0 - 0 }
    a[across] = jawMin; b[across] = jawMax
    a[along] = s.min[along] - over; b[along] = s.max[along] + over
    out.push(supportBody(`${o.id}-bed`, { x: a.x, y: a.y, z: a.z }, { x: b.x, y: b.y, z: b.z }))
  }
  return out
}

interface Contact { readonly id: string; readonly axis: Axis; readonly side: -1 | 1; readonly area: number; readonly role: FixtureBody["role"] | undefined }

const contactsOf = (bodies: ReadonlyArray<FixtureBody>, stock: StockBox): ReadonlyArray<Contact> => {
  const out: Contact[] = []
  for (const b of bodies) for (const a of AXES) {
    const [u, v] = other(a)
    const overlap = (k: Axis): number => Math.max(0, Math.min(b.max[k], stock.max[k]) - Math.max(b.min[k], stock.min[k]))
    const area = overlap(u) * overlap(v)
    if (area <= 0) continue
    // The body's face against the stock's low face (body below / before it) or high face (body after it).
    if (Math.abs(b.max[a] - stock.min[a]) <= TOUCH) out.push({ id: b.id, axis: a, side: -1, area, role: b.role })
    if (Math.abs(b.min[a] - stock.max[a]) <= TOUCH) out.push({ id: b.id, axis: a, side: 1, area, role: b.role })
  }
  return out
}

export interface Holding {
  readonly held: boolean
  readonly detail: string
}

/** Whether the bodies hold `stock` (see the module note). Only meaningful when some body names a role. */
export const holdingOf = (bodies: ReadonlyArray<FixtureBody>, stock: StockBox): Holding => {
  const contacts = contactsOf(bodies, stock)
  const jaws = contacts.filter((c) => c.role === "jaw" && c.area >= MIN_CONTACT)
  for (const a of AXES) {
    const lo = jaws.filter((c) => c.axis === a && c.side === -1), hi = jaws.filter((c) => c.axis === a && c.side === 1)
    if (lo.length > 0 && hi.length > 0) {
      const l = lo[0]!, h = hi[0]!
      return { held: true, detail: `${l.id} and ${h.id} press on opposite ${a.toUpperCase()} faces of the stock (${Math.round(l.area)} and ${Math.round(h.area)} mm² of contact)` }
    }
  }
  const clamp = contacts.find((c) => c.role === "clamp" && c.area >= MIN_CONTACT)
  if (clamp !== undefined) {
    const against = contacts.find((c) => c.axis === clamp.axis && c.side === -clamp.side && c.area >= MIN_CONTACT && c.id !== clamp.id)
    if (against !== undefined) return { held: true, detail: `${clamp.id} presses on the ${clamp.axis.toUpperCase()}${clamp.side > 0 ? "+" : "-"} face against ${against.id} (${Math.round(clamp.area)} mm² of contact)` }
  }
  const touching = contacts.length
  return {
    held: false,
    detail: touching === 0
      ? "no fixture body touches the stock: the jaws or clamps are open or elsewhere, so nothing is shown to hold it"
      : `${touching} contacts with the stock, but no pair of jaws on opposite faces and no clamp against a support with at least ${MIN_CONTACT} mm² of contact`
  }
}
