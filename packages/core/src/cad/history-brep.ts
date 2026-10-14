/**
 * The exact model of a parametric history: the same features `rebuild` replays as meshes, replayed as exact B-reps
 * (`brep/`) from the parameters and the solved sketches `rebuild` already computed. One history, two views of each body:
 * the mesh for the viewport and the CAM's dexels, the B-rep for measuring, STEP exchange and the operations a mesh cannot
 * carry (exact Booleans, face and edge selection).
 *
 * Exact today: extrude (with rounded or bevelled profile corners, and its end rims filleted or chamfered), revolve, hole
 * (simple, counterbore, countersink), fillet and chamfer of straight edges and plane-cylinder rims, the shell of an
 * extrusion (its profile offset exactly by `offsetLoop`), the analytic catalogue primitives (cube, cylinder, cone, sphere,
 * hemisphere, torus, prism, pyramid) with their rotation, move, uniform scale, mirror, pattern, split and combine, and the
 * union / subtract / intersect of every tool. A body that went through anything else (the shell of a revolution or a
 * sweep, sweep, loft, coil, drafts, blends of curved edges, a non-uniform scale, another catalogue element) keeps its mesh
 * and says why it has no exact model; nothing is approximated behind the caller's back.
 */
import { dimensionValue, type Dimension } from "./expr.ts"
import { polygonArea, sketchProfiles, type Sketch } from "./sketch.ts"
import { length3, sub3 } from "./vec.ts"
import { rebuild, type Feature, type History, type PlaneName, type RebuildResult } from "./history.ts"
import {
  blendBrep,
  blendCandidates,
  booleanBrep,
  BooleanError,
  brepLocator,
  compose,
  edgePointAt,
  extrudeProfile,
  frame,
  makeBox,
  makeCone,
  makeSphere,
  makeTorus,
  draftPlanarFace,
  normalizeProfile,
  offsetLoop,
  pickPlanarFace,
  pieceEnd,
  pieceLength,
  pieceTangent,
  polyhedron,
  revolveProfile,
  sweepPath,
  rotation,
  segmentEnd,
  segmentPoint,
  segmentStart,
  selectBlendEdges,
  treatLoopCorners,
  tessellateBrep,
  massProperties,
  validateBrep,
  writeStepBreps,
  type StepWriteOptions,
  transformBrep,
  translation,
  uniformScale,
  type Brep,
  type Frame,
  type PathFrame,
  type PathPiece,
  type ProfileLoop,
  type ProfileSegment,
  type Transform,
  type Vec2,
  type Vec3
} from "./brep/index.ts"

const PLANES: Readonly<Record<PlaneName, { readonly u: Vec3; readonly v: Vec3; readonly n: Vec3 }>> = {
  XY: { u: { x: 1, y: 0, z: 0 }, v: { x: 0, y: 1, z: 0 }, n: { x: 0, y: 0, z: 1 } },
  YZ: { u: { x: 0, y: 1, z: 0 }, v: { x: 0, y: 0, z: 1 }, n: { x: 1, y: 0, z: 0 } },
  ZX: { u: { x: 0, y: 0, z: 1 }, v: { x: 1, y: 0, z: 0 }, n: { x: 0, y: 1, z: 0 } }
}

/** Placement of a sketch plane at `offset` along its normal (x = u, y = v, z = normal). */
export const sketchPlaneFrame = (plane: PlaneName, offset: number, along = 0): Frame => {
  const p = PLANES[plane]
  const d = offset + along
  return frame({ x: p.n.x * d, y: p.n.y * d, z: p.n.z * d }, p.n, p.u)
}

// ================================================================ exact sketch profiles

/**
 * Closed loops of a solved sketch with their exact lines, arcs and circles (the companion of `sketchProfiles`, which
 * returns polygons). Arcs run counter-clockwise from start to end, as the sketcher draws them.
 */
export const exactSketchLoops = (sketch: Sketch): { readonly loops: ProfileLoop[]; readonly open: number } => {
  const pts = new Map<string, Vec2>()
  for (const e of sketch.entities) if (e.kind === "point") pts.set(e.id, { x: e.x, y: e.y })
  const at = (id: string): Vec2 => {
    const p = pts.get(id)
    if (p === undefined) throw new RangeError(`'${id}' is not a point of the sketch`)
    return p
  }
  interface Piece { readonly a: string; readonly b: string; readonly seg: ProfileSegment }
  const pieces: Piece[] = []
  const loops: ProfileLoop[] = []
  for (const e of sketch.entities) {
    if (e.kind === "line") pieces.push({ a: e.p1, b: e.p2, seg: { kind: "line", a: at(e.p1), b: at(e.p2) } })
    else if (e.kind === "arc") {
      const c = at(e.center), s = at(e.start), t = at(e.end)
      const a0 = Math.atan2(s.y - c.y, s.x - c.x)
      let sweep = Math.atan2(t.y - c.y, t.x - c.x) - a0
      while (sweep <= 1e-12) sweep += 2 * Math.PI
      pieces.push({ a: e.start, b: e.end, seg: { kind: "arc", center: c, radius: Math.hypot(s.x - c.x, s.y - c.y), start: a0, end: a0 + sweep } })
    } else if (e.kind === "circle") loops.push([{ kind: "arc", center: at(e.center), radius: e.radius, start: 0, end: 2 * Math.PI }])
  }
  const reverse = (s: ProfileSegment): ProfileSegment => (s.kind === "line" ? { kind: "line", a: s.b, b: s.a } : s.kind === "arc" ? { ...s, start: s.end, end: s.start } : s)
  const used = new Set<number>()
  let open = 0
  for (let i = 0; i < pieces.length; i++) {
    if (used.has(i)) continue
    used.add(i)
    const chain: ProfileSegment[] = [pieces[i]!.seg]
    const start = pieces[i]!.a
    let head = pieces[i]!.b
    while (head !== start) {
      const next = pieces.findIndex((p, k) => !used.has(k) && (p.a === head || p.b === head))
      if (next < 0) break
      used.add(next)
      const p = pieces[next]!
      const forward = p.a === head
      chain.push(forward ? p.seg : reverse(p.seg))
      head = forward ? p.b : p.a
    }
    if (head === start) loops.push(chain)
    else open++
  }
  return { loops, open }
}

/** Point-in-loop by sampling the loop's segments (even-odd). */
const insideLoop = (p: Vec2, loop: ProfileLoop): boolean => {
  const ring: Vec2[] = []
  for (const s of loop) {
    const n = s.kind === "line" ? 1 : 48
    for (let k = 0; k < n; k++) ring.push(segmentPoint(s, k / n))
  }
  let c = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!, b = ring[j]!
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c
  }
  return c
}

/** Loops grouped into profiles by even-odd nesting: each solid loop with the holes directly inside it. */
export const profilesOfLoops = (loops: ReadonlyArray<ProfileLoop>): Array<{ readonly loops: ProfileLoop[] }> => {
  // A loop is nested in another only when all of it is inside: loops whose boundaries cross (two overlapping circles, the
  // mixer's figure-eight boss) are separate regions, extruded apart and united, as the mesh rebuild unites them. One probe
  // point per loop took the second circle for a hole of the first.
  const probes = loops.map((l) => l.flatMap((s) => [0.25, 0.5, 0.75].map((f) => segmentPoint(s, f))))
  const within = (i: number, j: number): boolean => probes[i]!.every((p) => insideLoop(p, loops[j]!))
  const depth = loops.map((_, i) => loops.filter((_, j) => j !== i && within(i, j)).length)
  const out: Array<{ loops: ProfileLoop[] }> = []
  loops.forEach((l, i) => {
    if (depth[i]! % 2 !== 0) return
    const holes = loops.filter((_, j) => depth[j] === depth[i]! + 1 && within(j, i))
    out.push({ loops: [l, ...holes] })
  })
  return out
}

// ================================================================ replay

export interface ExactBody {
  readonly id: string
  readonly feature: string
  /** The exact solid, when every feature that shaped the body has an exact counterpart. */
  readonly brep?: Brep
  /** Why there is no exact solid (the first feature that had none). */
  readonly reason?: string
}

export interface ExactRebuild {
  readonly result: RebuildResult
  /** One entry per body of `result.bodies`, same ids, same order. */
  readonly bodies: ReadonlyArray<ExactBody>
  readonly warnings: ReadonlyArray<string>
}

type Exact = { readonly brep: Brep; readonly reason?: undefined } | { readonly brep?: undefined; readonly reason: string }

const ok = (brep: Brep): Exact => ({ brep })
const no = (reason: string): Exact => ({ reason })

const unionAll = (parts: ReadonlyArray<Brep>): Brep => parts.slice(1).reduce((acc, b) => booleanBrep(acc, b, "union").brep, parts[0]!)

type SketchFrame = { readonly origin: Vec3; readonly u: Vec3; readonly v: Vec3; readonly n: Vec3 }
const onFrame = (F: SketchFrame, p: Vec2): Vec3 => ({ x: F.origin.x + F.u.x * p.x + F.v.x * p.y, y: F.origin.y + F.u.y * p.x + F.v.y * p.y, z: F.origin.z + F.u.z * p.x + F.v.z * p.y })

/**
 * A sweep path as exact pieces in world space, in the order the mesh rebuild walks it (`sketchProfiles`: from the first line or
 * arc of the sketch, forward through shared points), or one circle as a closed ring starting at angle 0. A sketch with
 * anything else (several chains, a spline) is the reason.
 */
export const exactSketchPath = (sketch: Sketch, F: SketchFrame): { readonly pieces: PathPiece[]; readonly closed: boolean } | string => {
  const pts = new Map<string, Vec2>()
  for (const e of sketch.entities) if (e.kind === "point") pts.set(e.id, { x: e.x, y: e.y })
  const at = (id: string): Vec2 => pts.get(id)!
  const edges = sketch.entities.filter((e) => e.kind === "line" || e.kind === "arc")
  const circles = sketch.entities.filter((e) => e.kind === "circle")
  if (edges.length === 0) {
    if (circles.length !== 1 || circles[0]!.kind !== "circle") return "the path sketch must hold one chain of lines and arcs, or one closed loop"
    const c = at(circles[0]!.center), r = circles[0]!.radius
    return { pieces: [{ kind: "arc", center: onFrame(F, c), axis: F.n, from: onFrame(F, { x: c.x + r, y: c.y }), angle: 2 * Math.PI }], closed: true }
  }
  if (circles.length > 0) return "the path sketch must hold one chain of lines and arcs, or one closed loop"
  const ends = (e: (typeof edges)[number]) => (e.kind === "line" ? [e.p1, e.p2] : e.kind === "arc" ? [e.start, e.end] : [])
  const piece = (e: (typeof edges)[number], forward: boolean): PathPiece => {
    if (e.kind === "line") { const [a, b] = forward ? [at(e.p1), at(e.p2)] : [at(e.p2), at(e.p1)]; return { kind: "line", a: onFrame(F, a), b: onFrame(F, b) } }
    const arc = e as Extract<(typeof edges)[number], { kind: "arc" }>
    const c = at(arc.center), s = at(arc.start), t = at(arc.end)
    const a0 = Math.atan2(s.y - c.y, s.x - c.x)
    let sweep = Math.atan2(t.y - c.y, t.x - c.x) - a0
    while (sweep <= 1e-12) sweep += 2 * Math.PI
    // Counter-clockwise in the sketch from start to end: about the sketch normal; walked backwards, about its opposite.
    return { kind: "arc", center: onFrame(F, c), axis: forward ? F.n : { x: -F.n.x, y: -F.n.y, z: -F.n.z }, from: onFrame(F, forward ? s : t), angle: sweep }
  }
  const used = new Set<number>([0])
  const pieces: PathPiece[] = [piece(edges[0]!, true)]
  const start = ends(edges[0]!)[0]!
  let head = ends(edges[0]!)[1]!
  for (;;) {
    if (head === start) break
    const next = edges.findIndex((e, i) => !used.has(i) && ends(e).includes(head))
    if (next < 0) break
    used.add(next)
    const forward = ends(edges[next]!)[0] === head
    pieces.push(piece(edges[next]!, forward))
    head = ends(edges[next]!)[forward ? 1 : 0]!
  }
  if (used.size !== edges.length) return "the path sketch must hold one chain of lines and arcs, or one closed loop"
  return { pieces, closed: head === start }
}

/**
 * The path with every corner between two straight runs that turns more than 5 degrees replaced by a tangent bend of centre-line
 * radius `radius` (the mesh rebuild's `roundPath`, with true arcs); a sharp corner next to an arc is the reason.
 */
export const roundExactPath = (pieces: ReadonlyArray<PathPiece>, radius: number): PathPiece[] | string => {
  const out: PathPiece[] = pieces.map((p) => ({ ...p }))
  const setbacks = out.map(() => [0, 0])
  const bends: Array<PathPiece | undefined> = out.map(() => undefined)
  for (let i = 0; i + 1 < out.length; i++) {
    const d1 = pieceTangent(out[i]!, true), d2 = pieceTangent(out[i + 1]!, false)
    const turnAngle = Math.acos(Math.max(-1, Math.min(1, d1.x * d2.x + d1.y * d2.y + d1.z * d2.z)))
    if (turnAngle < (5 * Math.PI) / 180) continue
    if (out[i]!.kind !== "line" || out[i + 1]!.kind !== "line") return "a sharp corner next to an arc of the path has no exact bend"
    const phi = Math.PI - turnAngle
    const s = radius / Math.tan(phi / 2)
    setbacks[i]![1] = s
    setbacks[i + 1]![0] = s
    const B = pieceEnd(out[i]!)
    const t1 = { x: B.x - d1.x * s, y: B.y - d1.y * s, z: B.z - d1.z * s }
    const axis = (() => { const c = { x: d1.y * d2.z - d1.z * d2.y, y: d1.z * d2.x - d1.x * d2.z, z: d1.x * d2.y - d1.y * d2.x }; const l = Math.hypot(c.x, c.y, c.z); return { x: c.x / l, y: c.y / l, z: c.z / l } })()
    // The centre is square to the incoming run at the bend's start, on the inside of the turn.
    const inward = { x: axis.y * d1.z - axis.z * d1.y, y: axis.z * d1.x - axis.x * d1.z, z: axis.x * d1.y - axis.y * d1.x }
    bends[i] = { kind: "arc", center: { x: t1.x + inward.x * radius, y: t1.y + inward.y * radius, z: t1.z + inward.z * radius }, axis, from: t1, angle: turnAngle }
  }
  const result: PathPiece[] = []
  for (let i = 0; i < out.length; i++) {
    const p = out[i]! as Extract<PathPiece, { kind: "line" }> | Extract<PathPiece, { kind: "arc" }>
    if (p.kind === "line") {
      const L = pieceLength(p), [s0, s1] = setbacks[i]!
      if (s0! + s1! > L + 1e-9) return `A bend radius of ${radius} mm needs ${(s0! + s1!).toFixed(2)} mm of the ${L.toFixed(2)} mm straight run ${i + 1}`
      const d = pieceTangent(p, false)
      const a = { x: p.a.x + d.x * s0!, y: p.a.y + d.y * s0!, z: p.a.z + d.z * s0! }, b = { x: p.b.x - d.x * s1!, y: p.b.y - d.y * s1!, z: p.b.z - d.z * s1! }
      if (pieceLength({ kind: "line", a, b }) > 1e-9) result.push({ kind: "line", a, b })
    } else result.push(p)
    if (bends[i] !== undefined) result.push(bends[i]!)
  }
  return result
}

/** The path shortened by `s` at its start (negative: carried on straight by -s), with the frame carried to its new start. */
const trimPathStart = (pieces: ReadonlyArray<PathPiece>, s: number, start: PathFrame): { pieces: PathPiece[]; start: PathFrame } | string => {
  if (s < 0) {
    const p0 = pieces[0]!, t = pieceTangent(p0, false), a = p0.kind === "line" ? p0.a : p0.from
    return { pieces: [{ kind: "line", a: { x: a.x + t.x * s, y: a.y + t.y * s, z: a.z + t.z * s }, b: a }, ...pieces], start }
  }
  const rest = [...pieces]
  let left = s, X = start.x, Y = start.y
  while (left > 1e-12) {
    const p = rest[0]
    if (p === undefined) return "The wall is thicker than the path is long"
    const L = pieceLength(p)
    if (L > left + 1e-9) {
      if (p.kind === "line") { const d = pieceTangent(p, false); rest[0] = { kind: "line", a: { x: p.a.x + d.x * left, y: p.a.y + d.y * left, z: p.a.z + d.z * left }, b: p.b } }
      else {
        const phi = left / length3(sub3(p.from, p.center))
        const turnBy = (v: Vec3) => applyPointRotation(p.axis, phi, v)
        rest[0] = { kind: "arc", center: p.center, axis: p.axis, from: add3v(p.center, turnBy(sub3(p.from, p.center))), angle: p.angle - phi }
        X = turnBy(X); Y = turnBy(Y)
      }
      break
    }
    // The whole piece goes: carry the frame across it and the corner after it.
    if (p.kind === "arc") { X = applyPointRotation(p.axis, p.angle, X); Y = applyPointRotation(p.axis, p.angle, Y) }
    rest.shift()
    if (rest[0] !== undefined) {
      const t0 = pieceTangent(p, true), t1 = pieceTangent(rest[0], false)
      const c = { x: t0.y * t1.z - t0.z * t1.y, y: t0.z * t1.x - t0.x * t1.z, z: t0.x * t1.y - t0.y * t1.x }, l = Math.hypot(c.x, c.y, c.z)
      if (l > 1e-12) { const k = { x: c.x / l, y: c.y / l, z: c.z / l }, ang = Math.atan2(l, t0.x * t1.x + t0.y * t1.y + t0.z * t1.z); X = applyPointRotation(k, ang, X); Y = applyPointRotation(k, ang, Y) }
    }
    left -= L
  }
  return { pieces: rest, start: { x: X, y: Y } }
}
const add3v = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z })
const applyPointRotation = (axis: Vec3, angle: number, v: Vec3): Vec3 => {
  const c = Math.cos(angle), s = Math.sin(angle), d = axis.x * v.x + axis.y * v.y + axis.z * v.z
  const x = { x: axis.y * v.z - axis.z * v.y, y: axis.z * v.x - axis.x * v.z, z: axis.x * v.y - axis.y * v.x }
  return { x: v.x * c + x.x * s + axis.x * d * (1 - c), y: v.y * c + x.y * s + axis.y * d * (1 - c), z: v.z * c + x.z * s + axis.z * d * (1 - c) }
}
/** The path reversed: the same pieces walked from its end. */
const reversePath = (pieces: ReadonlyArray<PathPiece>): PathPiece[] => [...pieces].reverse().map((p): PathPiece => p.kind === "line" ? { kind: "line", a: p.b, b: p.a } : { kind: "arc", center: p.center, axis: { x: -p.axis.x, y: -p.axis.y, z: -p.axis.z }, from: pieceEnd(p), angle: p.angle })

/** The mesh sweep's start frame: the rotation that takes the profile plane's normal to the path's first tangent, applied to its axes. */
const sweepStartFrame = (F: SketchFrame, t0: Vec3): PathFrame => {
  const d = Math.max(-1, Math.min(1, F.n.x * t0.x + F.n.y * t0.y + F.n.z * t0.z))
  if (d > 1 - 1e-12) return { x: F.u, y: F.v }
  let axis = { x: F.n.y * t0.z - F.n.z * t0.y, y: F.n.z * t0.x - F.n.x * t0.z, z: F.n.x * t0.y - F.n.y * t0.x }
  if (Math.hypot(axis.x, axis.y, axis.z) < 1e-9) {
    const a = F.n, ref = Math.abs(a.x) < 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 }
    axis = { x: a.y * ref.z - a.z * ref.y, y: a.z * ref.x - a.x * ref.z, z: a.x * ref.y - a.y * ref.x }
  }
  const l = Math.hypot(axis.x, axis.y, axis.z), k = { x: axis.x / l, y: axis.y / l, z: axis.z / l }
  const angle = Math.acos(d)
  return { x: applyPointRotation(k, angle, F.u), y: applyPointRotation(k, angle, F.v) }
}

/**
 * The cavity profile of a shelled revolution, exactly as the mesh rebuild's `shellRevolveProfile` builds it from a polygon:
 * a profile that touches the axis is mirrored across it into a closed section, moved inwards by the wall (`offsetLoop`),
 * cut back to the half-plane x >= 0 (by symmetry the joints between the chain and its mirror lie on the axis, so the cut is
 * the chain's own pieces plus a line along the axis), and an open end (`top`: largest axial position) is pushed out by
 * the wall plus 1 mm. Profile x is the distance from the axis, y the position along it.
 */
export const revolveShellLoop = (loop: ProfileLoop, t: number, open: "none" | "top" | "bottom" | "both"): ProfileLoop => {
  const tol = 1e-7
  const onAxis = (s: ProfileSegment) => s.kind === "line" && Math.abs(s.a.x) <= tol && Math.abs(s.b.x) <= tol
  const n = loop.length
  let inner: ProfileSegment[]
  if (!loop.some(onAxis)) {
    inner = [...offsetLoop(loop, t)]
  } else {
    // The open chain off the axis, from the end of the axis run round to its start.
    const startAt = loop.findIndex((s, i) => onAxis(s) && !onAxis(loop[(i + 1) % n]!))
    const chain: ProfileSegment[] = []
    for (let k = 1; k < n; k++) {
      const s = loop[(startAt + k) % n]!
      if (onAxis(s)) break
      chain.push(s)
    }
    if (chain.length + loop.filter(onAxis).length !== n) throw new RangeError("the profile of a revolution to shell touches its axis more than once")
    const mirror = (s: ProfileSegment): ProfileSegment => {
      if (s.kind === "line") return { kind: "line", a: { x: -s.b.x, y: s.b.y }, b: { x: -s.a.x, y: s.a.y } }
      if (s.kind === "arc") return { kind: "arc", center: { x: -s.center.x, y: s.center.y }, radius: s.radius, start: Math.PI - s.end, end: Math.PI - s.start }
      throw new RangeError("a spline in the profile of a revolution has no exact shell")
    }
    const full = [...chain, ...[...chain].reverse().map(mirror)]
    const moved = offsetLoop(full, t)
    // The chain's pieces (the first half) run from the axis back to the axis.
    inner = moved.slice(0, chain.length)
    const first = segmentStart(inner[0]!), last = segmentEnd(inner[inner.length - 1]!)
    if (Math.abs(first.x) > 1e-6 || Math.abs(last.x) > 1e-6) throw new RangeError(`A ${t} mm wall leaves no cavity in this revolution`)
    inner.push({ kind: "line", a: { x: 0, y: last.y }, b: { x: 0, y: first.y } })
  }
  for (const s of inner) for (let k = 0; k <= 8; k++) if (segmentPoint(s, k / 8).x < -1e-9) throw new RangeError(`A ${t} mm wall leaves no cavity in this revolution`)
  // Open ends: the flat inner face at the end is pushed out, its straight walls lengthened with it.
  const push = (which: "top" | "bottom") => {
    const ys = inner.flatMap((s) => [segmentStart(s).y, segmentEnd(s).y])
    const y0 = which === "top" ? Math.max(...ys) : Math.min(...ys)
    const y1 = y0 + (which === "top" ? 1 : -1) * (t + 1)
    const at = (p: Vec2) => Math.abs(p.y - y0) <= 1e-9
    const flat = inner.map((s) => s.kind === "line" && at(s.a) && at(s.b))
    if (!flat.some(Boolean)) throw new RangeError(`the open ${which} of a revolution shell has no exact model unless its inner face is flat`)
    const m = inner.length
    inner = inner.map((s, i) => {
      const touches = (p: Vec2) => at(p) && (flat[i] || flat[(i + m - 1) % m] || flat[(i + 1) % m])
      if (s.kind !== "line") {
        if (touches(segmentStart(s)) || touches(segmentEnd(s))) throw new RangeError(`the open ${which} of a revolution shell has no exact model next to an arc`)
        return s
      }
      const a = touches(s.a) ? { x: s.a.x, y: y1 } : s.a, b = touches(s.b) ? { x: s.b.x, y: y1 } : s.b
      if (!flat[i] && (a !== s.a || b !== s.b) && Math.abs(s.a.x - s.b.x) > 1e-9) throw new RangeError(`the open ${which} of a revolution shell has no exact model next to a slanted wall`)
      return { kind: "line", a, b }
    })
  }
  if (open === "top" || open === "both") push("top")
  if (open === "bottom" || open === "both") push("bottom")
  return inner
}

/**
 * An extrusion's edge treatment on the exact solid: the rims of its end faces (`<id>.top`, `<id>.bottom`), the outer boundary
 * and, with `holes`, the inner loops, filleted or chamfered by `blendBrep`. A rim the exact blend cannot make (the arc of a
 * rounded profile corner, a face too narrow) is the reason the body has no exact model: never a partial treatment.
 */
const treatEndRims = (b: Brep, id: string, ends: "top" | "bottom" | "both", holes: boolean, size: number, style: "fillet" | "chamfer"): Brep | string => {
  const names = new Set(ends === "both" ? [`${id}.top`, `${id}.bottom`] : [`${id}.${ends}`])
  const wanted = new Set<number>()
  b.faces.forEach((face) => {
    if (face.name === undefined || !names.has(face.name)) return
    // The outer loop of a planar face is the one with the largest box.
    const extent = face.loops.map((l) => {
      const pts = l.coedges.flatMap((c) => [edgePointAt(b.edges[c.edge]!, 0), edgePointAt(b.edges[c.edge]!, 0.5)])
      const span = (k: "x" | "y" | "z") => Math.max(...pts.map((p) => p[k])) - Math.min(...pts.map((p) => p[k]))
      return Math.hypot(span("x"), span("y"), span("z"))
    })
    const outer = extent.indexOf(Math.max(...extent))
    face.loops.forEach((l, li) => { if (li === outer || holes) for (const c of l.coedges) wanted.add(c.edge) })
  })
  if (wanted.size === 0) return b
  const candidates = blendCandidates(b, 0).filter((c) => wanted.has(c.edge))
  if (candidates.length < wanted.size) return `the exact ${style} of an extrusion's rim takes straight edges and full circles only (the profile has arcs or curves)`
  const res = blendBrep(b, candidates, size, style)
  if (res.failures.length > 0) return `exact ${style} failed: ${res.failures[0]}`
  if (res.rejected.length > 0) return `exact ${style} refused: ${res.rejected[0]}`
  return res.brep
}

/** A closed polygon as a profile loop of lines. */
export const polygonLoop = (ring: ReadonlyArray<Vec2>): ProfileLoop => ring.map((a, i) => ({ kind: "line", a, b: ring[(i + 1) % ring.length]! }) as const)

/** Points without consecutive duplicates (and without a repeated closing point when `closed`). */
export const cleanRing = (pts: ReadonlyArray<Vec2>, closed = true): Vec2[] => {
  const out: Vec2[] = []
  for (const q of pts) if (out.length === 0 || Math.hypot(q.x - out[out.length - 1]!.x, q.y - out[out.length - 1]!.y) > 1e-9) out.push({ x: q.x, y: q.y })
  if (closed && out.length > 1 && Math.hypot(out[0]!.x - out[out.length - 1]!.x, out[0]!.y - out[out.length - 1]!.y) <= 1e-9) out.pop()
  return out
}

/** Row-major rotation Rx·Ry·Rz (degrees), the catalogue's gizmo rotation. */
const gizmo = (rx: number, ry: number, rz: number, centre: Vec3): Transform => {
  const a = (rx * Math.PI) / 180, b = (ry * Math.PI) / 180, c = (rz * Math.PI) / 180
  const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cc = Math.cos(c), sc = Math.sin(c)
  const m = [cb * cc, -cb * sc, sb, ca * sc + sa * sb * cc, ca * cc - sa * sb * sc, -sa * cb, sa * sc - ca * sb * cc, sa * cc + ca * sb * sc, ca * cb] as const
  const t = { x: centre.x - (m[0] * centre.x + m[1] * centre.y + m[2] * centre.z), y: centre.y - (m[3] * centre.x + m[4] * centre.y + m[5] * centre.z), z: centre.z - (m[6] * centre.x + m[7] * centre.y + m[8] * centre.z) }
  return { m, t }
}

/** Exact catalogue solid placed at `at` as the catalogue builds it, before its rotation; a string says why there is none. */
export const catalogueBrep = (
  element: string,
  p: Readonly<Record<string, number>>,
  options: Readonly<Record<string, string>>,
  at: Vec3,
  profilePoints?: ReadonlyArray<Vec2>
): { readonly brep: Brep; readonly centre: Vec3 } | string => {
  const num = (k: string, d: number) => (typeof p[k] === "number" && p[k]! > 0 ? p[k]! : d)
  const W = (o: Vec3) => frame(o)
  switch (element) {
    case "cube": {
      const w = num("width", 1), h = num("height", 1), d = num("depth", 1)
      return { brep: makeBox(w, h, d, W({ x: at.x - w / 2, y: at.y - h / 2, z: at.z - d / 2 })), centre: at }
    }
    case "cylinder": {
      const r = num("radius", 1), h = num("height", 1)
      return { brep: makeCone(r, r, h, W({ x: at.x, y: at.y, z: at.z - h / 2 })), centre: at }
    }
    case "cone": {
      const r = num("radius", 1), h = num("height", 1)
      return { brep: makeCone(r, 0, h, W({ x: at.x, y: at.y, z: at.z - h / 2 })), centre: at }
    }
    case "sphere":
      return { brep: makeSphere(num("radius", 1), W(at)), centre: at }
    case "torus": {
      const R = num("radius", 1), r = num("tubeRadius", R / 4)
      if (!(r < R)) return "a torus whose tube reaches its axis has no exact model yet"
      return { brep: makeTorus(R, r, W(at)), centre: at }
    }
    case "hemisphere": {
      const r = num("radius", 1)
      const down = options["direction"] === "down"
      const arc: ProfileSegment = down ? { kind: "arc", center: { x: 0, y: 0 }, radius: r, start: -Math.PI / 2, end: 0 } : { kind: "arc", center: { x: 0, y: 0 }, radius: r, start: 0, end: Math.PI / 2 }
      const loop: ProfileLoop = down
        ? [arc, { kind: "line", a: { x: r, y: 0 }, b: { x: 0, y: 0 } }, { kind: "line", a: { x: 0, y: 0 }, b: { x: 0, y: -r } }]
        : [{ kind: "line", a: { x: 0, y: 0 }, b: { x: r, y: 0 } }, arc, { kind: "line", a: { x: 0, y: r }, b: { x: 0, y: 0 } }]
      const brep = revolveProfile({ loops: [loop] }, 2 * Math.PI, { origin: at })
      return { brep, centre: { x: at.x, y: at.y, z: at.z + (down ? -r / 2 : r / 2) } }
    }
    case "prism": {
      const r = num("radius", 1), h = num("height", 1), sides = Math.max(3, Math.floor(typeof p["sides"] === "number" ? p["sides"]! : 6))
      // The catalogue's corner convention: the first corner at (0, −r), going counter-clockwise.
      const ring = Array.from({ length: sides }, (_, k) => ({ x: r * Math.sin((2 * Math.PI * k) / sides), y: -r * Math.cos((2 * Math.PI * k) / sides) }))
      return { brep: extrudeProfile({ loops: [ring.map((a, i) => ({ kind: "line", a, b: ring[(i + 1) % sides]! }) as const)] }, h, { placement: W({ x: at.x, y: at.y, z: at.z - h / 2 }) }), centre: at }
    }
    case "pyramid": {
      const w = num("baseWidth", num("width", 1)), d = num("baseDepth", num("depth", 1)), h = num("height", 1)
      const z0 = at.z - h / 2
      const pts: Vec3[] = [
        { x: at.x - w / 2, y: at.y - d / 2, z: z0 },
        { x: at.x + w / 2, y: at.y - d / 2, z: z0 },
        { x: at.x + w / 2, y: at.y + d / 2, z: z0 },
        { x: at.x - w / 2, y: at.y + d / 2, z: z0 },
        { x: at.x, y: at.y, z: z0 + h }
      ]
      return { brep: polyhedron(pts, [[0, 3, 2, 1], [0, 1, 4], [1, 2, 4], [2, 3, 4], [3, 0, 4]]), centre: at }
    }
    case "extrusion": {
      // The scene extrudes from z to z + depth; rect and circle are centred on x, y; a profile is relative to x, y.
      const depth = num("depth", 10)
      let loop: ProfileLoop
      if (options["shape"] === "rect") {
        const w = num("width", 50) / 2, h = num("height", 30) / 2
        loop = polygonLoop([{ x: -w, y: -h }, { x: w, y: -h }, { x: w, y: h }, { x: -w, y: h }])
      } else if (options["shape"] === "circle") loop = [{ kind: "arc", center: { x: 0, y: 0 }, radius: num("radius", 25), start: 0, end: 2 * Math.PI }]
      else {
        const ring = cleanRing(profilePoints ?? [])
        if (ring.length < 3) return "the extrusion has no closed profile of at least three points"
        loop = polygonLoop(ring)
      }
      return { brep: extrudeProfile({ loops: [loop] }, depth, { placement: frame(at), name: "extrusion" }), centre: at }
    }
    case "revolution": {
      const pts = cleanRing(profilePoints ?? [], false)
      if (pts.length < 2 || pts.some((q) => q.x < 0)) return "the revolution needs a profile of points on one side of its axis"
      // Closed against the axis at both ends, as the scene's lathe closes it.
      const ring: Vec2[] = [...pts]
      if (Math.abs(ring[ring.length - 1]!.x) > 1e-12) ring.push({ x: 0, y: ring[ring.length - 1]!.y })
      if (Math.abs(ring[0]!.x) > 1e-12) ring.unshift({ x: 0, y: ring[0]!.y })
      const angle = num("angle", 2 * Math.PI)
      const phi = typeof p["phiStart"] === "number" ? p["phiStart"]! : 0
      const radial = { x: Math.cos(phi), y: Math.sin(phi), z: 0 }
      let b = revolveProfile({ loops: [polygonLoop(cleanRing(ring))] }, Math.min(angle, 2 * Math.PI), { origin: { x: 0, y: 0, z: 0 }, axis: { x: 0, y: 0, z: 1 }, radial, name: "revolution" })
      // axis "y" stands the lathe on Z; none leaves it along Y; "x" lays it along X (the scene's rotations).
      if (options["axis"] !== "y") {
        const m = options["axis"] === "x" ? ([0, 0, 1, -1, 0, 0, 0, -1, 0] as const) : ([1, 0, 0, 0, 0, 1, 0, -1, 0] as const)
        b = transformBrep(b, { m, t: { x: 0, y: 0, z: 0 } })
      }
      const moved = transformBrep(b, translation(at))
      return { brep: moved, centre: at }
    }
    default:
      return `the catalogue element '${element}' has no exact model yet`
  }
}

/**
 * Replays `history` as exact B-reps alongside the mesh rebuild (computed when not given). Never throws: a body without
 * an exact model carries the reason.
 */
export const rebuildExact = (history: History, given?: RebuildResult): ExactRebuild => {
  const result = given ?? rebuild(history)
  const warnings: string[] = []
  const values = result.parameters
  const failed = new Set(result.issues.filter((i) => i.severity === "error").map((i) => i.feature))
  const dim = (d: Dimension): number => dimensionValue(d, values)
  const bodies: Array<{ id: string; feature: string; exact: Exact }> = []
  const tools = new Map<string, { readonly exact: ReadonlyArray<Exact>; readonly operation: "new" | "union" | "subtract" | "intersect"; readonly targets?: ReadonlyArray<string> }>()
  // What a shell needs of an extrusion: its exact (corner-treated) loops, sketch frame and extent along the normal.
  const extrusions = new Map<string, { readonly loops: ReadonlyArray<ProfileLoop>; readonly frame: { readonly origin: Vec3; readonly n: Vec3; readonly u: Vec3 }; readonly from: number; readonly to: number }>()
  // And of a sweep: its profile about the path, the start frame and the path.
  const sweeps = new Map<string, { readonly loops: ReadonlyArray<ProfileLoop>; readonly start: PathFrame; readonly pieces: ReadonlyArray<PathPiece>; readonly closed: boolean }>()
  // And of a revolution: its (radial, axial) profile and axis.
  const revolutions = new Map<string, { readonly loop: ProfileLoop; readonly full: boolean; readonly origin: Vec3; readonly axis: Vec3; readonly radial: Vec3 }>()

  const boolean = (a: Exact, b: Exact, op: "union" | "subtract" | "intersect"): Exact => {
    if (a.brep === undefined) return a
    if (b.brep === undefined) return b
    try {
      return ok(booleanBrep(a.brep, b.brep, op).brep)
    } catch (e) {
      return no(e instanceof BooleanError ? `exact ${op} failed: ${e.message}` : String(e))
    }
  }

  const apply = (feature: string, tool: Exact, operation: "new" | "union" | "subtract" | "intersect", targets: ReadonlyArray<string> | undefined, label: string): void => {
    if (operation === "new") { bodies.push({ id: label, feature, exact: tool }); return }
    const chosen = bodies.filter((b) => targets === undefined || targets.includes(b.id))
    if (chosen.length === 0) return
    if (operation === "union") {
      const merged = chosen.reduce((acc, b) => boolean(b.exact, acc, "union"), tool)
      const first = bodies.indexOf(chosen[0]!)
      for (const b of chosen.slice(1)) bodies.splice(bodies.indexOf(b), 1)
      bodies[first] = { ...chosen[0]!, exact: merged }
      return
    }
    for (const b of chosen) bodies[bodies.indexOf(b)] = { ...b, exact: boolean(b.exact, tool, operation) }
  }
  const transformTargets = (f: Feature & { targets?: ReadonlyArray<string> }, tr: Transform | undefined, reason: string, copy = false): void => {
    const chosen = bodies.filter((b) => f.targets === undefined || f.targets.includes(b.id))
    for (const b of chosen) {
      const exact = tr === undefined ? no(reason) : b.exact.brep === undefined ? b.exact : ok(transformBrep(b.exact.brep, tr))
      if (copy) bodies.push({ id: chosen.length === 1 ? f.id : `${f.id}#${b.id}`, feature: f.id, exact })
      else bodies[bodies.indexOf(b)] = { ...b, exact }
    }
  }
  const unsupported = (f: Feature & { operation?: string; targets?: ReadonlyArray<string> }, reason: string): void => {
    const op = (f.operation ?? "new") as "new" | "union" | "subtract" | "intersect"
    tools.set(f.id, { exact: [no(reason)], operation: op, ...(f.targets !== undefined ? { targets: f.targets } : {}) })
    apply(f.id, no(reason), op, f.targets, f.id)
  }
  const sketchOf = (id: string) => {
    const sk = result.sketches[id]
    return sk === undefined || sk.solve.status === "conflicting" || sk.solve.status === "failed" ? undefined : sk
  }

  for (const f of history.features) {
    if (failed.has(f.id)) continue
    try {
      switch (f.type) {
        case "sketch":
          break
        case "extrude": {
          const sk = sketchOf(f.sketch)
          if (sk === undefined) break
          const depth = dim(f.depth)
          // A draft angle leans the walls: the top profile is inset by depth * tan(angle), as the mesh's tapered prism.
          const inset = f.taper === undefined ? 0 : depth * Math.tan((dim(f.taper) * Math.PI) / 180)
          const dir = f.direction ?? "up"
          const from = dir === "up" ? 0 : dir === "down" ? -depth : -depth / 2
          let { loops } = exactSketchLoops(sk.solve.sketch)
          // Rounded or bevelled profile corners: exact tangent arcs or lines between the sketch's lines.
          if (f.corner !== undefined) {
            const size = dim(f.corner.size)
            try {
              loops = loops.map((l) => treatLoopCorners(l, f.corner!.style, size))
            } catch (e) {
              unsupported(f, e instanceof Error ? e.message : String(e))
              break
            }
          }
          // The rebuild already resolved the sketch's plane (base or work plane, offset applied).
          const F = sk.frame
          const placement = frame({ x: F.origin.x + F.n.x * from, y: F.origin.y + F.n.y * from, z: F.origin.z + F.n.z * from }, F.n, F.u)
          let solids: Brep[]
          try {
            solids = profilesOfLoops(loops).map((p) => extrudeProfile(p, depth, { placement, name: f.id, ...(inset !== 0 ? { inset } : {}) }))
          } catch (e) {
            unsupported(f, e instanceof Error ? e.message : String(e))
            break
          }
          if (solids.length === 0) break
          extrusions.set(f.id, { loops, frame: F, from, to: from + depth })
          let united = unionAll(solids)
          if (f.edge !== undefined) {
            const treated = treatEndRims(united, f.id, f.edge.ends ?? "both", f.edge.holes === true, dim(f.edge.size), f.edge.style)
            if (typeof treated === "string") { unsupported(f, treated); break }
            united = treated
          }
          const tool = ok(united)
          tools.set(f.id, { exact: [tool], operation: f.operation, ...(f.targets !== undefined ? { targets: f.targets } : {}) })
          apply(f.id, tool, f.operation, f.targets, f.id)
          break
        }
        case "revolve": {
          const sk = sketchOf(f.sketch)
          if (sk === undefined) break
          const degrees = f.angle === undefined ? 360 : dim(f.angle)
          const { loops } = exactSketchLoops(sk.solve.sketch)
          if (loops.length !== 1) break
          let a0: Vec2, dirA: Vec2
          if (f.axis === "x") { a0 = { x: 0, y: 0 }; dirA = { x: 1, y: 0 } }
          else if (f.axis === "y") { a0 = { x: 0, y: 0 }; dirA = { x: 0, y: 1 } }
          else {
            const axisId = f.axis.line
            const line = sk.solve.sketch.entities.find((e) => e.id === axisId && e.kind === "line")
            if (line === undefined || line.kind !== "line") break
            const pts = new Map(sk.solve.sketch.entities.flatMap((e) => (e.kind === "point" ? [[e.id, e] as const] : [])))
            const p1 = pts.get(line.p1)!, p2 = pts.get(line.p2)!
            const len = Math.hypot(p2.x - p1.x, p2.y - p1.y)
            a0 = { x: p1.x, y: p1.y }
            dirA = { x: (p2.x - p1.x) / len, y: (p2.y - p1.y) / len }
          }
          // The axis line itself may be an edge of the profile; drop it from the loop only if it is not.
          const side = (d: Vec2, p: Vec2) => (p.x - a0.x) * -d.y + (p.y - a0.y) * d.x
          const loop0 = loops[0]!
          const samples = loop0.flatMap((s) => [segmentPoint(s, 0), segmentPoint(s, 0.5)])
          if (samples.every((p) => side(dirA, p) <= 1e-6)) dirA = { x: -dirA.x, y: -dirA.y }
          const n2 = { x: -dirA.y, y: dirA.x }
          const map = (p: Vec2): Vec2 => ({ x: Math.max(0, (p.x - a0.x) * n2.x + (p.y - a0.y) * n2.y), y: (p.x - a0.x) * dirA.x + (p.y - a0.y) * dirA.y })
          // (radial, axial) coordinates are a reflection of the sketch's: arcs change their sense.
          const mapped: ProfileLoop = loop0.map((s): ProfileSegment => {
            if (s.kind === "line") return { kind: "line", a: map(s.a), b: map(s.b) }
            if (s.kind === "arc") {
              const c = map(s.center)
              const ps = map(segmentPoint(s, 0))
              const a1 = Math.atan2(ps.y - c.y, ps.x - c.x)
              return { kind: "arc", center: c, radius: s.radius, start: a1, end: a1 - (s.end - s.start) }
            }
            return s
          })
          const P = sk.frame
          const w = (p: Vec2): Vec3 => ({ x: P.origin.x + P.u.x * p.x + P.v.x * p.y, y: P.origin.y + P.u.y * p.x + P.v.y * p.y, z: P.origin.z + P.u.z * p.x + P.v.z * p.y })
          const o3 = w(a0)
          const d3 = { x: P.u.x * dirA.x + P.v.x * dirA.y, y: P.u.y * dirA.x + P.v.y * dirA.y, z: P.u.z * dirA.x + P.v.z * dirA.y }
          const r3 = { x: P.u.x * n2.x + P.v.x * n2.y, y: P.u.y * n2.x + P.v.y * n2.y, z: P.u.z * n2.x + P.v.z * n2.y }
          normalizeProfile({ loops: [mapped] })
          const brep = revolveProfile({ loops: [mapped] }, (degrees * Math.PI) / 180, { origin: o3, axis: d3, radial: r3, name: f.id })
          revolutions.set(f.id, { loop: mapped, full: degrees >= 360 - 1e-9, origin: o3, axis: d3, radial: r3 })
          const tool = ok(brep)
          tools.set(f.id, { exact: [tool], operation: f.operation, ...(f.targets !== undefined ? { targets: f.targets } : {}) })
          apply(f.id, tool, f.operation, f.targets, f.id)
          break
        }
        case "hole": {
          const offset = f.offset === undefined ? 0 : dim(f.offset)
          const x = dim(f.at[0]), y = dim(f.at[1]), d = dim(f.diameter), depth = dim(f.depth)
          if (!Object.hasOwn(PLANES, f.plane)) {
            // A hole always subtracts: the bodies it cuts lose their exact model, no new body appears.
            unsupported({ ...f, operation: "subtract" }, `a hole on the work plane '${f.plane}' has no exact model yet`)
            break
          }
          const P = PLANES[f.plane as PlaneName]
          const origin = { x: P.n.x * offset + P.u.x * x + P.v.x * y, y: P.n.y * offset + P.u.y * x + P.v.y * y, z: P.n.z * offset + P.u.z * x + P.v.z * y }
          const e = 0.01
          let profile: Vec2[]
          if (f.kind === undefined || f.kind === "simple") profile = [{ x: 0, y: e }, { x: d / 2, y: e }, { x: d / 2, y: -depth }, { x: 0, y: -depth }]
          else if (f.kind === "counterbore") {
            const head = dim(f.headDiameter!), headDepth = dim(f.headDepth!)
            profile = [{ x: 0, y: e }, { x: head / 2, y: e }, { x: head / 2, y: -headDepth }, { x: d / 2, y: -headDepth }, { x: d / 2, y: -depth }, { x: 0, y: -depth }]
          } else {
            const head = dim(f.headDiameter!)
            const included = f.angle === undefined ? 90 : dim(f.angle)
            const slope = Math.tan((included * Math.PI) / 360)
            const coneDepth = (head / 2 - d / 2) / slope
            profile = [{ x: 0, y: e }, { x: head / 2 + e * slope, y: e }, { x: d / 2, y: -coneDepth }, { x: d / 2, y: -depth }, { x: 0, y: -depth }]
          }
          const loop: ProfileLoop = profile.map((a, i) => ({ kind: "line", a, b: profile[(i + 1) % profile.length]! }) as const)
          const tool = ok(revolveProfile({ loops: [loop] }, 2 * Math.PI, { origin, axis: P.n, radial: P.u, name: f.id }))
          tools.set(f.id, { exact: [tool], operation: "subtract", ...(f.targets !== undefined ? { targets: f.targets } : {}) })
          apply(f.id, tool, "subtract", f.targets, f.id)
          break
        }
        case "mirror": {
          const source = tools.get(f.feature)
          if (source === undefined) break
          const value = f.offset === undefined ? 0 : dim(f.offset)
          const axis = f.plane === "XY" ? 2 : f.plane === "YZ" ? 0 : 1
          const m = [axis === 0 ? -1 : 1, 0, 0, 0, axis === 1 ? -1 : 1, 0, 0, 0, axis === 2 ? -1 : 1] as const
          const tr: Transform = { m, t: { x: axis === 0 ? 2 * value : 0, y: axis === 1 ? 2 * value : 0, z: axis === 2 ? 2 * value : 0 } }
          const exact = source.exact.map((x) => (x.brep === undefined ? x : ok(transformBrep(x.brep, tr))))
          tools.set(f.id, { exact, operation: source.operation, ...(source.targets !== undefined ? { targets: source.targets } : {}) })
          const missing = exact.find((x) => x.brep === undefined)
          apply(f.id, missing ?? ok(unionAll(exact.map((x) => x.brep!))), source.operation, source.targets, f.id)
          break
        }
        case "primitive": {
          const params: Record<string, number> = {}
          for (const [k, v] of Object.entries(f.params ?? {})) params[k] = dim(v)
          const at = (f.at ?? [0, 0, 0]).map(dim)
          const outline = f.profile?.map(([x, y]) => ({ x: dim(x), y: dim(y) }))
          const built = catalogueBrep(f.element, params, f.options ?? {}, { x: at[0]!, y: at[1]!, z: at[2]! }, outline)
          let exact: Exact
          if (typeof built === "string") exact = no(built)
          else {
            const turn = f.rotation?.map(dim)
            exact = ok(turn === undefined || turn.every((a) => a === 0) ? built.brep : transformBrep(built.brep, gizmo(turn[0]!, turn[1]!, turn[2]!, built.centre)))
          }
          tools.set(f.id, { exact: [exact], operation: f.operation, ...(f.targets !== undefined ? { targets: f.targets } : {}) })
          apply(f.id, exact, f.operation, f.targets, f.id)
          break
        }
        case "move": {
          const shift = f.translate?.map(dim)
          let tr: Transform = { m: [1, 0, 0, 0, 1, 0, 0, 0, 1], t: { x: 0, y: 0, z: 0 } }
          if (f.rotate !== undefined) {
            const axis = f.rotate.axis === "x" ? { x: 1, y: 0, z: 0 } : f.rotate.axis === "y" ? { x: 0, y: 1, z: 0 } : { x: 0, y: 0, z: 1 }
            const about = f.rotate.about?.map(dim)
            tr = rotation(axis, (dim(f.rotate.angle) * Math.PI) / 180, about === undefined ? { x: 0, y: 0, z: 0 } : { x: about[0]!, y: about[1]!, z: about[2]! })
          }
          if (shift !== undefined) tr = compose(tr, translation({ x: shift[0]!, y: shift[1]!, z: shift[2]! }))
          transformTargets(f, tr, "", f.copy === true)
          break
        }
        case "scale": {
          const factors = (Array.isArray(f.factor) ? f.factor : [f.factor, f.factor, f.factor]).map((d) => dim(d as Dimension))
          const about = f.about?.map(dim)
          const uniform = factors.every((v) => Math.abs(v - factors[0]!) < 1e-12)
          transformTargets(f, uniform ? uniformScale(factors[0]!, about === undefined ? { x: 0, y: 0, z: 0 } : { x: about[0]!, y: about[1]!, z: about[2]! }) : undefined, "a non-uniform scale has no exact model (it turns circles into ellipses)")
          break
        }
        case "split": {
          const value = f.offset === undefined ? 0 : dim(f.offset)
          const chosen = bodies.filter((b) => f.targets === undefined || f.targets.includes(b.id))
          // The half-space on one side of the plane, as a box a little larger than the body (a huge box would coarsen the
          // Boolean's size-relative tolerances).
          const half = (body: Brep, above: boolean): Brep => {
            const P = PLANES[f.plane]
            const box = brepBox(body)
            const big = 2 * Math.hypot(box.hi.x - box.lo.x, box.hi.y - box.lo.y, box.hi.z - box.lo.z) + 2 * Math.abs(value) + 1
            const c = { x: (box.lo.x + box.hi.x) / 2, y: (box.lo.y + box.hi.y) / 2, z: (box.lo.z + box.hi.z) / 2 }
            const cu = c.x * P.u.x + c.y * P.u.y + c.z * P.u.z, cv = c.x * P.v.x + c.y * P.v.y + c.z * P.v.z
            const along = above ? value : value - big
            const o = {
              x: P.n.x * along + P.u.x * (cu - big) + P.v.x * (cv - big),
              y: P.n.y * along + P.u.y * (cu - big) + P.v.y * (cv - big),
              z: P.n.z * along + P.u.z * (cu - big) + P.v.z * (cv - big)
            }
            return makeBox(2 * big, 2 * big, big, frame(o, P.n, P.u))
          }
          for (const b of chosen) {
            const kept = f.keep === "below" ? [false] : f.keep === "above" ? [true] : [true, false]
            const parts = kept.map((above) => (b.exact.brep === undefined ? b.exact : boolean(b.exact, ok(half(b.exact.brep, above)), "intersect")))
            bodies[bodies.indexOf(b)] = { ...b, exact: parts[0]! }
            if (parts.length > 1) bodies.push({ id: `${f.id}:${b.id}:below`, feature: f.id, exact: parts[1]! })
          }
          break
        }
        case "combine": {
          const target = bodies.find((b) => b.id === f.target)
          if (target === undefined) break
          const toolBodies = f.tools.map((id) => bodies.find((b) => b.id === id)!)
          const op = f.operation === "join" ? "union" : f.operation === "cut" ? "subtract" : "intersect"
          let exact = target.exact
          for (const t of toolBodies) exact = boolean(exact, t.exact, op)
          bodies[bodies.indexOf(target)] = { ...target, exact }
          if (f.keepTools !== true) for (const t of toolBodies) bodies.splice(bodies.indexOf(t), 1)
          break
        }
        case "pattern": {
          const source = tools.get(f.feature)
          if (source === undefined) break
          const count = dim(f.count)
          const base = source.exact.find((x) => x.brep === undefined) ?? ok(unionAll(source.exact.map((x) => x.brep!)))
          const copies: Array<{ exact: Exact; label: string }> = []
          const emit = (tr: Transform, label: string) => copies.push({ exact: base.brep === undefined ? base : ok(transformBrep(base.brep, tr)), label })
          if (f.kind === "grid") {
            const rows = dim(f.countB!)
            const a = (f.step ?? [0, 0, 0]).map(dim), bb = (f.stepB ?? [0, 0, 0]).map(dim)
            for (let i = 0; i < count; i++) for (let j = 0; j < rows; j++) {
              if (i === 0 && j === 0) continue
              emit(translation({ x: a[0]! * i + bb[0]! * j, y: a[1]! * i + bb[1]! * j, z: a[2]! * i + bb[2]! * j }), `${f.id}#${i}.${j}`)
            }
          } else if (f.kind === "linear") {
            const step = (f.step ?? [0, 0, 0]).map(dim)
            for (let i = 1; i < count; i++) emit(translation({ x: step[0]! * i, y: step[1]! * i, z: step[2]! * i }), `${f.id}#${i}`)
          } else {
            const c = (f.centre ?? [0, 0]).map(dim)
            const span = f.span === undefined ? 360 : dim(f.span)
            const each = span >= 360 - 1e-9 ? span / count : span / (count - 1)
            for (let i = 1; i < count; i++) emit(rotation({ x: 0, y: 0, z: 1 }, (each * i * Math.PI) / 180, { x: c[0]!, y: c[1]!, z: 0 }), `${f.id}#${i}`)
          }
          // The mesh rebuild applies disjoint copies in one Boolean (one body label); the exact replay applies them one by one,
          // which gives the same solid.
          if (source.operation === "new") for (const c of copies) apply(f.id, c.exact, "new", source.targets, c.label)
          else for (const c of copies) apply(f.id, c.exact, source.operation, source.targets, c.label)
          break
        }
        case "fillet": {
          // The mesh rebuild's selection (edges between faces meeting at 25 degrees or more, convex by default, rims only when
          // `curved`) on the exact solid; an edge the exact blend fails on leaves the body without an exact model.
          const style = f.style ?? "fillet"
          const size = dim(f.radius)
          const sel = f.edges
          const selector = {
            ...(sel?.parallel !== undefined ? { parallel: sel.parallel } : {}), ...(sel?.kind !== undefined ? { kind: sel.kind } : {}),
            ...(sel?.minLength !== undefined ? { minLength: dim(sel.minLength) } : {}), ...(sel?.curved === true ? { curved: true } : {}),
            ...(sel?.within !== undefined ? { within: { min: sel.within.min.map(dim) as [number, number, number], max: sel.within.max.map(dim) as [number, number, number] } } : {})
          }
          for (const b of bodies.filter((x) => f.targets === undefined || f.targets.includes(x.id))) {
            if (b.exact.brep === undefined) continue
            const picked = selectBlendEdges(blendCandidates(b.exact.brep, 25), selector)
            if (picked.length === 0) continue
            const res = blendBrep(b.exact.brep, picked, size, style)
            for (const why of res.rejected.slice(0, 4)) warnings.push(`${f.id}: not blended: ${why}`)
            bodies[bodies.indexOf(b)] = { ...b, exact: res.failures.length > 0 ? no(`exact ${style} failed: ${res.failures[0]}`) : ok(res.brep) }
          }
          break
        }
        case "shell": {
          // The mesh rebuild's cavity, exact: each region of the extrusion's profile moved inwards by the wall (its holes
          // outwards), from a wall above the bottom to a wall below the top, or through an open end; then subtracted.
          const ex = extrusions.get(f.feature)
          const t = dim(f.thickness)
          const open = f.open ?? "none"
          const rev = revolutions.get(f.feature)
          const sw = sweeps.get(f.feature)
          if (ex === undefined && sw !== undefined) {
            // The mesh's cavity: every loop moved by the wall (the outline in, the holes out), swept along the path shortened by
            // the wall at a closed end and carried 1 mm past an open one.
            let cavity: Brep
            try {
              const inner = sw.loops.map((l, i) => offsetLoop(l, i === 0 ? t : -t))
              let pieces: ReadonlyArray<PathPiece> = sw.pieces, start = sw.start
              if (!sw.closed) {
                const s0 = open === "bottom" || open === "both" ? -1 : t, s1 = open === "top" || open === "both" ? -1 : t
                const a = trimPathStart(pieces, s0, start)
                if (typeof a === "string") throw new RangeError(a)
                const b = trimPathStart(reversePath(a.pieces), s1, { x: { x: 0, y: 0, z: 1 }, y: { x: 0, y: 1, z: 0 } })
                if (typeof b === "string") throw new RangeError(b)
                pieces = reversePath(b.pieces); start = a.start
                // An extension at the start turns nothing; a trim may have carried the frame round a bend.
              }
              cavity = sweepPath({ loops: inner }, start, pieces, { closed: sw.closed, name: `${f.id}.cavity` })
            } catch (e) {
              unsupported({ ...f, operation: "subtract" }, e instanceof Error ? e.message : String(e))
              break
            }
            tools.set(f.id, { exact: [ok(cavity)], operation: "subtract", ...(f.targets !== undefined ? { targets: f.targets } : {}) })
            apply(f.id, ok(cavity), "subtract", f.targets, f.id)
            break
          }
          if (ex === undefined && rev !== undefined) {
            if (!rev.full) { unsupported({ ...f, operation: "subtract" }, "only a full revolution (360 degrees) can be shelled"); break }
            let cavity: Brep
            try {
              cavity = revolveProfile({ loops: [revolveShellLoop(rev.loop, t, open)] }, 2 * Math.PI, { origin: rev.origin, axis: rev.axis, radial: rev.radial, name: `${f.id}.cavity` })
            } catch (e) {
              unsupported({ ...f, operation: "subtract" }, e instanceof Error ? e.message : String(e))
              break
            }
            tools.set(f.id, { exact: [ok(cavity)], operation: "subtract", ...(f.targets !== undefined ? { targets: f.targets } : {}) })
            apply(f.id, ok(cavity), "subtract", f.targets, f.id)
            break
          }
          if (ex === undefined) { unsupported({ ...f, operation: "subtract" }, `a shell of '${f.feature}' has no exact model yet (extrusions and full revolutions are shelled exactly)`); break }
          const z0 = ex.from + (open === "bottom" || open === "both" ? -1 : t)
          const z1 = ex.to + (open === "top" || open === "both" ? 1 : -t)
          let cavity: Brep
          try {
            const at = (z: number) => frame({ x: ex.frame.origin.x + ex.frame.n.x * z, y: ex.frame.origin.y + ex.frame.n.y * z, z: ex.frame.origin.z + ex.frame.n.z * z }, ex.frame.n, ex.frame.u)
            const pieces = profilesOfLoops(ex.loops).map((p) => {
              const [outer, ...holes] = p.loops
              let piece = extrudeProfile({ loops: [offsetLoop(outer!, t)] }, z1 - z0, { placement: at(z0), name: `${f.id}.cavity` })
              for (const h of holes) piece = booleanBrep(piece, extrudeProfile({ loops: [offsetLoop(h, -t)] }, z1 - z0 + 2, { placement: at(z0 - 1), name: `${f.id}.wall` }), "subtract").brep
              return piece
            })
            cavity = unionAll(pieces)
          } catch (e) {
            unsupported({ ...f, operation: "subtract" }, e instanceof Error ? e.message : String(e))
            break
          }
          tools.set(f.id, { exact: [ok(cavity)], operation: "subtract", ...(f.targets !== undefined ? { targets: f.targets } : {}) })
          apply(f.id, ok(cavity), "subtract", f.targets, f.id)
          break
        }
        case "draft": {
          // The face nearest `near` among the candidate bodies (the mesh rebuild's choice); a curved one leans by moving its
          // vertices in the mesh rebuild, which has no exact counterpart yet.
          const near = { x: dim(f.near[0]), y: dim(f.near[1]), z: dim(f.near[2]) }
          const hint = f.normal === undefined ? undefined : { x: dim(f.normal[0]), y: dim(f.normal[1]), z: dim(f.normal[2]) }
          const raw = f.pull === undefined ? { x: 0, y: 0, z: 1 } : { x: dim(f.pull[0]), y: dim(f.pull[1]), z: dim(f.pull[2]) }
          const candidates = bodies.filter((b) => f.body === undefined || b.id === f.body)
          let chosen: { body: (typeof bodies)[number]; distance: number; planar: boolean } | undefined
          for (const b of candidates) {
            if (b.exact.brep === undefined) continue
            const closest = brepLocator(b.exact.brep).closest(near)
            const planar = closest.face !== undefined && b.exact.brep.faces[closest.face]!.surface.kind === "plane"
            const pick = hint === undefined ? undefined : pickPlanarFace(b.exact.brep, near, hint)
            const distance = pick?.distance ?? closest.distance
            if (chosen === undefined || distance < chosen.distance) chosen = { body: b, distance, planar: hint !== undefined ? pick !== undefined : planar }
          }
          if (chosen === undefined) {
            for (const b of candidates) bodies[bodies.indexOf(b)] = { ...b, exact: b.exact.brep === undefined ? b.exact : no("the drafted face could not be found on the exact model") }
            break
          }
          const target = chosen.body
          if (!chosen.planar) { bodies[bodies.indexOf(target)] = { ...target, exact: no("a draft of a curved face has no exact model yet") }; break }
          const len = Math.hypot(raw.x, raw.y, raw.z)
          const drafted = draftPlanarFace(target.exact.brep!, { near, ...(hint !== undefined ? { normal: hint } : {}), pull: { x: raw.x / len, y: raw.y / len, z: raw.z / len }, neutral: f.neutral === undefined ? 0 : dim(f.neutral), angle: dim(f.angle) })
          bodies[bodies.indexOf(target)] = { ...target, exact: typeof drafted === "string" ? no(drafted) : ok(drafted) }
          break
        }
        case "plane":
          // Construction geometry only: no body changes.
          break
        case "sweep": {
          const prof = sketchOf(f.profile), route = sketchOf(f.path)
          if (prof === undefined || route === undefined) break
          let path = exactSketchPath(route.solve.sketch, route.frame)
          if (typeof path === "string") { unsupported(f, path); break }
          const bend = f.bendRadius === undefined ? 0 : dim(f.bendRadius)
          if (bend > 0 && !path.closed) {
            const rounded = roundExactPath(path.pieces, bend)
            if (typeof rounded === "string") { unsupported(f, rounded); break }
            path = { pieces: rounded, closed: false }
          }
          // The mesh sweep carries the profile by its outer ring's vertex mean (the polygon `sketchProfiles` draws).
          const { loops } = exactSketchLoops(prof.solve.sketch)
          const polys = sketchProfiles(prof.solve.sketch).loops
          if (polys.length === 0 || loops.length === 0) break
          const outerPoly = polys.reduce((a, b) => (Math.abs(polygonArea(b)) > Math.abs(polygonArea(a)) ? b : a))
          const c2 = { x: outerPoly.reduce((s, p) => s + p.x, 0) / outerPoly.length, y: outerPoly.reduce((s, p) => s + p.y, 0) / outerPoly.length }
          const groups = profilesOfLoops(loops)
          if (groups.length !== 1) { unsupported(f, "a sweep of several separate profiles has no exact model yet"); break }
          const shift = (l: ProfileLoop): ProfileLoop => l.map((s): ProfileSegment => s.kind === "line" ? { kind: "line", a: { x: s.a.x - c2.x, y: s.a.y - c2.y }, b: { x: s.b.x - c2.x, y: s.b.y - c2.y } } : s.kind === "arc" ? { ...s, center: { x: s.center.x - c2.x, y: s.center.y - c2.y } } : s)
          const profileLoops = groups[0]!.loops.map(shift)
          const start = sweepStartFrame(prof.frame, pieceTangent(path.pieces[0]!, false))
          let solid: Brep
          try {
            solid = sweepPath({ loops: profileLoops }, start, path.pieces, { closed: path.closed, name: f.id })
          } catch (e) {
            unsupported(f, e instanceof Error ? e.message : String(e))
            break
          }
          sweeps.set(f.id, { loops: profileLoops, start, pieces: path.pieces, closed: path.closed })
          tools.set(f.id, { exact: [ok(solid)], operation: f.operation, ...(f.targets !== undefined ? { targets: f.targets } : {}) })
          apply(f.id, ok(solid), f.operation, f.targets, f.id)
          break
        }
        case "loft":
        case "coil":
        case "rib":
        case "sheet":
        case "text":
          unsupported(f, `a ${f.type} has no exact model yet`)
          break
        case "thread":
          unsupported({ ...f, operation: f.cut === true ? "subtract" : f.operation ?? "new" }, "a modelled (helical) thread has no exact model yet")
          break
        case "pushpull":
        case "mate": {
          // These move faces or whole bodies in the mesh rebuild; until they are replayed exactly, the bodies they touch say so.
          const id = f.body
          for (const b of bodies.filter((x) => id === undefined || x.id === id)) bodies[bodies.indexOf(b)] = { ...b, exact: b.exact.brep === undefined ? b.exact : no(`a ${f.type === "mate" ? "joint (mate)" : "push-pull"} has no exact model yet`) }
          break
        }
      }
    } catch (e) {
      warnings.push(`${f.id}: ${e instanceof Error ? e.message : String(e)}`)
      for (const b of bodies) if (b.feature === f.id) b.exact = no(`exact model of ${f.id} failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  // Align with the mesh bodies by id.
  const byId = new Map(bodies.map((b) => [b.id, b]))
  const out: ExactBody[] = result.bodies.map((mb) => {
    const b = byId.get(mb.id)
    if (b === undefined) return { id: mb.id, feature: mb.feature, reason: "the exact replay has no body of this id" }
    return b.exact.brep !== undefined ? { id: mb.id, feature: mb.feature, brep: b.exact.brep } : { id: mb.id, feature: mb.feature, reason: b.exact.reason ?? "no exact model" }
  })
  return { result, bodies: out, warnings }
}

/** Bounding box of a B-rep from a coarse tessellation (within its chord of the true box). */
export const brepBox = (b: Brep): { readonly lo: Vec3; readonly hi: Vec3 } => {
  const t = tessellateBrep(b, { chordTol: 0.05, angleTolDeg: 30 })
  const lo = { x: Infinity, y: Infinity, z: Infinity }, hi = { x: -Infinity, y: -Infinity, z: -Infinity }
  for (let i = 0; i < t.positions.length; i += 3) {
    lo.x = Math.min(lo.x, t.positions[i]!); hi.x = Math.max(hi.x, t.positions[i]!)
    lo.y = Math.min(lo.y, t.positions[i + 1]!); hi.y = Math.max(hi.y, t.positions[i + 1]!)
    lo.z = Math.min(lo.z, t.positions[i + 2]!); hi.z = Math.max(hi.z, t.positions[i + 2]!)
  }
  return { lo, hi }
}

// ================================================================ summaries and exchange

export interface ExactBodySummary {
  readonly id: string
  readonly exact: boolean
  readonly reason?: string
  readonly volume?: number
  readonly area?: number
  readonly centroid?: Vec3
  readonly genus?: number
  readonly faces?: number
  readonly edges?: number
  readonly vertices?: number
  /** Number of faces per surface kind (plane, cylinder, cone, sphere, torus, nurbs, revolution, extrusion). */
  readonly surfaces?: Readonly<Record<string, number>>
  readonly valid?: boolean
}

/** What the exact model says about each body: what the assistant quotes and the UI shows next to the mesh. */
export const exactSummary = (ex: ExactRebuild): ReadonlyArray<ExactBodySummary> =>
  ex.bodies.map((b) => {
    if (b.brep === undefined) return { id: b.id, exact: false, reason: b.reason ?? "no exact model" }
    const rep = validateBrep(b.brep, { skipVolume: true })
    const mp = massProperties(b.brep)
    const surfaces: Record<string, number> = {}
    for (const f of b.brep.faces) surfaces[f.surface.kind] = (surfaces[f.surface.kind] ?? 0) + 1
    return {
      id: b.id,
      exact: true,
      volume: mp.volume,
      area: mp.area,
      centroid: mp.centroid,
      ...(rep.genus === undefined ? {} : { genus: rep.genus }),
      faces: b.brep.faces.length,
      edges: b.brep.edges.length,
      vertices: b.brep.vertices.length,
      surfaces,
      valid: rep.valid
    }
  })

export interface HistoryStep {
  /** ISO 10303-21 text (AP214), or undefined when no body has an exact model. */
  readonly step?: string
  readonly exported: ReadonlyArray<string>
  readonly skipped: ReadonlyArray<{ readonly id: string; readonly reason: string }>
}

/** The exact bodies of a history as a STEP file, one product per body (`name` alone for a single body). */
export const historyToStep = (history: History, name = "part", options: StepWriteOptions = {}): HistoryStep => {
  const ex = rebuildExact(history)
  const parts = ex.bodies.filter((b) => b.brep !== undefined).map((b) => ({ name: ex.bodies.length === 1 ? name : `${name}-${b.id}`, brep: b.brep! }))
  const skipped = ex.bodies.filter((b) => b.brep === undefined).map((b) => ({ id: b.id, reason: b.reason ?? "no exact model" }))
  return parts.length === 0 ? { exported: [], skipped } : { step: writeStepBreps(parts, options), exported: parts.map((p) => p.name), skipped }
}
