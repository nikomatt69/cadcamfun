/** Post-processors: one shared emitter, one small dialect per control. */
import { fanucDialect, fanucPost } from "./fanuc.ts"
import { genericDialect, genericPost } from "./generic.ts"
import { grblDialect, grblPost } from "./grbl.ts"
import { haasDialect, haasPost } from "./haas.ts"
import { siemensDialect, siemensPost } from "./siemens.ts"
import { heidenhainDialect, heidenhainPost } from "./heidenhain.ts"
import { linuxcncDialect, linuxcncPost } from "./linuxcnc.ts"
import { okumaDialect, okumaPost } from "./okuma.ts"
import { mazakDialect, mazakPost } from "./mazak.ts"
import type { Dialect, Post, PostId } from "./types.ts"

export * from "./types.ts"
export { convertNc, programOfNc, type ConvertOptions, type ConvertResult, type NcFigures } from "./convert.ts"
export { emitProgram, formatNumber, sanitizeComment, toolNumbers } from "./emitter.ts"
export { genericDialect, genericPost } from "./generic.ts"
export { fanucDialect, fanucPost } from "./fanuc.ts"
export { grblDialect, grblPost } from "./grbl.ts"
export { haasDialect, haasPost } from "./haas.ts"
export { siemensDialect, siemensPost } from "./siemens.ts"
export { heidenhainDialect, heidenhainPost } from "./heidenhain.ts"
export { linuxcncDialect, linuxcncPost } from "./linuxcnc.ts"
export { okumaDialect, okumaPost } from "./okuma.ts"
export { mazakDialect, mazakPost } from "./mazak.ts"
export { PostDefinitionSchema, BASE_POSTS, compileDefinition, definitionIssues, type PostDefinition, type DefinitionIssue } from "./definition.ts"
export { samplePostProgram } from "./sample.ts"
export { BUILTIN_DEFINITIONS, GENERIC_DEFINITION, FANUC_DEFINITION, HAAS_DEFINITION, GRBL_DEFINITION, LINUXCNC_DEFINITION } from "./builtin-definitions.ts"

/** Implemented posts by id: every `PostId`. */
export const posts: Readonly<Record<PostId, Post>> = {
  generic: genericPost,
  linuxcnc: linuxcncPost,
  fanuc: fanucPost,
  grbl: grblPost,
  haas: haasPost,
  siemens: siemensPost,
  heidenhain: heidenhainPost,
  okuma: okumaPost,
  mazak: mazakPost
}

export const getPost = (id: PostId): Post | undefined => posts[id] as Post | undefined

/** The dialect of an implemented post: what its control can do (canned cycles, rigid tapping, rotary axes). */
export const dialectOf = (id: PostId): Dialect | undefined =>
  ({ generic: genericDialect, linuxcnc: linuxcncDialect, fanuc: fanucDialect, grbl: grblDialect, haas: haasDialect, siemens: siemensDialect, heidenhain: heidenhainDialect, okuma: okumaDialect, mazak: mazakDialect } as Partial<Record<PostId, Dialect>>)[id]
