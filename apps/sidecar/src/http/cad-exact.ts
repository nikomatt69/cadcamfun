import { Api, BadRequest, CurrentUser, Forbidden, InternalError, NotFound } from "@cadcamfun/api"
import { cad } from "@cadcamfun/core"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { DrawingRepo } from "../repos/drawing-repo.ts"
import { elementsOf } from "../services/ai-elements.ts"

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
        return yield* guarded("Failed to analyse the exact model", () => cad.analyzeScene(elements, {
          ...(payload.ids !== undefined ? { ids: payload.ids } : {}), ...(payload.machining !== undefined ? { machining: payload.machining } : {})
        }))
      }))
    .handle("step", ({ payload }) =>
      Effect.gen(function*() {
        const elements = yield* sceneOf(payload)
        const selected = cad.selectElements(elements, payload.ids)
        return yield* guarded("Failed to write the STEP file", () => {
          const out = cad.sceneToStep(selected, {
            ...(payload.faceted !== undefined ? { faceted: payload.faceted } : {}), ...(payload.author !== undefined ? { author: payload.author } : { author: "CAD/CAM FUN" })
          })
          return { ...(out.step !== undefined ? { step: out.step } : {}), parts: out.parts.map((p) => ({ id: p.id, name: p.name, exact: p.exact, faces: p.faces, valid: p.valid, ...(p.note !== undefined ? { note: p.note } : {}) })), skipped: out.skipped }
        })
      }))
    .handle("setups", ({ payload }) =>
      Effect.gen(function*() {
        const elements = yield* sceneOf(payload)
        return yield* guarded("Failed to plan the setups", () => cad.setupsForScene(elements, {
          ...(payload.ids !== undefined ? { ids: payload.ids } : {}), ...(payload.fixture !== undefined ? { fixture: payload.fixture } : {}),
          ...(payload.allowed !== undefined ? { allowed: payload.allowed } : {})
        }))
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
        return yield* guarded("Failed to edit the feature", () => payload.nurbs !== undefined ? cad.sceneNurbsEdit(elements, payload.id, payload.nurbs, nurbsEdit as cad.NurbsEdit) : payload.fillet !== undefined ? cad.sceneFilletEdit(elements, payload.id, payload.fillet, payload.radius!) : payload.boss !== undefined
          ? cad.sceneBossEdit(elements, payload.id, payload.boss, payload.diameter!, payload.taper ?? 0)
          : cad.sceneHoleEdit(elements, payload.id, payload.hole!, payload.diameter !== undefined ? { kind: "resize", diameter: payload.diameter, ...(payload.taper !== undefined ? { taper: payload.taper } : {}) } : { kind: "fill" }))
      }))
    .handle("assembly", ({ payload }) =>
      Effect.gen(function*() {
        const elements = yield* sceneOf(payload)
        return yield* guarded("Failed to analyse the assembly", () => cad.assemblyReport(elements, payload.washers !== undefined ? { washers: payload.washers } : {}))
      }))
}))
