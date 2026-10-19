import { emitProgram } from "./emitter.ts"
import { fanucProgramNumber, fanucSubprograms } from "./fanuc.ts"
import type { Dialect, Post } from "./types.ts"

/**
 * Haas NGC dialect (UMC / VF / MDC with the Next Generation control).
 *
 * Same G-code family as Fanuc (`%` delimiters, `O` program number, safe start
 * block, `G43 H<n>` after a tool change, millisecond dwells, `M30`), plus what a
 * Haas trunnion machine actually needs:
 *  - `rotary: true` — the control drives the A/B/C axes, so a program may carry
 *    rotary angles on its motion blocks (4/5-axis work);
 *  - `tcp: "G234"` — Haas Tool Center Point Control (Group 08), the code that
 *    hands the tool centre point to the control during a simultaneous 5-axis
 *    section. `G234` cancels `G43`, so the emitter opens a section with
 *    `G234 H<n>` and closes it with `G43 H<n>`, and the program ends with `G49`.
 *    The machine's MRZP settings (255/256/257) tell the control where the table
 *    turns, which is why the program is written in the work offset.
 */
export const haasDialect: Dialect = {
  id: "haas",
  canned: true,
  // Haas NGC taps rigidly in G84 (setting 130 on); no extra block.
  rigidTap: {},
  arcModes: ["ijk", "radius"],
  dwell: "milliseconds",
  uppercaseComments: true,
  rotary: true,
  tcp: "G234",
  begin: (program) => ["%", `O${String(fanucProgramNumber(program)).padStart(4, "0")}`],
  subprograms: fanucSubprograms,
  setup: ["G90", "G17", "G94", "G40", "G49", "G80"],
  toolChange: (n) => [`T${n} M6`, `G43 H${n}`],
  end: "M30",
  finish: ["%"]
}

export const haasPost: Post = {
  id: "haas",
  emit: (program, options = {}) => emitProgram(program, options, haasDialect)
}
