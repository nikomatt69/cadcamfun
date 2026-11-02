import { Api, BadRequest, Conflict, CurrentUser, Forbidden, InternalError, NotFound } from "@cadcamfun/api"
import { pmi } from "@cadcamfun/core"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { DrawingRepo } from "../repos/drawing-repo.ts"

const fail = (message: string) => (e: unknown) =>
  Effect.logError(message, e).pipe(Effect.andThen(Effect.fail(new InternalError({ message }))))

export const PmiHandlers = HttpApiBuilder.group(Api, "pmi", Effect.fn(function*(handlers) {
  const drawings = yield* DrawingRepo

  const load = Effect.fn("pmi.load")(function*(id: string) {
    const user = yield* CurrentUser
    if (!id) return yield* new BadRequest({ message: "Drawing ID is required" })
    const drawing = yield* drawings.find(user.id, id)
    if (!drawing) return yield* new NotFound({ message: "Drawing not found" })
    const hasAccess = drawing.project.ownerId === user.id || (!!drawing.project.organization && drawing.project.organization.users.length > 0)
    if (!hasAccess) return yield* new Forbidden({ message: "You do not have permission to access this drawing" })
    return drawing
  })

  const reply = (drawingId: string, set: pmi.PmiSet) => ({
    drawingId, pmi: set, fingerprint: pmi.pmiFingerprint(set), issues: pmi.validatePmiSet(set)
  })

  return handlers
    .handle("get", ({ params }) =>
      load(params.id).pipe(
        Effect.map((drawing) => reply(drawing.id, pmi.pmiSetOf(drawing.data))),
        Effect.catchTag("DatabaseError", fail("Failed to fetch PMI"))))
    .handle("update", ({ params, payload }) =>
      Effect.gen(function*() {
        const drawing = yield* load(params.id)
        const errors = pmi.pmiErrors(payload.pmi)
        if (errors.length > 0) return yield* new BadRequest({ message: `Invalid PMI: ${errors.join("; ")}` })
        const set = pmi.pmiSetOf({ pmi: payload.pmi })
        const data = drawing.data !== null && typeof drawing.data === "object" && !Array.isArray(drawing.data)
          ? { ...(drawing.data as Record<string, unknown>), pmi: set } : { pmi: set }
        const saved = yield* drawings.save(params.id, { data }, payload.baseUpdatedAt, false)
        if (!saved.ok) return yield* new Conflict({ message: `The drawing was saved elsewhere since it was read (${saved.currentUpdatedAt}). Nothing was overwritten.` })
        return reply(params.id, set)
      }).pipe(Effect.catchTag("DatabaseError", fail("Failed to update PMI"))))
}))
