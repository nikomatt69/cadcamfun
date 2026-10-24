/**
 * Machining features read from the exact B-rep (spec 29 §5, "authoritative geometry Seam"): a STEP import, a part the editor
 * rotated, a Boolean result or any parametric part whose history the generator cannot walk is planned like a part with a
 * feature history, instead of falling back to 3D surface strategies that know neither holes nor pockets.
 *
 * What it does, all on the exact model:
 *  - the holes come from `recognizeHoles` (coaxial concave cylinders and cones, counterbores, countersinks, drill points); a hole
 *    drilled along another axis than Z belongs to another setup: it is plugged (`brep/hole-edit.ts`, an exact fill) before the
 *    sections are cut, so it neither refuses the part nor becomes a notch of its outline, and it is counted in `sideHoles`;
 *  - every other face must be machinable from above (a 2.5D part): planar walls, planar floors facing up, the underside at the
 *    lowest level, cylindrical walls parallel to Z. A chamfer, a dome, a sloped face or an undercut makes the whole part a
 *    surface job and the reason is returned (never a silent partial plan);
 *  - the horizontal faces cut the part into slabs of constant cross-section; each slab is sectioned on the watertight
 *    tessellation at its mid height and the loops are nested (material / void). Material must only shrink going up (no bridge,
 *    no cavity), a void may widen going up (a stepped pocket); material standing inside a void is an island of that pocket
 *    (the pocket carries its loop), a pocket inside an island is refused;
 *  - consecutive slabs with the same outer loop merge into one outline, with the same void loop into one pocket.
 *
 * The result has the shape of `historyFeatures` (`generator/history-features.ts`), so the planner, the generator and the DFM
 * see one kind of feature whatever the part came from. Everything is in the element's world coordinates, millimetres.
 */
import { editHole, recognizeHoles, tessellateBrep, transformBrep, type Brep, type RecognizedHole } from "../cad/brep/index.ts"
import type { Transform } from "../cad/brep/math.ts"
import { elementBrep } from "../cad/scene-step.ts"
import type { Vec2 } from "../cad/vec.ts"
import { signedArea } from "../cad/shapes.ts"
import type { HistoryFeatures, MachiningHole, MachiningOutline, MachiningPocket } from "./generator/history-features.ts"
import type { CadElement } from "./generator/schema.ts"

/** Largest distance between the section polygons and the exact surfaces, mm. */
const CHORD = 0.005
/** Two section loops of consecutive slabs are the same loop when every vertex lies this close to the other. */
const LOOP_TOL = 0.02
/** Heights closer than this are one level. */
const LEVEL_TOL = 1e-6
/** A loop is a drilled hole when it is a circle centred this close to the hole axis. */
const HOLE_TOL = 2e-3

export type ExactFeatures = { readonly features: HistoryFeatures; readonly reason?: undefined } | { readonly features?: undefined; readonly reason: string }

interface Section {
  readonly z0: number
  readonly z1: number
  /** Boundaries of the material components (nesting depth 0). */
  readonly outers: ReadonlyArray<ReadonlyArray<Vec2>>
  /** Voids inside the material (depth 1), each with the index of the component that holds it and the islands standing in it (depth 2). */
  readonly voids: ReadonlyArray<{ readonly loop: ReadonlyArray<Vec2>; readonly parent: number; readonly islands: ReadonlyArray<ReadonlyArray<Vec2>> }>
}

const key = (p: Vec2): string => `${Math.round(p.x * 1e5)},${Math.round(p.y * 1e5)}`

/** Even-odd containment of a point in a closed polyline. */
const inside = (p: Vec2, ring: ReadonlyArray<Vec2>): boolean => {
  let c = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!, b = ring[j]!
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c
  }
  return c
}

const distToSegment = (p: Vec2, a: Vec2, b: Vec2): number => {
  const dx = b.x - a.x, dy = b.y - a.y
  const l2 = dx * dx + dy * dy
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

const distToRing = (p: Vec2, ring: ReadonlyArray<Vec2>): number => {
  let d = Infinity
  for (let i = 0; i < ring.length; i++) d = Math.min(d, distToSegment(p, ring[i]!, ring[(i + 1) % ring.length]!))
  return d
}

const sameLoop = (a: ReadonlyArray<Vec2>, b: ReadonlyArray<Vec2>): boolean =>
  a.every((p) => distToRing(p, b) <= LOOP_TOL) && b.every((p) => distToRing(p, a) <= LOOP_TOL)

/** The same set of loops, in any order. */
const sameLoops = (a: ReadonlyArray<ReadonlyArray<Vec2>>, b: ReadonlyArray<ReadonlyArray<Vec2>>): boolean =>
  a.length === b.length && a.every((l) => b.some((m) => sameLoop(l, m)))

/** Closed loops of the intersection of a welded triangle mesh with the plane `z`, or undefined when a chain does not close. */
const sectionLoops = (positions: Float64Array, indices: Uint32Array, z: number): Vec2[][] | undefined => {
  const points = new Map<string, Vec2>()
  const ends: Array<[string, string]> = []
  const cross = (a: number, b: number): Vec2 => {
    const lo = Math.min(a, b), hi = Math.max(a, b)
    const za = positions[lo * 3 + 2]!, zb = positions[hi * 3 + 2]!
    const t = (z - za) / (zb - za)
    return { x: positions[lo * 3]! + (positions[hi * 3]! - positions[lo * 3]!) * t, y: positions[lo * 3 + 1]! + (positions[hi * 3 + 1]! - positions[lo * 3 + 1]!) * t }
  }
  for (let t = 0; t < indices.length; t += 3) {
    const v = [indices[t]!, indices[t + 1]!, indices[t + 2]!] as const
    const up = v.map((i) => positions[i * 3 + 2]! > z)
    if (up[0] === up[1] && up[1] === up[2]) continue
    const found: Vec2[] = []
    for (let e = 0; e < 3; e++) {
      const a = v[e]!, b = v[(e + 1) % 3]!
      if (up[e] !== up[(e + 1) % 3]) found.push(cross(a, b))
    }
    if (found.length !== 2) continue
    const ka = key(found[0]!), kb = key(found[1]!)
    if (ka === kb) continue
    points.set(ka, found[0]!); points.set(kb, found[1]!)
    ends.push([ka, kb])
  }
  const at = new Map<string, number[]>()
  ends.forEach(([a, b], i) => { for (const k of [a, b]) { const l = at.get(k); if (l === undefined) at.set(k, [i]); else l.push(i) } })
  const used = new Array<boolean>(ends.length).fill(false)
  const loops: Vec2[][] = []
  for (let s = 0; s < ends.length; s++) {
    if (used[s]) continue
    used[s] = true
    const start = ends[s]![0]
    const loop: Vec2[] = [points.get(start)!]
    let cur = ends[s]![1]
    while (cur !== start) {
      loop.push(points.get(cur)!)
      const next = at.get(cur)!.find((i) => !used[i])
      if (next === undefined) return undefined
      used[next] = true
      cur = ends[next]![0] === cur ? ends[next]![1] : ends[next]![0]
    }
    if (loop.length >= 3) loops.push(loop)
  }
  return loops
}

/** The loop without the vertices a straight wall gets from the mesh of its neighbours (collinear within 1e-5 mm). */
const simplify = (loop: ReadonlyArray<Vec2>): Vec2[] => {
  let out = [...loop]
  for (let changed = true; changed && out.length > 3;) {
    changed = false
    for (let i = 0; i < out.length && out.length > 3; i++) {
      const a = out[(i + out.length - 1) % out.length]!, b = out[i]!, c = out[(i + 1) % out.length]!
      if (distToSegment(b, a, c) <= 1e-5) { out = out.filter((_, k) => k !== i); changed = true; i-- }
    }
  }
  return out
}

/** Whether a loop is a circle (a drilled hole's section) and where. */
const asCircle = (loop: ReadonlyArray<Vec2>): { readonly center: Vec2; readonly radius: number } | undefined => {
  if (loop.length < 8) return undefined
  const center = { x: loop.reduce((s, p) => s + p.x, 0) / loop.length, y: loop.reduce((s, p) => s + p.y, 0) / loop.length }
  const radius = loop.reduce((s, p) => s + Math.hypot(p.x - center.x, p.y - center.y), 0) / loop.length
  return loop.every((p) => Math.abs(Math.hypot(p.x - center.x, p.y - center.y) - radius) <= Math.max(0.02, radius * 0.01)) ? { center, radius } : undefined
}

const holeReach = (h: RecognizedHole): number => Math.max(h.diameter, h.headDiameter ?? 0, ...h.segments.flatMap((s) => [s.diameterStart, s.diameterEnd])) / 2

/**
 * The solid with its holes along other axes than Z filled, and those holes; or the reason one cannot be filled exactly (the part
 * is then refused as a whole, like any other feature this recogniser cannot place).
 */
const plugSideHoles = (b: Brep): { readonly brep: Brep; readonly plugged: ReadonlyArray<RecognizedHole> } | string => {
  let brep = b
  const plugged: RecognizedHole[] = []
  // Each fill changes the solid, so the holes are read again and the first side hole filled, until none is left.
  for (let guard = 0; guard < 64; guard++) {
    const side = recognizeHoles(brep).find((h) => Math.abs(h.direction.x) > 1e-6 || Math.abs(h.direction.y) > 1e-6)
    if (side === undefined) return { brep, plugged }
    const r = editHole(brep, side, { kind: "fill" })
    if (typeof r === "string") return `has a hole that is not parallel to Z and cannot be filled exactly (${r}); it needs another setup or 3+2 indexing`
    brep = r.brep
    plugged.push(side)
  }
  return "has more than 64 holes along other axes"
}

/** The 2.5D machining features of an exact solid, or why it is not machinable from above as one setup. */
export const brepFeatures = (original: Brep, name = "part"): ExactFeatures => {
  const refuse = (reason: string): ExactFeatures => ({ reason: `${name}: ${reason}` })
  const side = plugSideHoles(original)
  if (typeof side === "string") return refuse(side)
  const b = side.brep
  const holes = recognizeHoles(b)

  // 1. Every face is a hole wall, a vertical wall or a horizontal floor.
  const inHole = new Set<number>()
  for (const h of holes) for (const s of h.segments) for (const f of s.faces) inHole.add(f)
  const ups: number[] = []
  const downs: number[] = []
  for (let fi = 0; fi < b.faces.length; fi++) {
    if (inHole.has(fi)) continue
    const f = b.faces[fi]!
    const s = f.surface
    if (s.kind === "plane") {
      const n = s.frame.z, flip = f.reversed ? -1 : 1
      const nz = n.z * flip
      if (Math.abs(n.z) < 1e-6) continue
      if (Math.abs(Math.abs(n.z) - 1) > 1e-6) return refuse("has a sloped planar face; it needs 3D surface machining")
      ;(nz > 0 ? ups : downs).push(s.frame.origin.z)
    } else if (s.kind === "cylinder") {
      if (Math.abs(Math.abs(s.frame.z.z) - 1) > 1e-9) return refuse("has a cylindrical face that is not parallel to Z; it needs another setup or 3D surface machining")
    } else return refuse(`has a ${s.kind} face outside any hole (a chamfer, a fillet, a dome or a freeform surface); it needs 3D surface machining`)
  }
  for (const h of holes) if (Math.abs(h.direction.x) > 1e-6 || Math.abs(h.direction.y) > 1e-6) return refuse("has a hole that is not parallel to Z; it needs another setup or 3+2 indexing")

  // 2. Slabs between the levels of the horizontal faces.
  const mesh = tessellateBrep(b, { chordTol: CHORD })
  let zMin = Infinity, zMax = -Infinity
  const min = { x: Infinity, y: Infinity }, max = { x: -Infinity, y: -Infinity }
  for (let i = 0; i < mesh.positions.length; i += 3) {
    zMin = Math.min(zMin, mesh.positions[i + 2]!); zMax = Math.max(zMax, mesh.positions[i + 2]!)
    min.x = Math.min(min.x, mesh.positions[i]!); max.x = Math.max(max.x, mesh.positions[i]!)
    min.y = Math.min(min.y, mesh.positions[i + 1]!); max.y = Math.max(max.y, mesh.positions[i + 1]!)
  }
  if (!(zMax - zMin > LEVEL_TOL)) return refuse("has no height")
  if (downs.some((z) => Math.abs(z - zMin) > 1e-4)) return refuse("has a downward face above the underside (an undercut); it is not machinable from above")
  const levels: number[] = []
  for (const z of [zMin, ...ups.filter((u) => u > zMin + LEVEL_TOL && u < zMax - LEVEL_TOL), zMax].sort((p, q) => p - q)) {
    if (levels.length === 0 || z - levels[levels.length - 1]! > LEVEL_TOL) levels.push(z)
  }

  // 3. Section of each slab, minus the drilled holes.
  const drilled = (loop: ReadonlyArray<Vec2>): boolean => {
    const c = asCircle(loop)
    return c !== undefined && holes.some((h) => Math.hypot(h.entry.x - c.center.x, h.entry.y - c.center.y) <= HOLE_TOL + 0.01 * c.radius && c.radius <= holeReach(h) + 0.02)
  }
  const sections: Section[] = []
  for (let i = 0; i + 1 < levels.length; i++) {
    const z0 = levels[i]!, z1 = levels[i + 1]!
    const all = sectionLoops(mesh.positions, mesh.indices, (z0 + z1) / 2)
    if (all === undefined) return refuse(`section at Z ${((z0 + z1) / 2).toFixed(3)} does not close; the solid is not watertight`)
    const loops = all.map(simplify).filter((l) => !drilled(l))
    const depth = loops.map((l, k) => loops.reduce((n, o, j) => n + (j !== k && inside(l[0]!, o) ? 1 : 0), 0))
    if (depth.some((d) => d >= 3)) return refuse("has a pocket cut into an island standing inside a pocket; it needs the surface strategies")
    const outers: Vec2[][] = []
    const voids: Array<{ loop: Vec2[]; parent: number; islands: Vec2[][] }> = []
    loops.forEach((l, k) => { if (depth[k] === 0) outers.push(l) })
    loops.forEach((l, k) => {
      if (depth[k] === 1) voids.push({ loop: l, parent: outers.findIndex((o) => inside(l[0]!, o)), islands: [] })
    })
    // An island belongs to the void that holds it: the innermost loop around it that is a void.
    loops.forEach((l, k) => {
      if (depth[k] !== 2) return
      const holder = voids.find((v) => inside(l[0]!, v.loop))
      if (holder === undefined) throw new Error("brepFeatures: an island has no void around it")
      holder.islands.push(l)
    })
    sections.push({ z0, z1, outers, voids })
  }
  if (sections.length === 0) return refuse("has no material section")

  // 4. Material only shrinks going up: no bridge, no cavity under a roof.
  const material = (s: Section, p: Vec2): boolean =>
    s.outers.some((o) => inside(p, o)) && !s.voids.some((v) => inside(p, v.loop) && !v.islands.some((i) => inside(p, i)))
  const near = (s: Section, p: Vec2): boolean => [...s.outers, ...s.voids.flatMap((v) => [v.loop, ...v.islands])].some((l) => distToRing(p, l) <= LOOP_TOL)
  for (let i = 1; i < sections.length; i++) {
    const below = sections[i - 1]!, here = sections[i]!
    const loops = [...here.outers, ...here.voids.flatMap((v) => [v.loop, ...v.islands])]
    for (const l of loops) for (const p of l) if (!near(below, p) && !material(below, p)) return refuse(`has material at Z ${here.z0.toFixed(3)} that overhangs the level below (a bridge or a cavity); it is not machinable from above`)
  }

  // 5. Outlines and pockets, merged across slabs.
  type Span<T> = { loop: T; z0: number; z1: number; islands?: ReadonlyArray<ReadonlyArray<Vec2>> }
  const outlines: Array<Span<Vec2[]>> = []
  const pockets: Array<Span<Vec2[]>> = []
  const open = { outline: [] as Array<Span<Vec2[]>>, pocket: [] as Array<Span<Vec2[]>> }
  for (const s of sections) {
    const nextOutline: Array<Span<Vec2[]>> = []
    for (const o of s.outers) {
      const prev = open.outline.find((x) => sameLoop(x.loop, o))
      if (prev !== undefined) { prev.z1 = s.z1; nextOutline.push(prev) } else { const x = { loop: [...o], z0: s.z0, z1: s.z1 }; outlines.push(x); nextOutline.push(x) }
    }
    open.outline = nextOutline
    const nextPocket: Array<Span<Vec2[]>> = []
    for (const v of s.voids) {
      // Slabs merge into one pocket only when the loop and the islands standing in it are the same.
      const prev = open.pocket.find((x) => sameLoop(x.loop, v.loop) && sameLoops(x.islands ?? [], v.islands))
      if (prev !== undefined) { prev.z1 = s.z1; nextPocket.push(prev) } else { const x = { loop: [...v.loop], z0: s.z0, z1: s.z1, islands: v.islands.map((i) => [...i]) }; pockets.push(x); nextPocket.push(x) }
    }
    open.pocket = nextPocket
  }

  const ccw = (l: ReadonlyArray<Vec2>): Vec2[] => (signedArea(l) >= 0 ? [...l] : [...l].reverse())
  const machiningHoles: MachiningHole[] = holes.map((h, i) => ({
    id: `hole-${i + 1}`, source: "brep", entry: h.entry, direction: h.direction, diameter: h.diameter, depth: h.depth, kind: h.form,
    ...(h.headDiameter !== undefined ? { headDiameter: h.headDiameter } : {}), ...(h.headDepth !== undefined ? { headDepth: h.headDepth } : {})
  }))
  const machiningPockets: MachiningPocket[] = pockets.sort((p, q) => q.z1 - p.z1 || q.z0 - p.z0)
    .map((p, i) => ({
      id: `pocket-${i + 1}`, feature: "brep", loop: ccw(p.loop), top: p.z1, floor: p.z0,
      ...(p.islands !== undefined && p.islands.length > 0 ? { islands: p.islands.map(ccw) } : {})
    }))
  const machiningOutlines: MachiningOutline[] = outlines.sort((p, q) => q.z1 - p.z1)
    .map((o, i) => ({ id: `outline-${i + 1}`, feature: "brep", outer: ccw(o.loop), inner: [], top: o.z1, bottom: o.z0 }))
  return {
    features: {
      holes: machiningHoles, pockets: machiningPockets, outlines: machiningOutlines, turned: [],
      bounds: { min: { x: min.x, y: min.y, z: zMin }, max: { x: max.x, y: max.y, z: zMax } },
      ...(side.plugged.length > 0 ? { sideHoles: side.plugged.length } : {}),
      notes: [
        `${name}: ${machiningHoles.length} holes, ${machiningPockets.length} pockets and ${machiningOutlines.length} outlines recognised on the exact B-rep`,
        ...(side.plugged.length > 0 ? [`${name}: ${side.plugged.length} hole(s) along other axes (${side.plugged.map((h) => `Ø${Math.round(h.diameter * 1000) / 1000} along ${["x", "y", "z"].map((k) => `${k}${Math.round((h.direction as unknown as Record<string, number>)[k]! * 100) / 100}`).join(" ")}`).join(", ")}) are left to their own setup`] : [])
      ]
    }
  }
}

const cache = new WeakMap<object, ExactFeatures>()

/**
 * The features of a drawing element that has an exact model and no feature history the generator can read: a `brep` element
 * (STEP import), or a parametric part the editor rotated / scaled. Undefined for every other element. The element is placed
 * exactly as the viewport and the CAM place its mesh (`elementBrep`). An explicit setup transform also enables exact
 * recognition of catalogue solids, so a refixtured box is not needlessly routed through ball-nose surface finishing.
 */
export const exactFeatures = (e: CadElement, byId: ReadonlyMap<string, CadElement> = new Map(), transform?: Transform): ExactFeatures | undefined => {
  const type = e["type"]
  if (type !== "brep" && type !== "parametric" && transform === undefined) return undefined
  const hit = transform === undefined ? cache.get(e) : undefined
  if (hit !== undefined) return hit
  const name = typeof e["name"] === "string" && e["name"] !== "" ? (e["name"] as string) : String(e["id"] ?? type)
  let result: ExactFeatures
  try {
    const placed = elementBrep(e, byId)
    result = placed.brep === undefined ? { reason: `${name}: no exact model (${placed.reason})` } : brepFeatures(transform === undefined ? placed.brep : transformBrep(placed.brep, transform), name)
  } catch (cause) {
    result = { reason: `${name}: exact feature recognition failed (${cause instanceof Error ? cause.message : String(cause)})` }
  }
  if (transform === undefined) cache.set(e, result)
  return result
}
