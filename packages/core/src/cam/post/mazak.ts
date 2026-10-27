import { emitProgram } from "./emitter.ts"
import { fanucDialect } from "./fanuc.ts"
import type { Dialect, Post } from "./types.ts"

/**
 * Mazak in EIA/ISO mode (MAZATROL SmoothX / SmoothG / Matrix, programs written as G-code, not MAZATROL conversational).
 *
 * The Fanuc family (`%` and `O` number, safe start, `G43 H<n>` after `T<n> M6`, millisecond dwell, `G98`/`G99` canned drilling,
 * `M98` subprograms) with what is Mazak's own: synchronous (rigid) tapping is `G84.2`, entered without Fanuc's `M29` block,
 * and tool tip point control is `G43.4 H<n>` (cancelled with `G43 H<n>`). The control must read the tool length for EIA programs
 * (Mazak tool-data parameters). No contour smoothing: Mazak's high-speed modes are machine options with their own words.
 */
export const mazakDialect: Dialect = {
  ...fanucDialect,
  id: "mazak",
  rigidTap: {},
  cycleCodes: { tap: "G84.2" },
  tcp: "G43.4",
  smoothing: undefined
}

export const mazakPost: Post = {
  id: "mazak",
  emit: (program, options = {}) => emitProgram(program, options, mazakDialect)
}
