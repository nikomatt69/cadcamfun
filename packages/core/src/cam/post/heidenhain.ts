import type { Program } from "../ir.ts"
import { emitProgram } from "./emitter.ts"
import { genericDialect } from "./generic.ts"
import type { Dialect, Post, PostOptions } from "./types.ts"

/**
 * Native Klartext subset: explicit linear XYZABC, expanded drilling, tool calls and dwell. A simultaneous five-axis section is
 * bracketed by `M128` (tool tip positioning kept by the control) and `M129`. No tilted planes. Repeated toolpaths become label
 * subprograms (`CALL LBL n`, `LBL n` … `LBL 0` after `M30`), their bodies in incremental `IX IY IZ`.
 */
export const heidenhainDialect: Dialect = {
  ...genericDialect, id: "heidenhain", canned: false, rigidTap: undefined, arcModes: ["linearize"], commentStyle: "semicolon",
  tcp: { on: () => "M128", off: () => "M129" }
}

/**
 * The shared writer's subprogram blocks, which this post turns into labels: `M98 P<n>` → `CALL LBL n`, `O<n>` → `LBL n`,
 * `M99` → `LBL 0`. Kept off `heidenhainDialect`, which post definitions use to write ISO text directly.
 */
const klartextLabels: NonNullable<Dialect["subprograms"]> = { first: () => 1, last: 999, call: (n) => `M98 P${n}`, begin: (n) => `O${n}`, end: "M99" }

/**
 * Whether each label body leaves the control in rapid mode, read before the main program is translated: after `CALL LBL n`
 * the shared writer omits a `G0` / `G1` the body already set, and the bodies come after `M30` in the text.
 */
const labelExits = (source: string): ReadonlyMap<number, boolean> => {
  const exits = new Map<number, boolean>()
  let label: number | undefined
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim()
    const open = /^O(\d+)$/.exec(line)
    if (open) { label = Number(open[1]); continue }
    if (label === undefined) continue
    const motion = /^G([01])(?:\s|$)/.exec(line)
    if (motion) exits.set(label, motion[1] === "0")
  }
  return exits
}

export const heidenhainPost: Post = {
  id: "heidenhain",
  emit: (program: Program, options: Partial<PostOptions> = {}): string => {
    if (program.units !== "mm") throw new RangeError("The Klartext post supports millimetres only")
    if (program.workOffset !== "G54") throw new RangeError("Klartext datum-table mapping is not configured for this work offset")
    const decimals = options.decimals ?? 3
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 6) throw new RangeError("Klartext decimals must be an integer from 0 to 6")
    // Retain the shared writer's arc validation, cycle expansion, rounding and protective tool-change retractions.
    const source = emitProgram(program, { ...options, lineNumbers: undefined, arcMode: "linearize", useCannedCycles: false }, options.subprograms === true ? { ...heidenhainDialect, subprograms: klartextLabels } : heidenhainDialect)
    const exits = labelExits(source)
    const name = program.name.toUpperCase().replace(/[^A-Z0-9_]/g, "_").slice(0, 32) || "PROGRAM"
    const lines = [`BEGIN PGM ${name} MM`, "; ACTIVE PRESET MUST MATCH THE PROGRAM G54 DATUM; MACHINE CALIBRATION REQUIRED"]
    let rapid = true, incremental = false, tool = 1, pendingTool = false
    const selectTool = (rpm = 0) => { lines.push(`TOOL CALL ${tool} Z S${rpm}`); pendingTool = false }
    for (const raw of source.split(/\r?\n/)) {
      let line = raw.trim()
      if (!line) continue
      if (line.startsWith(";")) { lines.push(line.replace(/\bSUBPROGRAM O(\d+)/, "SUBPROGRAM LBL $1")); continue }
      const call = /^M98 P(\d+)$/.exec(line)
      if (call) { lines.push(`CALL LBL ${call[1]}`); rapid = exits.get(Number(call[1])) ?? rapid; continue }
      const label = /^O(\d+)$/.exec(line)
      // A body starts with no motion mode: its first move states G0 or G1.
      if (label) { lines.push(`LBL ${label[1]}`); continue }
      if (line === "M99") { lines.push("LBL 0"); continue }
      if (line === "G91") { incremental = true; continue }
      if (line === "G90") { incremental = false; continue }
      const change = /^T(\d+) M6$/.exec(line)
      if (change) { tool = Number(change[1]); pendingTool = true; continue }
      const spindle = /^M3 S([\d.]+)$/.exec(line)
      if (spindle) { selectTool(Number(spindle[1])); lines.push("M3"); continue }
      if (/^(?:G21|G90|G17|G94|G54)(?:\s+(?:G90|G17|G94))*$/.test(line)) continue
      const dwell = /^G4 P([\d.]+)$/.exec(line)
      if (dwell) { lines.push("CYCL DEF 9.0 DWELL TIME", `CYCL DEF 9.1 DWELL ${dwell[1]}`); continue }
      if (/^M(?:0|1|2|5|7|8|9|30|128|129)$/.test(line)) { lines.push(line); continue }
      if (/^G[01](?:\s|$)/.test(line)) { rapid = /^G0(?:\s|$)/.test(line); line = line.replace(/^G[01]\s*/, "") }
      // Every remaining token must be a supported axis or feed, never a silently dropped controller command.
      const words = line.match(/[XYZABCF][+-]?(?:\d+(?:\.\d*)?|\.\d+)/g) ?? []
      if (!words.length || line.replace(/[XYZABCF][+-]?(?:\d+(?:\.\d*)?|\.\d+)/g, "").trim() !== "") throw new RangeError(`Klartext cannot express block: ${raw}`)
      if (pendingTool) selectTool()
      const axes = words.filter((w) => w[0] !== "F").map((w) => `${incremental ? "I" : ""}${w[0]}${Number(w.slice(1)) >= 0 ? "+" : ""}${w.slice(1)}`)
      const feed = words.find((w) => w[0] === "F")
      lines.push(`L ${axes.join(" ")} R0${rapid ? " FMAX" : feed !== undefined ? ` ${feed}` : ""}`)
    }
    if (pendingTool) selectTool()
    lines.push(`END PGM ${name} MM`)
    const start = options.lineNumbers?.start ?? 0, step = options.lineNumbers?.step ?? 1
    if (!Number.isInteger(start) || start < 0 || !Number.isInteger(step) || step <= 0) throw new RangeError("Klartext block numbering must use non-negative start and positive step")
    return lines.map((line, i) => `${start + i * step} ${line}`).join("\n") + "\n"
  }
}
