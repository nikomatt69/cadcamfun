import { emitProgram } from "./emitter.ts"
import { isoSpindleOrient } from "./spindle-orient.ts"
import type { Dialect, Post } from "./types.ts"

/** Plain ISO/LinuxCNC-style dialect: the reference output other posts are compared against. */
export const genericDialect: Dialect = {
  id: "generic",
  canned: true,
  rigidTap: {},
  arcModes: ["ijk", "radius"],
  dwell: "seconds",
  uppercaseComments: false,
  rotary: true,
  spindleOrient: isoSpindleOrient,
  inverseTime: { on: "G93", off: "G94" },
  begin: () => [],
  setup: ["G90", "G17", "G94"],
  toolChange: (n) => [`T${n} M6`],
  end: "M30",
  finish: []
}

export const genericPost: Post = {
  id: "generic",
  emit: (program, options = {}) => emitProgram(program, options, genericDialect)
}
