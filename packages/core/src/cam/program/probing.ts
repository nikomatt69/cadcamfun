/**
 * Probing as a kernel-level operation (spec 72 P4-7): a probe is a sensor, not a cutter. A `ProbeOperation` (surface, edge, corner,
 * bore centre, boss centre) is described as neutral `ProbeStep`s, which `runProbeSteps` executes against a modelled part so the
 * measured work zero is checked without a machine. No text is written here: `kernelProbe` hands the operation to the kernel's cycles and
 * the real posts (spec 73), the only writers of probing words.
 *
 * The stylus is a ball: at contact its centre is half a stylus diameter before the surface, so every edge/centre result adds that
 * radius back. Z is measured on the bottom of the ball (the probe's length is calibrated to it), so a Z surface has no radius term.
 * The spindle is off while a probe works.
 */
import type { Vec2 } from "../../cad/vec.ts"
import type { Move } from "../ir.ts"
import { varKey, type Expr } from "../macro.ts"
import { planProbeCycle } from "../probing/cycles.ts"
import { DEFAULT_PROBE_SETTINGS, deviceOfSettings } from "../probing/device.ts"
import type { ProbeAction, ProbeCycle as ProbeCycleSpec } from "../probing/types.ts"

export type ProbeCycle = "z-surface" | "edge" | "corner" | "bore" | "boss"
export type ProbeAxis = "X" | "Y" | "Z"

export interface ProbeSettings {
  /** Stylus ball diameter, mm. */
  readonly stylusDiameter: number
  /** Probing feed, mm/min. */
  readonly feed: number
  /** How far past the expected surface the probe searches before it reports a miss, mm. */
  readonly search: number
  /** Work offset the result is written to, `G54`..`G59`. */
  readonly workOffset: "G54" | "G55" | "G56" | "G57" | "G58" | "G59"
  /** Height the probe travels at between touches (absolute, in the current work coordinates), mm. */
  readonly safeZ: number
}

export type ProbeOperation =
  | { readonly cycle: "z-surface"; readonly at: Vec2; readonly expectedZ: number; readonly zero?: number }
  /** An edge normal to `axis`: the probe stands at `from` (outside the part) and moves toward `direction` along `axis`. */
  | { readonly cycle: "edge"; readonly axis: "X" | "Y"; readonly direction: 1 | -1; readonly at: Vec2; readonly depth: number; readonly expectedEdge: number; readonly zero?: number }
  /** An outside corner: the X edge then the Y edge, the probe approaching from the -X/-Y side (`sx`, `sy` = +1) or the opposite. */
  | { readonly cycle: "corner"; readonly corner: Vec2; readonly sx: 1 | -1; readonly sy: 1 | -1; readonly depth: number; readonly zero?: Vec2 }
  /** A bore of nominal `diameter` centred near `centre`: four touches from inside; writes the centre and reports the diameter. */
  | { readonly cycle: "bore"; readonly centre: Vec2; readonly diameter: number; readonly depth: number }
  /** A boss of nominal `diameter`: four touches from outside at `depth` below the top. */
  | { readonly cycle: "boss"; readonly centre: Vec2; readonly diameter: number; readonly depth: number; readonly top: number }

export type ProbeStep =
  | { readonly kind: "rapid"; readonly x?: number; readonly y?: number; readonly z?: number; /** A move near the part: written with the probe armed, so a contact stops the program instead of crashing the stylus. */ readonly guard?: true }
  /** Move `axis` to the midpoint of two stored touches (re-centres the probe in a bore or on a boss before the next pair). */
  | { readonly kind: "rapid-mid"; readonly axis: "X" | "Y"; readonly store: number; readonly store2: number }
  /** Feed along `axis` by `distance` (signed) until contact; the contact is stored as register `store`. Missing contact is an alarm. */
  | { readonly kind: "touch"; readonly axis: ProbeAxis; readonly distance: number; readonly store: number }
  /** Work-offset `axis` changes so that the surface touched in `store` (corrected by `radius` along `sign`) becomes coordinate `value`; with `store2`, the midpoint of two touches. */
  | { readonly kind: "set-offset"; readonly axis: ProbeAxis; readonly store: number; readonly store2?: number; readonly radius: number; readonly sign: 1 | -1; readonly value: number }
  /** Report (not store as offset): the measured size between two touches, stylus diameter added back or taken off. */
  | { readonly kind: "report-size"; readonly axis: ProbeAxis; readonly store: number; readonly store2: number; readonly stylus: number; readonly inside: boolean; readonly label: string }

export interface ProbePlan { readonly steps: ReadonlyArray<ProbeStep>; readonly notes: ReadonlyArray<string> }

export const validateProbeSettings = (s: ProbeSettings): ReadonlyArray<string> => {
  const out: string[] = []
  if (!(s.stylusDiameter > 0)) out.push("the stylus diameter must be positive")
  if (!(s.feed > 0)) out.push("the probing feed must be positive")
  if (!(s.search > 0)) out.push("the search distance must be positive")
  return out
}

/** The kernel's moves of an operation as neutral steps: a touch keeps the order of its register, a move to a measured midpoint names its two registers. */
const stepsOfMoves = (moves: ReadonlyArray<Move>, start: { x: number; y: number; z: number }): { readonly steps: ProbeStep[]; readonly touches: number } => {
  const steps: ProbeStep[] = []
  const stores = new Map<string, number>()
  const mids = new Map<string, readonly [number, number]>()
  const here = { ...start }
  const go = (to: { readonly x: number; readonly y: number; readonly z: number }, expr: Readonly<Partial<Record<"x" | "y" | "z", Expr>>> | undefined, guard: boolean): void => {
    for (const axis of ["x", "y"] as const) {
      const e = expr?.[axis]
      const mid = e !== undefined && typeof e === "object" && "var" in e ? mids.get(varKey(e.var)) : undefined
      if (mid !== undefined) steps.push({ kind: "rapid-mid", axis: axis === "x" ? "X" : "Y", store: mid[0], store2: mid[1] })
    }
    const words = { ...(expr?.x === undefined && to.x !== here.x ? { x: to.x } : {}), ...(expr?.y === undefined && to.y !== here.y ? { y: to.y } : {}), ...(to.z !== here.z ? { z: to.z } : {}) }
    if (Object.keys(words).length > 0) steps.push({ kind: "rapid", ...words, ...(guard ? { guard: true } : {}) })
    Object.assign(here, to)
  }
  let touches = 0
  for (const m of moves) {
    if (m._tag === "Assign") {
      const v = m.value
      if (typeof v === "object" && "op" in v && v.op === "*" && v.b === 0.5 && typeof v.a === "object" && "op" in v.a && v.a.op === "+" && typeof v.a.a === "object" && "var" in v.a.a && typeof v.a.b === "object" && "var" in v.a.b) {
        const a = stores.get(varKey(v.a.a.var)), b = stores.get(varKey(v.a.b.var))
        if (a !== undefined && b !== undefined) mids.set(varKey(m.variable), [a, b])
      }
    } else if (m._tag === "Linear") go(m.to, m.expr, false)
    else if (m._tag === "Probe" && m.kind === "protected") go(m.to, m.expr, m.to.z < here.z && m.to.z < start.z)
    else if (m._tag === "Probe") {
      const axis = (["X", "Y", "Z"] as const).find((name) => Math.abs(m.direction[name.toLowerCase() as "x" | "y" | "z"]) > 0.5)
      if (axis === undefined) throw new RangeError("probing: a legacy step touches along X, Y or Z")
      const key = axis.toLowerCase() as "x" | "y" | "z", sense = m.direction[key]
      steps.push({ kind: "touch", axis, distance: m.to[key] - here[key] + sense * m.overtravel, store: touches })
      const stored = m.store?.[key]
      if (stored !== undefined) stores.set(varKey(stored), touches)
      touches++
    }
  }
  return { steps, touches }
}

/** Steps of one probing operation, read off the kernel's cycle: there is one planner. Throws a RangeError with the reason for an operation the probe cannot do. */
export const planProbe = (op: ProbeOperation, s: ProbeSettings): ProbePlan => {
  const problems = validateProbeSettings(s)
  if (problems.length > 0) throw new RangeError(`probing: ${problems.join("; ")}`)
  const r = s.stylusDiameter / 2
  const notes: string[] = ["the spindle stays off: a probe is a sensor, not a cutter"]
  const probe = { ...deviceOfSettings({ ...DEFAULT_PROBE_SETTINGS, stylusDiameter: s.stylusDiameter, feed: s.feed }), doubleTouch: false }
  const routine = planProbeCycle(kernelProbe(op, s).cycle, { probe, safeZ: s.safeZ, clearance: Math.min(s.search, 5), search: s.search, prefix: "p" })
  if ("refused" in routine) throw new RangeError(`probing: ${routine.refused}`)
  const { steps } = stepsOfMoves(routine.moves, { x: 0, y: 0, z: s.safeZ })
  switch (op.cycle) {
    case "z-surface":
      return { steps: [...steps, { kind: "set-offset", axis: "Z", store: 0, radius: 0, sign: 1, value: op.zero ?? 0 }], notes }
    case "edge":
      return { steps: [...steps, { kind: "set-offset", axis: op.axis, store: 0, radius: r, sign: op.direction, value: op.zero ?? 0 }], notes }
    case "corner":
      return {
        steps: [...steps, { kind: "set-offset", axis: "X", store: 0, radius: r, sign: op.sx, value: op.zero?.x ?? 0 }, { kind: "set-offset", axis: "Y", store: 1, radius: r, sign: op.sy, value: op.zero?.y ?? 0 }],
        notes: [...notes, "X edge first, then Y edge; each edge is touched on its face, 7 mm plus the stylus radius in from the corner"]
      }
    case "bore": case "boss": {
      const inside = op.cycle === "bore"
      // X pair, re-centre X, Y pair, re-centre Y, X pair again: the sizes are then measured through the true centre, not along a chord.
      return {
        steps: [...steps,
          { kind: "set-offset", axis: "X", store: 4, store2: 5, radius: 0, sign: 1, value: op.centre.x }, { kind: "set-offset", axis: "Y", store: 2, store2: 3, radius: 0, sign: 1, value: op.centre.y },
          { kind: "report-size", axis: "X", store: 4, store2: 5, stylus: s.stylusDiameter, inside, label: `${op.cycle} diameter X` }, { kind: "report-size", axis: "Y", store: 2, store2: 3, stylus: s.stylusDiameter, inside, label: `${op.cycle} diameter Y` }],
        notes: [...notes, "the centre is the midpoint of two opposite touches, so the stylus radius cancels", `the diameter is the touch distance ${inside ? "plus" : "minus"} the stylus diameter`]
      }
    }
  }
}

/* --------------------------------------------------------------------------------------------------------------- model run */

export interface ProbeWorld {
  /** Where the stylus first touches the part moving from `pos` by `distance` along `axis`, or undefined (miss). Returns the controlled point's coordinate along the axis at contact: the ball CENTRE for X and Y, the ball BOTTOM for Z. */
  readonly touch: (pos: { x: number; y: number; z: number }, axis: ProbeAxis, distance: number, stylusRadius: number) => number | undefined
}

export interface ProbeOutcome {
  /** Work offset change per axis, mm: the machine coordinate of the new zero minus the old one. */
  readonly offset: Partial<Record<ProbeAxis, number>>
  readonly sizes: ReadonlyArray<{ readonly label: string; readonly value: number }>
  readonly missed?: { readonly step: number; readonly axis: ProbeAxis }
}

/** Executes steps against a modelled part (positions in the work coordinates before the offset change). */
export const runProbeSteps = (steps: ReadonlyArray<ProbeStep>, world: ProbeWorld, s: ProbeSettings): ProbeOutcome => {
  const r = s.stylusDiameter / 2
  const pos = { x: 0, y: 0, z: s.safeZ }
  const contacts = new Map<number, number>()
  const offset: Partial<Record<ProbeAxis, number>> = {}
  const sizes: Array<{ label: string; value: number }> = []
  for (let i = 0; i < steps.length; i++) {
    const st = steps[i]!
    if (st.kind === "rapid") { if (st.x !== undefined) pos.x = st.x; if (st.y !== undefined) pos.y = st.y; if (st.z !== undefined) pos.z = st.z; continue }
    if (st.kind === "rapid-mid") { pos[st.axis.toLowerCase() as "x" | "y"] = (contacts.get(st.store)! + contacts.get(st.store2)!) / 2; continue }
    if (st.kind === "touch") {
      const c = world.touch({ ...pos }, st.axis, st.distance, r)
      if (c === undefined) return { offset, sizes, missed: { step: i, axis: st.axis } }
      contacts.set(st.store, c)
      pos[st.axis.toLowerCase() as "x" | "y" | "z"] = c
      continue
    }
    if (st.kind === "set-offset") {
      const a = contacts.get(st.store)!
      const centre = st.store2 === undefined ? a + st.sign * st.radius : (a + contacts.get(st.store2)!) / 2
      // the touched surface (or centre) is at `centre`; it must read `value`, so the zero moves by centre - value
      offset[st.axis] = centre - st.value
      continue
    }
    const a = contacts.get(st.store)!, b = contacts.get(st.store2)!
    const gap = Math.abs(b - a)
    sizes.push({ label: st.label, value: st.inside ? gap + st.stylus : gap - st.stylus })
  }
  return { offset, sizes }
}

/* ----------------------------------------------------------------------------------------------------------------- emission */

export type ProbeDialect = "fanuc" | "linuxcnc" | "siemens"

/* ------------------------------------------------------------------------------------------------- the same operation, in the kernel */

/**
 * A legacy operation as the kernel's cycle and offset action (spec 73 §5.1): what the real posts write and the deprecated routes send.
 * The legacy rule is kept: the touched surface reads `zero` (0 when absent), not its nominal, so the zero lands where it always did. Depths
 * are below Z0.
 */
export const kernelProbe = (op: ProbeOperation, s: ProbeSettings): { readonly cycle: ProbeCycleSpec; readonly actions: ReadonlyArray<ProbeAction> } => {
  const ref = { kind: "g5x", code: s.workOffset } as const
  const set = (axes: Readonly<Record<string, string>>, reads?: Readonly<Record<string, number>>): ReadonlyArray<ProbeAction> =>
    [{ kind: "set-offset", ref, axes, policy: { mode: "set" }, ...(reads !== undefined ? { reads } : {}) }]
  const r = s.stylusDiameter / 2
  switch (op.cycle) {
    case "z-surface":
      return { cycle: { kind: "z-surface", at: op.at, expectedZ: op.expectedZ }, actions: set({ Z: "z" }, { Z: op.zero ?? 0 }) }
    case "edge": {
      const x = op.axis === "X"
      return {
        cycle: { kind: "edge", at: { x: x ? op.expectedEdge : op.at.x, y: x ? op.at.y : op.expectedEdge, z: -op.depth }, normal: { x: x ? -op.direction : 0, y: x ? 0 : -op.direction } },
        actions: set(x ? { X: "x" } : { Y: "y" }, x ? { X: op.zero ?? 0 } : { Y: op.zero ?? 0 })
      }
    }
    case "corner":
      return {
        cycle: { kind: "corner", corner: op.corner, inside: false, xSense: op.sx, ySense: op.sy, depth: op.depth, top: 0, inset: r + 7, touchesPerEdge: 1 },
        actions: set({ X: "x", Y: "y" }, { X: op.zero?.x ?? 0, Y: op.zero?.y ?? 0 })
      }
    case "bore":
      return { cycle: { kind: "bore", centre: op.centre, diameter: op.diameter, depth: op.depth, top: 0 }, actions: set({ X: "x", Y: "y" }) }
    case "boss":
      return { cycle: { kind: "boss", centre: op.centre, diameter: op.diameter, depth: op.depth, top: op.top }, actions: set({ X: "x", Y: "y" }) }
  }
}
