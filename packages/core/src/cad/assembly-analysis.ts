/**
 * Assembly checks on the exact model (Fusion's Interference, Bill of Materials and joints): which parts overlap and by how much,
 * which only touch, and the parts list with quantities and masses. Every number comes from the B-rep: the overlap is the
 * exact Boolean intersection of two parts, the mass the exact volume times the material's density.
 */
import { booleanBrep, massProperties, type Brep, type Vec3 } from "./brep/index.ts"
import { brepBox } from "./history-brep.ts"
import { holeStacks } from "./smart-fasteners.ts"

export interface AssemblyPart {
  readonly id: string
  readonly name: string
  readonly brep: Brep
  /** Catalogue designation (`ISO 4762 M8x20`): parts with one designation are one BOM row whatever their shape. */
  readonly designation?: string
  readonly material?: string
  /** g/cm³. */
  readonly density?: number
}

export interface Interference {
  readonly a: string
  readonly b: string
  /** Volume of the overlap, mm³. */
  readonly volume: number
  readonly centroid: Vec3
  /** `clash`: a design error. `expected`: an overlap the caller declared (a screw's thread in its tapped hole). */
  readonly kind: "clash" | "expected"
  readonly note?: string
}

export interface InterferenceReport {
  readonly interferences: ReadonlyArray<Interference>
  /** Pairs whose boxes meet but whose solids share no volume (faces in contact, or a gap below the box tolerance). */
  readonly touching: ReadonlyArray<{ readonly a: string; readonly b: string }>
  /** Pairs the exact Boolean could not decide, with its reason: never reported as clear. */
  readonly undetermined: ReadonlyArray<{ readonly a: string; readonly b: string; readonly reason: string }>
  /** Pairs whose boxes overlap, i.e. the pairs that needed a Boolean. */
  readonly checked: number
}

export interface InterferenceOptions {
  /** Overlaps below this volume are contact, not interference, mm³ (default 1e-6). */
  readonly minVolume?: number
  /** Declared overlaps: a note for the pair, or undefined when an overlap would be a clash. */
  readonly expected?: (a: string, b: string) => string | undefined
}

const boxesMeet = (p: { lo: Vec3; hi: Vec3 }, q: { lo: Vec3; hi: Vec3 }, tol: number): boolean =>
  p.lo.x <= q.hi.x + tol && q.lo.x <= p.hi.x + tol && p.lo.y <= q.hi.y + tol && q.lo.y <= p.hi.y + tol && p.lo.z <= q.hi.z + tol && q.lo.z <= p.hi.z + tol

/** Interference of every pair of parts. Pairs whose bounding boxes are apart are clear without a Boolean. */
export const assemblyInterference = (parts: ReadonlyArray<AssemblyPart>, options: InterferenceOptions = {}): InterferenceReport => {
  const minVolume = options.minVolume ?? 1e-6
  const boxes = parts.map((p) => brepBox(p.brep))
  const interferences: Interference[] = []
  const touching: Array<{ a: string; b: string }> = []
  const undetermined: Array<{ a: string; b: string; reason: string }> = []
  let checked = 0
  for (let i = 0; i < parts.length; i++) {
    for (let j = i + 1; j < parts.length; j++) {
      if (!boxesMeet(boxes[i]!, boxes[j]!, 1e-6)) continue
      checked++
      const a = parts[i]!, b = parts[j]!
      let common: Brep
      try {
        common = booleanBrep(a.brep, b.brep, "intersect").brep
      } catch (err) {
        undetermined.push({ a: a.id, b: b.id, reason: err instanceof Error ? err.message : String(err) })
        continue
      }
      const mass = common.faces.length === 0 ? undefined : massProperties(common)
      if (mass === undefined || mass.volume < minVolume) { touching.push({ a: a.id, b: b.id }); continue }
      const note = options.expected?.(a.id, b.id)
      interferences.push({ a: a.id, b: b.id, volume: mass.volume, centroid: mass.centroid, kind: note === undefined ? "clash" : "expected", ...(note !== undefined ? { note } : {}) })
    }
  }
  return { interferences, touching, undetermined, checked }
}

export interface InferredJoint {
  /** The part further along the stacks' downward axis (the base the other sits on), and the part on it. */
  readonly parent: string
  readonly child: string
  /** One shared hole axis leaves the child free to turn about it (a pin); two or more fix it. */
  readonly kind: "revolute" | "fixed"
  /** Where the parts meet on the first shared axis, and that axis (pointing from the child into the parent). */
  readonly origin: Vec3
  readonly axis: Vec3
  /** Distinct hole axes the two parts share. */
  readonly axes: number
}

/**
 * Joints inferred from coaxial holes (Fusion's joints snapped to hole centres): every two parts whose holes touch on a shared
 * axis are joined there, revolute about one axis, fixed by two or more.
 */
export const jointsFromHoles = (bodies: ReadonlyArray<{ readonly id: string; readonly brep: Brep }>): ReadonlyArray<InferredJoint> => {
  const pairs = new Map<string, { parent: string; child: string; origin: Vec3; axis: Vec3; lines: Array<{ origin: Vec3; axis: Vec3 }> }>()
  for (const stack of holeStacks(bodies)) {
    for (let i = 0; i + 1 < stack.holes.length; i++) {
      const upper = stack.holes[i]!, lower = stack.holes[i + 1]!
      if (upper.body === lower.body) continue
      const t = (Math.max(upper.hi, upper.lo) + lower.lo) / 2
      const at = { x: stack.origin.x + stack.axis.x * t, y: stack.origin.y + stack.axis.y * t, z: stack.origin.z + stack.axis.z * t }
      const key = [upper.body, lower.body].sort().join("\u0000")
      const pair = pairs.get(key)
      const sameLine = (l: { origin: Vec3; axis: Vec3 }) => {
        const w = { x: at.x - l.origin.x, y: at.y - l.origin.y, z: at.z - l.origin.z }
        const along = w.x * l.axis.x + w.y * l.axis.y + w.z * l.axis.z
        return Math.abs(Math.abs(l.axis.x * stack.axis.x + l.axis.y * stack.axis.y + l.axis.z * stack.axis.z) - 1) < 1e-6 &&
          Math.hypot(w.x - l.axis.x * along, w.y - l.axis.y * along, w.z - l.axis.z * along) < 0.01
      }
      if (pair === undefined) pairs.set(key, { parent: lower.body, child: upper.body, origin: at, axis: stack.axis, lines: [{ origin: at, axis: stack.axis }] })
      else if (!pair.lines.some(sameLine)) pair.lines.push({ origin: at, axis: stack.axis })
    }
  }
  return [...pairs.values()].map((p) => ({ parent: p.parent, child: p.child, kind: p.lines.length >= 2 ? "fixed" as const : "revolute" as const, origin: p.origin, axis: p.axis, axes: p.lines.length }))
}

export interface BomRow {
  /** 1-based item number, in order of first appearance. */
  readonly item: number
  readonly name: string
  readonly designation?: string
  readonly material?: string
  readonly quantity: number
  /** Exact volume of one part, mm³. */
  readonly volume: number
  /** Mass of one part, g (when the density is known). */
  readonly mass?: number
  readonly parts: ReadonlyArray<string>
}

/**
 * The bill of materials: one row per catalogue designation, or per distinct geometry (same volume, area and topology,
 * whatever the placement) and material for modelled parts.
 */
export const billOfMaterials = (parts: ReadonlyArray<AssemblyPart>): ReadonlyArray<BomRow> => {
  const rows = new Map<string, { name: string; designation?: string; material?: string; volume: number; density?: number; parts: string[] }>()
  for (const p of parts) {
    const m = massProperties(p.brep)
    const sig = p.designation !== undefined
      ? `d:${p.designation}`
      : `g:${p.name}|${p.material ?? ""}|${p.brep.faces.length}/${p.brep.edges.length}|${m.volume.toPrecision(9)}|${m.area.toPrecision(9)}`
    const row = rows.get(sig)
    if (row !== undefined) row.parts.push(p.id)
    else rows.set(sig, {
      name: p.name, volume: m.volume, parts: [p.id],
      ...(p.designation !== undefined ? { designation: p.designation } : {}),
      ...(p.material !== undefined ? { material: p.material } : {}),
      ...(p.density !== undefined ? { density: p.density } : {})
    })
  }
  return [...rows.values()].map((r, k) => ({
    item: k + 1,
    name: r.name,
    ...(r.designation !== undefined ? { designation: r.designation } : {}),
    ...(r.material !== undefined ? { material: r.material } : {}),
    quantity: r.parts.length,
    volume: r.volume,
    // mm³ × g/cm³ / 1000 = g.
    ...(r.density !== undefined ? { mass: (r.volume * r.density) / 1000 } : {}),
    parts: r.parts
  }))
}
