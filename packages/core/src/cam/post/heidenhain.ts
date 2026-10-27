import type { Program } from "../ir.ts"
import { emitProgram } from "./emitter.ts"
import { genericDialect } from "./generic.ts"
import type { Dialect, Post, PostOptions } from "./types.ts"

/**
 * Native Klartext (TNC 640 / TNC7 conversational): `L` lines, circles as a centre `CC` and a `C` block, tool calls, dwell
 * (cycle 9), smoothing (cycle 32), expanded drilling. A simultaneous five-axis section is bracketed by `M128` (tool tip
 * positioning kept by the control) and `M129`. No tilted planes. Repeated toolpaths become label subprograms (`CALL LBL n`,
 * `LBL n` … `LBL 0` after `M30`), their bodies in incremental `IX IY IZ`.
 *
 * Klartext has no block of its own for a miscellaneous function: an M function rides on a positioning block. One that acts at
 * the start of the block (`M3 M4 M7 M8 M128`) goes on the next `L` / `C`; one that acts at its end (`M0 M1 M2 M5 M9 M30 M129`)
 * on the previous one, or on a zero-length `L Z… R0 FMAX` at the current height when the previous block does not move.
 * A helix (a `C` cannot change Z) is written as lines, a full circle as two half circles.
 */
export const heidenhainDialect: Dialect = {
  ...genericDialect, id: "heidenhain", canned: false, rigidTap: undefined, arcModes: ["ijk"], arcLimits: { helical: false, fullCircle: false },
  commentStyle: "semicolon", tcp: { on: () => "M128", off: () => "M129" }
}

/**
 * The shared writer's subprogram blocks, which this post turns into labels: `M98 P<n>` → `CALL LBL n`, `O<n>` → `LBL n`,
 * `M99` → `LBL 0`. Kept off `heidenhainDialect`, which post definitions use to write ISO text directly.
 */
const klartextLabels: NonNullable<Dialect["subprograms"]> = { first: () => 1, last: 999, call: (n) => `M98 P${n}`, begin: (n) => `O${n}`, end: "M99" }

/** Cycle 32 TOLERANCE, written by the shared writer as blocks and passed through: the tolerance stays until redefined. */
const klartextSmoothing: NonNullable<Dialect["smoothing"]> = { on: (tol) => ["CYCL DEF 32.0 TOLERANCE", `CYCL DEF 32.1 T${tol}`], off: [] }

type Motion = "G0" | "G1" | "G2" | "G3"

/**
 * What each label body leaves behind, read before the main program is translated: after `CALL LBL n` the shared writer omits
 * a motion code the body already set, and the bodies come after `M30` in the text. `dz` is the body's total Z travel, so the
 * height after a call stays known.
 */
const labelExits = (source: string): ReadonlyMap<number, { readonly motion: Motion | undefined; readonly dz: number }> => {
  const exits = new Map<number, { motion: Motion | undefined; dz: number }>()
  let label: number | undefined
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim()
    const open = /^O(\d+)$/.exec(line)
    if (open) { label = Number(open[1]); exits.set(label, { motion: undefined, dz: 0 }); continue }
    if (label === undefined || line.startsWith(";")) continue
    const exit = exits.get(label)!
    const motion = /^G([0-3])(?:\s|$)/.exec(line)
    if (motion) exit.motion = `G${motion[1]}` as Motion
    const z = /(?:^|\s)Z([+-]?[\d.]+)/.exec(line)
    if (z) exit.dz += Number(z[1])
  }
  return exits
}

const START_M = new Set(["M3", "M4", "M7", "M8", "M128"])
const END_M = new Set(["M0", "M1", "M2", "M5", "M9", "M30", "M129"])
const signed = (text: string): string => `${Number(text) >= 0 && !text.startsWith("+") ? "+" : ""}${text}`

/** Writes `program` as Klartext with `dialect` (the built-in one, or a definition's): see {@link heidenhainDialect}. */
export const emitKlartext = (program: Program, options: Partial<PostOptions>, dialect: Dialect): string => {
  if (program.units !== "mm") throw new RangeError("The Klartext post supports millimetres only")
  if (program.workOffset !== "G54") throw new RangeError("Klartext datum-table mapping is not configured for this work offset")
  const decimals = options.decimals ?? 3
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 6) throw new RangeError("Klartext decimals must be an integer from 0 to 6")
  const start = options.lineNumbers?.start ?? 0, step = options.lineNumbers?.step ?? 1
  if (!Number.isInteger(start) || start < 0 || !Number.isInteger(step) || step <= 0) throw new RangeError("Klartext block numbering must use non-negative start and positive step")
  // Retain the shared writer's arc validation, cycle expansion, rounding and protective tool-change retractions.
  const writer: Dialect = {
    ...dialect, arcModes: ["ijk"], arcLimits: { helical: false, fullCircle: false }, canned: false, smoothing: klartextSmoothing,
    subprograms: options.subprograms === true ? klartextLabels : undefined
  }
  const source = emitProgram(program, { ...options, lineNumbers: undefined, arcMode: "ijk", useCannedCycles: false }, writer)
  const exits = labelExits(source)
  const name = program.name.toUpperCase().replace(/[^A-Z0-9_]/g, "_").slice(0, 32) || "PROGRAM"
  const lines = [`BEGIN PGM ${name} MM`, "; ACTIVE PRESET MUST MATCH THE PROGRAM G54 DATUM; MACHINE CALIBRATION REQUIRED"]
  let motion: Motion = "G0", incremental = false, tool = 1, pendingTool = false
  /** Absolute height of the tool in the main program, once a Z has been written. */
  let z: number | undefined
  /** Start-of-block M functions waiting for the next positioning block. */
  let pending: string[] = []
  /** Index of the last positioning block and of the last block of any kind (comments are not blocks). */
  let lastMove = -1, lastBlock = -1
  const block = (text: string): void => { lines.push(text); lastBlock = lines.length - 1 }
  const move = (text: string): void => {
    if (pending.length > 4) throw new RangeError(`Klartext takes at most four M functions in a block: ${pending.join(" ")}`)
    block(pending.length > 0 ? `${text} ${pending.join(" ")}` : text)
    pending = []
    lastMove = lastBlock
  }
  const endFunction = (m: string): void => {
    const previous = lines[lastMove]
    if (lastMove >= 0 && lastMove === lastBlock && (previous!.match(/\bM\d+/g)?.length ?? 0) < 4) { lines[lastMove] = `${previous} ${m}`; return }
    if (z === undefined || incremental) throw new RangeError(`Klartext cannot place ${m}: no positioning block to carry it`)
    move(`L Z${signed(z.toFixed(decimals))} R0 FMAX ${m}`)
  }
  const toolCall = (rpm?: number): void => {
    const speed = rpm === undefined ? "" : ` S${rpm}`
    block(pendingTool ? `TOOL CALL ${tool} Z${speed}` : `TOOL CALL Z${speed}`)
    pendingTool = false
  }
  for (const raw of source.split(/\r?\n/)) {
    let line = raw.trim()
    if (!line) continue
    if (line.startsWith(";")) { lines.push(line.replace(/\bSUBPROGRAM O(\d+)/, "SUBPROGRAM LBL $1")); continue }
    const call = /^M98 P(\d+)$/.exec(line)
    if (call) {
      block(`CALL LBL ${call[1]}`)
      const exit = exits.get(Number(call[1]))
      motion = exit?.motion ?? motion
      if (z !== undefined) z += exit?.dz ?? 0
      continue
    }
    const label = /^O(\d+)$/.exec(line)
    // A body starts with no motion mode: its first move states G0 or G1.
    if (label) { block(`LBL ${label[1]}`); continue }
    if (line === "M99") { block("LBL 0"); continue }
    if (line === "G91") { incremental = true; continue }
    if (line === "G90") { incremental = false; continue }
    const change = /^T(\d+) M6$/.exec(line)
    if (change) { tool = Number(change[1]); pendingTool = true; continue }
    const spindle = /^M3 S(\d+)$/.exec(line)
    if (spindle) { toolCall(Number(spindle[1])); pending.push("M3"); continue }
    if (/^(?:G21|G90|G17|G94|G54)(?:\s+(?:G90|G17|G94))*$/.test(line)) continue
    if (line.startsWith("CYCL DEF ")) { block(line); continue }
    const dwell = /^G4 P([\d.]+)$/.exec(line)
    if (dwell) { block("CYCL DEF 9.0 DWELL TIME"); block(`CYCL DEF 9.1 DWELL ${dwell[1]}`); continue }
    if (START_M.has(line)) { pending.push(line); continue }
    if (END_M.has(line)) { endFunction(line); continue }
    const code = /^G([0-3])(?:\s|$)/.exec(line)
    if (code) { motion = `G${code[1]}` as Motion; line = line.replace(/^G[0-3]\s*/, "") }
    // Every remaining token must be a supported axis, centre or feed, never a silently dropped controller command.
    const WORD = /[XYZABCIJF][+-]?(?:\d+(?:\.\d*)?|\.\d+)/g
    const words = line.match(WORD) ?? []
    if (!words.length || line.replace(WORD, "").trim() !== "") throw new RangeError(`Klartext cannot express block: ${raw}`)
    if (pendingTool) toolCall()
    const value = (letter: string) => words.find((w) => w[0] === letter)?.slice(1)
    const axis = (w: string) => `${incremental ? "I" : ""}${w[0]}${signed(w.slice(1))}`
    const feed = value("F")
    const zWord = value("Z")
    if (zWord !== undefined && !incremental) z = Number(zWord)
    if (value("I") !== undefined || value("J") !== undefined) {
      if (motion !== "G2" && motion !== "G3") throw new RangeError(`Klartext cannot express block: ${raw}`)
      if (zWord !== undefined || words.some((w) => "ABC".includes(w[0]!))) throw new RangeError(`Klartext C blocks are planar: ${raw}`)
      // The centre relative to the arc's start (the last programmed position), the end point absolute or incremental.
      block(`CC IX${signed(value("I") ?? "0")} IY${signed(value("J") ?? "0")}`)
      const ends = words.filter((w) => w[0] === "X" || w[0] === "Y").map(axis)
      move(`C ${ends.join(" ")} DR${motion === "G3" ? "+" : "-"} R0${feed !== undefined ? ` F${feed}` : ""}`)
      continue
    }
    if (motion === "G2" || motion === "G3") throw new RangeError(`Klartext cannot express block: ${raw}`)
    const axes = words.filter((w) => w[0] !== "F").map(axis)
    move(`L ${axes.join(" ")} R0${motion === "G0" ? " FMAX" : feed !== undefined ? ` F${feed}` : ""}`)
  }
  if (pendingTool) toolCall()
  if (pending.length > 0) {
    if (z === undefined) throw new RangeError(`Klartext cannot place ${pending.join(" ")}: no positioning block follows`)
    move(`L Z${signed(z.toFixed(decimals))} R0 FMAX`)
  }
  lines.push(`END PGM ${name} MM`)
  return lines.map((line, i) => `${start + i * step} ${line}`).join("\n") + "\n"
}

export const heidenhainPost: Post = {
  id: "heidenhain",
  emit: (program: Program, options: Partial<PostOptions> = {}): string => emitKlartext(program, options, heidenhainDialect)
}
