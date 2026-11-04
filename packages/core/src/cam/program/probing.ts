/**
 * Probing as a kernel-level operation (spec 72 P4-7): a probe is a sensor, not a cutter. A `ProbeOperation` (surface, edge, corner,
 * bore centre, boss centre) is turned into neutral `ProbeStep`s, which `emitProbeSteps` writes for a control (`fanuc` G31,
 * `linuxcnc` G38.2, `siemens` MEAS=1) and `runProbeSteps` executes against a modelled part so the measured work zero is checked
 * without a machine.
 *
 * The stylus is a ball: at contact its centre is half a stylus diameter before the surface, so every edge/centre result adds that
 * radius back. Z is measured on the bottom of the ball (the probe's length is calibrated to it), so a Z surface has no radius term.
 * The spindle is off while a probe works; the emitted program says so and never starts it. This module does not change the IR
 * (`ir.ts`): a host that wants probing inside a toolpath adds an IR move first; until then the steps are emitted as text.
 */
import type { Vec2 } from "../../cad/vec.ts"

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

const OFFSET_N: Readonly<Record<string, number>> = { G54: 1, G55: 2, G56: 3, G57: 4, G58: 5, G59: 6 }
const FANUC_BASE: Readonly<Record<string, number>> = { G54: 5221, G55: 5241, G56: 5261, G57: 5281, G58: 5301, G59: 5321 }
const n3 = (v: number): string => (Math.round(v * 1000) / 1000).toFixed(3)
const AXIS_INDEX: Readonly<Record<ProbeAxis, number>> = { X: 0, Y: 1, Z: 2 }

/**
 * The text of the steps for a control (the spec 73 posts write the same words from the IR; this is the legacy neutral-step form). The
 * registers hold contacts in the current work coordinates: #520.. (Fanuc, LinuxCNC), R10.. (Siemens). Fixed in spec 73: the midpoint
 * is bracketed as a whole (`X[[#524+#525]/2]`, `X=(R14+R15)/2`), the Siemens frame is written as `$P_UIFR[n,X,TR]` and selected again,
 * a Fanuc touch that finds nothing raises an alarm, a descent near the part is armed (a contact stops the program), and a size is stored in a
 * register as well as written as a comment.
 */
export const emitProbeSteps = (steps: ReadonlyArray<ProbeStep>, s: ProbeSettings, dialect: ProbeDialect): string => {
  const reg = (store: number): string => dialect === "siemens" ? `R${10 + store}` : `#${520 + store}`
  const contactOf = (axis: ProbeAxis): string => dialect === "siemens" ? `$AA_MW[${axis}]` : `#${5061 + AXIS_INDEX[axis]}`
  const here = (axis: ProbeAxis): string => `#${5041 + AXIS_INDEX[axis]}`
  const mid = (a: number, b: number): string => (dialect === "siemens" ? `(${reg(a)}+${reg(b)})/2` : `[[${reg(a)}+${reg(b)}]/2]`)
  const lines: string[] = []
  lines.push("G90 G21 G17", s.workOffset, "M5 ; the spindle stays off: a probe is a sensor, not a cutter")
  let sizes = 0
  for (const st of steps) {
    switch (st.kind) {
      case "rapid": {
        const w = [st.x !== undefined ? `X${n3(st.x)}` : "", st.y !== undefined ? `Y${n3(st.y)}` : "", st.z !== undefined ? `Z${n3(st.z)}` : ""].filter(Boolean).join(" ")
        if (st.guard !== true || st.z === undefined) { lines.push(`G0 ${w}`); break }
        // Armed descent: a contact on the way is a crash avoided.
        if (dialect === "fanuc") lines.push(`G31 ${w} F${s.feed}`, `IF [ABS[#5063-${st.z < 0 ? `[${n3(st.z)}]` : n3(st.z)}] GT 0.002] THEN #3000=192 (PROBE TOUCHED ON A PROTECTED MOVE)`)
        else if (dialect === "linuxcnc") lines.push(`G38.3 ${w} F${s.feed}`, "o9001 if [#5070 EQ 1]", "(abort, probe touched on a protected move)", "o9001 endif")
        else lines.push(`MEAS=1 G1 ${w} F${s.feed}`, "STOPRE", "IF $AC_MEA[1]==1 GOTOF PROBEHIT")
        break
      }
      case "rapid-mid":
        lines.push(`G0 ${st.axis}${dialect === "siemens" ? "=" : ""}${mid(st.store, st.store2)}`)
        break
      case "touch": {
        // The start is read before the move: the touch missed when the skip position is the end of the search.
        if (dialect === "fanuc") lines.push(`#530=${here(st.axis)}`, `G91 G31 ${st.axis}${n3(st.distance)} F${s.feed}`, "G90", `IF [ABS[${contactOf(st.axis)}-[#530${st.distance < 0 ? "-" : "+"}${n3(Math.abs(st.distance))}]] LT 0.001] THEN #3000=191 (PROBE MISS)`)
        else if (dialect === "linuxcnc") lines.push(`G91`, `G38.2 ${st.axis}${n3(st.distance)} F${s.feed}`, "G90")
        else lines.push("MEAS=1 G91 G1 " + `${st.axis}${n3(st.distance)} F${s.feed}`, "G90", "STOPRE", `IF $AC_MEA[1]==0 GOTOF PROBEMISS`)
        lines.push(`${reg(st.store)} = ${contactOf(st.axis)} ; contact ${st.store}`)
        break
      }
      case "set-offset": {
        const centre = st.store2 === undefined ? `${reg(st.store)} + ${st.sign * st.radius}` : mid(st.store, st.store2)
        const value = n3(st.value)
        if (dialect === "linuxcnc") {
          // G10 L2 sets the origin of the coordinate system in machine coordinates; #5221.. hold the current G54.. origin (X, Y, Z in steps of 1)
          const v = (FANUC_BASE[s.workOffset] ?? 5221) + AXIS_INDEX[st.axis]
          lines.push(`G10 L2 P${OFFSET_N[s.workOffset] ?? 1} ${st.axis}[#${v} + ${centre} - ${value}] ; ${s.workOffset} ${st.axis}: the touched surface reads ${value}`)
        } else if (dialect === "fanuc") {
          const v = (FANUC_BASE[s.workOffset] ?? 5221) + AXIS_INDEX[st.axis]
          lines.push(`#${v} = #${v} + ${centre} - ${value} ; ${s.workOffset} ${st.axis}: the touched surface reads ${value}`)
        } else {
          // The frame of G54..G57 is $P_UIFR[1..4]; it takes effect when it is selected again.
          const n = OFFSET_N[s.workOffset] ?? 1
          if (n > 4) throw new RangeError(`siemens: ${s.workOffset} is a programmable offset on the 840D, not a settable frame: use G54..G57`)
          const f = `$P_UIFR[${n},${st.axis},TR]`
          lines.push(`${f}=${f}+${centre}-${value}`, s.workOffset)
        }
        break
      }
      case "report-size": {
        const gap = `ABS[${reg(st.store2)} - ${reg(st.store)}]`
        const size = `${dialect === "siemens" ? "ABS(" : "ABS["}${reg(st.store2)} - ${reg(st.store)}${dialect === "siemens" ? ")" : "]"} ${st.inside ? "+" : "-"} ${n3(st.stylus)}`
        const target = dialect === "siemens" ? `R${30 + sizes}` : `#${540 + sizes}`
        sizes++
        lines.push(`${target} = ${size} ; ${st.label}`)
        void gap
        break
      }
    }
  }
  if (dialect === "siemens") lines.push("M30", "PROBEMISS: MSG(\"probe did not touch\")", "M0", "PROBEHIT: MSG(\"probe touched on a protected move\")", "M0")
  else lines.push("M30")
  return lines.join("\n") + "\n"
}
