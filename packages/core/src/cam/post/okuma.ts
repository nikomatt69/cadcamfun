import { emitProgram } from "./emitter.ts"
import type { Dialect, Post } from "./types.ts"

/**
 * Okuma OSP (P200M / P300M machining centres), the control's own G-code, not a Fanuc emulation.
 *
 * What differs from the ISO family: the work offset is selected with `G15 H<n>` (`G54`…`G59` become `H1`…`H6`), the tool length
 * with `G56 H<n>` after `T<n> M6` (there is no `G43` / `G49`; on OSP `G56` is the Z length offset, not a work offset), the dwell
 * is `G4 F<seconds>` (feed per minute is active), comments are parentheses, `M2` ends.
 *
 * What it deliberately leaves out: canned cycles (OSP fixed cycles return to a level set with `G71` / `M52`-`M54`, not with
 * `G98` / `G99`: drilling is written as moves, with pecking), rigid tapping (the planner mills the thread), subprograms (OSP
 * subprograms are separate `.SSB` files), tool-centre-point control (the program is written in machine coordinates). None of
 * this is qualified on a real control.
 */
export const okumaDialect: Dialect = {
  id: "okuma",
  canned: false,
  arcModes: ["ijk", "radius"],
  dwell: "seconds",
  dwellWord: "F",
  uppercaseComments: true,
  rotary: true,
  workOffset: (offset) => `G15 H${Number(offset.slice(1)) - 53}`,
  begin: () => [],
  setup: ["G90", "G17", "G94", "G40", "G80"],
  toolChange: (n) => [`T${n} M6`, `G56 H${n}`],
  end: "M2",
  finish: []
}

export const okumaPost: Post = {
  id: "okuma",
  emit: (program, options = {}) => emitProgram(program, options, okumaDialect)
}
