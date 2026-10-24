/**
 * The built-in posts written as post definitions (`definition.ts`), field by field from the generic dialect: the proof that the
 * format is enough to say what a post says. Compiled and run through the shared emitter, each writes exactly the text of the
 * post it describes (`post-definition.test.ts` compares them byte for byte over a corpus of programs).
 *
 * The Siemens and the Heidenhain posts are not here: the first names its program by rules in code, the second translates the
 * output into Klartext. A definition may start from them (`base`) and change the words they use, not those rules.
 */
import type { PostDefinition } from "./definition.ts"

/** Every field is written out, so the base only gives the post its identity (the id its errors and reports carry). */
const of = <B extends PostDefinition["base"]>(base: B) => ({ schemaVersion: 1 as const, base })

export const GENERIC_DEFINITION: PostDefinition = {
  ...of("generic"), name: "Generic ISO / LinuxCNC",
  canned: true, rigidTap: {}, arcModes: ["ijk", "radius"], dwell: "seconds", uppercaseComments: false, rotary: true, tcp: false, subprograms: "none",
  begin: [], setup: ["G90", "G17", "G94"], toolChange: ["T{tool} M6"], end: "M30", finish: []
}

export const FANUC_DEFINITION: PostDefinition = {
  ...of("fanuc"), name: "Fanuc",
  canned: true, rigidTap: { prefix: "M29 S{rpm}" }, arcModes: ["ijk", "radius"], dwell: "milliseconds", uppercaseComments: true, rotary: true,
  tcp: { kind: "offset", code: "G43.4" }, subprograms: "fanuc",
  begin: ["%", "O{programNumber:4}"], setup: ["G90", "G17", "G94", "G40", "G49", "G80"], toolChange: ["T{tool} M6", "G43 H{tool}"], end: "M30", finish: ["%"]
}

export const HAAS_DEFINITION: PostDefinition = {
  ...FANUC_DEFINITION, ...of("haas"), name: "Haas NGC",
  rigidTap: {}, tcp: { kind: "offset", code: "G234" }
}

export const GRBL_DEFINITION: PostDefinition = {
  ...of("grbl"), name: "GRBL",
  canned: false, rigidTap: false, arcModes: ["ijk", "radius"], dwell: "seconds", uppercaseComments: false, rotary: false, tcp: false, subprograms: "none",
  begin: [], setup: ["G90", "G17", "G94"], firstToolChange: ["(TOOL T{tool})"], toolChange: ["(CHANGE TO TOOL T{tool})", "M0"], end: "M2", finish: []
}

export const BUILTIN_DEFINITIONS = { generic: GENERIC_DEFINITION, fanuc: FANUC_DEFINITION, haas: HAAS_DEFINITION, grbl: GRBL_DEFINITION } as const
