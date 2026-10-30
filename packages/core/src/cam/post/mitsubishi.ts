import { emitProgram } from "./emitter.ts"
import { fanucDialect } from "./fanuc.ts"
import type { Dialect, VendorPost } from "./types.ts"

/**
 * Mitsubishi Electric MELDAS M70 / M700 / M80 / M800, written in the control's Fanuc-compatible G-code list (the builder selects the list
 * with a parameter; a machine left on the Mitsubishi native list reads some of these words differently). A thin layer over the Fanuc
 * dialect: the program frame, the safe start, `T<n> M6` + `G43 H<n>`, canned drilling with `G98` / `G99`, `M98` subprograms and the
 * millisecond dwell are the same text.
 *
 * Differences from the Fanuc post (what this layer changes, and why):
 *
 *   | Fanuc post writes               | Mitsubishi post                | Reason                                                                   |
 *   | ------------------------------- | ------------------------------ | ------------------------------------------------------------------------ |
 *   | `M29 S<rpm>` + `G84` rigid tap  | tapping cycles refused         | MELDAS synchronous tapping is selected with its own parameter/option    |
 *   |                                 |                                | and not with `M29`; the planner mills the thread instead of guessing    |
 *   | `G5.1 Q1` AI contour control    | `smoothing` option ignored     | the MELDAS equivalents (`G61.1` high-accuracy control, `G05 P2`) take  |
 *   |                                 |                                | machine-specific parameters; none is written without them              |
 *   | `G68.2` + `G53.1` tilted plane  | `workPlanes` refused           | the inclined-plane option's words are not established for MELDAS here   |
 *   | `G43.4 H<n>` tip control        | `G43.4 H<n>` (unchanged)       | MELDAS 5-axis option "tool centre point control" type 1                 |
 *
 * Not qualified on a real control. A machine builder's own M-codes (tool changer, coolant) are the shop's post definition to add.
 */
export const mitsubishiDialect: Dialect = {
  ...fanucDialect,
  id: "mitsubishi",
  rigidTap: undefined,
  smoothing: undefined,
  tiltedPlane: undefined
}

export const mitsubishiPost: VendorPost = {
  id: "mitsubishi",
  emit: (program, options = {}) => emitProgram(program, options, mitsubishiDialect)
}
