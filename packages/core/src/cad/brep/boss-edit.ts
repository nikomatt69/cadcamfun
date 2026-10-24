/**
 * Direct editing of the bosses and shaft sections of an exact solid (Fusion's Press Pull on a cylindrical face): the convex
 * cylinders that go all the way round, read from the faces (a STEP import, a Boolean result and a parametric part are alike).
 * The twin of `hole-edit.ts`: the boss is a convex cylinder, the edit is one exact Boolean on the solid, every other face is
 * untouched.
 *
 *  - **grow**: a cylinder of the new radius over the boss's axial range is united with the solid.
 *  - **shrink**: the tube between the old and the new radius is subtracted over the same range.
 *
 * The result is checked like a hole edit: a valid solid whose volume moved by exactly pi (r'^2 - r^2) L. A boss whose ends are
 * not square to its axis (a chamfer, a fillet or a cone at the end), one that is split into several faces, and an edit that runs
 * into a neighbouring feature are refused with the reason, the solid unchanged.
 */
import { add3, cross3, dot3, length3, normalize3, scale3, sub3 } from "../vec.ts"
import { booleanBrep } from "./boolean.ts"
import { brepLocator } from "./classify.ts"
import { curvePoint, surfaceNormal, surfaceProject } from "./geom.ts"
import { massProperties } from "./mass.ts"
import { MODEL_TOL, frame, type Vec3 } from "./math.ts"
import { makeCylinder } from "./primitives.ts"
import type { Brep } from "./topology.ts"
import { validateBrep } from "./validate.ts"

/** How far the cutter of a shrink runs past the free end of the boss, mm. */
const OVERRUN = 1
const TAU = 2 * Math.PI
const MAX_GAP = Math.PI / 3

export interface RecognizedBoss {
  /** The cylindrical face. */
  readonly face: number
  /** A point on the axis at the start of the boss, and the unit axis; the boss runs `length` along it. */
  readonly origin: Vec3
  readonly axis: Vec3
  readonly diameter: number
  readonly length: number
  /** Whether the end beyond `start + length` (`"far"`), the start (`"near"`), both or neither is open air. */
  readonly free: "near" | "far" | "both" | "none"
}

/** Convex cylinders that go all the way round, with their axial range. */
export const recognizeBosses = (b: Brep): ReadonlyArray<RecognizedBoss> => {
  const out: RecognizedBoss[] = []
  const locator = brepLocator(b)
  for (let fi = 0; fi < b.faces.length; fi++) {
    const f = b.faces[fi]!, s = f.surface
    if (s.kind !== "cylinder") continue
    const axis = s.frame.z
    const samples: Vec3[] = []
    for (const loop of f.loops) for (const c of loop.coedges) {
      const e = b.edges[c.edge]!
      for (let k = 0; k <= 16; k++) samples.push(curvePoint(e.curve, e.t0 + ((e.t1 - e.t0) * k) / 16))
    }
    if (samples.length === 0) continue
    // Convex: the outward normal points away from the axis.
    const mid = samples[Math.floor(samples.length / 2)]!
    const uv = surfaceProject(s, mid)
    const n0 = surfaceNormal(s, uv.u, uv.v)
    const n = f.reversed ? scale3(n0, -1) : n0
    const d = sub3(mid, s.frame.origin)
    const radial = sub3(d, scale3(axis, dot3(d, axis)))
    if (dot3(n, radial) <= 0) continue
    // All the way round: no gap of a third of a turn between boundary samples.
    const ref = Math.abs(axis.x) < 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 }
    const u = normalize3(cross3(axis, ref)), v = cross3(axis, u)
    const angles: number[] = []
    let lo = Infinity, hi = -Infinity
    for (const p of samples) {
      const q = sub3(p, s.frame.origin)
      const t = dot3(q, axis)
      lo = Math.min(lo, t); hi = Math.max(hi, t)
      const r = sub3(q, scale3(axis, t))
      if (length3(r) > 1e-6) angles.push(Math.atan2(dot3(r, v), dot3(r, u)) + Math.PI)
    }
    const sorted = [...angles].sort((x, y) => x - y)
    let gap = sorted.length === 0 ? TAU : sorted[0]! + TAU - sorted[sorted.length - 1]!
    for (let i = 1; i < sorted.length; i++) gap = Math.max(gap, sorted[i]! - sorted[i - 1]!)
    if (gap > MAX_GAP || hi - lo < 1e-6) continue
    const at = (t: number) => add3(s.frame.origin, scale3(axis, t))
    const eps = Math.max(10 * MODEL_TOL, Math.min(0.05, s.radius * 0.05))
    const open = (t: number) => locator.classify(at(t), MODEL_TOL * 10) === "out"
    const near = open(lo - eps), far = open(hi + eps)
    out.push({ face: fi, origin: at(lo), axis, diameter: 2 * s.radius, length: hi - lo, free: near && far ? "both" : near ? "near" : far ? "far" : "none" })
  }
  return out
}

export interface BossEditResult {
  readonly brep: Brep
  /** Volume added (grow) or removed (shrink), mm³, signed: positive when material was added. */
  readonly volumeChange: number
}

/** Resizes one boss to `diameter`. Checked before it is returned: valid, and the volume moved by the exact cylinder shell. */
export const resizeBoss = (b: Brep, boss: RecognizedBoss, diameter: number): BossEditResult | string => {
  if (!(diameter > 0) || !Number.isFinite(diameter)) return "the diameter must be positive"
  if (Math.abs(diameter - boss.diameter) < 1e-9) return { brep: b, volumeChange: 0 }
  const r0 = boss.diameter / 2, r1 = diameter / 2
  const before = massProperties(b).volume
  const cylinder = (radius: number, from: number, to: number): Brep => makeCylinder(radius, to - from, frame(add3(boss.origin, scale3(boss.axis, from)), boss.axis))
  try {
    let solid: Brep
    if (r1 > r0) {
      solid = booleanBrep(b, cylinder(r1, 0, boss.length), "union").brep
    } else {
      // The tube between the new and the old wall; the free end (if any) gets an overrun so no cap is coplanar with the boss's own.
      const from = boss.free === "near" || boss.free === "both" ? -OVERRUN : 0
      const to = boss.free === "far" || boss.free === "both" ? boss.length + OVERRUN : boss.length
      const tube = booleanBrep(cylinder(r0, from, to), cylinder(r1, from - OVERRUN, to + OVERRUN), "subtract").brep
      solid = booleanBrep(b, tube, "subtract").brep
    }
    const report = validateBrep(solid)
    if (!report.valid) return `the edited solid is not valid (${report.issues.slice(0, 2).map((i) => i.message).join("; ")})`
    const after = massProperties(solid).volume
    const expected = Math.PI * (r1 * r1 - r0 * r0) * boss.length
    if (Math.abs(after - before - expected) > 1e-6 * Math.max(before, 1) + 1e-6 * Math.abs(expected)) {
      return `the edit changed the volume by ${(after - before).toFixed(6)} mm³ where the cylinder shell accounts for ${expected.toFixed(6)} mm³: it ran into a neighbouring feature (a chamfer, a fillet or another wall)`
    }
    return { brep: solid, volumeChange: after - before }
  } catch (cause) {
    return `the Boolean failed (${cause instanceof Error ? cause.message : String(cause)})`
  }
}
