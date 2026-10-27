import { emitProgram } from "./emitter.ts"
import type { Dialect, Post } from "./types.ts"

/**
 * LinuxCNC (2.8 / 2.9, the `rs274ngc` interpreter of a milling configuration).
 *
 * `%` delimiters, a safe-start block (`G40 G49 G80`), `T<n> M6` followed by `G43 H<n>` (the length from the tool table),
 * seconds on `G4 P` and on the `P` of `G82`, canned drilling `G73 G81 G82 G83 G85 G86` with `G99`, `M2` to end.
 * The `smoothing` option writes the path-blending tolerance `G64 P<tol>` per operation and restores exact path (`G61`) before
 * a tool change and at the end.
 *
 * What it deliberately leaves out: rigid tapping (LinuxCNC taps with `G33.1`, a spindle-synchronised move with its own
 * semantics, not `G84`: the planner mills the thread), subprograms (`o<n> sub` must be defined before the `M2` that ends the
 * file, while the shared writer places bodies after it), tool-centre-point control (only in a TCP kinematics configuration:
 * the program is written in machine coordinates). A rotary word is written as the axis letter the configuration names A/B/C.
 */
export const linuxcncDialect: Dialect = {
  id: "linuxcnc",
  canned: true,
  arcModes: ["ijk", "radius"],
  dwell: "seconds",
  uppercaseComments: false,
  rotary: true,
  smoothing: { on: (tol) => [`G64 P${tol}`], off: ["G61"] },
  begin: () => ["%"],
  setup: ["G90", "G17", "G94", "G40", "G49", "G80"],
  toolChange: (n) => [`T${n} M6`, `G43 H${n}`],
  end: "M2",
  finish: ["%"]
}

export const linuxcncPost: Post = {
  id: "linuxcnc",
  emit: (program, options = {}) => emitProgram(program, options, linuxcncDialect)
}
