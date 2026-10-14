/**
 * Assembly checks on the exact model (Fusion's Interference and Bill of Materials): which parts overlap and by how much,
 * which only touch, and the parts list with quantities and masses. Every number comes from the B-rep: the overlap is the
 * exact Boolean intersection of two parts, the mass the exact volume times the material's density.
 */
import { booleanBrep, massProperties, type Brep, type Vec3 } from "./brep/index.ts"
import { brepBox } from "./history-brep.ts"

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
