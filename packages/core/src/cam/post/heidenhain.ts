import type { Program } from "../ir.ts"
import { emitProgram } from "./emitter.ts"
import { genericDialect } from "./generic.ts"
import type { Dialect, Post, PostOptions } from "./types.ts"

/** Native Klartext subset: explicit linear XYZABC, expanded drilling, tool calls and dwell. No TCP or tilted planes. */
export const heidenhainDialect: Dialect = {
  ...genericDialect, id: "heidenhain", canned: false, rigidTap: undefined, arcModes: ["linearize"], commentStyle: "semicolon"
}

export const heidenhainPost: Post = {
  id: "heidenhain",
  emit: (program: Program, options: Partial<PostOptions> = {}): string => {
    if (program.units !== "mm") throw new RangeError("The Klartext post supports millimetres only")
    if (program.workOffset !== "G54") throw new RangeError("Klartext datum-table mapping is not configured for this work offset")
    if (options.subprograms) throw new RangeError("Klartext subprogram emission is not supported")
    const decimals = options.decimals ?? 3
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 6) throw new RangeError("Klartext decimals must be an integer from 0 to 6")
    // Retain the shared writer's arc validation, cycle expansion, rounding and protective tool-change retractions.
    const source = emitProgram(program, { ...options, lineNumbers: undefined, arcMode: "linearize", useCannedCycles: false }, heidenhainDialect)
    const name = program.name.toUpperCase().replace(/[^A-Z0-9_]/g, "_").slice(0, 32) || "PROGRAM"
    const lines = [`BEGIN PGM ${name} MM`, "; ACTIVE PRESET MUST MATCH THE PROGRAM G54 DATUM; MACHINE CALIBRATION REQUIRED"]
    let rapid = true, tool = 1, pendingTool = false
    const selectTool = (rpm = 0) => { lines.push(`TOOL CALL ${tool} Z S${rpm}`); pendingTool = false }
    for (const raw of source.split(/\r?\n/)) {
      let line = raw.trim()
      if (!line) continue
      if (line.startsWith(";")) { lines.push(line); continue }
      const change = /^T(\d+) M6$/.exec(line)
      if (change) { tool = Number(change[1]); pendingTool = true; continue }
      const spindle = /^M3 S([\d.]+)$/.exec(line)
      if (spindle) { selectTool(Number(spindle[1])); lines.push("M3"); continue }
      if (/^(?:G21|G90|G17|G94|G54)(?:\s+(?:G90|G17|G94))*$/.test(line)) continue
      const dwell = /^G4 P([\d.]+)$/.exec(line)
      if (dwell) { lines.push("CYCL DEF 9.0 DWELL TIME", `CYCL DEF 9.1 DWELL ${dwell[1]}`); continue }
      if (/^M(?:0|1|2|5|7|8|9|30)$/.test(line)) { lines.push(line); continue }
      if (/^G[01](?:\s|$)/.test(line)) { rapid = /^G0(?:\s|$)/.test(line); line = line.replace(/^G[01]\s*/, "") }
      // Every remaining token must be a supported axis or feed, never a silently dropped controller command.
      const words = line.match(/[XYZABCF][+-]?(?:\d+(?:\.\d*)?|\.\d+)/g) ?? []
      if (!words.length || line.replace(/[XYZABCF][+-]?(?:\d+(?:\.\d*)?|\.\d+)/g, "").trim() !== "") throw new RangeError(`Klartext cannot express block: ${raw}`)
      if (pendingTool) selectTool()
      const axes = words.filter((w) => w[0] !== "F").map((w) => `${w[0]}${Number(w.slice(1)) >= 0 ? "+" : ""}${w.slice(1)}`)
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
