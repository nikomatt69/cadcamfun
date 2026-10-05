/** Post-processors: one shared emitter, one small dialect per control. */
import { fanucPost } from "./fanuc.ts"
import { genericPost } from "./generic.ts"
import { grblPost } from "./grbl.ts"
import type { Post, PostId } from "./types.ts"

export * from "./types.ts"
export { emitProgram, formatNumber, sanitizeComment, toolNumbers } from "./emitter.ts"
export { genericDialect, genericPost } from "./generic.ts"
export { fanucDialect, fanucPost } from "./fanuc.ts"
export { grblDialect, grblPost } from "./grbl.ts"

/** Implemented posts by id (`linuxcnc` and `haas` are reserved ids, not implemented yet). */
export const posts: Readonly<Partial<Record<PostId, Post>>> = {
  generic: genericPost,
  fanuc: fanucPost,
  grbl: grblPost
}

export const getPost = (id: PostId): Post | undefined => posts[id]
