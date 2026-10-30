import { KLARTEXT_PREFIX } from "./macro-syntax.ts"
import type { SpindleOrientCodes } from "./types.ts"

/**
 * The words that stop the spindle and hold it at an angle (IR move `SpindleOrient`, used by back-boring and fine-boring shifts).
 *
 * What each control really supports, and how sure the text below is. None of this is qualified on a real control; the angle an
 * `M19` reaches is, on most controls, the machine builder's own PLC / parameter setting, so the program states the intent and the
 * operator proves the mark (insert towards +X at angle 0) at set-up.
 *
 *   | Control                                           | Word written                  | Basis                                                                          |
 *   | ------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------ |
 *   | Fanuc, Mitsubishi, Mazak, Brother, Okuma, generic | `M19` (angle 0 only)          | `M19` is the orientation M code; the stop position is a parameter (Fanuc 4031 |
 *   |                                                   |                               | on a spindle motor), so another angle is refused, not guessed                  |
 *   | Haas                                              | `M19 P<deg>` / `M19 R<deg>`   | Haas operator manual: `P` whole degrees 0-360, `R` degrees with 4 decimals     |
 *   | Siemens 840D sl                                   | `SPOS=<deg>`                  | `SPOS` positions the spindle (and puts it in position control by itself)       |
 *   | LinuxCNC                                          | `M19 R<deg> Q<s>`             | `R` angle, `Q` timeout in seconds; needs the orient HAL pins in the machine    |
 *   | Heidenhain TNC 640                                | `CYCL DEF 13.0 ORIENTATION`,  | from memory: cycle 13 is machine-builder dependent; whether it is DEF-active   |
 *   |                                                   | `13.1 ANGLE`, `CYCL CALL`     | or call-active is not established here, so the call is written as well         |
 *   | GRBL                                              | refused                       | no spindle orientation exists (3-axis controller, PWM spindle)                 |
 */

/** `90`, `22.5`, `0.0125`: at most four decimals, no trailing zeros. */
export const angleText = (degrees: number): string => String(Number(degrees.toFixed(4)))

/** Plain `M19`: the control stops at its parameterised mark, so only the mark itself (angle 0) can be asked for. */
export const isoSpindleOrient: SpindleOrientCodes = { angled: false, blocks: () => ["M19"] }

/** Haas `M19 P<degrees>` (whole degrees) or `M19 R<degrees>` (decimals). */
export const haasSpindleOrient: SpindleOrientCodes = { angled: true, blocks: (a) => [/^\d+$/.test(a) ? `M19 P${a}` : `M19 R${a}`] }

/** Siemens `SPOS=<degrees>`. */
export const siemensSpindleOrient: SpindleOrientCodes = { angled: true, blocks: (a) => [`SPOS=${a}`] }

/** LinuxCNC `M19 R<degrees> Q<timeout seconds>`. */
export const linuxcncSpindleOrient: SpindleOrientCodes = { angled: true, blocks: (a) => [`M19 R${a} Q10`] }

/** Heidenhain cycle 13 ORIENTATION, passed through the Klartext translation as finished blocks. */
export const klartextSpindleOrient: SpindleOrientCodes = {
  angled: true,
  blocks: (a) => [`${KLARTEXT_PREFIX}CYCL DEF 13.0 ORIENTATION`, `${KLARTEXT_PREFIX}CYCL DEF 13.1 ANGLE${a}`, `${KLARTEXT_PREFIX}CYCL CALL`]
}
