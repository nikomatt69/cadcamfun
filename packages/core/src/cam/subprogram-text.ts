/**
 * Subprograms in G-code text, unrolled: for the tools that read a program line by line (the static analyser, an editor's
 * statistics) instead of replaying it. The main program is everything up to the second `O` line; every later `O<n>` block is a
 * subprogram that only an `M98 P<n> [L<count>]` runs, inline at the call, nested up to {@link MAX_UNROLL_DEPTH}. The same
 * reading as the reference interpreter (`testing/gcode-interpreter.ts`), without its geometry.
 *
 * Each line of the result keeps the number of the line it is reported on: its own in the main program, the line of the
 * outermost call inside a subprogram. A text with no subprogram comes back unchanged, line for line.
 */

/** Deepest `M98` nesting that is followed. */
export const MAX_UNROLL_DEPTH = 8
/** Safety cap on the unrolled length, so a long repeat count cannot exhaust memory. */
export const MAX_UNROLLED_LINES = 2_000_000

export interface UnrolledLine {
  readonly text: string
  /** Line the text is reported on (1-based). */
  readonly line: number
}

const code = (raw: string): string => raw.replace(/\([^)]*\)/g, " ").replace(/;.*$/, "").trim()
const CALL = /\bM0*98\b/i

export const unrollSubprograms = (text: string): ReadonlyArray<UnrolledLine> => {
  const lines = text.split(/\r?\n/)
  const starts: Array<{ readonly index: number; readonly number: number }> = []
  lines.forEach((raw, index) => {
    const m = /^O\s*0*(\d+)\b/i.exec(code(raw))
    if (m !== null) starts.push({ index, number: Number(m[1]) })
  })
  const mainEnd = starts.length > 1 ? starts[1]!.index : lines.length
  if (starts.length <= 1 && !lines.some((l) => CALL.test(code(l)))) return lines.map((t, i) => ({ text: t, line: i + 1 }))
  const programs = new Map<number, { readonly start: number; readonly end: number }>()
  starts.slice(1).forEach((p, i) => programs.set(p.number, { start: p.index + 1, end: i + 2 < starts.length ? starts[i + 2]!.index : lines.length }))

  const out: UnrolledLine[] = []
  const run = (start: number, end: number, depth: number, site: number | undefined): boolean => {
    for (let index = start; index < end; index++) {
      const raw = lines[index]!
      const c = code(raw)
      const reported = site ?? index + 1
      const call = CALL.test(c) ? /\bP\s*0*(\d+)/i.exec(c) : null
      if (call === null) {
        out.push({ text: raw, line: reported })
        if (out.length > MAX_UNROLLED_LINES) return false
        // M30 / M2 end the whole program; M99 ends the subprogram it is in.
        if (/\bM0*(?:30|2)\b/i.test(c)) return false
        if (site !== undefined && /\bM0*99\b/i.test(c)) return true
        continue
      }
      const target = programs.get(Number(call[1]))
      const repeat = /\bL\s*(\d+)/i.exec(c)
      const times = repeat === null ? 1 : Number(repeat[1])
      if (target !== undefined && depth < MAX_UNROLL_DEPTH) {
        for (let n = 0; n < times; n++) if (!run(target.start, target.end, depth + 1, reported)) return false
      }
    }
    return true
  }
  run(0, mainEnd, 0, undefined)
  return out
}
