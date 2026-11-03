import { Api, BadRequest, Conflict, CurrentUser, InternalError, NotFound } from "@cadcamfun/api"
import { cam } from "@cadcamfun/core"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { CamSetupRepo } from "../repos/cam-setup-repo.ts"
import { ProjectRepo } from "../repos/project-repo.ts"

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
  const setups = yield* CamSetupRepo
  const projects = yield* ProjectRepo
  const fail = (message: string) => (e: unknown) =>
    Effect.logError(message, e).pipe(Effect.andThen(Effect.fail(new InternalError({ message }))))
  /** Saved setups belong to a project the caller owns or reaches through an organisation. */
  const projectAccess = Effect.fn("camSetup.projectAccess")(function*(projectId: string) {
    const user = yield* CurrentUser
    if (!(yield* projects.find(user.id, projectId))) return yield* new NotFound({ message: "Project not found or access denied" })
  })
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
    .handle("list", ({ params }) => Effect.gen(function*() {
      yield* projectAccess(params.id)
      return yield* setups.list(params.id)
    }).pipe(Effect.catchTag("DatabaseError", fail("Failed to fetch saved setups"))))
    .handle("save", ({ params, payload }) => Effect.gen(function*() {
      yield* projectAccess(params.id)
      if (payload.name.trim() === "") return yield* new BadRequest({ message: "Setup name is required" })
      return yield* setups.save(params.id, { name: payload.name, setup: payload.setup })
    }).pipe(Effect.catchTag("DatabaseError", fail("Failed to save the setup"))))
    .handle("get", ({ params }) => Effect.gen(function*() {
      yield* projectAccess(params.id)
      const found = yield* setups.get(params.id, params.setupId)
      if (!found) return yield* new NotFound({ message: "Setup not found" })
      return found
    }).pipe(Effect.catchTag("DatabaseError", fail("Failed to fetch the setup"))))
    .handle("update", ({ params, payload }) => Effect.gen(function*() {
      yield* projectAccess(params.id)
      if (payload.name !== undefined && payload.name.trim() === "") return yield* new BadRequest({ message: "Setup name is required" })
      if (payload.name === undefined && payload.setup === undefined) return yield* new BadRequest({ message: "No fields provided for update" })
      const updated = yield* setups.update(params.id, params.setupId, { name: payload.name, setup: payload.setup }, payload.baseUpdatedAt)
      if (updated === undefined) return yield* new NotFound({ message: "Setup not found" })
      if (updated === "conflict") return yield* new Conflict({ message: "The setup was saved elsewhere since it was read. Nothing was overwritten." })
      return updated
    }).pipe(Effect.catchTag("DatabaseError", fail("Failed to update the setup"))))
    .handle("remove", ({ params }) => Effect.gen(function*() {
      yield* projectAccess(params.id)
      if (!(yield* setups.remove(params.id, params.setupId))) return yield* new NotFound({ message: "Setup not found" })
      return { message: "Setup deleted successfully" }
    }).pipe(Effect.catchTag("DatabaseError", fail("Failed to delete the setup"))))
}))
