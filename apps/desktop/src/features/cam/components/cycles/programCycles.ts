/**
 * Cycles found in the program text, for the "Cycles in the program" section: ISO canned cycles (G73-G79, G81-G89,
 * including a modal line such as `G99 G81`),
 * Heidenhain `CYCL DEF n` blocks with their `Qnnn=` rows and their calls (`CYCL CALL`, `L ... M99`), and Siemens
 * `CYCLEnn(...)` style calls. Pure text analysis, no editing.
 */
export type ProgramCycle =
  | { readonly kind: "iso"; readonly line: number; readonly text: string }
  | { readonly kind: "heidenhain-def"; readonly line: number; readonly text: string; readonly number: string; readonly title: string; readonly rows: ReadonlyArray<{ readonly name: string; readonly value: string; readonly comment: string }> }
  | { readonly kind: "heidenhain-call"; readonly line: number; readonly text: string }
  | { readonly kind: "siemens"; readonly line: number; readonly text: string; readonly name: string; readonly args: ReadonlyArray<string> }

/** A canned-cycle word anywhere in the code of the line (`G81` or `G99 G81`), not only at the start. */
const ISO = /\bG(7[3-9]|8[1-9])\b/i
const CYCL_DEF = /^\s*(?:\d+\s+)?CYCL\s+DEF\s+(\d+(?:\.\d+)?)\s*(.*)$/i
const CYCL_CALL = /^\s*(?:\d+\s+)?CYCL\s+CALL\b/i
const LINE_CALL = /^\s*(?:\d+\s+)?L\b.*\bM99\b/i
const Q_ROW = /^\s*(?:\d+\s+)?(Q\d+)\s*=\s*([^;~]*?)\s*(?:~\s*)?(?:;\s*(.*))?$/i
const SIEMENS = /^\s*(?:N\d+\s+)?(?:MCALL\s+)?(CYCLE\d+|HOLES\d+|POCKET\d+|SLOT\d+|LONGHOLE|CYCLE\d+)\s*\(([^)]*)\)/i

/** The part of a `CYCL DEF` line after the number: the title without the continuation mark or a comment. */
const titleOf = (rest: string): string => rest.replace(/;.*$/, "").replace(/~\s*$/, "").trim()

export const findProgramCycles = (gcode: string): ReadonlyArray<ProgramCycle> => {
  const lines = gcode.split(/\r?\n/)
  const found: ProgramCycle[] = []
  for (let index = 0; index < lines.length; index++) {
    const text = lines[index] ?? ""
    const def = CYCL_DEF.exec(text)
    if (def) {
      const rows: { name: string; value: string; comment: string }[] = []
      let end = index
      for (let next = index + 1; next < lines.length; next++) {
        const row = Q_ROW.exec(lines[next] ?? "")
        if (!row) break
        rows.push({ name: (row[1] ?? "").toUpperCase(), value: row[2] ?? "", comment: row[3] ?? "" })
        end = next
      }
      found.push({ kind: "heidenhain-def", line: index, text: text.trim(), number: def[1] ?? "", title: titleOf(def[2] ?? ""), rows })
      index = end
      continue
    }
    if (CYCL_CALL.test(text) || LINE_CALL.test(text)) { found.push({ kind: "heidenhain-call", line: index, text: text.trim() }); continue }
    const siemens = SIEMENS.exec(text)
    if (siemens) { found.push({ kind: "siemens", line: index, text: text.trim(), name: (siemens[1] ?? "").toUpperCase(), args: (siemens[2] ?? "").split(",").map((arg) => arg.trim()) }); continue }
    const code = text.replace(/\([^)]*\)/g, "").replace(/;.*$/, "")
    if (ISO.test(code)) found.push({ kind: "iso", line: index, text: text.trim() })
  }
  return found
}

/** Replaces one program line, keeping the others and the line ending style. */
export const replaceLine = (gcode: string, line: number, next: string): string => {
  const eol = gcode.includes("\r\n") ? "\r\n" : "\n"
  const lines = gcode.split(/\r?\n/)
  if (line < 0 || line >= lines.length) return gcode
  lines[line] = next
  return lines.join(eol)
}
