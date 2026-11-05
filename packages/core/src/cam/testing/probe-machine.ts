/**
 * Replays the NC text of a probe program against a modelled part (spec 73 §5.11): what the control does with it. The macro runtime
 * (`macro-runtime.ts`) runs the variables, the jumps and the alarms; this module is the machine under it. Every motion block goes to
 * a tracker of the modal state (G90 / G91, the unit, the tilted plane, the offset selected, G53 and SUPA machine coordinates); a
 * probing block (Fanuc `G31`, `G38.2` / `G38.3`, Siemens `MEAS=1`, Klartext `TCH PROBE 0`) is cast against the world and stops at
 * the contact the way the control does, writing the skip variables (`#5061`, `$AA_MW[X]`, `Q94`) the program then reads. Work offsets
 * live in the control's own variables (`#5221`, `$P_UIFR[n,X,TR]`) so the program's writes to them are the writes the machine would
 * see; a `G10 L2` / `L20` / `L1` block is the host's own write. The geometry (the frame, the offsets, the true pivot, the trigger
 * radius, the pre-travel) is the one `runProbeMoves` uses, so a program and the IR it was written from give the same contacts.
 *
 * Not modelled, reported, never guessed: arcs and canned cycles in a probe program, the Klartext datum cycles, a rapid that
 * would crash (a plain positioning block does not arm the probe, as on a control).
 */
import type { Vec3 } from "../../cad/vec.ts"
import type { PostProbingOptions, ProbingCodes } from "../post/types.ts"
import { toolBases } from "../post/probing-writer.ts"
import { addressOf, getOffset, machineToWork, offsetKey, parseOffsetRef, workToMachine, type OffsetAxis, type OffsetEntry, type OffsetFamily, type WorkOffsetRef } from "../work-offset.ts"
import { effectiveRadius } from "../probing/device.ts"
import { frameToWork, tablePose, workToFrame, type SimMachine } from "../probing/simulate.ts"
import type { ProbeSimContact, ProbeSimOutcome, ProbeSimToolUpdate, ProbeSimUpdate } from "../probing/types.ts"
import type { ProbeWorld3 } from "../probing/world.ts"
import type { WorkFrame } from "../setup.ts"
import { expandMacros, type Expanded, type ExpandOptions } from "./macro-runtime.ts"
import { frameOfCycle800, frameOfG68, frameOfG682, frameOfPlaneSpatial, type Frame } from "./frames.ts"

const DEG = Math.PI / 180

export interface NcSimOptions {
  /**
   * Rewrite instead of consume: every block stays in the text as it is, except a probing block, which is written as a plain move that
   * ends where the probe touched (absolute program coordinates). The text then replays in `interpretGcode` as the path the probe took.
   */
  readonly rewrite?: boolean
  readonly world: ProbeWorld3
  readonly machine: SimMachine
  /** The control the text is for: its offset addresses and probing syntax. */
  readonly codes: ProbingCodes
  readonly probing?: PostProbingOptions
  /** Variables the program reads before it writes them. */
  readonly variables?: Readonly<Record<string, number>>
}

export interface NcSimOutcome extends Omit<ProbeSimOutcome, "variables"> {
  /** The control's variables at the end, by the control's name (`#105`, `R5`, `$P_UIFR[1,X,TR]`). */
  readonly variables: Readonly<Record<string, number>>
  readonly expanded: Expanded
  /** Errors the replay reports (a variable it does not model, a word it cannot read). */
  readonly errors: ReadonlyArray<string>
}

const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z })
const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
const scale = (a: Vec3, k: number): Vec3 => ({ x: a.x * k, y: a.y * k, z: a.z * k })

const ENTRY_KEY: Readonly<Record<OffsetAxis, keyof OffsetEntry>> = { X: "x", Y: "y", Z: "z", A: "a", B: "b", C: "c", R: "rotation" }
const ANGULAR = (a: OffsetAxis): boolean => a === "A" || a === "B" || a === "C" || a === "R"
const WORD = /(?:^|\s)([A-Z])\s*=?\s*([+-]?(?:\d+\.?\d*|\.\d+))/g

const frameOfWork = (f: WorkFrame | undefined): Frame | undefined =>
  f === undefined ? undefined : { m: [f.xAxis.x, f.yAxis.x, f.zAxis.x, f.xAxis.y, f.yAxis.y, f.zAxis.y, f.xAxis.z, f.yAxis.z, f.zAxis.z], t: f.origin, planar: false }
const workFrameOf = (f: Frame | undefined): WorkFrame | undefined =>
  f === undefined ? undefined : { origin: f.t, xAxis: { x: f.m[0], y: f.m[3], z: f.m[6] }, yAxis: { x: f.m[1], y: f.m[4], z: f.m[7] }, zAxis: { x: f.m[2], y: f.m[5], z: f.m[8] } }

/** The offset selected by a block's G words, or undefined. */
const selectedRef = (g: ReadonlyArray<number>, p: number | undefined): WorkOffsetRef | undefined => {
  for (const code of g) {
    if (code >= 54 && code <= 59 && Number.isInteger(code)) return { kind: "g5x", code: `G${code}` as "G54" }
    if (code === 54.1 && p !== undefined) return { kind: "extended", p }
    if (code === 154 && p !== undefined) return { kind: "extended", p }
    if (code >= 505 && code <= 599) return { kind: "frame", n: code - 500 }
    if (code === 59.1 || code === 59.2 || code === 59.3) return { kind: "linuxcnc", p: 6 + Math.round((code - 59) * 10) }
  }
  return undefined
}

/** Okuma `G15 H<n>`: H1..H6 are G54..G59, above them the extended offsets. */
const okumaRef = (h: number): WorkOffsetRef => (h <= 6 ? { kind: "g5x", code: `G${53 + h}` as "G54" } : { kind: "extended", p: h - 6 })

/** The machine under the macro runtime: `expand` is what `expandMacros` takes, `finish` reads the outcome once the program has run. */
export interface NcProbeHost {
  readonly expand: ExpandOptions
  readonly finish: (expanded: Expanded) => NcSimOutcome
}

export const simulateNc = (text: string, options: NcSimOptions): NcSimOutcome => {
  const host = createNcProbeHost(options)
  return host.finish(expandMacros(text, host.expand))
}

export const createNcProbeHost = (options: NcSimOptions): NcProbeHost => {
  const { world, machine, codes } = options
  const family: OffsetFamily = codes.offsets
  const capacity = options.probing?.offsets
  const ball = machine.probe.stylus.ballDiameter / 2
  const kin = machine.kinematics
  const contacts: ProbeSimContact[] = []
  const updates: ProbeSimUpdate[] = []
  const toolUpdates: ProbeSimToolUpdate[] = []
  const alarms: Array<{ code: number; text: string; moveIndex: number; line?: number }> = []
  const reports: Array<{ label: string; values: Record<string, number> }> = []
  const path: Vec3[] = []
  const tools: Record<number, { length: number; radius: number; lengthWear?: number; radiusWear?: number }> = { ...(machine.tools ?? {}) }
  const errors: string[] = []

  let unit = 1
  let absolute = true
  let active: WorkOffsetRef = machine.active
  let frame: Frame | undefined = frameOfWork(machine.frame)
  let pose = { a: 0, b: 0, c: 0 }
  let stopped: string | undefined
  let blockCount = 0
  let rd: (name: string) => number = () => 0
  // Skip results the program reads.
  let skip: Vec3 = { x: 0, y: 0, z: 0 }
  let touched = 0
  // Heidenhain TCH PROBE 0.0 waits for its 0.1 row.
  let pending: { readonly axis: "x" | "y" | "z"; readonly sign: 1 | -1; readonly result: string } | undefined

  // ---- offsets live in the control's variables
  const addr = (ref: WorkOffsetRef) => { const a = addressOf(ref, family, capacity); return "refused" in a ? undefined : a }
  const staticEntry = (ref: WorkOffsetRef): OffsetEntry => getOffset(machine.offsets, ref)
  const entryOf = (ref: WorkOffsetRef): OffsetEntry => {
    const a = addr(ref)
    const base = staticEntry(ref)
    if (a === undefined) return base
    const get = (axis: OffsetAxis): number | undefined => {
      const name = a.read(axis)
      if (name === undefined) return undefined
      const v = rd(name)
      return ANGULAR(axis) ? v * DEG : v * unit
    }
    const out: Record<string, number | undefined> = {}
    for (const axis of ["X", "Y", "Z", "A", "B", "C", "R"] as const) {
      const have = base[ENTRY_KEY[axis]] as number | undefined
      const v = get(axis)
      // An axis the table does not carry stays absent while the control holds 0 there.
      out[ENTRY_KEY[axis]] = v !== undefined && (v !== 0 || have !== undefined || axis === "X" || axis === "Y" || axis === "Z") ? v : have
    }
    return { x: out["x"] ?? 0, y: out["y"] ?? 0, z: out["z"] ?? 0, ...(out["a"] !== undefined ? { a: out["a"] } : {}), ...(out["b"] !== undefined ? { b: out["b"] } : {}), ...(out["c"] !== undefined ? { c: out["c"] } : {}), ...(out["rotation"] !== undefined && out["rotation"] !== 0 ? { rotation: out["rotation"] } : {}) }
  }
  const offset = (): OffsetEntry => entryOf(active)

  const seed: Record<string, number> = { ...(options.variables ?? {}) }
  const owners = new Map<string, { readonly ref: WorkOffsetRef; readonly axis: OffsetAxis }>()
  const refs: WorkOffsetRef[] = [active]
  for (const key of Object.keys(machine.offsets.entries)) { const r = parseOffsetRef(key); if (r !== undefined && !refs.some((x) => offsetKey(x) === key)) refs.push(r) }
  for (const ref of refs) {
    const a = addr(ref)
    if (a === undefined) continue
    const entry = staticEntry(ref)
    for (const axis of ["X", "Y", "Z", "A", "B", "C", "R"] as const) {
      const name = a.read(axis)
      if (name === undefined) continue
      owners.set(name, { ref, axis })
      const v = entry[ENTRY_KEY[axis]] as number | undefined
      if (!(name in seed)) seed[name] = v === undefined ? 0 : ANGULAR(axis) ? v / DEG : v
    }
  }
  // Tool table variables (Fanuc-syntax controls): `base + tool`.
  const bases = toolBases(codes, options.probing)
  const toolOf = (name: string): { tool: number; quantity: "length" | "radius"; part: "geometry" | "wear" } | undefined => {
    const m = /^#(\d+)$/.exec(name)
    if (m === null || bases === undefined) return undefined
    const idx = Number(m[1])
    const table: ReadonlyArray<[number | undefined, "length" | "radius", "geometry" | "wear"]> = [[bases.lengthGeometry, "length", "geometry"], [bases.lengthWear, "length", "wear"], [bases.radiusGeometry, "radius", "geometry"], [bases.radiusWear, "radius", "wear"]]
    for (const [base, quantity, part] of table) if (base !== undefined && idx > base && idx <= base + 999) return { tool: idx - base, quantity, part }
    return undefined
  }
  const siemensTool = (name: string): { tool: number; quantity: "length" | "radius"; part: "geometry" | "wear" } | undefined => {
    const s = /^\$TC_DP(\d+)\[(\d+),1\]$/.exec(name)
    if (s === null) return undefined
    const n = Number(s[1])
    const q = n === 3 ? ["length", "geometry"] : n === 12 ? ["length", "wear"] : n === 6 ? ["radius", "geometry"] : n === 15 ? ["radius", "wear"] : undefined
    return q === undefined ? undefined : { tool: Number(s[2]), quantity: q[0] as "length" | "radius", part: q[1] as "geometry" | "wear" }
  }
  const fieldOf = (q: "length" | "radius", part: "geometry" | "wear"): "length" | "radius" | "lengthWear" | "radiusWear" => (q === "length" ? (part === "geometry" ? "length" : "lengthWear") : part === "geometry" ? "radius" : "radiusWear")

  // ---- geometry
  const progToMachine = (p: Vec3): Vec3 => workToMachine(offset(), frameToWork(workFrameOf(frame), p))
  const machineToProg = (m: Vec3): Vec3 => workToFrame(workFrameOf(frame), machineToWork(offset(), m))
  const toWorld = (m: Vec3): Vec3 => (kin === undefined ? m : tablePose(kin, pose, true).toTable(m))
  const worldAxis = (): Vec3 => {
    const wf = workFrameOf(frame)
    const z = wf === undefined ? { x: 0, y: 0, z: 1 } : wf.zAxis
    const r = offset().rotation ?? 0
    const m = { x: Math.cos(r) * z.x - Math.sin(r) * z.y, y: Math.sin(r) * z.x + Math.cos(r) * z.y, z: z.z }
    return kin === undefined ? m : tablePose(kin, pose, true).dirToTable(m)
  }
  const triggerRadius = (d: Vec3): number => machine.truth?.radius?.(d) ?? effectiveRadius(machine.probe, d)
  let at: Vec3 | undefined
  const here = (): Vec3 => {
    if (at === undefined) at = progToMachine(machine.start ?? { x: 0, y: 0, z: 0 })
    return at
  }
  const reportedPos = (): Vec3 => {
    const m = here()
    return machine.skipFrame === "work" && frame !== undefined ? machineToWork(offset(), m) : machineToProg(m)
  }

  const fail = (reason: string, stop: (r: string) => void): void => { stopped = reason; stop(reason) }

  /** A probing move to `end` (machine coordinates): stops at the contact, writes the skip position. `armed`: G38.2 / MEAS alarms on a miss are the program's. */
  const touch = (end: Vec3, line: number, kind: "g31" | "g38.2" | "g38.3" | "meas", stop: (r: string) => void): void => {
    const start = here()
    const a = toWorld(start), b = toWorld(end)
    const dw = sub(b, a)
    const lw = Math.hypot(dw.x, dw.y, dw.z)
    // A block that goes nowhere ends where it is: the skip position is that point and nothing touched.
    if (!(lw > 1e-12)) { skip = reportedPos(); touched = 0; return }
    const unitDir = scale(dw, 1 / lw)
    const vertical = Math.abs(unitDir.z) > 0.999999
    const hit = world.touch(a, b, { radius: vertical ? ball : triggerRadius(unitDir), centre: ball, axis: worldAxis() })
    if (hit === undefined) {
      at = end
      path.push(machineToProg(at))
      const p = reportedPos()
      skip = p
      touched = 0
      if (kind === "g38.2") {
        alarms.push({ code: 991, text: "the probe did not touch", moveIndex: blockCount, line })
        fail("alarm 991: the probe did not touch", stop)
      }
      return
    }
    const extra = (vertical ? machine.truth?.pretravelZ ?? 0 : 0) + (machine.truth?.noise?.() ?? 0)
    const travelled = (hit.travelled + extra) / lw
    at = add(start, scale(sub(end, start), travelled))
    path.push(machineToProg(at))
    skip = reportedPos()
    touched = 1
    contacts.push({ tip: skip, moveIndex: blockCount, line })
    if (pending !== undefined) { /* the result row is written by the caller */ }
  }

  const readTarget = (words: Map<string, number>, machineCoords: boolean): Vec3 | undefined => {
    const has = (l: string): boolean => words.has(l)
    if (!has("X") && !has("Y") && !has("Z")) return undefined
    if (machineCoords) {
      const m = here()
      return { x: has("X") ? words.get("X")! * unit : m.x, y: has("Y") ? words.get("Y")! * unit : m.y, z: has("Z") ? words.get("Z")! * unit : m.z }
    }
    const p = machineToProg(here())
    const v = (l: string, cur: number): number => (has(l) ? (absolute ? words.get(l)! * unit : cur + words.get(l)! * unit) : cur)
    return progToMachine({ x: v("X", p.x), y: v("Y", p.y), z: v("Z", p.z) })
  }

  const handleInner = (block: { readonly text: string; readonly line: number; readonly stop: (reason: string) => void; readonly read: (name: string) => number; readonly write: (name: string, value: number) => void }): boolean | string => {
    rd = block.read
    blockCount++
    if (stopped !== undefined) return true
    let t = block.text.trim().replace(/^N\d+\s+/, "").replace(/^\d+\s+(?=[A-Z])/, "")
    const line = block.line
    if (t === "" || t.startsWith(";") || t.startsWith("%")) return true
    if (t.startsWith("(")) {
      const log = /^\(LOG,\s*(.*)\)$/i.exec(t)
      if (log !== null) {
        const m = /^(.*?)\s+(\S+)=#<([^>]+)>$/.exec(log[1]!)
        if (m !== null) {
          const label = m[1]!.toUpperCase()
          const last = reports[reports.length - 1]
          const value = block.read(`#<${m[3]!.toLowerCase()}>`)
          if (last !== undefined && last.label === label) last.values[m[2]!] = value
          else reports.push({ label, values: { [m[2]!]: value } })
        }
      }
      return true
    }
    const dprnt = /^DPRNT\[(.*)\]$/.exec(t)
    if (dprnt !== null) {
      const parts = dprnt[1]!.split("*")
      const value = Number(parts[parts.length - 1])
      const name = parts[parts.length - 2] ?? ""
      const label = parts.slice(0, -2).join(" ")
      const last = reports[reports.length - 1]
      if (last !== undefined && last.label === label) last.values[name] = value
      else reports.push({ label, values: { [name]: value } })
      return true
    }
    // ---- Klartext
    const tch = /^TCH PROBE 0\.([01])\s+(.*)$/.exec(t)
    if (tch !== null) {
      if (tch[1] === "0") {
        const m = /^REF\. PLANE\s+(Q\d+)\s+([XYZ])([+-])$/.exec(tch[2]!)
        if (m === null) { errors.push(`line ${line}: cannot read '${t}'`); return true }
        pending = { axis: m[2]!.toLowerCase() as "x" | "y" | "z", sign: m[3] === "+" ? 1 : -1, result: m[1]! }
        return ";TCH PROBE 0.0"
      }
      if (pending === undefined) { errors.push(`line ${line}: TCH PROBE 0.1 without 0.0`); return true }
      const m = /^([XYZ])([+-]\d+\.?\d*)(?:\s+F(\d+\.?\d*))?/.exec(tch[2]!)
      if (m === null) { errors.push(`line ${line}: cannot read '${t}'`); return true }
      const p = machineToProg(here())
      const target = { ...p, [pending.axis]: Number(m[2]) * unit }
      const before = pending
      const words0Feed = Number(m[3] ?? 0)
      pending = undefined
      touch(progToMachine(target), line, "g38.2", block.stop)
      if (stopped === undefined) block.write(before.result, machineToProg(here())[before.axis] / unit)
      const e = machineToProg(here())
      return `L X${e.x < 0 ? "-" : "+"}${Math.abs(e.x / unit).toFixed(4)} Y${e.y < 0 ? "-" : "+"}${Math.abs(e.y / unit).toFixed(4)} Z${e.z < 0 ? "-" : "+"}${Math.abs(e.z / unit).toFixed(4)} R0 F${Math.round(words0Feed)}`
    }
    if (/^(L\s|CC\s|C\s)/.test(t)) {
      const kl = /^L\s+(.*)$/.exec(t)
      if (kl === null) { fail(`line ${line}: an arc in a probe program is not replayed`, block.stop); return true }
      const words = new Map<string, number>()
      for (const m of kl[1]!.matchAll(/(I?)([XYZABC])([+-]\d+\.?\d*)/g)) words.set(m[2]!, Number(m[3]))
      const target = readTarget(words, false)
      if (target !== undefined) { at = target; path.push(machineToProg(at)) }
      return true
    }
    if (/^(FN|CYCL DEF|TOOL CALL|BEGIN|END PGM|Q\d|LBL|CALL|BLK|TOOL DEF)/.test(t)) return true
    const spatial = /^PLANE (SPATIAL|RESET)\b/.exec(t)
    if (spatial !== null) { frame = spatial[1] === "RESET" ? undefined : frameOfPlaneSpatial(t); return true }
    const c800 = /^CYCLE800\((.*)\)$/.exec(t)
    if (c800 !== null) {
      const r = frameOfCycle800(c800[1]!, unit, frame)
      if ("error" in r) errors.push(`line ${line}: ${r.error}`)
      else frame = r.frame
      return true
    }
    if (/^(TRAORI|TRAFOOF|STOPRE|MSG|SETAL|CYCLE832|O\d+|POPEN|PCLOS)\b/.test(t)) return true
    // ---- ISO words
    const meas = /\bMEAS=1\b/.test(t)
    const supa = /\bSUPA\b/.test(t)
    t = t.replace(/\bMEAS=1\b/g, " ").replace(/\bSUPA\b/g, " ")
    const g: number[] = []
    for (const m of t.matchAll(/\bG(\d+(?:\.\d+)?)/g)) g.push(Number(m[1]))
    const words = new Map<string, number>()
    const stripped = t.replace(/\bG\d+(?:\.\d+)?/g, " ").replace(/\bM\d+/g, " ")
    for (const m of stripped.matchAll(WORD)) words.set(m[1]!, Number(m[2]))
    const mCodes = [...t.matchAll(/\bM(\d+)/g)].map((m) => Number(m[1]))
    if (mCodes.includes(0)) { stopped = "program stop"; block.stop("program stop (M0)"); return true }
    if (mCodes.includes(30) || mCodes.includes(2)) return true
    // modal state first: it applies to this block
    for (const code of g) {
      if (code === 90) absolute = true
      else if (code === 91) absolute = false
      else if (code === 20) unit = 25.4
      else if (code === 21) unit = 1
      else if (code === 69) frame = undefined
    }
    // On Okuma G56 is the tool length: only G15 selects an offset.
    const sel = family === "okuma" ? (g.includes(15) && words.has("H") ? okumaRef(words.get("H")!) : undefined) : selectedRef(g, words.get("P"))
    if (sel !== undefined) active = sel
    if (g.includes(68.2)) { frame = frameOfG682((l) => words.get(l), unit); return true }
    if (g.includes(68)) { frame = frameOfG68((words.get("X") ?? 0) * unit, (words.get("Y") ?? 0) * unit, words.get("R") ?? 0); return true }
    if (g.includes(10)) {
      const l = words.get("L")
      if (l === 2) {
        const p = words.get("P") ?? 0
        const ref: WorkOffsetRef = { kind: "linuxcnc", p }
        const a = addr(ref)
        if (a === undefined) { errors.push(`line ${line}: G10 L2 P${p}: no such offset`); return true }
        for (const axis of ["X", "Y", "Z"] as const) {
          const v = words.get(axis)
          const name = a.read(axis)
          if (v !== undefined && name !== undefined) block.write(name, v)
        }
        return true
      }
      if (l === 20) {
        const ref = selectedRef([53 + (words.get("P") ?? 1)], undefined) ?? active
        const a = addr(ref)
        if (a === undefined) return true
        const m = here()
        for (const axis of ["X", "Y", "Z"] as const) {
          const v = words.get(axis)
          const name = a.read(axis)
          if (v === undefined) continue
          // L20: the position the tip is at now reads `v`: the offset is the machine position minus it.
          const next = (m[axis.toLowerCase() as "x" | "y" | "z"] - v * unit) / unit
          if (name !== undefined) block.write(name, next)
          else { const before = (staticEntry(ref)[ENTRY_KEY[axis]] as number) ?? 0; updates.push({ ref, axis, before, after: next * unit, line }) }
        }
        return true
      }
      if (l === 1) {
        const tool = words.get("P")
        if (tool !== undefined && words.has("Z")) {
          const cur = tools[tool] ?? { length: 0, radius: 0 }
          toolUpdates.push({ tool, quantity: "length", part: "geometry", before: cur.length, after: words.get("Z")! * unit })
          tools[tool] = { ...cur, length: words.get("Z")! * unit }
        }
        return true
      }
      return true
    }
    // Homing and the like end where the control puts the tool: nothing the probe tracker reads follows from them.
    if (g.includes(28) || g.includes(30) || g.includes(53.1)) return true
    // motion
    let motion: "rapid" | "feed" | "g31" | "g38.2" | "g38.3" | "meas" | undefined
    if (g.includes(31)) motion = "g31"
    else if (g.includes(38.2)) motion = "g38.2"
    else if (g.includes(38.3)) motion = "g38.3"
    else if (meas) motion = "meas"
    else if (g.includes(0)) motion = "rapid"
    else if (g.includes(1)) motion = "feed"
    // An arc is followed to its end point (the tracker needs where the tool is, not the path); a probe program has none.
    else if (g.some((x) => x === 2 || x === 3) && (words.has("X") || words.has("Y"))) motion = "feed"
    // rotary words position the table before the move
    if (kin !== undefined && (words.has("A") || words.has("B") || words.has("C"))) pose = { a: words.has("A") ? words.get("A")! * DEG : pose.a, b: words.has("B") ? words.get("B")! * DEG : pose.b, c: words.has("C") ? words.get("C")! * DEG : pose.c }
    const target = readTarget(words, g.includes(53) || supa)
    if (motion === undefined || target === undefined) {
      if (motion === undefined && target !== undefined && words.size > 0) errors.push(`line ${line}: a position without a motion word ('${block.text.trim()}') is not replayed`)
      return true
    }
    if (motion === "rapid" || motion === "feed") {
      at = target
      path.push(machineToProg(at))
      return true
    }
    touch(target, line, motion, block.stop)
    const e = machineToProg(here())
    const f = words.get("F")
    return `G90 G1 X${(e.x / unit).toFixed(4)} Y${(e.y / unit).toFixed(4)} Z${(e.z / unit).toFixed(4)}${f !== undefined ? ` F${f}` : ""}`
  }
  const handle = (block: Parameters<typeof handleInner>[0]): boolean | string => {
    const r = handleInner(block)
    if (options.rewrite === true) return typeof r === "string" ? r : false
    return typeof r === "string" ? true : r
  }

  const systemRead = (name: string): number | undefined => {
    const pos = /^#(504[123]|506[123])$/.exec(name)
    if (pos !== null) {
      const i = Number(pos[1]) % 10 - 1
      const key = (["x", "y", "z"] as const)[i]!
      return (Number(pos[1]) >= 5061 ? skip[key] : machineToProg(here())[key]) / unit
    }
    const ok = /^(VSKP|VPPA)([XYZ])$/.exec(name)
    if (ok !== null) return (ok[1] === "VSKP" ? skip : machineToProg(here()))[ok[2]!.toLowerCase() as "x" | "y" | "z"] / unit
    const mw = /^\$AA_MW\[([XYZ])\]$/.exec(name)
    if (mw !== null) return skip[mw[1]!.toLowerCase() as "x" | "y" | "z"] / unit
    if (name === "#5070" || name === "$AC_MEA[1]") return touched
    return undefined
  }

  const expand: ExpandOptions = {
    variables: seed,
    systemRead,
    onBlock: handle,
    onWrite: (name, value, line) => {
      const o = owners.get(name)
      if (o !== undefined) {
        const key = ENTRY_KEY[o.axis]
        const before = (staticEntry(o.ref)[key] as number | undefined) ?? 0
        const prior = [...updates].reverse().find((u) => offsetKey(u.ref) === offsetKey(o.ref) && u.axis === o.axis)
        updates.push({ ref: o.ref, axis: o.axis, before: prior !== undefined ? prior.after : before, after: ANGULAR(o.axis) ? value * DEG : value * unit, line })
        return
      }
      const tool = toolOf(name) ?? siemensTool(name)
      if (tool !== undefined) {
        const cur = tools[tool.tool] ?? { length: 0, radius: 0 }
        const field = fieldOf(tool.quantity, tool.part)
        const before = (cur[field] as number | undefined) ?? 0
        toolUpdates.push({ ...tool, before, after: value * unit })
        tools[tool.tool] = { ...cur, [field]: value * unit }
      }
    },
    onAlarm: (a) => { alarms.push({ code: a.code, text: a.text, moveIndex: blockCount, line: a.line }); stopped = `alarm ${a.code}: ${a.text}` }
  }

  const finish = (expanded: Expanded): NcSimOutcome => {
    // The offsets after the run: the control's variables read back.
    rd = (name) => expanded.variables[name] ?? seed[name] ?? 0
    const offsets: Record<string, OffsetEntry> = { ...machine.offsets.entries }
    for (const ref of refs) offsets[offsetKey(ref)] = entryOf(ref)
    return {
      contacts, variables: expanded.variables, results: {}, offsets, updates, tools: toolUpdates, inspections: [], alarms, reports,
      ...(stopped !== undefined ? { stopped } : {}),
      path, expanded, errors: [...errors, ...expanded.errors.filter((e) => !/: alarm \d+|the program stops|program stop/.test(e))]
    }
  }
  return { expand, finish }
}
