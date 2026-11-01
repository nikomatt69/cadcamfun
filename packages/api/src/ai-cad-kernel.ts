/**
 * `cad.kernel`: the exact kernel's naming and Boolean health, for the assistant (spec 41 N7, spec 42 R0).
 *
 *   health   naming health of every exact body (unnamed faces, ordinal keys) and the Boolean counters of the build
 *   refs     the stable references a body offers (faces, edges, vertices), to store instead of an index
 *   resolve  what became of references after the history was edited (`parameters` or `after`) or by the end of the history
 *
 * The part is a parametric history, inline or read from an element; lengths are millimetres.
 */
import { Schema } from "effect"
import { ParametricHistory, ParametricParameters } from "./ai-parametric.ts"

const optional = Schema.optionalKey
const id = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(100))
/** `face:plate|plate.top` — kind, body id and the stable key (see `refToString`). */
const refText = Schema.String.check(Schema.isMinLength(5), Schema.isMaxLength(400), Schema.isPattern(/^(face|edge|vertex):[^|]*\|.+$/))

export const CadKernelInput = Schema.Struct({
  op: Schema.Literals(["health", "refs", "resolve"]),
  elementId: optional(id),
  history: optional(ParametricHistory),
  /** The body to list references of (default: every body). */
  body: optional(id),
  kinds: optional(Schema.Array(Schema.Literals(["face", "edge", "vertex"])).check(Schema.isMinLength(1), Schema.isMaxLength(3))),
  /** `refs`: how many references to return (default 200, at most 1000). */
  limit: optional(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 1000 }))),
  /** `resolve`: references made on `history`. */
  refs: optional(Schema.Array(refText).check(Schema.isMinLength(1), Schema.isMaxLength(100))),
  /** `resolve`: the edited parameters (merged over the history's own) to resolve the references against. */
  parameters: optional(ParametricParameters),
  /** `resolve`: the whole edited history to resolve against (instead of `parameters`). */
  after: optional(ParametricHistory),
  /** `resolve`: the feature after which the references were made, when resolving along one history. */
  madeAfter: optional(id)
})
export type CadKernelInput = typeof CadKernelInput.Type
