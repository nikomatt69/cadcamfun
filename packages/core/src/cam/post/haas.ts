import { emitProgram } from "./emitter.ts"
import { fanucProgramNumber, fanucSubprograms } from "./fanuc.ts"
import { haasSpindleOrient } from "./spindle-orient.ts"
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
 *
 * Sources: Haas mill G-code reference (haascnc.com): G04 ("G04 P10. is a dwell of 10 seconds; G04 P10 is a dwell of 10
 * milliseconds"), G84 (no spindle start or M29 needed), G187 Pn E (a bare G187 restores Setting 191), G234 (H on the same
 * block; the rotary axes at 0 when it is commanded; no rapid rotary moves while it is active: written as G1).
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
  spindleOrient: haasSpindleOrient,
  tcp: "G234",
  inverseTime: { on: "G93", off: "G94" },
  // Haas G234 page: "The rotary axes must be at 0 before commanding G234"; "Do not program rapid moves while TCPC is active".
  tcpLimits: { rotaryZeroAtOn: true, noRapidRotary: true },
  // G187 accuracy control: P1 rough / P2 medium / P3 finish, E the corner tolerance; a bare G187 restores setting 191.
  smoothing: { on: (tol) => [`G187 P${Number(tol) <= 0.01 ? 3 : Number(tol) <= 0.05 ? 2 : 1} E${tol}`], off: ["G187"] },
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
