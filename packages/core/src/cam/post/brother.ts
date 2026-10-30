import { emitProgram } from "./emitter.ts"
import { fanucDialect } from "./fanuc.ts"
import type { Dialect, VendorPost } from "./types.ts"

/**
 * Brother Speedio (CNC-C00 / CNC-D00 control, S- and R-series machining centres), the control's ISO G-code. A thin layer over the Fanuc
 * dialect: `%` and `O` number, `G90 G17 G94 G40 G49 G80` safe start, millisecond dwell, `G98` / `G99` canned cycles, `M98` subprograms,
 * `M30` to end.
 *
 * Differences from the Fanuc post:
 *
 *   | Fanuc post writes                   | Brother post                          | Reason                                                              |
 *   | ----------------------------------- | ------------------------------------- | ------------------------------------------------------------------- |
 *   | `T<n> M6` then `G43 H<n>`           | `G100 T<n> M6` then `G43 H<n>`        | Brother's tool call is the G100 tool-change block                   |
 *   | `M29 S<rpm>` + `G84` rigid tap      | tapping cycles refused                | the Speedio's synchronous tapping block is not established here     |
 *   | `G5.1 Q1` AI contour control        | `smoothing` option ignored            | the contour-accuracy words are machine parameters                   |
 *   | `G43.4` tip control, `G68.2` plane  | refused (a program with rotary moves  | this layer writes 3-axis programs; the words of the optional rotary |
 *   |                                     | or a work plane is not written)       | table are not established here, so none is guessed                  |
 *
 * Not qualified on a real control.
 */
export const brotherDialect: Dialect = {
  ...fanucDialect,
  id: "brother",
  rigidTap: undefined,
  smoothing: undefined,
  tiltedPlane: undefined,
  tcp: undefined,
  tcpLimits: undefined,
  inverseTime: undefined,
  rotary: false,
  toolChange: (n) => [`G100 T${n} M6`, `G43 H${n}`]
}

export const brotherPost: VendorPost = {
  id: "brother",
  emit: (program, options = {}) => emitProgram(program, options, brotherDialect)
}
