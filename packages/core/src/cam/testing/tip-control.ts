/**
 * Carries the replay of a program written under the control's tool-centre-point mode to machine coordinates (spec 72 step 0.2, P4-6).
 *
 * The interpreter marks every motion read while a tip-control word was active (`G43.4`, `G234`, `M128`, `TRAORI`, a definition's own
 * blocks) with `tcp: true`: its X Y Z are the tool tip in part coordinates and the control moves the linear axes to keep it there while
 * the table turns. Everything downstream of the replay (stock removal, rapid / shank / holder checks, table clearance, travel, the
 * comparison with the planned motion) reads machine-axis positions with the angles in force. This module is the one place that
 * converts, so those verdicts are the same whichever frame the post wrote:
 *
 *   machine = R(angles) (tip - pivot) + pivot          (`partToMachine`, `indexing.ts`)
 *
 * The tip path the control follows between two motions is the straight line in part coordinates with the angles interpolated linearly;
 * in machine axes that is a curve when an angle changes, so such a motion is split where the machine-axis chord leaves the true path by
 * more than `tolerance` (the same rule, and the same default 0.01 mm, as the post's own splitting in `five-axis-frame.ts`). A motion
 * that does not change an angle maps rigidly: a straight line stays a straight line and is not split.
 *
 * A motion without the mode (the control off, e.g. after `G43 H` or `TRAFOOF`) is a machine-axis position as written; its start is
 * where the previous motion left the machine, and its tip is carried back to the part with `machineToPart` so a later TCP motion starts
 * at the tip the machine really stands on.
 *
 * Not covered, reported and never passed silently: an arc while the table stands tilted (a circle of the part frame is no circle in the
 * machine axes, it is replayed as chords within `tolerance`, counted in `arcsLinearised`); a motion that would need more than
 * {@link MAX_DEPTH} bisections to stay within `tolerance` (counted in `unconverged`, written with the chord it reached).
 */
import type { Vec3 } from "../../cad/vec.ts"
import { fiveAxisKinematic } from "../five-axis.ts"
import { partToMachine, type RotaryAngles, type RotaryLayout } from "../indexing.ts"
import { machineToPart } from "../post/five-axis-frame.ts"
import type { GSegment, P3, RotaryAngles as SegmentAngles } from "./gcode-interpreter.ts"

export const MAX_DEPTH = 12

/** The table the tip is carried through: its layout and the centre of rotation in machine coordinates. */
export interface TipKinematic {
  readonly layout: RotaryLayout
  readonly pivot: Vec3
}

export interface CarryResult {
  /** The same segments in machine coordinates (no segment carries `tcp` any more); the input array itself when none was marked. */
  readonly segments: ReadonlyArray<GSegment>
  /** Motions that were read under tip control and carried. */
  readonly carried: number
  /** Pieces made by splitting turning motions (more pieces than motions). */
  readonly pieces: number
  readonly arcsLinearised: number
  /** Motions that stayed outside `tolerance` at the deepest bisection. */
  readonly unconverged: number
  /** Pieces that stop short of the end of their NC motion: they lie on the tip path, not at a position the program wrote. */
  readonly interior: ReadonlySet<GSegment>
  /** Largest distance of a carried tip from the pivot, mm: the lever that turns an angle rounding into a position error. */
  readonly maxRadius: number
}

type Angles = { a: number; b: number; c: number }

const zero = (): Angles => ({ a: 0, b: 0, c: 0 })
const anglesOf = (held: Angles, r: SegmentAngles | undefined): Angles => (r === undefined ? held : { a: r.a ?? held.a, b: r.b ?? held.b, c: r.c ?? held.c })
const turns = (p: Angles, q: Angles): boolean => p.a !== q.a || p.b !== q.b || p.c !== q.c
const lerp = (p: P3, q: P3, t: number): P3 => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t, z: p.z + (q.z - p.z) * t })
const lerpAngles = (p: Angles, q: Angles, t: number): Angles => ({ a: p.a + (q.a - p.a) * t, b: p.b + (q.b - p.b) * t, c: p.c + (q.c - p.c) * t })
const dist = (p: P3, q: P3): number => Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z)
const tilted = (h: Angles): boolean => h.a !== 0 || h.b !== 0 || h.c !== 0

/** Machine position of the tool tip `tip` (part coordinates) with the table at `h`. */
export const tipToMachine = (tip: Vec3, h: { readonly a?: number; readonly b?: number; readonly c?: number }, k: TipKinematic): Vec3 =>
  partToMachine(tip, { ...(h.a !== undefined ? { a: h.a } : {}), ...(h.b !== undefined ? { b: h.b } : {}), c: h.c ?? 0 } satisfies RotaryAngles, k.layout, k.pivot)

/** Tool tip (part coordinates) of a machine position with the table at `h`. */
export const machineToTip = (machine: Vec3, h: { readonly a?: number; readonly b?: number; readonly c?: number }, k: TipKinematic): Vec3 =>
  machineToPart(machine, h, fiveAxisKinematic({ layout: k.layout, pivot: k.pivot, tcp: "program" }))

/**
 * The segments of an interpreted program with every motion read under tip control carried to machine coordinates. Returns the input
 * unchanged when no motion is marked, so a program written without a tip-control word costs nothing and is not touched.
 */
export const carryTipControl = (segments: ReadonlyArray<GSegment>, kinematic: TipKinematic, options: { readonly tolerance?: number } = {}): CarryResult => {
  if (!segments.some((s) => s.kind !== "dwell" && s.tcp === true)) return { segments, carried: 0, pieces: 0, arcsLinearised: 0, unconverged: 0, interior: new Set(), maxRadius: 0 }
  const tolerance = options.tolerance ?? 0.01
  if (!(Number.isFinite(tolerance) && tolerance > 0)) throw new RangeError("tolerance must be a positive number of millimetres")
  const out: GSegment[] = []
  let carried = 0, pieces = 0, arcsLinearised = 0, unconverged = 0, maxRadius = 0
  const interior = new Set<GSegment>()
  let held = zero()
  let machine: P3 | undefined
  let tip: P3 | undefined
  const radius = (p: P3): number => Math.hypot(p.x - kinematic.pivot.x, p.y - kinematic.pivot.y, p.z - kinematic.pivot.z)

  for (const s of segments) {
    if (s.kind === "dwell") { out.push(s); continue }
    machine ??= s.from
    tip ??= s.from
    const end = anglesOf(held, s.kind === "arc" ? undefined : s.rotary)
    if (s.tcp !== true) {
      // Machine-axis words as written. Its start is where the machine stands (after a tip-control motion that is the carried end).
      const seg = dist(s.from, machine) < 1e-9 ? s : { ...s, from: machine }
      out.push(seg)
      tip = machineToTip(s.to, end, kinematic)
      machine = s.to
      held = end
      continue
    }
    carried++
    const { tcp: _marked, ...plain } = s
    const tipFrom = tip, tipTo = s.to
    if (s.kind === "arc") {
      if (!tilted(held)) {
        // The table stands at zero: part and machine coordinates are the same.
        out.push({ ...plain, from: machine })
        tip = s.to
        machine = s.to
        continue
      }
      // A circle of the part frame is no circle in the machine axes: replayed as chords.
      arcsLinearised++
      const chords = arcPoints(s, tipFrom, tolerance)
      let previous = machine
      for (let n = 1; n < chords.length; n++) {
        const to = tipToMachine(chords[n]!, held, kinematic)
        maxRadius = Math.max(maxRadius, radius(to))
        const piece: GSegment = { kind: "linear", from: previous, to, feed: s.feed, line: s.line, ...(s.subLine !== undefined ? { subLine: s.subLine } : {}), rotary: heldRotary(held, kinematic.layout) }
        out.push(piece)
        if (n < chords.length - 1) interior.add(piece)
        pieces++
        previous = to
      }
      tip = tipTo
      machine = previous
      continue
    }
    const sample = (t: number): P3 => tipToMachine(lerp(tipFrom, tipTo, t), lerpAngles(held, end, t), kinematic)
    const cuts: number[] = []
    if (turns(held, end)) {
      const split = (t0: number, t1: number, depth: number): void => {
        const p = sample(t0), q = sample(t1)
        let worst = 0
        for (const f of [0.25, 0.5, 0.75]) worst = Math.max(worst, dist(sample(t0 + (t1 - t0) * f), lerp(p, q, f)))
        if (worst <= tolerance) { cuts.push(t1); return }
        if (depth >= MAX_DEPTH) { unconverged++; cuts.push(t1); return }
        const mid = (t0 + t1) / 2
        split(t0, mid, depth + 1)
        split(mid, t1, depth + 1)
      }
      split(0, 1, 0)
    } else cuts.push(1)
    let previous = machine
    maxRadius = Math.max(maxRadius, radius(tipFrom), radius(tipTo))
    cuts.forEach((t, n) => {
      const last = n === cuts.length - 1
      const to = last ? sample(1) : sample(t)
      const h = last ? end : lerpAngles(held, end, t)
      const rotary: SegmentAngles | undefined = s.rotary === undefined ? undefined : {
        ...(s.rotary.a !== undefined ? { a: h.a } : {}), ...(s.rotary.b !== undefined ? { b: h.b } : {}), ...(s.rotary.c !== undefined ? { c: h.c } : {})
      }
      const piece: GSegment = { ...plain, from: previous, to, ...(rotary !== undefined ? { rotary } : {}) }
      out.push(piece)
      if (!last) interior.add(piece)
      pieces++
      previous = to
    })
    tip = tipTo
    machine = previous
    held = end
  }
  return { segments: out, carried, pieces, arcsLinearised, unconverged, interior, maxRadius }
}

const heldRotary = (h: Angles, layout: RotaryLayout): SegmentAngles => (layout === "table-AC" ? { a: h.a, c: h.c } : { b: h.b, c: h.c })

/** Points of an arc in the part frame (XY circle, Z linear) so that no chord is farther than `tolerance` from the circle. */
const arcPoints = (s: Extract<GSegment, { kind: "arc" }>, from: P3, tolerance: number): ReadonlyArray<P3> => {
  const { center } = s
  const r0 = Math.hypot(from.x - center.x, from.y - center.y), r1 = Math.hypot(s.to.x - center.x, s.to.y - center.y)
  const a0 = Math.atan2(from.y - center.y, from.x - center.x), a1 = Math.atan2(s.to.y - center.y, s.to.x - center.x)
  let sweep = s.clockwise ? a0 - a1 : a1 - a0
  sweep = ((sweep % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
  if (Math.hypot(s.to.x - from.x, s.to.y - from.y) < 1e-9 || sweep < 1e-12) sweep = 2 * Math.PI
  const radius = Math.max(r0, r1, 1e-9)
  const step = radius > tolerance ? 2 * Math.acos(1 - tolerance / radius) : sweep
  const n = Math.min(10_000, Math.max(1, Math.ceil(sweep / step)))
  const points: P3[] = [from]
  for (let k = 1; k <= n; k++) {
    const t = k / n
    if (k === n) { points.push(s.to); break }
    const a = a0 + (s.clockwise ? -1 : 1) * sweep * t
    const r = r0 + (r1 - r0) * t
    points.push({ x: center.x + r * Math.cos(a), y: center.y + r * Math.sin(a), z: from.z + (s.to.z - from.z) * t })
  }
  return points
}
