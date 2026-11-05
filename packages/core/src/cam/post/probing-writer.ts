/**
 * Probing in the words of each control (spec 73 §5.8): a `Probe` touch or protected move, an `OffsetUpdate`, an `Alarm`, a `Report`, a
 * `Stop`, and a rapid in machine coordinates. The shared writer asks this module for the blocks and writes them like any control node.
 *
 *   fanuc      Fanuc, Haas, Mazak, Mitsubishi, Brother, generic   `G91 G31 X-12.5 F100` / `G90`, skip position `#5061..#5063`, current `#5041..`,
 *                                                                  offsets `#5221+20(n-1)+axis`, alarm `#3000=n(TEXT)`, report `DPRNT[..]`
 *   linuxcnc   LinuxCNC                                           `G38.2` (a miss aborts) / `G38.3` + `#5070`, contact `#5061..`, offsets `G10 L2 P`, `(abort, ..)`, `(LOG, ..)`
 *   siemens    Siemens 840D sl                                    `MEAS=1 G1 G91 X..`, `$AC_MEA[1]`, contact `$AA_MW[X]`, offsets `$P_UIFR[n,X,TR]` and the frame selected again
 *   okuma      Okuma OSP                                          `G91 G31 X.. F..`, skip position `VSKPX`, position `VPPAX`, offsets `VZOFX[n]`, alarm `VUACM[1]='..'` + `VDOUT[992]=n`
 *   heidenhain Klartext                                           `TCH PROBE 0.0 REF. PLANE Q94 X-` / `TCH PROBE 0.1 X+..`, one axis per touch; the TNC stops with its own error on a miss
 *   grbl       GRBL                                               `G38.2`, no variables: a touch that stores nothing; an offset is `G10 L20` ("the tip reads ...")
 *
 * Every table is read from the vendor manual as the author reads it and was not run on a control (spec 54 §4). What a control cannot
 * do is refused with the reason, never written as something else. The search of a touch is an incremental vector of the length the IR
 * gives (from where the tool stands to the expected contact, plus the overtravel), so a probe re-centred by a computed move still
 * searches the same distance; a miss is found by comparing the skip position with the end of that vector.
 */
import type { Vec3 } from "../../cad/vec.ts"
import type { AlarmMove, OffsetUpdateMove, ProbeMove, ReportMove } from "../ir.ts"
import { exprProblem, type Expr, type VarRef } from "../macro.ts"
import { addressOf, formatOffsetRef, type OffsetAddress, type OffsetAxis, type OffsetCapacity } from "../work-offset.ts"
import type { ToolOffsetAddresses } from "../probing/device.ts"
import { KLARTEXT_PREFIX, type MacroEmitter } from "./macro-syntax.ts"
import type { PostProbingOptions, ProbingCodes } from "./types.ts"

/** The codes of the alarms a probe writes itself (see `probing/simulate.ts`). */
const MISS_CODE = 991
const HIT_CODE = 992
/** Tolerance of the miss test, mm. */
const MISS_EPS = 0.001
const KT = KLARTEXT_PREFIX

export interface ProbeIo {
  /** A length in output units, fixed decimals. */
  readonly num: (mm: number) => string
  /** A feed in output units. */
  readonly feed: (mmPerMin: number) => string
  readonly macro: MacroEmitter
  readonly codes: ProbingCodes
  readonly options: PostProbingOptions | undefined
  /** `1` for mm, `1/25.4` for inch: what a literal in a compare is multiplied by. */
  readonly scale: number
}

const refuse = (io: ProbeIo, what: string): never => {
  throw new RangeError(`The ${io.codes.syntax === "fanuc" ? io.codes.offsets : io.codes.syntax} post cannot write ${what}`)
}

const AXES = ["x", "y", "z"] as const
const LETTER = { x: "X", y: "Y", z: "Z" } as const
const cleanText = (text: string): string => text.replace(/[()";\r\n]/g, " ").replace(/\s+/g, " ").trim().toUpperCase().slice(0, 60)

/** The number a control with a narrow alarm range gets: folded into 1..max, the text says what it was. */
const alarmNumber = (code: number, max: number): number => (code <= max ? code : ((code - 1) % max) + 1)

/** The skip (contact) position of an axis, in the frame the control reports it in. */
export const contactWord = (io: ProbeIo, axis: "x" | "y" | "z"): string => {
  switch (io.codes.syntax) {
    case "fanuc": case "linuxcnc": return `#${5061 + AXES.indexOf(axis)}`
    case "okuma": return `VSKP${LETTER[axis]}`
    case "siemens": return `$AA_MW[${LETTER[axis]}]`
    case "heidenhain": return `Q94`
    case "grbl": return refuse(io, "a contact position (GRBL has no variables)")
  }
}

const varText = (io: ProbeIo, v: VarRef): string => io.macro.variable(v)

const assignRaw = (io: ProbeIo, target: VarRef, raw: string): string => {
  const t = varText(io, target)
  return io.codes.syntax === "heidenhain" ? `${KT}FN 0: ${t} = ${raw.startsWith("-") || raw.startsWith("+") ? raw : `+${raw}`}` : `${t}=${raw}`
}

/** The axis a touch moves along when it is parallel to one (Klartext cycle 0 measures one axis). */
const singleAxis = (dir: Vec3): { readonly axis: "x" | "y" | "z"; readonly sign: 1 | -1 } | undefined => {
  const big = AXES.filter((a) => Math.abs(dir[a]) > 1e-9)
  if (big.length !== 1) return undefined
  const a = big[0]!
  return { axis: a, sign: dir[a] > 0 ? 1 : -1 }
}

const dominant = (v: Vec3): "x" | "y" | "z" => AXES.reduce((best, a) => (Math.abs(v[a]) > Math.abs(v[best]) ? a : best), "x" as "x" | "y" | "z")

/**
 * The blocks of a touch from `start` (the nominal position the writer tracks; program coordinates, mm). `writeStores` assigns each stored
 * axis its variable. A touch against nothing is an alarm (`onMiss: "alarm"`) or sets `flag`.
 */
export const touchLines = (m: ProbeMove, start: Vec3, io: ProbeIo): string[] => {
  const length = (m.to.x - start.x) * m.direction.x + (m.to.y - start.y) * m.direction.y + (m.to.z - start.z) * m.direction.z + m.overtravel
  if (!(length > 0)) throw new RangeError(`A touch that searches ${length.toFixed(4)} mm cannot be written (the probe stands past the surface it is to find)`)
  const v: Vec3 = { x: m.direction.x * length, y: m.direction.y * length, z: m.direction.z * length }
  const moving = AXES.filter((a) => Math.abs(v[a]) > 1e-9)
  const words = moving.map((a) => `${LETTER[a]}${io.num(v[a])}`).join(" ")
  const feed = `F${io.feed(m.feed)}`
  const out: string[] = []
  const stores = (): void => {
    for (const a of AXES) {
      const ref = m.store?.[a]
      if (ref !== undefined) out.push(assignRaw(io, ref, contactWord(io, a)))
    }
  }
  const flagLine = (miss: string): void => {
    if (m.flag !== undefined) out.push(assignRaw(io, m.flag, miss))
  }
  switch (io.codes.syntax) {
    case "fanuc": {
      const k = dominant(v)
      const here = io.macro.variable({ name: "pmiss" })
      const sk = io.options?.skipCode ?? io.codes.skip ?? "G31"
      out.push(`${here}=#${5041 + AXES.indexOf(k)}`)
      out.push(`G91 ${sk} ${words} ${feed}`, "G90")
      const near = `ABS[#${5061 + AXES.indexOf(k)}-[${here}${v[k] < 0 ? "-" : "+"}${io.num(Math.abs(v[k]))}]]`
      const missTest = `[${near} LT ${(MISS_EPS * io.scale).toFixed(4)}]`
      if (m.onMiss === "alarm") out.push(`IF ${missTest} THEN #3000=${alarmNumber(MISS_CODE, io.codes.alarmMax ?? 200)}(THE PROBE DID NOT TOUCH)`)
      else if (m.flag !== undefined) { out.push(assignRaw(io, m.flag, "0")); out.push(`IF ${missTest} THEN ${varText(io, m.flag)}=1`) }
      stores()
      return out
    }
    case "okuma": {
      // OSP has no one-line IF .. THEN: the difference goes to a variable and the structured If tests it.
      const k = dominant(v)
      const L = LETTER[k]
      const near: VarRef = { name: "pmissd" }
      out.push(assignRaw(io, { name: "pmiss" }, `VPPA${L}`))
      out.push(`G91 ${io.options?.skipCode ?? "G31"} ${words} ${feed}`, "G90")
      out.push(assignRaw(io, near, `ABS[VSKP${L}-[${varText(io, { name: "pmiss" })}${v[k] < 0 ? "-" : "+"}${io.num(Math.abs(v[k]))}]]`))
      const miss = { cmp: "lt" as const, a: { var: near }, b: MISS_EPS * io.scale }
      if (m.onMiss === "alarm") out.push(...io.macro.node({ _tag: "If", condition: miss }), ...alarmLines(MISS_CODE, "THE PROBE DID NOT TOUCH", io), ...io.macro.node({ _tag: "EndIf" }))
      else if (m.flag !== undefined) { out.push(assignRaw(io, m.flag, "0"), ...io.macro.node({ _tag: "If", condition: miss }), assignRaw(io, m.flag, "1"), ...io.macro.node({ _tag: "EndIf" })) }
      stores()
      return out
    }
    case "linuxcnc": {
      out.push("G91", `${m.onMiss === "alarm" ? "G38.2" : "G38.3"} ${words} ${feed}`, "G90")
      if (m.onMiss === "flag") flagLine("[1-#5070]")
      stores()
      return out
    }
    case "siemens": {
      out.push(`G91 MEAS=1 G1 ${words} ${feed}`, "G90", "STOPRE")
      if (m.onMiss === "alarm") out.push("IF $AC_MEA[1]==0", ...alarmLines(MISS_CODE, "THE PROBE DID NOT TOUCH", io), "ENDIF")
      else flagLine("1-$AC_MEA[1]")
      stores()
      return out
    }
    case "heidenhain": {
      const one = singleAxis(m.direction)
      if (one === undefined) return refuse(io, "a touch that is not parallel to an axis (TCH PROBE 0 measures one axis)")
      if (m.onMiss === "flag") return refuse(io, "a touch that sets a flag instead of stopping (the TNC stops with an error when the probe does not touch)")
      const end = m.to[one.axis] + m.direction[one.axis] * m.overtravel
      const L = LETTER[one.axis]
      out.push(`${KT}TCH PROBE 0.0 REF. PLANE Q94 ${L}${one.sign > 0 ? "+" : "-"}`)
      out.push(`${KT}TCH PROBE 0.1 ${L}${end < 0 ? "-" : "+"}${io.num(Math.abs(end)).replace(/^-/, "")} F${io.feed(m.feed)}`)
      for (const a of AXES) {
        const ref = m.store?.[a]
        if (ref === undefined) continue
        if (a !== one.axis) return refuse(io, `a touch that stores the ${LETTER[a]} contact when it measures ${L}`)
        out.push(assignRaw(io, ref, "Q94"))
      }
      return out
    }
    case "grbl": {
      if (m.store !== undefined && Object.keys(m.store).length > 0) return refuse(io, "a touch that stores its contact (GRBL has no variables)")
      if (m.onMiss === "flag") return refuse(io, "a touch that sets a flag (GRBL stops with an alarm when the probe does not touch)")
      out.push("G91", `G38.2 ${words} ${feed}`, "G90")
      return out
    }
  }
}

/** The axis words of a protected move, written by the caller (computed words included); this adds the block that arms and checks it. */
export const protectedLines = (m: ProbeMove, wordsText: ReadonlyArray<string>, targets: { readonly x: string; readonly y: string; readonly z: string }, io: ProbeIo): { readonly before: string[]; readonly block: string; readonly after: string[] } => {
  const feed = `F${io.feed(m.feed)}`
  const w = wordsText.join(" ")
  switch (io.codes.syntax) {
    case "fanuc": {
      const sk = io.options?.skipCode ?? io.codes.skip ?? "G31"
      const sum = AXES.map((a, i) => `ABS[#${5061 + i}-${targets[a].startsWith("-") ? `[${targets[a]}]` : targets[a]}]`).join("+")
      return { before: [], block: `${sk} ${w} ${feed}`, after: [`IF [${sum} GT ${(0.002 * io.scale).toFixed(4)}] THEN #3000=${alarmNumber(HIT_CODE, io.codes.alarmMax ?? 200)}(THE PROBE TOUCHED DURING A PROTECTED MOVE)`] }
    }
    case "okuma": {
      const near: VarRef = { name: "pmissd" }
      const sum = AXES.map((a) => `ABS[VSKP${LETTER[a]}-${targets[a].startsWith("-") || targets[a].startsWith("=") ? `[${targets[a].replace(/^=/, "")}]` : targets[a]}]`).join("+")
      return {
        before: [], block: `${io.options?.skipCode ?? "G31"} ${w} ${feed}`,
        after: [assignRaw(io, near, sum), ...io.macro.node({ _tag: "If", condition: { cmp: "gt", a: { var: near }, b: 0.002 * io.scale } }), ...alarmLines(HIT_CODE, "THE PROBE TOUCHED DURING A PROTECTED MOVE", io), ...io.macro.node({ _tag: "EndIf" })]
      }
    }
    case "linuxcnc":
      return {
        before: [], block: `G38.3 ${w} ${feed}`,
        after: [...io.macro.node({ _tag: "If", condition: { cmp: "eq", a: { var: { scope: "system", index: 5070 } }, b: 1 } }), ...alarmLines(HIT_CODE, "THE PROBE TOUCHED DURING A PROTECTED MOVE", io), ...io.macro.node({ _tag: "EndIf" })]
      }
    case "siemens":
      return { before: [], block: `MEAS=1 G1 ${w} ${feed}`, after: ["STOPRE", "IF $AC_MEA[1]==1", ...alarmLines(HIT_CODE, "THE PROBE TOUCHED DURING A PROTECTED MOVE", io), "ENDIF"] }
    case "heidenhain":
      // The TNC arms the probe only inside its probing cycles: a contact on a plain positioning block is not seen.
      return { before: [`${KT};PROTECTED MOVE: THE TNC DOES NOT ARM THE PROBE OUTSIDE ITS CYCLES`], block: `G1 ${w} ${feed}`, after: [] }
    case "grbl":
      return { before: [], block: `G38.3 ${w} ${feed}`, after: [] }
  }
}

/** The blocks of an alarm: the program stops with the text. */
export const alarmLines = (code: number, text: string, io: ProbeIo): string[] => {
  const t = cleanText(text)
  switch (io.codes.syntax) {
    case "fanuc": return [`#3000=${alarmNumber(code, io.codes.alarmMax ?? 200)}(${t})`]
    case "okuma": return [`VUACM[1]='${t.slice(0, 16)}'`, `VDOUT[992]=${code}`]
    case "linuxcnc": return [`(abort, ${code} ${t})`]
    case "siemens": return [`MSG("${t}")`, `SETAL(${61000 + code})`, "M0"]
    case "heidenhain": return [`${KT};ALARM ${code} ${t}`, `${KT}FN 14: ERROR = ${code}`]
    case "grbl": return refuse(io, "an alarm (GRBL has no program alarm: the probe's own alarm stops the program)")
  }
}

export const alarmBlocks = (m: AlarmMove, io: ProbeIo): string[] => alarmLines(m.code, m.text, io)

export const stopBlock = (optional: boolean): string => (optional ? "M1" : "M0")

/** Report values to the control's output channel: one line per value, the label and the name in the text. */
export const reportLines = (m: ReportMove, io: ProbeIo): string[] => {
  for (const v of m.values) {
    const p = exprProblem(v.value)
    if (p !== undefined) throw new RangeError(`Bad expression in a report: ${p}`)
  }
  const label = cleanText(m.label).replace(/[^A-Z0-9 ]/g, "").replace(/ +/g, "*")
  switch (io.codes.syntax) {
    case "fanuc": {
      const lines: string[] = ["POPEN"]
      m.values.forEach((v, i) => {
        const ref: VarRef = { name: `prt${i}` }
        lines.push(...io.macro.node({ _tag: "Assign", variable: ref, value: v.value }))
        lines.push(`DPRNT[${label}*${v.name.toUpperCase().replace(/[^A-Z0-9]/g, "")}*${varText(io, ref)}[53]]`)
      })
      lines.push("PCLOS")
      return lines
    }
    case "linuxcnc": {
      const lines: string[] = []
      m.values.forEach((v, i) => {
        const ref: VarRef = { name: `prt${i}` }
        lines.push(...io.macro.node({ _tag: "Assign", variable: ref, value: v.value }))
        lines.push(`(LOG,${cleanText(m.label)} ${v.name}=#<prt${i}>)`)
      })
      return lines
    }
    default:
      return refuse(io, "a report (no output channel the writer can set up on this control: read the result variables instead)")
  }
}

// ----------------------------------------------------------------------------------------------------------------- offsets

/** Default tool-table variables of a family, `base + tool`. */
const DEFAULT_TOOL_OFFSETS: Readonly<Record<string, ToolOffsetAddresses>> = {
  fanuc: { lengthWear: 10000, lengthGeometry: 11000, radiusWear: 12000, radiusGeometry: 13000 },
  mitsubishi: { lengthWear: 10000, lengthGeometry: 11000, radiusWear: 12000, radiusGeometry: 13000 },
  brother: { lengthWear: 10000, lengthGeometry: 11000, radiusWear: 12000, radiusGeometry: 13000 },
  mazak: { lengthWear: 10000, lengthGeometry: 11000, radiusWear: 12000, radiusGeometry: 13000 },
  haas: { lengthGeometry: 2000, lengthWear: 2200 }
}

const exprText = (io: ProbeIo, e: Expr): string => {
  const p = exprProblem(e)
  if (p !== undefined) throw new RangeError(`Bad expression: ${p}`)
  return io.macro.expression(e, false)
}

/** `address = address + value` (or `- |value|` for a negative literal), the way each family writes a sum. */
const sumWith = (io: ProbeIo, address: string, value: Expr): string => {
  if (typeof value === "number") return value < 0 ? `${address}-${Number(Math.abs(value).toFixed(6))}` : `${address}+${Number(value.toFixed(6))}`
  return `${address}+${exprText(io, value)}`
}

/** The variable bases of the tool table on a Fanuc-syntax control (`base + tool`): the family default with the machine's own over it. */
export const toolBases = (codes: ProbingCodes, options: PostProbingOptions | undefined): ToolOffsetAddresses | undefined =>
  codes.syntax === "fanuc" ? { ...(DEFAULT_TOOL_OFFSETS[codes.offsets] ?? {}), ...(options?.toolOffsets ?? {}) } : undefined

/** The address of a tool length or radius part, or the reason this control has none. */
const toolAddress = (m: OffsetUpdateMove & { readonly target: { readonly kind: "tool" } }, io: ProbeIo): string => {
  const t = m.target
  switch (io.codes.syntax) {
    case "fanuc": {
      const table = toolBases(io.codes, io.options) ?? {}
      const base = t.quantity === "length" ? (t.part === "geometry" ? table.lengthGeometry : table.lengthWear) : t.part === "geometry" ? table.radiusGeometry : table.radiusWear
      if (base === undefined) return refuse(io, `the tool ${t.quantity} ${t.part} (its variable is not known: give it in the probing options)`)
      return `#${base + t.tool}`
    }
    case "siemens": {
      const n = t.quantity === "length" ? (t.part === "geometry" ? 3 : 12) : t.part === "geometry" ? 6 : 15
      return `$TC_DP${n}[${t.tool},1]`
    }
    default:
      return refuse(io, `a write to the tool ${t.quantity} ${t.part}`)
  }
}

/** The blocks of an offset or tool update. `reselect` follows a Siemens frame write. */
export const offsetLines = (m: OffsetUpdateMove, io: ProbeIo): string[] => {
  const p = exprProblem(m.value)
  if (p !== undefined) throw new RangeError(`Bad expression: ${p}`)
  if (m.target.kind === "tool") {
    if (io.codes.syntax === "linuxcnc") {
      if (m.target.part === "wear" || m.target.quantity !== "length") return refuse(io, `a write to the tool ${m.target.quantity} ${m.target.part} (the LinuxCNC tool table has one length and one diameter, G10 L1)`)
      if (m.mode === "add") return refuse(io, "an incremental tool length (G10 L1 sets the length; read it first in the program)")
      return [`G10 L1 P${m.target.tool} Z${exprText(io, m.value)}`]
    }
    const address = toolAddress(m as OffsetUpdateMove & { readonly target: { readonly kind: "tool" } }, io)
    return [m.mode === "set" ? `${address}=${io.macro.expression(m.value, true)}` : `${address}=${sumWith(io, address, m.value)}`]
  }
  const ref = m.target.ref
  if (m.reads === true && io.codes.syntax !== "grbl") return refuse(io, `a write that makes the tip read a value (the program computes the offset here)`)
  const capacity: OffsetCapacity | undefined = io.options?.offsets
  const a = addressOf(ref, io.codes.offsets, capacity)
  if ("refused" in a) throw new RangeError(a.refused)
  return writeWork(m, a, io)
}

const writeWork = (m: OffsetUpdateMove, a: OffsetAddress, io: ProbeIo): string[] => {
  const axis: OffsetAxis = m.axis
  const ref = (m.target as { readonly ref: Parameters<typeof formatOffsetRef>[0] }).ref
  const named = formatOffsetRef(ref)
  switch (a.write) {
    case "native-only": return refuse(io, `a step-level write to ${named} (its probing cycles set the preset: use the native cycle)`)
    case "l20-only": {
      if (m.reads !== true || typeof m.value !== "number") return refuse(io, `a write to ${named} other than "the tip reads a number" (G10 L20 is all GRBL has)`)
      if (axis !== "X" && axis !== "Y" && axis !== "Z") return refuse(io, `a write to the ${axis} of ${named}`)
      return [`G10 L20 P${a.g10P ?? 1} ${axis}${io.num(m.value)}`]
    }
    case "g10": {
      const address = a.read(axis)
      if (address === undefined) return refuse(io, `a write to the ${axis} of ${named}`)
      const value = m.mode === "set" ? io.macro.expression(m.value, true) : sumWith(io, address, m.value)
      const word = `${axis}[${value.startsWith("[") && m.mode === "set" ? value.slice(1, -1) : value}]`
      return [`G10 L2 P${a.g10P} ${word}`]
    }
    case "variable": {
      const address = a.read(axis)
      if (address === undefined) return refuse(io, `a write to the ${axis} of ${named} (the control keeps no such value)`)
      const rhs = m.mode === "set" ? io.macro.expression(m.value, true) : sumWith(io, address, m.value)
      return [`${address}=${rhs}`, ...(a.reselect === true ? [a.select] : [])]
    }
  }
}

/**
 * A marked Renishaw macro or Siemens measuring cycle (`probing/native.ts`), read from the vendors' manuals, not run on a control. Upper-case
 * keys of `params` are the macro's letters (`D`, `S`, `Z`), keys with `_` the Siemens classic parameters; `x`, `y`, `z`, `f` say where the
 * cycle ends, reached by a retract the cycle leaves to the program.
 */
export const nativeProbeLines = (move: { readonly family: string; readonly number: number; readonly params: Readonly<Record<string, number>> }, num: (mm: number) => string): string[] => {
  const p = move.params
  if (move.family === "renishaw") {
    const words = Object.keys(p).filter((k) => /^[A-Z]$/.test(k)).sort().map((k) => `${k}${k === "S" ? p[k]!.toFixed(0) + "." : num(p[k]!)}`)
    return [`G65 P${move.number} ${words.join(" ")}`, `G65 P9810 Z${num(p["z"]!)} F${Math.round(p["f"]!)}`]
  }
  const words = Object.keys(p).filter((k) => k.startsWith("_")).sort().map((k) => `${k}=${Number(p[k]!.toFixed(6))}`)
  return [...words, `CYCLE${move.number}`, `G0 Z${num(p["z"]!)}`]
}

/**
 * Coordinate rotation words: the Fanuc family's `G68 X Y R` / `G69`. Siemens (`ROT`), Okuma, Klartext and LinuxCNC are refused: none of the
 * replays reads their word, and the offset's own rotation (`offset-r`) or the table (`table-c`) does the same there.
 */
export const rotationLines = (on: boolean, x: string, y: string, r: string, io: ProbeIo): string[] => {
  if (io.codes.syntax !== "fanuc") return refuse(io, "a coordinate rotation (G68): correct the rotation through the offset (offset-r) or the table (table-c)")
  return [on ? `G68 X${x} Y${y} R${r}` : "G69"]
}

/** The word of a rapid in machine coordinates (G53 / SUPA), or the reason the control has none. */
export const machineRapidWord = (io: ProbeIo): { readonly before: string; readonly after?: string } => {
  switch (io.codes.syntax) {
    case "fanuc": case "linuxcnc": return { before: "G53 G0" }
    case "siemens": return { before: "G0 G90 SUPA" }
    default: return refuse(io, "a rapid in machine coordinates")
  }
}
