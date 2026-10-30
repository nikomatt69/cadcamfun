/**
 * Engagement along a program (spec 61 Z1/Z2, spec 69 G0): for every step of every move of a 3-axis program, the radial engagement
 * `ae`, the axial engagement `ap`, the contact arc of the cutter (its entry and exit angles, `φ`) and the cut area, measured on the
 * stock the program carries (the height field of `verify/heightfield.ts`: what is left after every earlier move, including the moves
 * of the same program). Then the load of each step through the one Kienzle function the nominal cut also uses (`millingLoad` of
 * `cutting-data.ts`), so the nominal result is the per-move result at constant engagement.
 *
 * How it is measured. The stock is sampled at the cutter's periphery (radius `R - 0.71 cell`, so the cell read is always one the cutter
 * has already visited behind it): a periphery angle is *engaged* when material stands above the cutting surface there. Behind the
 * cutter the tool has already cleared the stock (the field is lowered after every sample), so the engaged arc is the arc ahead: a slot
 * has `φ = π`, a shoulder cut of radial depth `ae` has `φ = acos(1 - 2 ae / D)`. Every value carries a declared bound (`bound`): the
 * radial depth is exact up to `cell · √2` (half a cell diagonal of quantisation plus the half diagonal read offset), and the arc angle
 * follows from it.
 *
 * Five-axis moves have no engagement here: a move with rotary words, and every move after a non-zero `Orient`, is `unresolved` with
 * the reason (spec 61 §3.1); nothing is extrapolated from a 3-axis value.
 */
import { arcSweepBetween, expandMoves, isFullCircle, type Move } from "../ir.ts"
import type { Vec3 } from "../../cad/vec.ts"
import { EPS, HeightField, type CuttingProfile } from "../verify/heightfield.ts"
import type { Cutter } from "./cutters.ts"
import { deflection, effectiveDiameter, millingLoad, powerLimitAt, type Load, type MachineLimits } from "./cutting-data.ts"
import type { WorkpieceMaterial } from "./materials.ts"

// ------------------------------------------------------------------------------------------------- cutter profile

/** The cutting surface of a kernel cutter as the height field stamps it: flat, ball, bull nose (corner radius), cone (chamfer, spot, engraver). */
export const cutterProfile = (c: Cutter): CuttingProfile => {
  const radius = c.diameter / 2
  if (c.kind === "ball") return { radius, flat: false, profile: (r) => radius - Math.sqrt(Math.max(0, radius * radius - r * r)) }
  if (c.kind === "bull" && c.cornerRadius !== undefined && c.cornerRadius > 0) {
    const rc = Math.min(c.cornerRadius, radius)
    const inner = radius - rc
    return { radius, flat: false, profile: (r) => (r <= inner ? 0 : rc - Math.sqrt(Math.max(0, rc * rc - (r - inner) * (r - inner)))) }
  }
  if (c.kind === "chamfer" || c.kind === "spot" || c.kind === "engraver") {
    const slope = Math.tan(((c.angle ?? 90) * Math.PI) / 360)
    const tip = (c.tipDiameter ?? 0) / 2
    return { radius, flat: false, profile: (r) => Math.max(0, r - tip) / slope }
  }
  return { radius, flat: true, profile: () => 0 }
}

// ------------------------------------------------------------------------------------------------- stock

/** A fresh stock block: a height field over the box `[minX, maxX] x [minY, maxY]`, solid from `floor` to `top`. */
export const stockBlock = (minX: number, minY: number, maxX: number, maxY: number, floor: number, top: number, cell: number): HeightField => {
  const nx = Math.max(1, Math.round((maxX - minX) / cell))
  const ny = Math.max(1, Math.round((maxY - minY) / cell))
  return new HeightField(nx, ny, minX, minY, maxX - minX, maxY - minY, floor, top)
}

/** Independent copy: the engagement run lowers the field as it goes, the caller's stock stays as it was. */
export const cloneStock = (s: HeightField): HeightField => {
  const copy = new HeightField(s.nx, s.ny, s.minX, s.minY, s.width, s.height, s.floor, s.ceiling)
  copy.top.set(s.top)
  return copy
}

// ------------------------------------------------------------------------------------------------- result types

export type EngagementStatus = "resolved" | "air" | "unresolved"

/** Engagement of one move (after cycles are expanded): the aggregate of its steps. */
export interface MoveEngagement {
  /** Index in `EngagementResult.moves`. */
  readonly index: number
  readonly status: EngagementStatus
  /** Why a move is `unresolved`. */
  readonly reason?: string
  /** First step and one past the last step in the step arrays. */
  readonly from: number
  readonly to: number
  readonly length: number
  /** Length of the part of the move that cuts material, mm. */
  readonly cutLength: number
  readonly aeMax: number
  /** Length-weighted mean of `ae` over the cutting steps. */
  readonly aeMean: number
  readonly apMax: number
  readonly phiMax: number
  /** Largest cut area (chip cross-section perpendicular to the feed), mm². */
  readonly areaMax: number
  /** Material removed by the move, mm³. */
  readonly removed: number
}

export interface StepArrays {
  readonly count: number
  /** Index of the move the step belongs to. */
  readonly move: Int32Array
  /** Distance travelled since the previous step of the same move, mm. */
  readonly length: Float64Array
  readonly ae: Float64Array
  readonly ap: Float64Array
  /** Contact arc, radians. */
  readonly phi: Float64Array
  /** Start and end of the contact arc relative to the direction of travel, radians (NaN when the cutter is not moving sideways or not engaged). */
  readonly entry: Float64Array
  readonly exit: Float64Array
  /** Cut area, mm² (removed volume over the step length; 0 for the first step of a move). */
  readonly area: Float64Array
  readonly removed: Float64Array
}

export interface EngagementBound {
  /** Stock cell the bound derives from, mm (the larger of the two sides). */
  readonly cell: number
  /** The radial engagement is exact within this, mm. */
  readonly ae: number
  /** The contact arc `φ` at a measured `ae`, within this, radians: `φ(ae + bound) - φ(ae - bound)` half-spread. */
  readonly phiAt: (ae: number) => number
  /** The step length of the sampling, mm (the programmed path is followed at this resolution). */
  readonly step: number
}

export interface EngagementResult {
  /** The move list the indices refer to: the input with every canned cycle expanded. */
  readonly moves: ReadonlyArray<Move>
  readonly perMove: ReadonlyArray<MoveEngagement>
  readonly steps: StepArrays
  readonly bound: EngagementBound
  readonly diameter: number
}

export interface EngagementOptions {
  /** Distance between samples along a move, mm. Default: a stock cell (at most a quarter radius). */
  readonly step?: number
  /** Periphery samples. Default: one per half cell of circumference, 90..720. */
  readonly angles?: number
  /** Where the tool stands before the first move. Default: the target of the first move. */
  readonly start?: Vec3
  readonly signal?: AbortSignal
  /** Lower the caller's stock instead of a copy (the caller then holds the stock after the program). */
  readonly inPlace?: boolean
}

const TAU = Math.PI * 2

/** The contact arc of radial depth `ae` on a cutter of diameter `d`: `acos(1 - 2 ae / d)`; `π` at and above the full width. */
export const contactArc = (ae: number, d: number): number => Math.acos(Math.max(-1, Math.min(1, 1 - (2 * Math.min(Math.max(ae, 0), d)) / d)))
/** Radial depth of a contact arc `phi` (up to `π`): `R (1 - cos φ)`. */
export const radialOf = (phi: number, d: number): number => (d / 2) * (1 - Math.cos(Math.min(phi, Math.PI)))

/** Declared bound of the engagement for a stock cell (see the module comment): `ae` within `cell · √2`. */
export const engagementBound = (cell: number, d: number, step: number): EngagementBound => {
  const ae = cell * Math.SQRT2
  return { cell, ae, step, phiAt: (value) => Math.max(contactArc(value + ae, d) - contactArc(value, d), contactArc(value, d) - contactArc(Math.max(0, value - ae), d)) }
}

// ------------------------------------------------------------------------------------------------- sampling

interface Segment {
  readonly kind: "line" | "arc"
  readonly from: Vec3
  readonly to: Vec3
  readonly center?: { readonly x: number; readonly y: number }
  readonly clockwise?: boolean
  readonly sweep?: number
  readonly radius?: number
  readonly length: number
  readonly cuts: boolean
}

const growth = (arr: Float64Array<ArrayBuffer>, n: number): Float64Array<ArrayBuffer> => {
  const next = new Float64Array(Math.max(64, arr.length * 2, n))
  next.set(arr)
  return next
}

/**
 * Engagement of every step of `moves` on `stock` for `cutter`. Rapids move the cutter without cutting (the stock is not changed and
 * the move is `air`); feed moves and arcs cut. See the module comment for what is measured and the bound.
 */
export const engagementAlong = (moves: ReadonlyArray<Move>, stock: HeightField, cutter: Cutter, options: EngagementOptions = {}): EngagementResult => {
  const field = options.inPlace === true ? stock : cloneStock(stock)
  const tool = cutterProfile(cutter)
  const R = tool.radius
  const D = 2 * R
  const cell = Math.max(field.cellX, field.cellY)
  const step = Math.max(options.step ?? Math.min(cell, R / 4), cell / 8, 1e-3)
  const nAngles = Math.max(90, Math.min(720, options.angles ?? Math.ceil((TAU * R) / (cell / 2))))
  const cosT = new Float64Array(nAngles)
  const sinT = new Float64Array(nAngles)
  for (let k = 0; k < nAngles; k++) { cosT[k] = Math.cos((TAU * k) / nAngles); sinT[k] = Math.sin((TAU * k) / nAngles) }
  const hit = new Uint8Array(nAngles)
  // The periphery is read on the stock as it stood `lag` samples ago: the stamp of the last samples has already cleared the strip the
  // cutter is about to enter, so reading the field right after them would see only a sliver (a slot would show a thin lens, not π).
  const lag = Math.max(1, Math.ceil((1.5 * cell) / step))

  const expanded = expandMoves(moves, options.start ?? firstTarget(moves))
  const perMove: MoveEngagement[] = []
  let cap = 256
  let move = new Int32Array(cap)
  let lengthA = new Float64Array(cap), aeA = new Float64Array(cap), apA = new Float64Array(cap), phiA = new Float64Array(cap)
  let entryA = new Float64Array(cap), exitA = new Float64Array(cap), areaA = new Float64Array(cap), removedA = new Float64Array(cap)
  let n = 0
  const push = (m: number, len: number, ae: number, phi: number, entry: number, exit: number): number => {
    if (n === cap) {
      cap *= 2
      const m2 = new Int32Array(cap); m2.set(move); move = m2
      lengthA = growth(lengthA, cap); aeA = growth(aeA, cap); apA = growth(apA, cap); phiA = growth(phiA, cap)
      entryA = growth(entryA, cap); exitA = growth(exitA, cap); areaA = growth(areaA, cap); removedA = growth(removedA, cap)
    }
    move[n] = m; lengthA[n] = len; aeA[n] = ae; phiA[n] = phi; entryA[n] = entry; exitA[n] = exit
    return n++
  }

  // Contact arc at one sample: the periphery (radius `rEff`) against the stock as it is now.
  let outEntry = NaN, outExit = NaN
  const measure = (cx: number, cy: number, tipZ: number, dirX: number, dirY: number, rEff: number): number => {
    let engaged = 0
    hit.fill(0)
    const cutting = tipZ + (tool.flat ? 0 : tool.profile(rEff)) + EPS
    for (let k = 0; k < nAngles; k++) {
      const x = cx + rEff * cosT[k]!
      const y = cy + rEff * sinT[k]!
      const i = Math.floor((x - field.minX) / field.cellX)
      const j = Math.floor((y - field.minY) / field.cellY)
      if (i < 0 || j < 0 || i >= field.nx || j >= field.ny) continue
      if (field.top[j * field.nx + i]! > cutting) { hit[k] = 1; engaged++ }
    }
    outEntry = NaN; outExit = NaN
    // Entry / exit: the largest run of engaged angles, relative to the direction of travel.
    if (engaged > 0 && engaged < nAngles && (dirX !== 0 || dirY !== 0)) {
      let bestStart = -1, bestLen = 0, runStart = -1, runLen = 0
      // Scan from a non-engaged angle so a run that wraps around zero is one run.
      let first = 0
      while (first < nAngles && hit[first] === 1) first++
      for (let q = 0; q < nAngles; q++) {
        const idx = (first + q) % nAngles
        if (hit[idx] === 1) {
          if (runLen === 0) runStart = idx
          runLen++
          if (runLen > bestLen) { bestLen = runLen; bestStart = runStart }
        } else runLen = 0
      }
      if (bestStart >= 0) {
        const heading = Math.atan2(dirY, dirX)
        const wrap = (a: number): number => { let v = a % TAU; if (v > Math.PI) v -= TAU; if (v < -Math.PI) v += TAU; return v }
        outEntry = wrap((TAU * bestStart) / nAngles - heading)
        outExit = wrap((TAU * (bestStart + bestLen - 1)) / nAngles - heading)
      }
    }
    return (engaged * TAU) / nAngles
  }

  // The stamp of a sample: lower every column under the cutter; the deepest cut and the volume go to the sample's own step.
  let lastAp = R
  const stamp = (idx: number, cx: number, cy: number, tipZ: number, dirX: number, dirY: number, narrow: boolean): void => {
    const i0 = Math.max(0, Math.ceil((cx - R - field.minX) / field.cellX - 0.5)), i1 = Math.min(field.nx - 1, Math.floor((cx + R - field.minX) / field.cellX - 0.5))
    const j0 = Math.max(0, Math.ceil((cy - R - field.minY) / field.cellY - 0.5)), j1 = Math.min(field.ny - 1, Math.floor((cy + R - field.minY) / field.cellY - 0.5))
    const r2 = R * R
    const back = narrow ? -2 * cell : -Infinity
    let ap = 0
    let volume = 0
    for (let j = j0; j <= j1; j++) {
      const dy = field.centreY(j) - cy
      const row = j * field.nx
      for (let i = i0; i <= i1; i++) {
        const dx = field.centreX(i) - cx
        const d2 = dx * dx + dy * dy
        if (d2 > r2) continue
        // Behind the cutter (against the travel) the previous sample already cleared the column: skip it in a continuous move.
        if (narrow && dx * dirX + dy * dirY < back) continue
        const h = tool.flat ? tipZ : tipZ + tool.profile(Math.sqrt(d2))
        const t = field.top[row + i]!
        if (t > h) {
          const drop = t - h
          if (drop > ap) ap = drop
          volume += drop
          field.top[row + i] = h
        }
      }
    }
    volume *= field.cellArea
    apA[idx] = ap
    removedA[idx] = volume
    areaA[idx] = lengthA[idx]! > 1e-12 ? volume / lengthA[idx]! : 0
    if (ap > 0) lastAp = ap
  }

  // Pending stamps, oldest first.
  const qIdx = new Int32Array(lag + 1), qNarrow = new Uint8Array(lag + 1)
  const qx = new Float64Array(lag + 1), qy = new Float64Array(lag + 1), qz = new Float64Array(lag + 1), qux = new Float64Array(lag + 1), quy = new Float64Array(lag + 1)
  let qHead = 0, qCount = 0
  const popStamp = (): void => {
    const h = qHead
    stamp(qIdx[h]!, qx[h]!, qy[h]!, qz[h]!, qux[h]!, quy[h]!, qNarrow[h] === 1)
    qHead = (qHead + 1) % (lag + 1)
    qCount--
  }
  const flush = (): void => { while (qCount > 0) popStamp() }

  const cancelled = (): boolean => options.signal?.aborted === true
  let at: Vec3 = options.start ?? firstTarget(moves)
  let tilted: string | undefined
  for (let m = 0; m < expanded.length; m++) {
    if (cancelled()) throw new DOMException("engagement cancelled", "AbortError")
    const mv = expanded[m]!
    const from = n
    if (mv._tag === "Orient") {
      tilted = (mv.a ?? 0) !== 0 || (mv.b ?? 0) !== 0 || (mv.c ?? 0) !== 0 ? "a rotary axis is turned: the stock is a 3-axis height field (spec 53 V1 gives the tilted-axis stock)" : undefined
      perMove.push(emptyMove(m, from, tilted === undefined ? "air" : "unresolved", tilted))
      continue
    }
    if (mv._tag !== "Rapid" && mv._tag !== "Linear" && mv._tag !== "Arc") { perMove.push(emptyMove(m, from, "air")); continue }
    const to = mv.to
    const rotary = (mv._tag === "Rapid" || mv._tag === "Linear") ? mv.rotary : undefined
    if (rotary !== undefined && (rotary.a !== undefined || rotary.b !== undefined || rotary.c !== undefined)) {
      perMove.push(emptyMove(m, from, "unresolved", "the move carries rotary words: the stock is a 3-axis height field"))
      at = to
      continue
    }
    if (tilted !== undefined) { perMove.push(emptyMove(m, from, "unresolved", tilted)); at = to; continue }
    const seg: Segment = mv._tag === "Arc" ? arcSegment(mv, at) : lineSegment(at, to, mv._tag === "Linear")
    if (!seg.cuts) {
      perMove.push({ ...emptyMove(m, from, "air"), length: seg.length })
      at = to
      continue
    }
    const count = Math.max(1, Math.ceil(seg.length / step))
    let prev: Vec3 | undefined
    for (let s = 0; s <= count; s++) {
      if ((s & 255) === 0 && cancelled()) throw new DOMException("engagement cancelled", "AbortError")
      const p = pointOn(seg, s / count)
      const dx = prev === undefined ? 0 : p.x - prev.x, dy = prev === undefined ? 0 : p.y - prev.y
      const travelled = prev === undefined ? 0 : Math.hypot(dx, dy, p.z - prev.z)
      const horizontal = Math.hypot(dx, dy)
      let ux = horizontal > 1e-12 ? dx / horizontal : 0, uy = horizontal > 1e-12 ? dy / horizontal : 0
      if (prev === undefined) { const tn = tangentOn(seg, 0); ux = tn.x; uy = tn.y }
      const rEff = tool.flat ? R : Math.max(cell, Math.min(R, effectiveDiameter(cutter, lastAp) / 2))
      const phi = measure(p.x, p.y, p.z, ux, uy, rEff)
      const idx = push(m, travelled, phi > 0 ? radialOf(phi, 2 * rEff) : 0, phi, outEntry, outExit)
      // The stamp of this sample waits `lag` samples; the one that falls due now is applied first.
      if (qCount > lag) popStamp()
      const t = (qHead + qCount) % (lag + 1)
      qIdx[t] = idx; qx[t] = p.x; qy[t] = p.y; qz[t] = p.z; qux[t] = ux; quy[t] = uy
      qNarrow[t] = prev !== undefined && horizontal > 1e-12 && travelled <= 3 * cell + step ? 1 : 0
      qCount++
      prev = p
    }
    flush()
    let cutLength = 0, aeSum = 0, aeMax = 0, apMax = 0, phiMax = 0, areaMax = 0, removedSum = 0
    for (let k = from; k < n; k++) {
      if (removedA[k]! <= 0 && phiA[k]! <= 0) continue
      cutLength += lengthA[k]!
      aeSum += aeA[k]! * lengthA[k]!
      aeMax = Math.max(aeMax, aeA[k]!); apMax = Math.max(apMax, apA[k]!); phiMax = Math.max(phiMax, phiA[k]!); areaMax = Math.max(areaMax, areaA[k]!)
      removedSum += removedA[k]!
    }
    perMove.push({
      index: m, status: removedSum > 0 ? "resolved" : "air", from, to: n, length: seg.length, cutLength,
      aeMax, aeMean: cutLength > 0 ? aeSum / cutLength : 0, apMax, phiMax, areaMax, removed: removedSum
    })
    at = to
  }
  const trim = <T extends Float64Array>(a: T): T => a.slice(0, n) as T
  return {
    moves: expanded, perMove, diameter: D, bound: engagementBound(cell, D, step),
    steps: { count: n, move: move.slice(0, n), length: trim(lengthA), ae: trim(aeA), ap: trim(apA), phi: trim(phiA), entry: trim(entryA), exit: trim(exitA), area: trim(areaA), removed: trim(removedA) }
  }
}

const firstTarget = (moves: ReadonlyArray<Move>): Vec3 => {
  for (const m of moves) if (m._tag === "Rapid" || m._tag === "Linear" || m._tag === "Arc") return m.to
  return { x: 0, y: 0, z: 0 }
}

const emptyMove = (index: number, from: number, status: EngagementStatus, reason?: string): MoveEngagement => ({
  index, status, ...(reason !== undefined ? { reason } : {}), from, to: from, length: 0, cutLength: 0, aeMax: 0, aeMean: 0, apMax: 0, phiMax: 0, areaMax: 0, removed: 0
})

const lineSegment = (from: Vec3, to: Vec3, cuts: boolean): Segment => ({ kind: "line", from, to, length: Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z), cuts })

const arcSegment = (mv: Extract<Move, { _tag: "Arc" }>, from: Vec3): Segment => {
  const radius = Math.hypot(from.x - mv.center.x, from.y - mv.center.y)
  const full = isFullCircle(mv, from)
  const sweep = full ? TAU : arcSweepBetween(from, mv.to, mv.center, mv.clockwise)
  const planar = radius * sweep
  return { kind: "arc", from, to: mv.to, center: mv.center, clockwise: mv.clockwise, sweep, radius, length: Math.hypot(planar, mv.to.z - from.z), cuts: true }
}

const pointOn = (seg: Segment, t: number): Vec3 => {
  if (seg.kind === "line") return { x: seg.from.x + (seg.to.x - seg.from.x) * t, y: seg.from.y + (seg.to.y - seg.from.y) * t, z: seg.from.z + (seg.to.z - seg.from.z) * t }
  const a0 = Math.atan2(seg.from.y - seg.center!.y, seg.from.x - seg.center!.x)
  const a = a0 + (seg.clockwise === true ? -1 : 1) * seg.sweep! * t
  return { x: seg.center!.x + seg.radius! * Math.cos(a), y: seg.center!.y + seg.radius! * Math.sin(a), z: seg.from.z + (seg.to.z - seg.from.z) * t }
}

const tangentOn = (seg: Segment, t: number): { x: number; y: number } => {
  if (seg.kind === "line") {
    const dx = seg.to.x - seg.from.x, dy = seg.to.y - seg.from.y
    const h = Math.hypot(dx, dy)
    return h > 1e-12 ? { x: dx / h, y: dy / h } : { x: 0, y: 0 }
  }
  const a0 = Math.atan2(seg.from.y - seg.center!.y, seg.from.x - seg.center!.x)
  const a = a0 + (seg.clockwise === true ? -1 : 1) * seg.sweep! * t
  return seg.clockwise === true ? { x: Math.sin(a), y: -Math.cos(a) } : { x: -Math.sin(a), y: Math.cos(a) }
}

// ------------------------------------------------------------------------------------------------- load per step (Z2)

export interface LoadSettings {
  readonly material: WorkpieceMaterial
  readonly cutter: Cutter
  readonly machine: MachineLimits
  readonly rpm: number
  /** Largest tool deflection, mm (default 0.05). */
  readonly maxDeflection?: number
  /** Share of the available spindle power the cut may use (`cuttingData` uses 0.9). Default 0.9. */
  readonly powerShare?: number
}

export interface StepLoad extends Load {
  /** Largest chip the edge sees, mm. */
  readonly chipMax: number
  readonly deflectionMm: number
  /** The largest of load / limit over power, torque and deflection (> 1: a limit is exceeded). */
  readonly ratio: number
  readonly binding: "power" | "torque" | "deflection" | "none"
}

/** Spindle speed to cutting speed at the diameter that cuts, m/min. */
export const cuttingSpeed = (deff: number, rpm: number): number => (Math.PI * deff * rpm) / 1000

/**
 * The Kienzle load of one step: the same `millingLoad` that `cuttingData` calls for the nominal cut, at the engagement the step
 * measured. `ae` is the radial depth of the engagement (a step with `ae > D` is a slot), `feed` mm/min.
 */
export const stepLoad = (s: LoadSettings, ae: number, ap: number, feed: number): StepLoad => {
  const c = s.cutter
  const deff = Math.max(0.05 * c.diameter, effectiveDiameter(c, ap))
  const rpm = s.rpm
  const vc = cuttingSpeed(deff, rpm)
  const fz = feed / (rpm * Math.max(1, c.flutes))
  const load = millingLoad(s.material, c, deff, ap, ae, fz, feed, rpm, vc)
  const eta = s.machine.efficiency ?? 0.8
  const phi = contactArc(ae, deff)
  const sinK = c.kind === "chamfer" || c.kind === "spot" || c.kind === "engraver" ? Math.sin(((c.angle ?? 90) * Math.PI) / 360) : 1
  const chipMax = (phi >= Math.PI / 2 ? fz : fz * Math.sin(phi)) * sinK
  const defl = deflection(c, load.forceN)
  const powerLimit = powerLimitAt(s.machine, rpm)
  const share = s.powerShare ?? 0.9
  const power = powerLimit !== undefined ? load.powerKw / eta / (share * powerLimit) : 0
  const torque = s.machine.torqueNm !== undefined ? load.torqueNm / s.machine.torqueNm : 0
  const bend = defl / (s.maxDeflection ?? 0.05)
  const ratio = Math.max(power, torque, bend)
  const binding = ratio <= 0 ? "none" : ratio === bend ? "deflection" : ratio === power ? "power" : "torque"
  return { ...load, chipMax, deflectionMm: defl, ratio, binding }
}

export interface MoveLoad {
  readonly index: number
  readonly status: EngagementStatus
  /** Peak and length-weighted mean of the tangential force over the cutting steps, N. */
  readonly forcePeak: number
  readonly forceMean: number
  readonly powerPeakKw: number
  readonly torquePeakNm: number
  readonly deflectionPeak: number
  readonly chipPeak: number
  /** Worst load / limit of the move (with the engagement bound added), and which limit. */
  readonly ratio: number
  readonly binding: StepLoad["binding"]
}

/**
 * Load of every move at the feed it carries (`feeds[i]` mm/min for move `i` of `result.moves`; a number applies to all). The
 * judgement adds the declared engagement bound to `ae` (and the matching rise of `ap` is not assumed): a move passes only when its
 * load is inside every limit at the engagement the bound allows.
 */
export const moveLoads = (result: EngagementResult, s: LoadSettings, feeds: number | ReadonlyArray<number>): ReadonlyArray<MoveLoad> => {
  const out: MoveLoad[] = []
  const D = result.diameter
  for (const m of result.perMove) {
    if (m.status !== "resolved") {
      out.push({ index: m.index, status: m.status, forcePeak: 0, forceMean: 0, powerPeakKw: 0, torquePeakNm: 0, deflectionPeak: 0, chipPeak: 0, ratio: 0, binding: "none" })
      continue
    }
    const feed = typeof feeds === "number" ? feeds : feeds[m.index]!
    let forcePeak = 0, forceSum = 0, weight = 0, powerPeak = 0, torquePeak = 0, deflPeak = 0, chipPeak = 0, ratio = 0
    let binding: StepLoad["binding"] = "none"
    for (let k = m.from; k < m.to; k++) {
      if (result.steps.removed[k]! <= 0) continue
      const ae = Math.min(D, result.steps.ae[k]! + result.bound.ae)
      const load = stepLoad(s, ae, result.steps.ap[k]!, feed)
      if (load.forceN > forcePeak) forcePeak = load.forceN
      const w = Math.max(result.steps.length[k]!, 1e-9)
      forceSum += load.forceN * w; weight += w
      powerPeak = Math.max(powerPeak, load.powerKw); torquePeak = Math.max(torquePeak, load.torqueNm)
      deflPeak = Math.max(deflPeak, load.deflectionMm); chipPeak = Math.max(chipPeak, load.chipMax)
      if (load.ratio > ratio) { ratio = load.ratio; binding = load.binding }
    }
    out.push({ index: m.index, status: m.status, forcePeak, forceMean: weight > 0 ? forceSum / weight : 0, powerPeakKw: powerPeak, torquePeakNm: torquePeak, deflectionPeak: deflPeak, chipPeak, ratio, binding })
  }
  return out
}

/**
 * The claim `cutting-data` made per move (spec 61 §3.3): `passed` when every resolved move is inside every limit with the engagement
 * bound added, `failed` when one is not, `unresolved` when no move could be measured (five-axis, or no stock).
 */
export const cuttingDataClaim = (loads: ReadonlyArray<MoveLoad>): { readonly status: "passed" | "failed" | "unresolved"; readonly worst: MoveLoad | undefined; readonly failing: number } => {
  const resolved = loads.filter((l) => l.status === "resolved")
  const unresolved = loads.filter((l) => l.status === "unresolved")
  const worst = resolved.reduce<MoveLoad | undefined>((w, l) => (w === undefined || l.ratio > w.ratio ? l : w), undefined)
  const failing = resolved.filter((l) => l.ratio > 1 + 1e-9).length
  if (failing > 0) return { status: "failed", worst, failing }
  if (unresolved.length > 0 || resolved.length === 0) return { status: "unresolved", worst, failing: 0 }
  return { status: "passed", worst, failing: 0 }
}
