import { Api, BadRequest, type CadImportStepReport, CurrentUser, Forbidden, InternalError, NotFound } from "@cadcamfun/api"
import { cad } from "@cadcamfun/core"
import { decodeHistory, featureEditOf } from "@cadcamfun/ai"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { DrawingRepo } from "../repos/drawing-repo.ts"
import { elementsOf } from "../services/ai-elements.ts"
import { kernelRun } from "../services/kernel-errors.ts"

type Element = Record<string, unknown>

/** Run a pure core function; a throw is a server fault (the request already passed its Schema). */
const guarded = <A>(label: string, run: () => A) =>
  Effect.try({ try: run, catch: (cause) => cause }).pipe(
    Effect.catch((cause) => Effect.logError(label, cause).pipe(Effect.andThen(Effect.fail(new InternalError({ message: label })))))
  )

export const CadExactHandlers = HttpApiBuilder.group(Api, "cadExact", Effect.fn(function*(handlers) {
  const drawings = yield* DrawingRepo

  /** The scene of a request: its own elements, or those of a stored drawing under the drawing access rule (owner or organisation member). */
  const sceneOf = Effect.fn("cadExact.scene")(function*(source: { readonly elements?: ReadonlyArray<Element> | undefined; readonly drawingId?: string | undefined }) {
    if (source.elements !== undefined) return source.elements as ReadonlyArray<Element>
    if (source.drawingId === undefined) return yield* new BadRequest({ message: "Send the elements to analyse, or the id of a stored drawing" })
    const user = yield* CurrentUser
    const drawing = yield* drawings.find(user.id, source.drawingId).pipe(
      Effect.catchTag("DatabaseError", (e) => Effect.logError("cadExact: drawing lookup failed", e).pipe(Effect.andThen(Effect.fail(new InternalError({ message: "Failed to fetch drawing" })))))
    )
    if (!drawing) return yield* new NotFound({ message: "Drawing not found" })
    const hasAccess = drawing.project.ownerId === user.id || (!!drawing.project.organization && drawing.project.organization.users.length > 0)
    if (!hasAccess) return yield* new Forbidden({ message: "You do not have permission to access this drawing" })
    const elements = elementsOf(drawing.data)
    if (elements.length === 0) return yield* new BadRequest({ message: "The drawing has no elements" })
    return elements as ReadonlyArray<Element>
  })

  return handlers
    .handle("analyze", ({ payload }) =>
      Effect.gen(function*() {
        const elements = yield* sceneOf(payload)
        return yield* kernelRun("cad-analyze", {
          elements, options: { ...(payload.ids !== undefined ? { ids: payload.ids } : {}), ...(payload.machining !== undefined ? { machining: payload.machining } : {}) }
        }, "Failed to analyse the exact model")
      }))
    .handle("step", ({ payload }) =>
      Effect.gen(function*() {
        const elements = yield* sceneOf(payload)
        return yield* kernelRun("cad-step", {
          elements, ...(payload.ids !== undefined ? { ids: payload.ids } : {}),
          options: { ...(payload.faceted !== undefined ? { faceted: payload.faceted } : {}), author: payload.author ?? "CAD/CAM FUN" }
        }, "Failed to write the STEP file")
      }))
    .handle("setups", ({ payload }) =>
      Effect.gen(function*() {
        const elements = yield* sceneOf(payload)
        return yield* kernelRun("cad-setups", {
          elements, options: {
            ...(payload.ids !== undefined ? { ids: payload.ids } : {}), ...(payload.fixture !== undefined ? { fixture: payload.fixture } : {}),
            ...(payload.allowed !== undefined ? { allowed: payload.allowed } : {})
          }
        }, "Failed to plan the setups")
      }))
    .handle("hole", ({ payload }) =>
      Effect.gen(function*() {
        if ([payload.hole, payload.boss, payload.fillet, payload.nurbs].filter((v) => v !== undefined).length !== 1) return yield* new BadRequest({ message: "Give exactly one of hole, boss, fillet or nurbs" })
        if (payload.nurbs !== undefined && (payload.diameter !== undefined || payload.fill === true || payload.taper !== undefined || payload.radius !== undefined)) return yield* new BadRequest({ message: "A free-form face takes a distance, or an angle for a draft: not a diameter, fill, taper or radius" })
        if (payload.nurbs === undefined && [payload.distance, payload.direction, payload.mode, payload.angle, payload.neutral, payload.pull, payload.tolerance].some((v) => v !== undefined)) return yield* new BadRequest({ message: "distance, direction, mode, angle, neutral, pull and tolerance belong to a free-form face (nurbs)" })
        const nurbsEdit = payload.nurbs === undefined ? undefined : cad.nurbsEditOf(payload)
        if (typeof nurbsEdit === "string") return yield* new BadRequest({ message: nurbsEdit })
        if (payload.fillet !== undefined && (payload.radius === undefined || payload.diameter !== undefined || payload.fill === true || payload.taper !== undefined)) return yield* new BadRequest({ message: "A fillet takes a radius only" })
        if (payload.taper !== undefined && payload.diameter === undefined) return yield* new BadRequest({ message: "A draft angle (taper) needs a diameter" })
        if (payload.boss !== undefined && (payload.diameter === undefined || payload.fill === true)) return yield* new BadRequest({ message: "A boss takes a diameter (fill applies to holes only)" })
        if (payload.hole !== undefined && (payload.diameter !== undefined) === (payload.fill === true)) return yield* new BadRequest({ message: "Give exactly one of diameter (resize the drill) or fill: true" })
        const elements = yield* sceneOf(payload)
        const edit = featureEditOf(payload)
        if (typeof edit === "string") return yield* new BadRequest({ message: edit })
        return yield* kernelRun("cad-hole", { elements, edit }, "Failed to edit the feature")
      }))
    .handle("rebuild", ({ payload }) =>
      Effect.gen(function*() {
        // The history is checked here, at the boundary, so a malformed one is a 400 that names each refused field and not a worker fault.
        const decoded = decodeHistory(payload.history)
        if (!decoded.success) return yield* new BadRequest({ message: `Invalid parametric history: ${decoded.problems.slice(0, 8).join("; ")}` })
        return yield* kernelRun("cad-rebuild", { history: decoded.data, ...(payload.budgetMs !== undefined ? { budgetMs: payload.budgetMs } : {}) }, "Failed to rebuild the history")
      }))
    .handle("importStep", ({ payload }) =>
      Effect.gen(function*() {
        // A history sent along is checked here, so a malformed one is a 400 that names each refused field, and the job gets decoded data.
        let history: unknown
        if (payload.history !== undefined) {
          const decoded = decodeHistory(payload.history)
          if (!decoded.success) return yield* new BadRequest({ message: `Invalid parametric history: ${decoded.problems.slice(0, 8).join("; ")}` })
          history = decoded.data
        }
        return yield* kernelRun("cad-import-step", {
          step: payload.step, ...(history !== undefined ? { history } : {}), ...(payload.idPrefix !== undefined ? { idPrefix: payload.idPrefix } : {}),
          ...(payload.tolerance !== undefined ? { tolerance: payload.tolerance } : {}), ...(payload.keepAccepted !== undefined ? { keepAccepted: payload.keepAccepted } : {})
        }, "Failed to import the STEP file").pipe(Effect.map((report) => report as unknown as CadImportStepReport))
      }))
    .handle("assembly", ({ payload }) =>
      Effect.gen(function*() {
        const elements = yield* sceneOf(payload)
        return yield* kernelRun("cad-assembly", { elements, options: payload.washers !== undefined ? { washers: payload.washers } : {} }, "Failed to analyse the assembly")
      }))
}))
