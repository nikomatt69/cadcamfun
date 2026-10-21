/** Post-processors: one shared emitter, one small dialect per control. */
import { fanucDialect, fanucPost } from "./fanuc.ts"
import { genericDialect, genericPost } from "./generic.ts"
import { grblDialect, grblPost } from "./grbl.ts"
import { haasDialect, haasPost } from "./haas.ts"
import { siemensDialect, siemensPost } from "./siemens.ts"
import type { Dialect, Post, PostId } from "./types.ts"

export * from "./types.ts"
export * as advanced from "./advanced/index.ts"
export { emitProgram, formatNumber, sanitizeComment, toolNumbers } from "./emitter.ts"
export { genericDialect, genericPost } from "./generic.ts"
export { fanucDialect, fanucPost } from "./fanuc.ts"
export { grblDialect, grblPost } from "./grbl.ts"
export { haasDialect, haasPost } from "./haas.ts"
export { siemensDialect, siemensPost } from "./siemens.ts"

/** Implemented posts by id (`linuxcnc` is a reserved id, not implemented yet). */
export const posts: Readonly<Partial<Record<PostId, Post>>> = {
  generic: genericPost,
  fanuc: fanucPost,
  grbl: grblPost,
  haas: haasPost,
  siemens: siemensPost
}

export const getPost = (id: PostId): Post | undefined => posts[id]

/** The dialect of an implemented post: what its control can do (canned cycles, rigid tapping, rotary axes). */
export const dialectOf = (id: PostId): Dialect | undefined =>
  ({ generic: genericDialect, fanuc: fanucDialect, grbl: grblDialect, haas: haasDialect, siemens: siemensDialect } as Partial<Record<PostId, Dialect>>)[id]
