import { emitProgram } from "./emitter.ts"
import type { Program } from "../ir.ts"
import { siemensSpindleOrient } from "./spindle-orient.ts"
import type { Dialect, Post } from "./types.ts"
import { siemensTiltedPlane } from "./workplane.ts"

/**
 * Siemens Sinumerik 840D sl, native language (not the ISO-dialect mode): a `%_N_<NAME>_MPF` main program with its `;$PATH` line,
 * `;` comments, `G71` / `G70` for the unit, seconds on `G4 F`, the tool and its edge selected with `T<n> M6` then `D1` (the
 * length comes from the tool's edge data, there is no `G43`), `M30` to end.
 *
 * What it deliberately leaves out: no canned cycle (`CYCLE81..` take parameter lists of their own, so drilling is written as
 * moves, with pecking), no rigid tapping (`G331` / `G332` need `SPOS` and a thread-specific block: the planner mills the thread),
 * no subprograms (a Siemens subprogram is a separate `_SPF` file). A simultaneous five-axis section is opened with `TRAORI` (the
 * machine's first kinematic transformation; a machine with several sets `PostOptions.tcpTransformation` for `TRAORI(n)`) and closed with
 * `TRAFOOF`. A tilted work plane (`PostOptions.workPlanes`, needs `PostOptions.swivel`) is `CYCLE800` with its 16 parameters
 * (`workplane.ts`); inverse-time feed is `G93` / `G94`. A shop
 * that needs the rest enters its own post; none of this is qualified on a real control.
 */
export const siemensProgramName = (program: Program): string => {
  const clean = program.name.toUpperCase().replace(/[^A-Z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "").slice(0, 24)
  return /^[A-Z]/.test(clean) ? clean : `P${clean}`.slice(0, 24)
}

export const siemensDialect: Dialect = {
  id: "siemens",
  canned: false,
  arcModes: ["ijk"],
  dwell: "seconds",
  dwellWord: "F",
  uppercaseComments: true,
  commentStyle: "semicolon",
  unitCodes: { mm: "G71", inch: "G70" },
  rotary: true,
  spindleOrient: siemensSpindleOrient,
  tcp: { on: (_tool, transformation) => (transformation === undefined ? "TRAORI" : `TRAORI(${transformation})`), off: () => "TRAFOOF" },
  // CYCLE800 swivel plane with its full parameter list (workplane.ts); G93 inverse-time feed, G94 back to mm/min.
  tiltedPlane: siemensTiltedPlane,
  inverseTime: { on: "G93", off: "G94" },
  // High Speed Settings cycle (SINUMERIK Operate): contour tolerance, finishing technology, deselection with `_OFF`.
  smoothing: { on: (tol) => [`CYCLE832(${tol},_FINISH,1)`], off: ["CYCLE832(0,_OFF,1)"] },
  begin: (program) => [`%_N_${siemensProgramName(program)}_MPF`, ";$PATH=/_N_MPF_DIR"],
  setup: ["G90", "G17", "G94", "G40", "G64"],
  toolChange: (n) => [`T${n} M6`, "D1"],
  end: "M30",
  finish: []
}

export const siemensPost: Post = {
  id: "siemens",
  emit: (program, options = {}) => emitProgram(program, options, siemensDialect)
}
