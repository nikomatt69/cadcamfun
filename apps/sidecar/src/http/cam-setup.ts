import { Api, BadRequest, InternalError } from "@cadcamfun/api"
import { cam } from "@cadcamfun/core"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"

const p = cam.program

/** Run a pure core function; a throw is a server fault (the request already passed its Schema). */
const guarded = <A>(label: string, run: () => A) =>
  Effect.try({ try: run, catch: (cause) => cause }).pipe(
    Effect.catch((cause) => Effect.logError(label, cause).pipe(Effect.andThen(Effect.fail(new InternalError({ message: label })))))
  )

/**
 * Multi-operation setups (spec 14 §4, RM-02): the HTTP face of `cam.program`. Planning and validation are pure and cheap; generation
 * resolves each operation's elements from the request, then runs the same generator and post as a single operation, once per program.
 */
export const CamSetupHandlers = HttpApiBuilder.group(Api, "camSetup", Effect.fn(function*(handlers) {
  return handlers
    .handle("plan", Effect.fn("http.camSetup.plan")(function*({ payload }) {
      return yield* guarded("Failed to plan the setup", () => p.planPrograms(payload.setup))
    }))
    .handle("validate", Effect.fn("http.camSetup.validate")(function*({ payload }) {
      return yield* guarded("Failed to validate the setup", () => ({ issues: p.validateSetup(payload.setup) }))
    }))
    .handle("generate", Effect.fn("http.camSetup.generate")(function*({ payload }) {
      // An operation naming an element the request did not carry is the caller's mistake: say which, do not guess.
      const missing = payload.setup.operations.filter((op) => op.enabled).flatMap((op) => op.elementIds.filter((id) => payload.elements[id] === undefined).map((id) => `${op.name}: ${id}`))
      if (missing.length > 0) return yield* new BadRequest({ message: `The request carries no element for ${missing.join(", ")}` })
      return yield* guarded("Failed to generate the setup", () => p.generateSetup(payload.setup, (op) => p.geometryFor(op, payload.elements, payload.stock)))
    }))
}))
