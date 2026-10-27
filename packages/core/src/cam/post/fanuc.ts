import { emitProgram } from "./emitter.ts"
import type { Program } from "../ir.ts"
import type { Dialect, Post } from "./types.ts"

/**
 * Fanuc-style dialect: `%` program delimiters, an `O` program number, a safe
 * start block (cancel cutter compensation, length offset and canned cycles),
 * tool length offset `G43` after each tool change, millisecond dwells.
 * The program number comes from `metadata.programNumber` (default 1000).
 *
 * A simultaneous five-axis section is opened with `G43.4 H<n>` (tool tip control, a Fanuc option the machine builder enables) and closed
 * with `G43 H<n>`, like Haas does with `G234`; the program is then in the work offset, the control keeps the tool tip on the path.
 * The `smoothing` option switches AI contour control on per operation (`G5.1 Q1`) and off before each tool change (`G5.1 Q0`).
 */
/** The program number of the main program (`metadata.programNumber`, default 1000). */
export const fanucProgramNumber = (program: Program): number => {
  const requested = Number(program.metadata?.["programNumber"])
  return Number.isInteger(requested) && requested >= 1 && requested <= 9999 ? requested : 1000
}

/** `M98 P<n>` / `M99` subprograms, `O<n>` after the main program's `M30`. */
export const fanucSubprograms: NonNullable<Dialect["subprograms"]> = {
  first: (program) => fanucProgramNumber(program) + 1,
  last: 9999,
  call: (n) => `M98 P${n}`,
  begin: (n) => `O${String(n).padStart(4, "0")}`,
  end: "M99"
}

export const fanucDialect: Dialect = {
  id: "fanuc",
  canned: true,
  // Fanuc rigid tapping: M29 S<rpm> puts the spindle in position control before G84.
  rigidTap: { prefix: (rpm) => `M29 S${Math.round(rpm)}` },
  arcModes: ["ijk", "radius"],
  dwell: "milliseconds",
  uppercaseComments: true,
  rotary: true,
  tcp: "G43.4",
  // AI contour control (AICC II / AI APC): the precision level and tolerance are the machine's parameters, not words of the block.
  smoothing: { on: () => ["G5.1 Q1"], off: ["G5.1 Q0"] },
  begin: (program) => ["%", `O${String(fanucProgramNumber(program)).padStart(4, "0")}`],
  subprograms: fanucSubprograms,
  setup: ["G90", "G17", "G94", "G40", "G49", "G80"],
  toolChange: (n) => [`T${n} M6`, `G43 H${n}`],
  end: "M30",
  finish: ["%"]
}

export const fanucPost: Post = {
  id: "fanuc",
  emit: (program, options = {}) => emitProgram(program, options, fanucDialect)
}
