/**
 * Smart fasteners (SolidWorks' Smart Fasteners, Fusion's fastener insert): the screws, washers and nuts an assembly needs,
 * read from the exact holes of its parts. Holes of different parts on one axis that touch along it form a stack; the size
 * comes from the clearance holes (ISO 273), the length from the clamped thickness plus the thread engagement in a tapped
 * hole (`threadEngagement`) or the washer, nut and two pitches of protrusion, rounded to the ISO 4762 length series. The
 * fasteners are exact solids placed on the hole axis, so they can be measured, checked for interference and written to STEP.
 */
import { add3, cross3, dot3, normalize3, scale3, sub3 } from "./vec.ts"
import {
  booleanBrep,
  circleProfileLoop,
  extrudeProfile,
  frame,
  polygonProfileLoop,
  recognizeHoles,
  revolveProfile,
  type Brep,
  type RecognizedHole,
  type Vec3
} from "./brep/index.ts"
import { METRIC_THREADS, threadEngagement, type ClearanceFit, type MetricThread } from "./fasteners.ts"

/** ISO 4762 socket head cap screw: hexagon socket across flats and depth. */
const SOCKET: Readonly<Record<string, readonly [number, number]>> = {
  M2: [1.5, 1], M2_5: [2, 1.1], M3: [2.5, 1.3], M4: [3, 2], M5: [4, 2.5], M6: [5, 3], M8: [6, 4], M10: [8, 5], M12: [10, 6],
  M14: [12, 7], M16: [14, 8], M20: [17, 10], M24: [19, 12], M30: [22, 15.5]
}
/** ISO 4032 hexagon nut: width across flats and height. */
const NUT: Readonly<Record<string, readonly [number, number]>> = {
  M2: [4, 1.6], M2_5: [5, 2], M3: [5.5, 2.4], M4: [7, 3.2], M5: [8, 4.7], M6: [10, 5.2], M8: [13, 6.8], M10: [16, 8.4], M12: [18, 10.8],
  M14: [21, 12.8], M16: [24, 14.8], M20: [30, 18], M24: [36, 21.5], M30: [46, 25.6]
}
/** ISO 7089 plain washer: inner diameter, outer diameter, thickness. */
const WASHER: Readonly<Record<string, readonly [number, number, number]>> = {
  M2: [2.2, 5, 0.3], M2_5: [2.7, 6, 0.5], M3: [3.2, 7, 0.5], M4: [4.3, 9, 0.8], M5: [5.3, 10, 1], M6: [6.4, 12, 1.6], M8: [8.4, 16, 1.6],
  M10: [10.5, 20, 2], M12: [13, 24, 2.5], M14: [15, 28, 2.5], M16: [17, 30, 3], M20: [21, 37, 3], M24: [25, 44, 4], M30: [31, 56, 4]
}
/** ISO 4762 nominal lengths, mm. */
export const ISO_4762_LENGTHS: ReadonlyArray<number> = [5, 6, 8, 10, 12, 16, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 180, 200, 220, 240, 260, 280, 300]

const key = (m: MetricThread) => m.name.replace(".", "_")

export type FastenerMaterial = "steel" | "aluminium" | "cast" | "plastic"

export interface FastenerBody {
  readonly id: string
  readonly brep: Brep
  /** Material the thread is cut in when this body's hole is tapped (default steel). */
  readonly material?: FastenerMaterial
}

/** How a hole serves a fastener of a given size. */
export type HoleRole =
  | { readonly kind: "clearance"; readonly thread: MetricThread; readonly fit: ClearanceFit }
  | { readonly kind: "tapped"; readonly thread: MetricThread }
  | { readonly kind: "none" }

/** Tolerance on a diameter when it is matched against the ISO tables, mm. */
const DIAMETER_TOL = 0.05

/** The fastener size a hole diameter belongs to: a clearance hole (ISO 273) or a tap drill (ISO 262 coarse). */
export const holeRole = (diameter: number): HoleRole => {
  for (const m of METRIC_THREADS) {
    for (const fit of ["medium", "fine", "coarse"] as const) if (Math.abs(m.clearance[fit] - diameter) <= DIAMETER_TOL) return { kind: "clearance", thread: m, fit }
  }
  for (const m of METRIC_THREADS) if (Math.abs(m.tapDrill - diameter) <= DIAMETER_TOL) return { kind: "tapped", thread: m }
  return { kind: "none" }
}

export interface WasherSpec { readonly designation: string; readonly inner: number; readonly outer: number; readonly thickness: number }

export interface FastenerPlan {
  /** Stable id from the stack's position: `fastener-<n>`. */
  readonly id: string
  readonly size: string
  readonly thread: MetricThread
  /** `ISO 4762 M8x30`. */
  readonly designation: string
  readonly length: number
  /** Point where the underside of the head sits, and the unit direction the screw points (into the parts). */
  readonly seat: Vec3
  readonly direction: Vec3
  /** Bodies the screw passes through, from the head; the last is the tapped one when `tapped` is set. */
  readonly bodies: ReadonlyArray<string>
  readonly tapped?: string
  /** Thickness clamped between the head (or washer) and the thread or the nut, mm. */
  readonly grip: number
  /** Length of thread engaged in the tapped hole, mm. */
  readonly engagement?: number
  /** Washer between the head and the entry face (not in a counterbore); it lies from `seat` along `direction`. */
  readonly headWasher?: WasherSpec
  /** Washer between the last part and the nut, lying from `nutWasherAt` along `direction`. */
  readonly nutWasher?: WasherSpec
  readonly nutWasherAt?: Vec3
  /** Nut from `at` along `direction`. */
  readonly nut?: { readonly designation: string; readonly across: number; readonly height: number; readonly at: Vec3 }
  readonly warnings: ReadonlyArray<string>
}

export interface UnfastenedStack {
  readonly bodies: ReadonlyArray<string>
  readonly at: Vec3
  readonly reason: string
}

export interface FastenerOptions {
  /** Washer under the head when the hole is not counterbored, and under the nut (default true). */
  readonly washers?: boolean
  /** Fasten a single part with a through clearance hole and nothing behind it (default false: nothing to clamp). */
  readonly single?: boolean
  /** Largest gap between the faces of two stacked parts, mm (default 0.2). */
  readonly gap?: number
}

export interface FastenerAnalysis {
  readonly plans: ReadonlyArray<FastenerPlan>
  readonly unfastened: ReadonlyArray<UnfastenedStack>
  /** Every recognised hole, by body. */
  readonly holes: ReadonlyArray<{ readonly body: string; readonly hole: RecognizedHole }>
}

interface Placed { readonly body: FastenerBody; readonly hole: RecognizedHole; readonly lo: number; readonly hi: number }

/** Deterministic "down" for a stack whose two ends are both open: screws go in from the top (then from +y, then from +x). */
const downward = (d: Vec3): Vec3 => {
  const k = Math.abs(d.z) > 1e-9 ? d.z : Math.abs(d.y) > 1e-9 ? d.y : d.x
  return k < 0 ? d : scale3(d, -1)
}

const fmt = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(1))

/**
 * The fasteners an assembly needs. Bodies are in one frame (world). A stack is fastened when its first hole is a clearance
 * hole (or a counterbore) of some size and every following hole is a clearance hole of the same size, the last one possibly
 * a tap drill of that size; anything else is reported in `unfastened` with the reason.
 */
/** Holes of different parts on one axis that touch along it, ordered along `axis` (which points down, see `downward`). */
export interface HoleStack {
  readonly origin: Vec3
  readonly axis: Vec3
  readonly holes: ReadonlyArray<{ readonly body: string; readonly hole: RecognizedHole; readonly lo: number; readonly hi: number }>
}

const AXIS_TOL = 0.01

/** Every hole of the bodies, grouped into stacks: same axis line (within 0.01 mm), touching along it (within `gap`). */
const stacksOf = (bodies: ReadonlyArray<FastenerBody>, gap: number): { stacks: Array<{ origin: Vec3; axis: Vec3; holes: Placed[] }>; holes: Array<{ body: FastenerBody; hole: RecognizedHole }> } => {
  const holes: Array<{ body: FastenerBody; hole: RecognizedHole }> = []
  for (const body of bodies) for (const hole of recognizeHoles(body.brep)) holes.push({ body, hole })
  const lines: Array<{ origin: Vec3; axis: Vec3; members: Array<{ body: FastenerBody; hole: RecognizedHole }> }> = []
  for (const h of holes) {
    const d = h.hole.direction
    const line = lines.find((l) => {
      if (Math.abs(Math.abs(dot3(l.axis, d)) - 1) > 1e-6) return false
      const w = sub3(h.hole.entry, l.origin)
      const off = sub3(w, scale3(l.axis, dot3(w, l.axis)))
      return Math.hypot(off.x, off.y, off.z) <= AXIS_TOL
    })
    if (line !== undefined) line.members.push(h)
    else lines.push({ origin: h.hole.entry, axis: downward(d), members: [h] })
  }
  const stacks: Array<{ origin: Vec3; axis: Vec3; holes: Placed[] }> = []
  for (const line of lines) {
    // Place every hole on the line's axis (pointing down), then cut into stacks of touching holes.
    const placed: Placed[] = line.members.map(({ body, hole }) => {
      const t = dot3(sub3(hole.entry, line.origin), line.axis)
      const s = dot3(hole.direction, line.axis)
      const a = t, c = t + s * hole.depth
      return { body, hole, lo: Math.min(a, c), hi: Math.max(a, c) }
    }).sort((x, y) => x.lo - y.lo || x.body.id.localeCompare(y.body.id))
    const own: Placed[][] = []
    for (const p of placed) {
      const last = own[own.length - 1]
      if (last !== undefined && p.lo <= Math.max(...last.map((q) => q.hi)) + gap) last.push(p)
      else own.push([p])
    }
    for (const s of own) stacks.push({ origin: line.origin, axis: line.axis, holes: s })
  }
  return { stacks, holes }
}

/** The hole stacks of an assembly (see `planFasteners`), each with at least `min` holes (default 2: parts that share an axis). */
export const holeStacks = (bodies: ReadonlyArray<FastenerBody>, options: { readonly gap?: number; readonly min?: number } = {}): ReadonlyArray<HoleStack> =>
  stacksOf(bodies, options.gap ?? 0.2).stacks.filter((s) => s.holes.length >= (options.min ?? 2))
    .map((s) => ({ origin: s.origin, axis: s.axis, holes: s.holes.map((p) => ({ body: p.body.id, hole: p.hole, lo: p.lo, hi: p.hi })) }))

export const planFasteners = (bodies: ReadonlyArray<FastenerBody>, options: FastenerOptions = {}): FastenerAnalysis => {
  const gap = options.gap ?? 0.2
  const withWashers = options.washers ?? true
  const { stacks: all, holes } = stacksOf(bodies, gap)
  const plans: FastenerPlan[] = []
  const unfastened: UnfastenedStack[] = []
  for (const { origin, axis, holes: stack } of all) {
    const line = { origin, axis }
    {
      const at = add3(line.origin, scale3(line.axis, stack[0]!.lo))
      const ids = stack.map((p) => p.body.id)
      if (new Set(ids).size !== ids.length) { unfastened.push({ bodies: ids, at, reason: "two holes of one part on the same stack" }); continue }
      // Orientation: a blind or tapped end is the far end; a counterbore or countersink is the head end; else from the top.
      const roleOf = (p: Placed) => holeRole(p.hole.diameter)
      const isFar = (p: Placed) => p.hole.bottom !== "through" || roleOf(p).kind === "tapped"
      const isHead = (p: Placed) => p.hole.form !== "simple"
      let order = stack
      let dir = line.axis
      const first = stack[0]!, last = stack[stack.length - 1]!
      if (isFar(first) && !isFar(last)) { order = [...stack].reverse(); dir = scale3(line.axis, -1) }
      else if (!isFar(last) && isHead(last) && !isHead(first)) { order = [...stack].reverse(); dir = scale3(line.axis, -1) }
      const head = order[0]!, tail = order[order.length - 1]!
      const headRole = roleOf(head)
      if (headRole.kind !== "clearance") {
        unfastened.push({ bodies: order.map((p) => p.body.id), at, reason: `the entry hole (${fmt(head.hole.diameter)} mm) is not an ISO 273 clearance hole` })
        continue
      }
      const thread = headRole.thread
      const middle = order.slice(1, -1)
      const bad = middle.find((p) => { const r = roleOf(p); return r.kind !== "clearance" || r.thread.d !== thread.d })
      if (bad !== undefined) {
        unfastened.push({ bodies: order.map((p) => p.body.id), at, reason: `the hole in '${bad.body.id}' (${fmt(bad.hole.diameter)} mm) does not pass an ${thread.name} screw` })
        continue
      }
      const tailRole = order.length > 1 ? roleOf(tail) : headRole
      const tapped = order.length > 1 && tailRole.kind === "tapped" ? tail : undefined
      if (order.length > 1 && tapped === undefined && (tailRole.kind !== "clearance" || tailRole.thread.d !== thread.d)) {
        unfastened.push({ bodies: order.map((p) => p.body.id), at, reason: `the last hole (${fmt(tail.hole.diameter)} mm, '${tail.body.id}') is neither an ${thread.name} clearance hole nor its ${fmt(thread.tapDrill)} mm tap drill` })
        continue
      }
      if (tapped !== undefined && tailRole.kind === "tapped" && tailRole.thread.d !== thread.d) {
        unfastened.push({ bodies: order.map((p) => p.body.id), at, reason: `the tapped hole in '${tail.body.id}' is ${tailRole.thread.name}, the clearance holes are ${thread.name}` })
        continue
      }
      if (order.length === 1 && !(options.single ?? false)) {
        unfastened.push({ bodies: [head.body.id], at, reason: "a single part: nothing to clamp" })
        continue
      }
      if (tapped === undefined && tail.hole.bottom !== "through") {
        unfastened.push({ bodies: order.map((p) => p.body.id), at, reason: "a blind clearance hole leaves no room for a nut" })
        continue
      }
      // Axial positions along `dir`, measured from the head hole's opening.
      const down = dot3(dir, line.axis) > 0
      const origin = down ? head.lo : head.hi
      const along = (p: Placed) => (down ? { start: p.lo - origin, end: p.hi - origin } : { start: origin - p.hi, end: origin - p.lo })
      const entry = add3(line.origin, scale3(line.axis, origin))
      const warnings: string[] = []
      const counterbore = head.hole.form === "counterbore" ? head.hole.headDepth ?? 0 : 0
      if (head.hole.form === "counterbore" && head.hole.headDiameter !== undefined && head.hole.headDiameter < thread.headDiameter + 0.2)
        warnings.push(`the counterbore (${fmt(head.hole.headDiameter)} mm) is too small for the ${thread.name} head (${fmt(thread.headDiameter)} mm)`)
      if (head.hole.form === "countersink") warnings.push("a countersunk hole takes an ISO 10642 flat head; a socket head cap screw is placed on the opening")
      const w = WASHER[key(thread)]!
      const washerSpec = { designation: `ISO 7089 ${thread.name}`, inner: w[0], outer: w[1], thickness: w[2] }
      const headWasher = withWashers && head.hole.form === "simple" ? washerSpec : undefined
      // The head seats on the counterbore floor, on the washer above the entry face, or on the entry face.
      const seatDepth = counterbore - (headWasher?.thickness ?? 0)
      const seat = add3(entry, scale3(dir, seatDepth))
      const clampEnd = tapped !== undefined ? along(tapped).start : along(tail).end
      const grip = clampEnd - Math.max(0, seatDepth)
      // Length of the screw from the underside of its head to the far end of the clamped parts.
      const base = clampEnd - seatDepth
      let length: number
      let engagement: number | undefined
      let nut: FastenerPlan["nut"]
      let nutWasher: FastenerPlan["nutWasher"]
      if (tapped !== undefined) {
        const material = tapped.body.material ?? "steel"
        const need = threadEngagement(thread.name, material)
        // A blind tapped hole keeps two pitches of drill point and thread run-out below the screw.
        const room = tapped.hole.bottom === "through" ? Infinity : tapped.hole.depth - 2 * thread.pitch
        const fitting = ISO_4762_LENGTHS.filter((l) => l - base <= room + 1e-9 && l - base > 0)
        length = fitting.find((l) => l - base >= need - 1e-9) ?? fitting[fitting.length - 1] ?? ISO_4762_LENGTHS.find((l) => l > base) ?? base
        engagement = Math.min(length - base, tapped.hole.depth)
        if (fitting.length === 0) warnings.push(`the ${thread.name} tapped hole is too shallow for any standard length`)
        else if (engagement < need - 1e-9) warnings.push(`thread engagement ${fmt(engagement)} mm is below the ${fmt(need)} mm a thread in ${material} needs`)
      } else {
        const [across, height] = NUT[key(thread)]!
        nutWasher = withWashers ? washerSpec : undefined
        const under = nutWasher?.thickness ?? 0
        const need = base + under + height + 2 * thread.pitch
        length = ISO_4762_LENGTHS.find((l) => l >= need - 1e-9) ?? ISO_4762_LENGTHS[ISO_4762_LENGTHS.length - 1]!
        if (length < need - 1e-9) warnings.push(`no standard ${thread.name} length reaches ${fmt(need)} mm`)
        nut = { designation: `ISO 4032 ${thread.name}`, across, height, at: add3(entry, scale3(dir, clampEnd + under)) }
      }
      plans.push({
        id: `fastener-${plans.length + 1}`,
        size: thread.name,
        thread,
        designation: `ISO 4762 ${thread.name}x${fmt(length)}`,
        length,
        seat,
        direction: normalize3(dir),
        bodies: order.map((p) => p.body.id),
        ...(tapped !== undefined ? { tapped: tapped.body.id } : {}),
        grip,
        ...(engagement !== undefined ? { engagement } : {}),
        ...(headWasher !== undefined ? { headWasher } : {}),
        ...(nutWasher !== undefined ? { nutWasher, nutWasherAt: add3(entry, scale3(dir, clampEnd)) } : {}),
        ...(nut !== undefined ? { nut } : {}),
        warnings
      })
    }
  }
  return { plans, unfastened, holes: holes.map(({ body, hole }) => ({ body: body.id, hole })) }
}

const radialOf = (d: Vec3): Vec3 => normalize3(cross3(d, Math.abs(d.x) < 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 }))

/** ISO 4762 socket head cap screw as an exact solid: head behind `seat`, shank along `direction`, hexagon socket in the head. */
export const socketHeadScrew = (thread: MetricThread, length: number, seat: Vec3, direction: Vec3): Brep => {
  const d = thread.d, dk = thread.headDiameter, k = thread.headHeight
  const c = Math.min(thread.pitch, d * 0.1) // tip chamfer
  const e = Math.min(0.08 * dk, 0.5) // head edge rounding, as a chamfer
  // Profile in (radial, axial) with axial measured along -direction (the head side is positive).
  const profile = [
    { x: 0, y: k }, { x: dk / 2 - e, y: k }, { x: dk / 2, y: k - e }, { x: dk / 2, y: 0 }, { x: d / 2, y: 0 },
    { x: d / 2, y: -(length - c) }, { x: d / 2 - c, y: -length }, { x: 0, y: -length }
  ]
  const axis = scale3(direction, -1)
  const body = revolveProfile({ loops: [polygonProfileLoop(profile)] }, 2 * Math.PI, { origin: seat, axis, radial: radialOf(axis), name: "screw" })
  const [s, t] = SOCKET[key(thread)]!
  const hexR = s / Math.sqrt(3)
  const hex = Array.from({ length: 6 }, (_, i) => ({ x: hexR * Math.cos((i * Math.PI) / 3), y: hexR * Math.sin((i * Math.PI) / 3) }))
  // Socket prism from just above the head down to depth t below its top.
  const top = add3(seat, scale3(axis, k + 0.5))
  const socket = extrudeProfile({ loops: [polygonProfileLoop(hex)] }, t + 0.5, { placement: frame(top, direction, radialOf(direction)), name: "socket" })
  return booleanBrep(body, socket, "subtract").brep
}

/** ISO 7089 plain washer lying on `at`, its far face `thickness` along `direction`. */
export const plainWasher = (inner: number, outer: number, thickness: number, at: Vec3, direction: Vec3): Brep =>
  revolveProfile({ loops: [polygonProfileLoop([{ x: inner / 2, y: 0 }, { x: outer / 2, y: 0 }, { x: outer / 2, y: thickness }, { x: inner / 2, y: thickness }])] }, 2 * Math.PI,
    { origin: at, axis: direction, radial: radialOf(direction), name: "washer" })

/** ISO 4032 hexagon nut starting at `at`, `height` along `direction`, bore at the nominal diameter. */
export const hexNut = (thread: MetricThread, across: number, height: number, at: Vec3, direction: Vec3): Brep => {
  const r = across / Math.sqrt(3)
  const hex = Array.from({ length: 6 }, (_, i) => ({ x: r * Math.cos((i * Math.PI) / 3 + Math.PI / 6), y: r * Math.sin((i * Math.PI) / 3 + Math.PI / 6) }))
  return extrudeProfile({ loops: [polygonProfileLoop(hex), circleProfileLoop({ x: 0, y: 0 }, thread.d / 2)] }, height, { placement: frame(at, direction, radialOf(direction)), name: "nut" })
}

export interface FastenerSolid {
  readonly role: "screw" | "washer" | "nut"
  readonly designation: string
  readonly brep: Brep
}

/** The exact solids of a plan: the screw, its washers (under the head and under the nut) and the nut. */
export const fastenerSolids = (plan: FastenerPlan): ReadonlyArray<FastenerSolid> => {
  const out: FastenerSolid[] = [{ role: "screw", designation: plan.designation, brep: socketHeadScrew(plan.thread, plan.length, plan.seat, plan.direction) }]
  const hw = plan.headWasher
  if (hw !== undefined) out.push({ role: "washer", designation: hw.designation, brep: plainWasher(hw.inner, hw.outer, hw.thickness, plan.seat, plan.direction) })
  const nw = plan.nutWasher
  if (nw !== undefined && plan.nutWasherAt !== undefined) out.push({ role: "washer", designation: nw.designation, brep: plainWasher(nw.inner, nw.outer, nw.thickness, plan.nutWasherAt, plan.direction) })
  if (plan.nut !== undefined) out.push({ role: "nut", designation: plan.nut.designation, brep: hexNut(plan.thread, plan.nut.across, plan.nut.height, plan.nut.at, plan.direction) })
  return out
}
