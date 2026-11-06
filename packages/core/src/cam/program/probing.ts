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
import { makeProgram, type Move, type Program, type Toolpath } from "../ir.ts"
import { analyseGcode } from "../generator/analysis.ts"
import { getPost, dialectOf } from "../post/index.ts"
import { addressOf, formatOffsetRef, getOffset, offsetKey, withOffset, workToMachine, type OffsetAxis, type WorkOffsetRef, type WorkOffsetTable } from "../work-offset.ts"
import type { GeneratedProgram } from "./programs.ts"
import type { TiltedPlane } from "../post/types.ts"
import { indexPlane } from "../indexing.ts"
import type { PartDisplacement, Setup, Workpiece } from "./setup.ts"
import { enabledOperations, workpiecesOf } from "./setup.ts"
import { assignPockets } from "./tooltable.ts"
import { varKey, type Expr } from "../macro.ts"
import { planProbeCycle } from "../probing/cycles.ts"
import { compileActions } from "../probing/actions.ts"
import { DEFAULT_PROBE_SETTINGS, deviceOfSettings, type ProbeDevice } from "../probing/device.ts"
import { runProbeMoves, tablePose, type SimKinematics } from "../probing/simulate.ts"
import { boxWorld, cylinderWorld, meshWorld, plateWorld, pocketWorld, type Placement, type ProbeWorld3 } from "../probing/world.ts"
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

/* ------------------------------------------------------------------------------------------------- the datum probe of every part */

/**
 * What the probe program does to a blank that is not where the setup believes it: the program is run on the simulator (`runProbeMoves`)
 * against the part's blank placed with the displacement, and the register it ends with is compared with where the blank really is.
 * `residualMm` is the worst distance, over the eight corners of the blank, between where the corrected register puts the corner and where it
 * is; `beforeMm` is the same figure for the register as it stood. Inside `toleranceMm` the correction does what it is for.
 */
export interface PartProbeReplay {
  /** `within`: the corrected register is inside the tolerance; `outside`: it is not (see `reason`); `missed`: a touch found nothing; `stopped`: the program alarmed or stopped; `unreplayed`: the replay does not cover this setup (see `reason`). */
  readonly status: "within" | "outside" | "missed" | "stopped" | "unreplayed"
  readonly reason?: string
  /** The displacement the blank was given: mm in the part's frame, rotation in degrees about its datum. */
  readonly displacement?: { readonly x: number; readonly y: number; readonly z: number; readonly rotation: number }
  /** The register after the run: the machine position of the part's zero (mm) and the rotation written to it (degrees). */
  readonly corrected?: { readonly X: number; readonly Y: number; readonly Z: number; readonly R: number }
  readonly residualMm?: number
  readonly beforeMm?: number
  readonly toleranceMm?: number
  /** A coordinate rotation the program left on (`g68`), degrees. */
  readonly g68?: number
}

/** One part's probe: the register it writes, the touches it takes and the axes of the offset it corrects. */
export interface PartProbeEntry {
  readonly workpieceId: string
  readonly name: string
  readonly register: string
  readonly touches: number
  /** The axes whose offset the cycles correct, in order of the cycles (`R` when a measured rotation is written to the register). */
  readonly axes: ReadonlyArray<OffsetAxis>
  /** The axes some touch of the cycles really pins down (a touch along X says nothing about Y, though the cycle reports a Y result): what the part's displacement can be found in. */
  readonly measured: ReadonlyArray<"X" | "Y" | "Z">
  /** The replay of this part's probe against a displaced blank. */
  readonly replay?: PartProbeReplay
}

export interface PartProbePlan {
  /** Why no probe program can be made, or undefined. */
  readonly refused?: string
  readonly toolNumber: number
  readonly parts: ReadonlyArray<PartProbeEntry>
  readonly notes: ReadonlyArray<string>
}


/**
 * The way a post can write the rotation the setup asked for. A Fanuc-family register has no rotation (its offsets are X Y Z), so a rotation
 * asked of the register is written as G68 about the measured point; a Siemens frame has one but no G68 word here, so a G68 is written as the
 * frame's rotation (about its zero, not the measured point). Where neither exists the request stays as it is and the post refuses it with its
 * own reason. LinuxCNC has both (G10 L2 R and G68). `note` says what was changed.
 */
const rotationVia = (wanted: "g68" | "offset-r" | "table-c", ref: WorkOffsetRef, post: Setup["post"]["postId"]): { readonly via: "g68" | "offset-r" | "table-c"; readonly note?: string } => {
  if (wanted === "table-c") return { via: wanted }
  const codes = dialectOf(post)?.probing
  if (codes === undefined) return { via: wanted }
  const address = addressOf(ref, codes.offsets)
  const canRegister = !("refused" in address) && address.write !== "native-only" && address.write !== "l20-only" && address.read("R") !== undefined
  const canG68 = codes.syntax === "fanuc" || codes.syntax === "linuxcnc"
  if (wanted === "offset-r" && !canRegister && canG68) return { via: "g68", note: `the ${post} post has no rotation in a work offset: the measured rotation is written as G68 about the measured point, which stays on for what follows` }
  if (wanted === "g68" && !canG68 && canRegister) return { via: "offset-r", note: `the ${post} post writes no G68: the measured rotation is written into the register, which turns the part about the register's zero, not about the measured point (put the datum on the measured corner)` }
  return { via: wanted }
}

const PART_PROBE_ID = "part-probe"
const PART_PROBE_LIMIT = 5
const DEG = Math.PI / 180
const REPLAY_TOLERANCE = 0.05
/** What the replay moves a blank by when the setup does not say: a few tenths of a millimetre, and half a degree when a rotation is written. */
const DEFAULT_DISPLACEMENT = { x: 0.8, y: -0.6, z: 0.3 }
const DEFAULT_ROTATION = 0.5

interface PartProbeBuild {
  readonly refused?: string
  readonly toolNumber: number
  readonly device: ProbeDevice
  readonly parts: ReadonlyArray<{ readonly wp: Workpiece; readonly register: string; readonly ref: WorkOffsetRef; readonly moves: ReadonlyArray<Move>; readonly entry: PartProbeEntry; readonly kinds: ReadonlyArray<string>; readonly via?: "g68" | "offset-r" | "table-c" }>
  readonly notes: ReadonlyArray<string>
}

/**
 * Why the setup's tilted-plane parts cannot be written, or undefined: a part indexed `plane` needs a post whose control has the swivel words
 * (`G68.2` + `G53.1`, `CYCLE800`, `PLANE SPATIAL`), and a Siemens post needs the machine's swivel data record. Refused, never written as another frame.
 */
export const planeRefusal = (setup: Setup): string | undefined => {
  const parts = workpiecesOf(setup).filter((wp) => wp.index !== undefined && wp.indexAs === "plane")
  if (parts.length === 0) return undefined
  const dialect = dialectOf(setup.post.postId)
  // The Klartext writer adds its own PLANE SPATIAL words to the dialect it writes with (the ISO dialect of a Heidenhain definition has none).
  if (dialect?.tiltedPlane === undefined && setup.post.postId !== "heidenhain") return `${parts.map((p) => p.name).join(", ")} ${parts.length > 1 ? "are" : "is"} indexed as a tilted plane, and the ${setup.post.postId} post has no tilted-plane words (G68.2, CYCLE800, PLANE SPATIAL): use a post that has them (fanuc, haas, okuma, siemens, heidenhain) or index the part as a table turn`
  if (dialect?.id === "siemens" && setup.post.swivel === undefined) return "A tilted plane on a Siemens post is CYCLE800: set the post's swivel.dataRecord (the machine's swivel data record)"
  return undefined
}

/** The moves of the probe of every workpiece (cycles in the part's frame after its table turn), with the entry each one reports. */
const buildPartProbe = (setup: Setup): PartProbeBuild | { readonly refused: string; readonly toolNumber: number } => {
  const config = setup.partProbe
  const operations = enabledOperations(setup)
  const toolNumber = config?.toolNumber ?? Math.max(0, ...assignPockets(operations).values()) + (setup.sisters ?? []).length + 1
  const refuse = (refused: string): { readonly refused: string; readonly toolNumber: number } => ({ refused, toolNumber })
  if (config === undefined) return refuse("The setup has no partProbe: give it the cycles to run on every workpiece")
  if (setup.machineType !== "mill") return refuse(`A part probe is a milling accessory: a ${setup.machineType} setup has none`)
  const dialect = dialectOf(setup.post.postId)
  if (dialect?.probing === undefined) return refuse(`Post ${setup.post.postId} writes no probing words: use a post that does (fanuc, haas, mazak, mitsubishi, brother, generic, okuma, linuxcnc, siemens, heidenhain)`)
  const used = new Set(assignPockets(operations).values())
  if (config.toolNumber !== undefined && used.has(config.toolNumber)) return refuse(`The probe's T${config.toolNumber} is a pocket of the operations' tools: give the probe a pocket of its own`)
  const top = setup.stock === undefined ? undefined : setup.stock.origin.z
  const stylus = config.stylusDiameter ?? DEFAULT_PROBE_SETTINGS.stylusDiameter
  const device = deviceOfSettings({ ...DEFAULT_PROBE_SETTINGS, stylusDiameter: stylus, ...(config.feed !== undefined ? { feed: config.feed } : {}), toolNumber }, PART_PROBE_ID)
  const safeZ = config.safeZ ?? (top === undefined ? DEFAULT_PROBE_SETTINGS.safeZ : top + 15)
  const clearance = config.clearance ?? DEFAULT_PROBE_SETTINGS.clearance
  const search = config.search ?? DEFAULT_PROBE_SETTINGS.search
  const fixture = workpiecesOf(setup)
  const parts: PartProbeBuild["parts"][number][] = []
  const notes: string[] = [`T${toolNumber} measures ${fixture.length} workpiece${fixture.length === 1 ? "" : "s"}; each deviation goes into that part's register, so the toolpaths that follow start from the measured datum`]
  for (let w = 0; w < fixture.length; w++) {
    const wp = fixture[w]!
    const ref: WorkOffsetRef = wp.workOffsetRef ?? ({ kind: "g5x", code: wp.workOffset } as const)
    const register = wp.workOffsetRef !== undefined ? formatOffsetRef(wp.workOffsetRef) : wp.workOffset
    // An indexed face: the table turns first, so the cycles run in the part's own frame, the face up (its register was set at that pose).
    const moves: Move[] = wp.index === undefined || wp.indexAs === "plane" ? [] : [{ _tag: "Orient", ...wp.index }]
    let touches = 0
    const axes: OffsetAxis[] = []
    const measured = new Set<"X" | "Y" | "Z">()
    const kinds: string[] = []
    let via: "g68" | "offset-r" | "table-c" | undefined
    for (let c = 0; c < config.cycles.length; c++) {
      const ctx = { probe: device, safeZ, clearance, search, prefix: `w${w + 1}c${c + 1}_` }
      const routine = planProbeCycle(config.cycles[c]! as ProbeCycleSpec, ctx)
      if ("refused" in routine) return refuse(`${wp.name}, cycle ${c + 1} (${config.cycles[c]!.kind}): ${routine.refused}`)
      const cycleAxes = (["X", "Y", "Z"] as const).filter((axis) => routine.results[axis.toLowerCase()] !== undefined)
      const angleResult = (["rotation", "angle"] as const).find((name) => routine.results[name] !== undefined && routine.units[name] === "deg")
      const rotationWay = config.rotation === undefined ? undefined : rotationVia(config.rotation, ref, setup.post.postId)
      const writesRotation = rotationWay !== undefined && angleResult !== undefined
      if (writesRotation) via = rotationWay!.via
      if (cycleAxes.length === 0 && !writesRotation) return refuse(`${wp.name}, cycle ${c + 1} (${config.cycles[c]!.kind}) measures no X, Y or Z position${angleResult !== undefined ? " and the setup's partProbe has no rotation to write its angle to" : ""}: it cannot set a work offset`)
      const actions: ProbeAction[] = []
      if (cycleAxes.length > 0) actions.push({ kind: "set-offset", ref, axes: Object.fromEntries(cycleAxes.map((axis) => [axis, axis.toLowerCase()])), policy: { mode: "set", limit: config.limit ?? PART_PROBE_LIMIT } })
      if (writesRotation) {
        // The part turns by at most as much as the limit would move a point 100 mm from the datum: a larger angle is a wrong face or a loose part.
        actions.push({ kind: "rotation", result: angleResult!, via: rotationWay!.via, ref, policy: { mode: "set", limit: (config.limit ?? PART_PROBE_LIMIT) * DEG } })
        axes.push("R")
        notes.push(`${wp.name}, cycle ${c + 1} (${config.cycles[c]!.kind}): the measured ${angleResult} goes into ${rotationWay!.via === "g68" ? "the control's coordinate rotation (G68, about the measured point: it stays on for what follows)" : rotationWay!.via === "table-c" ? "the C axis of the table" : "the register's own rotation"}`)
        if (rotationWay!.note !== undefined && !notes.includes(rotationWay!.note)) notes.push(rotationWay!.note)
      }
      let compiled: Move[]
      try { compiled = compileActions(routine, actions, ctx) } catch (error) { return refuse(`${wp.name}, cycle ${c + 1}: ${error instanceof Error ? error.message : String(error)}`) }
      const first = compiled.find((m) => m._tag === "Probe")
      if (first !== undefined && first._tag === "Probe") moves.push({ _tag: "Rapid", to: { x: first.to.x, y: first.to.y, z: safeZ } })
      moves.push(...compiled)
      touches += routine.contacts.length
      for (const contact of routine.contacts) for (const axis of ["X", "Y", "Z"] as const) if (Math.abs(contact.direction[axis.toLowerCase() as "x" | "y" | "z"]) > 1e-6) measured.add(axis)
      axes.push(...cycleAxes)
      kinds.push(config.cycles[c]!.kind)
    }
    parts.push({ wp, register, ref, moves, kinds, ...(via !== undefined ? { via } : {}), entry: { workpieceId: wp.id, name: wp.name, register, touches, axes, measured: (["X", "Y", "Z"] as const).filter((a) => measured.has(a)) } })
  }
  return { toolNumber, device, parts, notes }
}


type PartProbeCycleLike = Setup["partProbe"] extends infer P ? P extends { cycles: ReadonlyArray<infer C> } ? C : never : never
type Corner3 = { readonly x: number; readonly y: number; readonly z: number }

/**
 * The blank with the features the cycles measure, placed where the blank really is: `undefined` when every cycle works on the plain block,
 * a world when some cycle needs a feature (through bores in the plate, one rectangular pocket cut into its top, or the blank's outline
 * itself for a boss, an outside rectangle or a web), a reason when the combination is not modelled. A pocket is cut as deep as the cycle
 * touches plus a margin, a slot or web runs the whole blank across its width, an inside corner is a pocket 40 mm into the part.
 */
const featuredBlank = (cycles: ReadonlyArray<PartProbeCycleLike>, lo: Corner3, hi: Corner3, placement: Placement): ProbeWorld3 | string | undefined => {
  const bores: { centre: { x: number; y: number }; radius: number }[] = []
  const pockets: { min: { x: number; y: number }; max: { x: number; y: number }; depth: number }[] = []
  const shapes: ProbeWorld3[] = []
  const thick = hi.z - lo.z
  // An outline that is the blank's own (a web or an outside rectangle as wide as the part) is measured on the plain block.
  const isBlank = (a: { x: number; y: number }, b: { x: number; y: number }): boolean =>
    Math.abs(a.x - lo.x) < 1e-6 && Math.abs(a.y - lo.y) < 1e-6 && Math.abs(b.x - hi.x) < 1e-6 && Math.abs(b.y - hi.y) < 1e-6
  const rightAngle = (angle: number): "x" | "y" | undefined => {
    const k = ((angle % Math.PI) + Math.PI) % Math.PI
    return Math.abs(k) < 1e-6 || Math.abs(k - Math.PI) < 1e-6 ? "x" : Math.abs(k - Math.PI / 2) < 1e-6 ? "y" : undefined
  }
  for (const c of cycles) {
    switch (c.kind) {
      case "bore": bores.push({ centre: c.centre, radius: c.diameter / 2 }); break
      case "boss": shapes.push(cylinderWorld({ centre: c.centre, radius: c.diameter / 2, z0: lo.z, z1: hi.z, inside: false }, placement)); break
      case "rectangle": {
        const a = { x: c.centre.x - c.size.x / 2, y: c.centre.y - c.size.y / 2 }, b = { x: c.centre.x + c.size.x / 2, y: c.centre.y + c.size.y / 2 }
        if (c.inside) pockets.push({ min: a, max: b, depth: Math.min(thick - 0.5, c.depth + 6) })
        else if (!isBlank(a, b)) shapes.push(boxWorld({ x: a.x, y: a.y, z: lo.z }, { x: b.x, y: b.y, z: hi.z }, placement))
        break
      }
      case "web": case "pocket": {
        const across = rightAngle(c.angle)
        if (across === undefined) return `a ${c.kind} at ${(c.angle * 180 / Math.PI).toFixed(1)} degrees: the replay models a ${c.kind} across X or across Y (probed on the real part, not replayed)`
        const half = c.width / 2
        const min = across === "x" ? { x: c.centre.x - half, y: lo.y } : { x: lo.x, y: c.centre.y - half }
        const max = across === "x" ? { x: c.centre.x + half, y: hi.y } : { x: hi.x, y: c.centre.y + half }
        if (c.kind === "pocket") pockets.push({ min, max, depth: Math.min(thick - 0.5, c.depth + 6) })
        else if (!isBlank(min, max)) shapes.push(boxWorld({ x: min.x, y: min.y, z: lo.z }, { x: max.x, y: max.y, z: hi.z }, placement))
        break
      }
      case "corner": if (c.inside) {
        const L = 40
        const xs = [c.corner.x, c.corner.x - c.xSense * L].sort((p, q) => p - q), ys = [c.corner.y, c.corner.y - c.ySense * L].sort((p, q) => p - q)
        pockets.push({ min: { x: xs[0]!, y: ys[0]! }, max: { x: xs[1]!, y: ys[1]! }, depth: Math.min(thick - 0.5, c.depth + 6) })
      } break
      default: break
    }
  }
  if (bores.length === 0 && pockets.length === 0 && shapes.length === 0) return undefined
  const kinds = [bores.length > 0, pockets.length > 0, shapes.length > 0].filter(Boolean).length
  if (kinds > 1) return "bores, pockets and outlines in one probe: the replay models one kind of feature at a time (probed on the real part, not replayed)"
  if (pockets.length > 1) return "more than one pocket in one probe: the replay cuts one pocket into the blank (probed on the real part, not replayed)"
  if (shapes.length > 1) return "more than one boss, web or outside rectangle in one probe: the replay models one outline (probed on the real part, not replayed)"
  if (bores.length > 0) return plateWorld({ min: lo, max: hi, bores }, placement)
  if (pockets.length === 1) return pocketWorld(lo, hi, pockets[0]!, placement)
  return shapes[0]
}

/** The replay of one part's probe moves against a blank that sits `d` away from nominal. */
const replayPart = (setup: Setup, built: PartProbeBuild, part: PartProbeBuild["parts"][number], d: { readonly x: number; readonly y: number; readonly z: number; readonly rotation: number }, tolerance: number): PartProbeReplay => {
  const unreplayed = (reason: string): PartProbeReplay => ({ status: "unreplayed", reason })
  if (part.wp.index !== undefined && part.wp.indexAs === "plane") return unreplayed("a part probed in a tilted work plane: the replay turns the table to the part's angles, it does not model the control's plane word (probed on the real part, not replayed)")
  if (setup.partProbe!.rotation === "table-c" && part.entry.axes.includes("R")) return unreplayed("a rotation written to the table's C axis turns the part about the table's pivot: the replay does not model that write")
  const block = part.wp.stock ?? setup.stock
  if (block === undefined) return unreplayed("the setup and the workpiece give no blank to replay against")
  const lo = { x: block.origin.x, y: block.origin.y, z: block.origin.z - block.z }, hi = { x: block.origin.x + block.x, y: block.origin.y + block.y, z: block.origin.z }
  const corners = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ x: i & 1 ? hi.x : lo.x, y: i & 2 ? hi.y : lo.y, z: i & 4 ? hi.z : lo.z }))
  const datum = part.wp.placement ?? { x: 0, y: 0, z: 0 }
  const theta = d.rotation * DEG
  const c = Math.cos(theta), s = Math.sin(theta)
  // Where a corner of the blank really is in the part's frame (turned about the datum, then moved), and in machine coordinates.
  const real = (p: { x: number; y: number; z: number }) => ({ x: c * p.x - s * p.y + d.x, y: s * p.x + c * p.y + d.y, z: p.z + d.z })
  const machine = (p: { x: number; y: number; z: number }) => ({ x: datum.x + p.x, y: datum.y + p.y, z: datum.z + p.z })
  // The register as it stands: the machine position of the part's zero, for every register of the fixture (the probe works under its own).
  let table: WorkOffsetTable = { entries: {} }
  for (const other of built.parts) table = withOffset(table, other.ref, { ...(other.wp.placement ?? { x: 0, y: 0, z: 0 }) })
  const index = part.wp.index
  const kinematics: SimKinematics | undefined = index === undefined ? undefined : { layout: index.a === undefined && index.b !== undefined ? "table-BC" : "table-AC", pivot: { ...datum } }
  const pose = { a: (index?.a ?? 0) * DEG, b: (index?.b ?? 0) * DEG, c: (index?.c ?? 0) * DEG }
  // The blank in the table's own frame: at the pose the program turns the table to, the part's frame is the machine's.
  const toWorld = (p: { x: number; y: number; z: number }) => (kinematics === undefined ? machine(real(p)) : tablePose(kinematics, pose, true).toTable(machine(real(p))))
  const v = corners.map(toWorld)
  const tri = [0, 2, 1, 1, 2, 3, 4, 5, 6, 5, 7, 6, 0, 1, 4, 1, 5, 4, 2, 6, 3, 3, 6, 7, 0, 4, 2, 2, 4, 6, 1, 3, 5, 3, 7, 5]
  const featured = featuredBlank(setup.partProbe!.cycles, lo, hi, { translate: { x: datum.x + d.x, y: datum.y + d.y, z: datum.z + d.z }, rotate: theta })
  if (typeof featured === "string") return unreplayed(featured)
  if (featured !== undefined && index !== undefined) return unreplayed("a part on an indexed face with a feature to probe: the replay places the feature on a flat table only (probed on the real part, not replayed)")
  const world = featured ?? meshWorld([{ positions: v.flatMap((p) => [p.x, p.y, p.z]), indices: tri }])
  const outcome = runProbeMoves(part.moves, world, { offsets: table, active: part.ref, probe: built.device, ...(kinematics !== undefined ? { kinematics } : {}) })
  const entry = outcome.offsets[offsetKey(part.ref)] ?? getOffset(table, part.ref)
  const rotation = outcome.rotation
  const turn = (p: { x: number; y: number; z: number }) => {
    if (rotation === undefined) return p
    const cr = Math.cos(rotation.angle), sr = Math.sin(rotation.angle)
    const x = p.x - rotation.centre.x, y = p.y - rotation.centre.y
    return { x: rotation.centre.x + cr * x - sr * y, y: rotation.centre.y + sr * x + cr * y, z: p.z }
  }
  const corrected = { X: entry.x, Y: entry.y, Z: entry.z, R: (entry.rotation ?? 0) / DEG }
  const worst = (believe: (p: { x: number; y: number; z: number }) => { x: number; y: number; z: number }): number =>
    Math.max(...corners.map((p) => { const t = machine(real(p)), b = believe(p); return Math.hypot(b.x - t.x, b.y - t.y, b.z - t.z) }))
  const before = worst((p) => workToMachine(getOffset(table, part.ref), p))
  const after = worst((p) => workToMachine(entry, turn(p)))
  const base = { displacement: { ...d }, toleranceMm: tolerance, beforeMm: Math.round(before * 1e4) / 1e4 }
  if (outcome.stopped !== undefined) {
    const missed = outcome.alarms.some((a) => a.code === 991)
    return { status: missed ? "missed" : "stopped", reason: missed ? `a touch found nothing on the displaced blank (${outcome.stopped}): the cycles do not meet the blank where the setup puts it` : outcome.stopped, ...base }
  }
  const unmeasured = (["X", "Y", "Z"] as const).filter((axis) => Math.abs(d[axis.toLowerCase() as "x" | "y" | "z"]) > 1e-9 && !part.entry.measured.includes(axis))
  const why = (_: number): string =>
    unmeasured.length > 0 ? `no cycle measures ${unmeasured.join(" and ")}, in which the blank is displaced`
      : part.via === "offset-r" && Math.abs(d.rotation) > 0 ? "a rotation written to the register turns the part about its zero, not about the point that was measured: put the datum on the measured corner or write the rotation with g68"
        : "the touches do not pin the blank down well enough (a rotation the cycles do not measure, or a stylus that does not reach the face where it is)"
  return {
    status: after <= tolerance ? "within" : "outside",
    ...(after <= tolerance ? {} : { reason: `the corrected register puts a corner of the blank ${after.toFixed(3)} mm from where it is: ${why(after)}` }),
    ...base, corrected, residualMm: Math.round(after * 1e4) / 1e4,
    ...(rotation !== undefined ? { g68: Math.round((rotation.angle / DEG) * 1e6) / 1e6 } : {})
  }
}

/** The displacement the replay gives a part: the setup's for that workpiece (or for all), else the default. */
const displacementOf = (setup: Setup, wp: Workpiece, writesRotation: boolean): { readonly x: number; readonly y: number; readonly z: number; readonly rotation: number } => {
  const list = setup.partProbe?.replay?.displacements ?? []
  const own = list.find((x) => x.workpieceId === wp.id) ?? list.find((x) => x.workpieceId === undefined)
  return { x: own?.x ?? (own === undefined ? DEFAULT_DISPLACEMENT.x : 0), y: own?.y ?? (own === undefined ? DEFAULT_DISPLACEMENT.y : 0), z: own?.z ?? (own === undefined ? DEFAULT_DISPLACEMENT.z : 0), rotation: own?.rotation ?? (own === undefined && writesRotation ? DEFAULT_ROTATION : 0) }
}

/** The tilted plane of every part indexed as one, by the id of its probe toolpath. */
const planesOf = (b: PartProbeBuild): Record<string, TiltedPlane> =>
  Object.fromEntries(b.parts.filter((p) => p.wp.index !== undefined && p.wp.indexAs === "plane").map((p) => [`probe@${p.wp.id}`, indexPlane(p.wp.index!)]))

/**
 * The probe of each workpiece as a toolpath of its own, to be put at the start of that part's cutting toolpaths in the program that first
 * cuts it (`partProbe.placement: "inline"`), instead of the separate probe program. `toolNumber` is the probe's pocket, `device` its tool id;
 * `planes` names the tilted plane of the toolpaths whose part is indexed as one. Refused, with the reason, when no probe can be made.
 */
export const inlinePartProbe = (setup: Setup): { readonly refused: string } | { readonly toolNumber: number; readonly deviceId: string; readonly byPart: ReadonlyMap<string, Toolpath>; readonly planes: Readonly<Record<string, TiltedPlane>>; readonly entries: ReadonlyArray<PartProbeEntry>; readonly notes: ReadonlyArray<string> } => {
  const built = buildPartProbe(setup)
  if ("refused" in built && built.refused !== undefined) return { refused: built.refused }
  const b = built as PartProbeBuild
  const problem = planeRefusal(setup)
  if (problem !== undefined) return { refused: problem }
  const multi = workpiecesOf(setup).length > 1
  const post = getPost(setup.post.postId)
  if (post === undefined) return { refused: `Post ${setup.post.postId} is not implemented` }
  const byPart = new Map<string, Toolpath>(b.parts.map((p) => [p.wp.id, {
    id: `probe@${p.wp.id}`, name: `Probe - ${p.wp.name}`, toolId: b.device.id, spindleRpm: 0, coolant: "off", moves: [...p.moves],
    ...(multi ? { workOffset: p.wp.workOffset, ...(p.wp.workOffsetRef !== undefined ? { workOffsetRef: p.wp.workOffsetRef } : {}) } : {}),
    operation: { id: `probe@${p.wp.id}`, name: `Probe - ${p.wp.name}` }
  } satisfies Toolpath]))
  // The post must be able to write every probe cycle: tried here on the probe toolpaths alone, so a control without the words (variables, a skip word) is named before the program is cut.
  try {
    post.emit(makeProgram("probe", [...byPart.values()], { workOffset: setup.workOffset }), {
      decimals: setup.post.decimals, useCannedCycles: setup.post.useCannedCycles, arcMode: setup.post.arcMode, header: false, tolerance: setup.post.tolerance,
      toolNumbers: { [b.device.id]: b.toolNumber },
      ...(Object.keys(planesOf(b)).length > 0 ? { workPlanes: planesOf(b), ...(setup.post.swivel !== undefined ? { swivel: setup.post.swivel } : {}) } : {})
    })
  } catch (error) { return { refused: `The ${setup.post.postId} post cannot write the probe: ${error instanceof Error ? error.message : String(error)}` } }
  return { toolNumber: b.toolNumber, deviceId: b.device.id, byPart, planes: planesOf(b), entries: b.parts.map((p) => p.entry), notes: b.notes }
}

/**
 * The probe program of a setup's workpieces: for every workpiece (in the fixture's order) the configured cycles run in that part's frame
 * and the deviation of each measured datum is added to that part's own register. The post must write probing words; the register is
 * the one the part's toolpaths run under, so the cut that follows starts from the measured datum. The plan carries the replay of each
 * part's probe against a displaced blank (`PartProbeReplay`): the program's touches run on the simulator, no cutting is replayed.
 */
export const partProbeProgram = (setup: Setup, programNumber: number): { readonly plan: PartProbePlan; readonly generated?: GeneratedProgram } => {
  const built = buildPartProbe(setup)
  if ("refused" in built && built.refused !== undefined) return { plan: { refused: built.refused, toolNumber: built.toolNumber, parts: [], notes: [] } }
  const b = built as PartProbeBuild
  const config = setup.partProbe!
  const planeProblem = planeRefusal(setup)
  if (planeProblem !== undefined) return { plan: { refused: planeProblem, toolNumber: b.toolNumber, parts: [], notes: [] } }
  const post = getPost(setup.post.postId)
  const refuse = (refused: string): { readonly plan: PartProbePlan } => ({ plan: { refused, toolNumber: b.toolNumber, parts: [], notes: [] } })
  if (post === undefined) return refuse(`Post ${setup.post.postId} is not implemented`)
  const tolerance = config.replay?.tolerance ?? REPLAY_TOLERANCE
  const writesRotation = config.rotation !== undefined && b.parts.some((p) => p.entry.axes.includes("R"))
  const parts: PartProbeEntry[] = b.parts.map((p) => {
    let replay: PartProbeReplay
    try { replay = replayPart(setup, b, p, displacementOf(setup, p.wp, writesRotation), tolerance) } catch (error) { replay = { status: "unreplayed", reason: `the replay could not run: ${error instanceof Error ? error.message : String(error)}` } }
    return { ...p.entry, replay }
  })
  const toolpaths: Toolpath[] = b.parts.map((p) => ({
    id: `probe@${p.wp.id}`, name: `Probe - ${p.wp.name}`, toolId: b.device.id, spindleRpm: 0, coolant: "off", moves: [...p.moves],
    workOffset: p.wp.workOffset, ...(p.wp.workOffsetRef !== undefined ? { workOffsetRef: p.wp.workOffsetRef } : {}),
    operation: { id: `probe@${p.wp.id}`, name: `Probe - ${p.wp.name}` }
  }))
  const notes = [...b.notes]
  const plan: PartProbePlan = { toolNumber: b.toolNumber, parts, notes }
  const name = `${setup.name} - probe parts`
  const program: Program = makeProgram(name, toolpaths, {
    workOffset: toolpaths[0]?.workOffset ?? setup.workOffset,
    ...(toolpaths[0]?.workOffsetRef !== undefined ? { workOffsetRef: toolpaths[0].workOffsetRef } : {}),
    metadata: { programNumber: String(programNumber), probe: "parts" }
  })
  let gcode: string
  try {
    gcode = post.emit(program, {
      decimals: setup.post.decimals, useCannedCycles: setup.post.useCannedCycles, arcMode: setup.post.arcMode, header: setup.post.header, tolerance: setup.post.tolerance,
      toolNumbers: { [b.device.id]: b.toolNumber }, retractBeforeToolChange: setup.retractBeforeToolChange,
      ...(setup.post.lineNumbers !== undefined ? { lineNumbers: setup.post.lineNumbers } : {}),
      ...(setup.post.stamp !== undefined ? { stamp: setup.post.stamp } : {}),
      ...(Object.keys(planesOf(b)).length > 0 ? { workPlanes: planesOf(b), ...(setup.post.swivel !== undefined ? { swivel: setup.post.swivel } : {}) } : {})
    })
  } catch (error) { return refuse(`The ${setup.post.postId} post cannot write the probe program: ${error instanceof Error ? error.message : String(error)}`) }
  const stats = analyseGcode(gcode, name).stats
  const bad = parts.filter((p) => p.replay !== undefined && p.replay.status !== "within" && p.replay.status !== "unreplayed")
  return {
    plan,
    generated: {
      name, programNumber, gcode, program, stats,
      warnings: [
        `Run this program first: it reads ${parts.map((p) => p.register).join(", ")} from the parts as clamped. It has no cutting tool and replays no material removal`,
        ...bad.map((p) => `Replay of ${p.name}'s probe on a displaced blank: ${p.replay!.status}${p.replay!.reason !== undefined ? ` - ${p.replay!.reason}` : ""}`)
      ],
      operationIds: toolpaths.map((t) => t.id), toolNumbers: [b.toolNumber], pockets: { [b.device.id]: b.toolNumber }, tools: []
    }
  }
}

/** The plan of the part probe without text: refused, or the register, touches, axes and replay of each part. */
export const planPartProbe = (setup: Setup): PartProbePlan => partProbeProgram(setup, setup.post.programNumberBase).plan

/** The probe program that goes with a generated setup, numbered after its programs: the program, or why there is none. Run it first. */
export const partProbeFor = (setup: Setup, generated: { readonly programs: ReadonlyArray<GeneratedProgram> }): { readonly program?: GeneratedProgram; readonly plan: PartProbePlan; readonly refused?: string; readonly inline?: boolean } => {
  const made = partProbeProgram(setup, setup.post.programNumberBase + generated.programs.length)
  // Placed inline, the probe is already in the programs that cut each part: there is no separate program to run first.
  if (setup.partProbe?.placement === "inline") return made.generated === undefined ? { plan: made.plan, refused: made.plan.refused ?? "The part probe made no program" } : { plan: made.plan, inline: true }
  return made.generated === undefined ? { plan: made.plan, refused: made.plan.refused ?? "The part probe made no program" } : { plan: made.plan, program: made.generated }
}
