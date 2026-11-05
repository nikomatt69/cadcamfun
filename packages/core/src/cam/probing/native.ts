/**
 * The control's own probing cycles around the inline expansion (spec 73 §5.9): Heidenhain TCH PROBE 4xx / 48x, Siemens CYCLE977 / 978 and
 * the Renishaw Inspection Plus macros (`G65 P98xx`). The moves stay what they are, between `CycleBegin` and `CycleEnd`: the viewer, the IR
 * executor and every other post see the inline touches, and the cycle's own post writes the cycle instead when `nativeCycles` is on.
 *
 * A native cycle is the vendor's code, which this project does not hold: it is not replayed, so the `probing` claim of a job that uses
 * one stays `unresolved` ("native cycle not replayed"). The cycle numbers, parameter rows and result behaviour are read from the vendor
 * manuals as the author reads them, not run on a control; a machine's cycle package may differ (Siemens: the classic `_MVAR` parameter
 * form, not the positional form of newer cycle versions).
 *
 * What a cycle cannot express is refused, and the operation fails with the reason (it does not fall back to the inline touches on its
 * own: a program that differs from the one asked for is the caller's choice, by clearing `native`): a cycle writes the datum itself, so at most one `set-offset`
 * with `mode: "set"` and no deadband or limit is taken (the control's cycle has no such rule), it must cover the axes the cycle sets, and
 * any other action is refused because its result variables would not exist after the cycle. A tilted plane is refused too.
 */
import type { Vec2 } from "../../cad/vec.ts"
import type { Move } from "../ir.ts"
import { addressOf, type OffsetAxis, type WorkOffsetRef } from "../work-offset.ts"
import type { MacroStyle, ProbeDevice } from "./device.ts"
import type { ProbeAction, ProbeCycle } from "./types.ts"

export type NativeStyle = Exclude<MacroStyle, "inline">
type Family = "heidenhain" | "siemens" | "renishaw"

export interface NativeContext {
  readonly probe: ProbeDevice
  readonly safeZ: number
  readonly clearance: number
  /** A tilted plane is in force. */
  readonly tilted?: boolean
}

export interface NativeCycle {
  /** The approach (protected, outside the marks), the marked inline expansion. */
  readonly moves: ReadonlyArray<Move>
  /** What the post writes, for the summary: `TCH PROBE 412`, `CYCLE977`, `G65 P9814`. */
  readonly word: string
}

export type NativeResult = NativeCycle | { readonly refused: string }

const refuse = (refused: string): { readonly refused: string } => ({ refused })
const NAME: Readonly<Record<NativeStyle, string>> = { "heidenhain-ts": "Heidenhain", "siemens-cycles": "Siemens", renishaw: "Renishaw" }

/** The single axis a unit direction lies along. */
const axisOf = (n: Vec2): { readonly axis: "X" | "Y"; readonly sign: 1 | -1 } | undefined =>
  Math.abs(Math.abs(n.x) - 1) <= 1e-9 ? { axis: "X", sign: n.x > 0 ? 1 : -1 } : Math.abs(Math.abs(n.y) - 1) <= 1e-9 ? { axis: "Y", sign: n.y > 0 ? 1 : -1 } : undefined

/** The axes a cycle's datum write sets, with the result each follows. */
const datumAxes = (cycle: ProbeCycle): Partial<Record<OffsetAxis, string>> | undefined => {
  switch (cycle.kind) {
    case "z-surface": return { Z: "z" }
    case "edge": { const a = axisOf(cycle.normal); return a === undefined ? undefined : a.axis === "X" ? { X: "x" } : { Y: "y" } }
    case "web": case "pocket": { const a = axisOf({ x: Math.cos(cycle.angle), y: Math.sin(cycle.angle) }); return a === undefined ? undefined : a.axis === "X" ? { X: "x" } : { Y: "y" } }
    case "bore": case "boss": case "rectangle": return { X: "x", Y: "y" }
    default: return undefined
  }
}

const sameAxes = (a: Partial<Record<OffsetAxis, string>>, b: Partial<Record<OffsetAxis, string>>): boolean => {
  const ka = Object.keys(a).sort(), kb = Object.keys(b).sort()
  return ka.length === kb.length && ka.every((k, i) => k === kb[i] && a[k as OffsetAxis] === b[k as OffsetAxis])
}

/** The one action a native cycle takes over, or the reason it cannot. */
const datumOf = (cycle: ProbeCycle, actions: ReadonlyArray<ProbeAction>): { readonly ref?: WorkOffsetRef } | { readonly refused: string } => {
  const other = actions.find((a) => a.kind !== "set-offset" && !(a.kind === "tool-offset"))
  if (other !== undefined) return refuse(`a ${other.kind} action reads result variables a native cycle does not leave`)
  const sets = actions.filter((a): a is Extract<ProbeAction, { readonly kind: "set-offset" }> => a.kind === "set-offset")
  if (sets.length > 1) return refuse("a native cycle writes one datum")
  const set = sets[0]
  if (set === undefined) return {}
  if (set.policy.mode !== "set" || set.policy.deadband !== undefined || set.policy.limit !== undefined) return refuse("a native cycle writes the datum unconditionally: an update policy with a tolerance, a deadband or a limit needs the inline touches")
  const axes = datumAxes(cycle)
  if (axes === undefined || !sameAxes(axes, set.axes)) return refuse(`this native cycle sets ${axes === undefined ? "no datum" : Object.keys(axes).join(", ")}: the action asks for ${Object.keys(set.axes).join(", ")}`)
  return { ref: set.ref }
}

const contactZ = (top: number | undefined, depth: number): number => (top ?? 0) - depth

interface Marked {
  readonly family: Family
  readonly number: number
  readonly name: string
  readonly word: string
  readonly params: Readonly<Record<string, number>>
  /** The tip where the cycle starts, reached by protected moves before it; absent: the cycle positions itself. */
  readonly start?: { readonly x: number; readonly y: number; readonly z: number }
}

const heidenhain = (cycle: ProbeCycle, ref: WorkOffsetRef | undefined, actions: ReadonlyArray<ProbeAction>, ctx: NativeContext): Marked | { readonly refused: string } => {
  let row = 0
  if (ref !== undefined) {
    const a = addressOf(ref, "heidenhain")
    if ("refused" in a) return refuse(a.refused)
    row = ref.kind === "preset" ? ref.row : ref.kind === "g5x" ? Number(ref.code.slice(1)) - 53 : 0
  }
  const clear = { Q320: ctx.clearance, Q260: ctx.safeZ }
  const write = { Q305: row, Q303: ref === undefined ? -1 : 1 }
  const circleOrRect = { Q301: 1, Q381: 0, Q382: 0, Q383: 0, Q384: 0, Q333: 0 }
  const mk = (number: number, name: string, params: Record<string, number>, x: number, y: number): Marked =>
    ({ family: "heidenhain", number, name, word: `TCH PROBE ${number}`, params: { ...params, x, y } })
  switch (cycle.kind) {
    case "bore": case "boss": {
      if (cycle.angles !== undefined) return refuse("touches at given angles need the inline touches: cycles 412 and 413 space their touches evenly")
      const c = cycle.centre
      return mk(cycle.kind === "bore" ? 412 : 413, cycle.kind === "bore" ? "DATUM INSIDE CIRCLE" : "DATUM OUTSIDE CIRCLE",
        { Q321: c.x, Q322: c.y, Q262: cycle.diameter, Q325: 0, Q247: 90, Q261: contactZ(cycle.top, cycle.depth), ...clear, ...write, Q331: c.x, Q332: c.y, ...circleOrRect, Q423: 4, Q365: 1 }, c.x, c.y)
    }
    case "rectangle": {
      const c = cycle.centre
      return mk(cycle.inside ? 410 : 411, cycle.inside ? "DATUM INSIDE RECTAN." : "DATUM OUTS. RECTAN.",
        { Q321: c.x, Q322: c.y, Q323: cycle.size.x, Q324: cycle.size.y, Q261: contactZ(cycle.top, cycle.depth), ...clear, ...write, Q331: c.x, Q332: c.y, ...circleOrRect }, c.x, c.y)
    }
    case "web": case "pocket": {
      const a = axisOf({ x: Math.cos(cycle.angle), y: Math.sin(cycle.angle) })
      if (a === undefined) return refuse("cycles 408 and 409 measure along an axis, not across an angled slot")
      const c = cycle.centre
      return mk(cycle.kind === "pocket" ? 408 : 409, cycle.kind === "pocket" ? "SLOT CENTER REF PT" : "RIDGE CENTER REF PT",
        { Q321: c.x, Q322: c.y, Q311: cycle.width, Q272: a.axis === "X" ? 1 : 2, Q261: contactZ(cycle.top, cycle.depth), ...clear, ...write, Q405: a.axis === "X" ? c.x : c.y, ...circleOrRect }, c.x, c.y)
    }
    case "edge": {
      const a = axisOf(cycle.normal)
      if (a === undefined) return refuse("cycle 419 measures along an axis, not an angled face")
      const stand = ctx.clearance + ctx.probe.stylus.ballDiameter / 2
      const x = cycle.at.x + cycle.normal.x * stand, y = cycle.at.y + cycle.normal.y * stand
      return mk(419, "DATUM IN ONE AXIS", { Q263: x, Q264: y, Q261: cycle.at.z, ...clear, Q272: a.axis === "X" ? 1 : 2, Q267: -a.sign, ...write, Q333: a.axis === "X" ? cycle.at.x : cycle.at.y }, x, y)
    }
    case "z-surface":
      return mk(417, "DATUM IN TS AXIS", { Q263: cycle.at.x, Q264: cycle.at.y, Q294: cycle.expectedZ, ...clear, ...write, Q333: cycle.expectedZ }, cycle.at.x, cycle.at.y)
    case "tool-length": case "tool-radius": case "broken-tool": {
      const t = actions.find((x) => x.kind === "tool-offset")
      if (t !== undefined && t.kind === "tool-offset" && t.part !== "geometry") return refuse("cycles 481 and 482 write the tool's geometry, not its wear")
      const q340 = cycle.kind === "broken-tool" ? 2 : t === undefined ? 1 : 0
      return mk(cycle.kind === "tool-radius" ? 482 : 481, cycle.kind === "tool-radius" ? "TOOL RADIUS" : "TOOL LENGTH", { Q340: q340, Q260: ctx.safeZ, Q341: 0 }, 0, 0)
    }
    default:
      return refuse(`no Heidenhain cycle for ${cycle.kind} is written here`)
  }
}

const startOf = (cycle: ProbeCycle, ctx: NativeContext): { readonly x: number; readonly y: number; readonly z: number } | undefined => {
  const stand = ctx.clearance + ctx.probe.stylus.ballDiameter / 2
  const r = ctx.probe.stylus.ballDiameter / 2
  switch (cycle.kind) {
    case "z-surface": return { x: cycle.at.x, y: cycle.at.y, z: cycle.expectedZ + ctx.clearance }
    case "edge": return { x: cycle.at.x + cycle.normal.x * stand, y: cycle.at.y + cycle.normal.y * stand, z: cycle.at.z - r }
    case "bore": case "pocket": return { ...cycle.centre, z: contactZ(cycle.top, cycle.depth) - r }
    case "boss": case "web": return { ...cycle.centre, z: (cycle.top ?? 0) + ctx.clearance }
    default: return undefined
  }
}

const renishaw = (cycle: ProbeCycle, ref: WorkOffsetRef | undefined, ctx: NativeContext): Marked | { readonly refused: string } => {
  const start = startOf(cycle, ctx)
  if (start === undefined) return refuse(`no Renishaw macro for ${cycle.kind} is written here`)
  // S: 1..6 are G54..G59, 100 + p is G54.1 P<p>; without S the macro only measures.
  let S: { S?: number } = {}
  if (ref !== undefined) {
    if (ref.kind === "g5x") S = { S: Number(ref.code.slice(1)) - 53 }
    else if (ref.kind === "extended") S = { S: 100 + ref.p }
    else return refuse("the macro's S word names G54..G59 or G54.1 P")
  }
  const end = { x: start.x, y: start.y, z: ctx.safeZ, f: ctx.probe.feeds.positioning }
  const mk = (number: number, name: string, params: Record<string, number>): Marked => ({ family: "renishaw", number, name, word: `G65 P${number}`, params: { ...params, ...S, ...end }, start })
  switch (cycle.kind) {
    case "z-surface": return mk(9811, "SINGLE SURFACE", { Z: cycle.expectedZ })
    case "edge": {
      const a = axisOf(cycle.normal)
      if (a === undefined) return refuse("O9811 measures along an axis, not an angled face")
      return mk(9811, "SINGLE SURFACE", a.axis === "X" ? { X: cycle.at.x } : { Y: cycle.at.y })
    }
    case "web": case "pocket": {
      const a = axisOf({ x: Math.cos(cycle.angle), y: Math.sin(cycle.angle) })
      if (a === undefined) return refuse("O9812 measures along an axis, not across an angled slot")
      return mk(9812, cycle.kind === "web" ? "WEB" : "POCKET", { [a.axis]: cycle.width, ...(cycle.kind === "web" ? { Z: contactZ(cycle.top, cycle.depth) - ctx.probe.stylus.ballDiameter / 2 } : {}) })
    }
    case "bore": case "boss":
      if (cycle.angles !== undefined) return refuse("touches at given angles need the inline touches: O9814 touches four times")
      return mk(9814, cycle.kind === "bore" ? "BORE" : "BOSS", { D: cycle.diameter, ...(cycle.kind === "boss" ? { Z: contactZ(cycle.top, cycle.depth) - ctx.probe.stylus.ballDiameter / 2 } : {}) })
    default: return refuse(`no Renishaw macro for ${cycle.kind} is written here`)
  }
}

const siemens = (cycle: ProbeCycle, ref: WorkOffsetRef | undefined, ctx: NativeContext): Marked | { readonly refused: string } => {
  const start = startOf(cycle, ctx)
  if (start === undefined) return refuse(`no Siemens measuring cycle for ${cycle.kind} is written here`)
  let knum = 0
  if (ref !== undefined) {
    const a = addressOf(ref, "siemens")
    if ("refused" in a) return refuse(a.refused)
    knum = ref.kind === "g5x" ? Number(ref.code.slice(1)) - 53 : ref.kind === "frame" ? ref.n : 0
  }
  const common = { _KNUM: knum, _PRNUM: 1, _FA: ctx.clearance * 2, _VMS: 0, _NMSP: 1 }
  const end = { x: start.x, y: start.y, z: ctx.safeZ }
  const zt = (top: number | undefined, depth: number): number => contactZ(top, depth) - ctx.probe.stylus.ballDiameter / 2
  const mk = (number: number, name: string, params: Record<string, number>): Marked => ({ family: "siemens", number, name, word: `CYCLE${number}`, params: { ...params, ...common, ...end }, start })
  switch (cycle.kind) {
    case "z-surface": return mk(978, "SURFACE", { _MVAR: 100, _SETVAL: cycle.expectedZ, _MA: 3 })
    case "edge": {
      const a = axisOf(cycle.normal)
      if (a === undefined) return refuse("CYCLE978 measures along an axis, not an angled face")
      return mk(978, "SURFACE", { _MVAR: 100, _SETVAL: a.axis === "X" ? cycle.at.x : cycle.at.y, _MA: a.axis === "X" ? 1 : 2 })
    }
    case "bore": case "boss":
      if (cycle.angles !== undefined) return refuse("touches at given angles need the inline touches")
      return mk(977, cycle.kind === "bore" ? "HOLE" : "SHAFT", { _MVAR: cycle.kind === "bore" ? 101 : 102, _SETVAL: cycle.diameter, ...(cycle.kind === "boss" ? { _ID: zt(cycle.top, cycle.depth) - start.z } : {}) })
    case "web": case "pocket": {
      const a = axisOf({ x: Math.cos(cycle.angle), y: Math.sin(cycle.angle) })
      if (a === undefined) return refuse("CYCLE977 measures along an axis, not across an angled slot")
      return mk(977, cycle.kind === "pocket" ? "GROOVE" : "WEB", { _MVAR: cycle.kind === "pocket" ? 103 : 104, _SETVAL: cycle.width, _MA: a.axis === "X" ? 1 : 2, ...(cycle.kind === "web" ? { _ID: zt(cycle.top, cycle.depth) - start.z } : {}) })
    }
    default: return refuse(`no Siemens measuring cycle for ${cycle.kind} is written here`)
  }
}

/**
 * The cycle's inline `moves` (routine and actions) marked as the control's own cycle of `style`, with the approach the cycle expects
 * before the marks; or why it cannot be written natively.
 */
export const nativeCycle = (cycle: ProbeCycle, actions: ReadonlyArray<ProbeAction>, style: MacroStyle, inline: ReadonlyArray<Move>, ctx: NativeContext): NativeResult => {
  if (style === "inline") return refuse("the machine's probing has no cycle package (macroStyle inline): the operation cannot be native")
  if (ctx.tilted === true) return refuse(`${NAME[style]} cycles under a tilted plane are not written here`)
  const datum = datumOf(cycle, actions)
  if ("refused" in datum) return datum
  const tool = cycle.kind === "tool-length" || cycle.kind === "tool-radius" || cycle.kind === "broken-tool"
  if (!tool && actions.some((a) => a.kind === "tool-offset")) return refuse("a tool write needs a tool-setter cycle")
  const marked = style === "heidenhain-ts" ? heidenhain(cycle, datum.ref, actions, ctx) : style === "renishaw" ? renishaw(cycle, datum.ref, ctx) : siemens(cycle, datum.ref, ctx)
  if ("refused" in marked) return marked
  const approach: Move[] = []
  if (marked.start !== undefined) {
    const s = marked.start
    const down = { x: 0, y: 0, z: -1 }
    const armed = { _tag: "Probe" as const, overtravel: 0, feed: ctx.probe.feeds.positioning, kind: "protected" as const, onMiss: "alarm" as const }
    approach.push({ ...armed, to: { x: s.x, y: s.y, z: ctx.safeZ }, direction: down }, { ...armed, to: s, direction: down })
  }
  return {
    moves: [...approach, { _tag: "CycleBegin", family: marked.family, number: marked.number, name: marked.name, params: marked.params }, ...inline, { _tag: "CycleEnd" }],
    word: marked.word
  }
}

/** The program without the marks of native probe cycles: what every post writes inline, and what the replay can check. */
export const withoutNativeMarks = (moves: ReadonlyArray<Move>): Move[] => moves.filter((m) => m._tag !== "CycleBegin" && m._tag !== "CycleEnd")
