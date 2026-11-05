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

/** Steps of one probing operation. Throws a RangeError with the reason for an operation the probe cannot do. */
export const planProbe = (op: ProbeOperation, s: ProbeSettings): ProbePlan => {
  const problems = validateProbeSettings(s)
  if (problems.length > 0) throw new RangeError(`probing: ${problems.join("; ")}`)
  const r = s.stylusDiameter / 2
  const steps: ProbeStep[] = []
  const notes: string[] = ["the spindle stays off: a probe is a sensor, not a cutter"]
  const search = s.search
  switch (op.cycle) {
    case "z-surface": {
      steps.push({ kind: "rapid", z: s.safeZ }, { kind: "rapid", x: op.at.x, y: op.at.y })
      steps.push({ kind: "rapid", z: op.expectedZ + Math.min(search, 5), guard: true }, { kind: "touch", axis: "Z", distance: -(Math.min(search, 5) + search), store: 0 })
      steps.push({ kind: "set-offset", axis: "Z", store: 0, radius: 0, sign: 1, value: op.zero ?? 0 }, { kind: "rapid", z: s.safeZ })
      return { steps, notes }
    }
    case "edge": {
      const along = op.axis
      const startAt = op.expectedEdge - op.direction * (r + Math.min(search, 5))
      steps.push({ kind: "rapid", z: s.safeZ }, along === "X" ? { kind: "rapid", x: startAt, y: op.at.y } : { kind: "rapid", x: op.at.x, y: startAt })
      steps.push({ kind: "rapid", z: -op.depth, guard: true }, { kind: "touch", axis: along, distance: op.direction * (Math.min(search, 5) + search), store: 0 })
      steps.push({ kind: "set-offset", axis: along, store: 0, radius: r, sign: op.direction, value: op.zero ?? 0 }, { kind: "rapid", z: s.safeZ })
      return { steps, notes }
    }
    case "corner": {
      const a = planProbe({ cycle: "edge", axis: "X", direction: op.sx, at: { x: op.corner.x, y: op.corner.y + op.sy * (r + 7) }, depth: op.depth, expectedEdge: op.corner.x, ...(op.zero !== undefined ? { zero: op.zero.x } : {}) }, s)
      const b = planProbe({ cycle: "edge", axis: "Y", direction: op.sy, at: { x: op.corner.x + op.sx * (r + 7), y: op.corner.y }, depth: op.depth, expectedEdge: op.corner.y, ...(op.zero !== undefined ? { zero: op.zero.y } : {}) }, s)
      return { steps: [...a.steps, ...b.steps], notes: [...notes, "X edge first, then Y edge; each edge is touched on its face, 7 mm plus the stylus radius in from the corner"] }
    }
    case "bore": case "boss": {
      const inside = op.cycle === "bore"
      const nominalR = op.diameter / 2
      if (inside && nominalR - r <= 0.5) throw new RangeError(`probing: a stylus of ${s.stylusDiameter} mm does not fit a bore of ${op.diameter} mm`)
      // Bore: from the centre outward to each wall. Boss: from outside inward, starting 5 mm clear of the wall.
      const reach = inside ? nominalR - r + search : search + 5
      const z = -op.depth
      steps.push({ kind: "rapid", z: s.safeZ }, { kind: "rapid", x: op.centre.x, y: op.centre.y })
      if (inside) steps.push({ kind: "rapid", z, guard: true })
      // X pair, re-centre X, Y pair, re-centre Y, X pair again: the sizes are then measured through the true centre, not along a chord.
      const pair = (axis: "X" | "Y", a: number): void => {
        for (const [k, dir] of [[a, -1], [a + 1, 1]] as const) {
          if (inside) {
            steps.push({ kind: "touch", axis, distance: dir * reach, store: k })
            // back to where this pair started
            const back = axis === "X" ? (a === 0 ? op.centre.x : undefined) : op.centre.y
            if (back !== undefined) steps.push(axis === "X" ? { kind: "rapid", x: back } : { kind: "rapid", y: back })
            else steps.push({ kind: "rapid-mid", axis, store: 0, store2: 1 })
          } else {
            const offset = nominalR + r + 5
            steps.push({ kind: "rapid", z: s.safeZ })
            steps.push(axis === "X" ? { kind: "rapid", x: op.centre.x - dir * offset } : { kind: "rapid", y: op.centre.y - dir * offset })
            steps.push({ kind: "rapid", z, guard: true })
            steps.push({ kind: "touch", axis, distance: dir * reach, store: k })
          }
        }
      }
      const toMid = (axis: "X" | "Y", a: number): void => {
        // a boss is left at safe height first: the middle of a boss is inside it
        if (!inside) steps.push({ kind: "rapid", z: s.safeZ })
        steps.push({ kind: "rapid-mid", axis, store: a, store2: a + 1 })
      }
      pair("X", 0)
      toMid("X", 0)
      pair("Y", 2)
      toMid("Y", 2)
      pair("X", 4)
      // centre = midpoint of opposite touches of the last pairs; the stylus radius cancels
      steps.push({ kind: "set-offset", axis: "X", store: 4, store2: 5, radius: 0, sign: 1, value: op.centre.x }, { kind: "set-offset", axis: "Y", store: 2, store2: 3, radius: 0, sign: 1, value: op.centre.y })
      steps.push({ kind: "report-size", axis: "X", store: 4, store2: 5, stylus: s.stylusDiameter, inside, label: `${op.cycle} diameter X` }, { kind: "report-size", axis: "Y", store: 2, store2: 3, stylus: s.stylusDiameter, inside, label: `${op.cycle} diameter Y` })
      steps.push({ kind: "rapid", z: s.safeZ })
      return { steps, notes: [...notes, `the centre is the midpoint of two opposite touches, so the stylus radius cancels`, `the diameter is the touch distance ${inside ? "plus" : "minus"} the stylus diameter`] }
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
