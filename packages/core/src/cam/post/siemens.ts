import { emitProgram } from "./emitter.ts"
import type { Program } from "../ir.ts"
import type { Dialect, Post } from "./types.ts"

/**
 * Siemens Sinumerik 840D sl, native language (not the ISO-dialect mode): a `%_N_<NAME>_MPF` main program with its `;$PATH` line,
 * `;` comments, `G71` / `G70` for the unit, seconds on `G4 F`, the tool and its edge selected with `T<n> M6` then `D1` (the
 * length comes from the tool's edge data, there is no `G43`), `M30` to end.
 *
 * What it deliberately leaves out: no canned cycle (`CYCLE81..` take parameter lists of their own, so drilling is written as
 * moves, with pecking), no rigid tapping (`G331` / `G332` need `SPOS` and a thread-specific block: the planner mills the thread),
 * no subprograms (a Siemens subprogram is a separate `_SPF` file), no tool-centre-point command (`TRAORI` needs the machine's
 * kinematic transformation number; the kernel writes machine coordinates, like its other five-axis posts). A shop that needs those
 * enters its own post; none of this is qualified on a real control.
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
