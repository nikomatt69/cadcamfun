import { Api, BadRequest, Conflict, CurrentUser, InternalError, NotFound } from "@cadcamfun/api"
import { cam } from "@cadcamfun/core"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { CamSetupRepo } from "../repos/cam-setup-repo.ts"
import { ProjectRepo } from "../repos/project-repo.ts"
import { replaySetupEffect } from "../services/cam-program.ts"
import { Probing } from "../services/probing.ts"

const p = cam.program

/**
 * What `generate` answers: the programs, each with its replay when the caller asked for evidence. The replay runs the same plan as the
 * assistant's `setup_generate` (a kernel job per work offset); nothing is stored here, the caller stores the program with its evidence.
 */
const withEvidence = (given: cam.program.Setup, elements: Record<string, Record<string, unknown>>, stock: cam.generator.Stock | undefined, evidence: boolean | undefined, probePart: boolean | undefined) =>
  Effect.gen(function*() {
    // Template uses are operations by the time the generator sees the setup.
    const setup = p.expandSetup(given).setup
    const geometryOf = (op: cam.program.Operation) => p.geometryFor(op, elements, stock)
    const generated = yield* guarded("Failed to generate the setup", () => p.generateSetup(setup, geometryOf))
    const replayed = evidence !== true ? generated.programs : yield* Effect.forEach(generated.programs, (program) =>
      replaySetupEffect(setup, program, geometryOf, stock).pipe(Effect.map((result) => ({ ...program, evidence: JSON.parse(JSON.stringify(result)) as Record<string, never> }))))
    if (probePart !== true) return { ...generated, programs: replayed }
    // The datum probe of the parts goes first: it is run before the cuts, and has no cutting tool to replay.
    const probe = p.partProbeFor(setup, generated)
    if (probe.program === undefined) return yield* new BadRequest({ message: `probePart: ${probe.refused}` })
    return { ...generated, programs: [{ ...probe.program, kind: "probe" as const }, ...replayed] }
  })

/** Run a pure core function; a throw is a server fault (the request already passed its Schema). */
const guarded = <A>(label: string, run: () => A) =>
  Effect.try({ try: run, catch: (cause) => cause }).pipe(
    Effect.catch((cause) => Effect.logError(label, cause).pipe(Effect.andThen(Effect.fail(new InternalError({ message: label })))))
  )

/**
 * A probing computation: bad settings and an operation the probe cannot do (the planner throws a `RangeError`) are the caller's
 * request and answer 400 with the reason; anything else is a server fault.
 */
const probing = <A>(label: string, settings: Parameters<typeof p.validateProbeSettings>[0], run: () => A): Effect.Effect<A, BadRequest | InternalError> => {
  const problems = p.validateProbeSettings(settings)
  if (problems.length > 0) return Effect.fail(new BadRequest({ message: `probing: ${problems.join("; ")}` }))
  return Effect.try({ try: run, catch: (e) => e }).pipe(
    Effect.catch((e): Effect.Effect<never, BadRequest | InternalError> => e instanceof RangeError
      ? Effect.fail(new BadRequest({ message: e.message }))
      : Effect.logError(label, e).pipe(Effect.andThen(Effect.fail(new InternalError({ message: label })))))
  )
}

/** The deprecated routes name no machine, so the service cannot answer 403 or 404; their contract has only 400 and 500. */
const machineErrorsAreFaults = (message: string) => ({
  Forbidden: () => Effect.fail(new InternalError({ message })), NotFound: () => Effect.fail(new InternalError({ message }))
})

/**
 * Multi-operation setups (spec 14 §4, RM-02): the HTTP face of `cam.program`. Planning and validation are pure and cheap; generation
 * resolves each operation's elements from the request, then runs the same generator and post as a single operation, once per program.
 */
export const CamSetupHandlers = HttpApiBuilder.group(Api, "camSetup", Effect.fn(function*(handlers) {
  const setups = yield* CamSetupRepo
  const service = yield* Probing
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
      return yield* guarded("Failed to plan the setup", () => p.planPrograms(p.expandSetup(payload.setup).setup))
    }))
    .handle("validate", Effect.fn("http.camSetup.validate")(function*({ payload }) {
      return yield* guarded("Failed to validate the setup", () => ({ issues: p.validateSetup(payload.setup) }))
    }))
    .handle("generate", Effect.fn("http.camSetup.generate")(function*({ payload }) {
      // An operation naming an element the request did not carry is the caller's mistake: say which, do not guess.
      const missing = p.expandSetup(payload.setup).setup.operations.filter((op) => op.enabled).flatMap((op) => op.elementIds.filter((id) => payload.elements[id] === undefined).map((id) => `${op.name}: ${id}`))
      if (missing.length > 0) return yield* new BadRequest({ message: `The request carries no element for ${missing.join(", ")}` })
      return yield* withEvidence(payload.setup, payload.elements, payload.stock, payload.evidence, payload.probePart)
    }))
    .handle("probePlan", Effect.fn("http.camSetup.probePlan")(function*({ payload }) {
      const legacy = yield* probing("Failed to plan the probing", payload.settings, () => ({ plan: p.planProbe(payload.operation, payload.settings), kernel: p.kernelProbe(payload.operation, payload.settings) }))
      const user = yield* CurrentUser
      yield* service.plan.plan(user.id, { operation: legacy.kernel.cycle, actions: legacy.kernel.actions, settings: payload.settings }).pipe(Effect.catchTags(machineErrorsAreFaults("Failed to plan the probing")))
      return legacy.plan
    }))
    .handle("probeEmit", Effect.fn("http.camSetup.probeEmit")(function*({ payload }) {
      const legacy = yield* probing("Failed to write the probing program", payload.settings, () => ({ plan: p.planProbe(payload.operation, payload.settings), kernel: p.kernelProbe(payload.operation, payload.settings) }))
      const user = yield* CurrentUser
      const written = yield* service.plan.emit(user.id, { operation: legacy.kernel.cycle, actions: legacy.kernel.actions, settings: payload.settings, dialect: payload.dialect }).pipe(Effect.catchTags(machineErrorsAreFaults("Failed to write the probing program")))
      return { gcode: written.nc, steps: legacy.plan.steps, notes: [...legacy.plan.notes, ...written.notes] }
    }))
    .handle("linkReport", Effect.fn("http.camSetup.linkReport")(function*({ payload }) {
      return yield* guarded("Failed to measure the links", () => p.linkReport(payload.toolpaths, { lowSafeZ: payload.lowSafeZ, ...(payload.rapidRate !== undefined ? { rapidRate: payload.rapidRate } : {}) }))
    }))
    .handle("linkOrder", Effect.fn("http.camSetup.linkOrder")(function*({ payload }) {
      return yield* guarded("Failed to order the operations", () => p.orderForLinking(payload.items, payload.from))
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
    .handle("planSaved", ({ params }) => Effect.gen(function*() {
      yield* projectAccess(params.id)
      const found = yield* setups.get(params.id, params.setupId)
      if (!found) return yield* new NotFound({ message: "Setup not found" })
      return yield* guarded("Failed to plan the setup", () => p.planPrograms(p.expandSetup(found.setup).setup))
    }).pipe(Effect.catchTag("DatabaseError", fail("Failed to fetch the setup"))))
    .handle("generateSaved", ({ params, payload }) => Effect.gen(function*() {
      yield* projectAccess(params.id)
      const found = yield* setups.get(params.id, params.setupId)
      if (!found) return yield* new NotFound({ message: "Setup not found" })
      const missing = p.expandSetup(found.setup).setup.operations.filter((op) => op.enabled).flatMap((op) => op.elementIds.filter((id) => payload.elements[id] === undefined).map((id) => `${op.name}: ${id}`))
      if (missing.length > 0) return yield* new BadRequest({ message: `The request carries no element for ${missing.join(", ")}` })
      return yield* withEvidence(found.setup, payload.elements, payload.stock, payload.evidence, payload.probePart)
    }).pipe(Effect.catchTag("DatabaseError", fail("Failed to fetch the setup"))))
    .handle("remove", ({ params }) => Effect.gen(function*() {
      yield* projectAccess(params.id)
      if (!(yield* setups.remove(params.id, params.setupId))) return yield* new NotFound({ message: "Setup not found" })
      return { message: "Setup deleted successfully" }
    }).pipe(Effect.catchTag("DatabaseError", fail("Failed to delete the setup"))))
}))
