import { Api, BadRequest, CamKernelResult, InternalError } from "@cadcamfun/api"
import { cam } from "@cadcamfun/core"
import { Effect, Schema } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"

const g = cam.generator

/** Run a pure core function; a throw is a server fault (the request already passed its Schema). */
const guarded = <A>(label: string, run: () => A) =>
  Effect.try({ try: run, catch: (cause) => cause }).pipe(
    Effect.catch((cause) => Effect.logError(label, cause).pipe(Effect.andThen(Effect.fail(new InternalError({ message: label })))))
  )

export const ToolpathGeneratorHandlers = HttpApiBuilder.group(Api, "toolpathGenerator", Effect.fn(function*(handlers) {
  return handlers
    .handle("manufacture", ({ payload }) => Effect.gen(function*() {
      const machine = payload.machine !== undefined ? cam.kernel.findMachine(payload.machine) : undefined
      if (payload.machine !== undefined && machine === undefined) return yield* new BadRequest({ message: `Unknown machine preset '${payload.machine}'` })
      const result = yield* guarded("Failed to run CAM kernel", () => {
        // The editor stock is centred in CAD XY; its topZ is the machine reference. Anchor the raw block on the CAD part bottom.
        const meshes = payload.stock !== undefined ? cam.model.partMeshes(payload.elements, { tolerance: payload.tolerance ?? 0.01 }) : undefined
        const bottom = meshes !== undefined ? Math.min(...meshes.meshes.map((mesh) => cam.model.meshBounds(mesh).min[2])) : 0
        const stock = payload.stock
        return cam.kernel.runJob({
        schemaVersion: payload.schemaVersion, id: payload.id, name: payload.name, material: payload.material,
        part: { kind: "elements", elements: payload.elements },
        ...(machine !== undefined ? { machine } : {}), ...(stock !== undefined ? { stock: {
          min: { x: stock.x - stock.width / 2, y: stock.y - stock.height / 2, z: bottom },
          max: { x: stock.x + stock.width / 2, y: stock.y + stock.height / 2, z: bottom + stock.depth }
        } } : {}),
        ...(payload.origin !== undefined ? { origin: payload.origin } : {}),
        ...(payload.workOffset !== undefined ? { workOffset: payload.workOffset } : {}),
        quality: {
          ...(payload.finishAllowance !== undefined ? { finishAllowance: payload.finishAllowance } : {}),
          ...(payload.scallop !== undefined ? { scallop: payload.scallop } : {}),
          ...(payload.tolerance !== undefined ? { tolerance: payload.tolerance } : {}),
          ...(payload.resolution !== undefined ? { resolution: payload.resolution } : {})
        }
      }) })
      return yield* Schema.decodeUnknownEffect(CamKernelResult)(result).pipe(
        Effect.mapError(() => new InternalError({ message: "CAM kernel returned an invalid artifact" })))
    }))
    .handle("generate", ({ payload }) =>
      Effect.gen(function*() {
        const outcome = yield* guarded("Failed to generate toolpath", () => g.generateToolpath(payload))
        if (outcome.error !== undefined) return yield* new BadRequest({ message: outcome.error })
        return outcome.response
      }))
    .handle("suggest", ({ payload }) =>
      guarded("Failed to compute suggestions", () => g.suggestFor(payload.settings, payload.geometry)))
    .handle("parse", ({ payload }) =>
      guarded("Failed to parse G-code", () => g.analyseGcode(payload.gcode, payload.name)).pipe(
        Effect.map((analysis) => ({ warnings: analysis.warnings, stats: analysis.stats, program: analysis.program }))))
    .handle("verify", ({ payload }) =>
      guarded("Failed to verify toolpath", () => cam.verify.verifyToolpath(payload)))
}))
