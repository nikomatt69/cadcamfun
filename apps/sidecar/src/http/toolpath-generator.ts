import { Api, BadRequest, CurrentUser, InternalError } from "@cadcamfun/api"
import { cam } from "@cadcamfun/core"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { runKernelRequest } from "../services/cam-program.ts"
import { camProgressReporter } from "../services/cam-progress.ts"
import { LiveEvents } from "../services/live-events.ts"
import { ProjectRepo } from "../repos/project-repo.ts"

const g = cam.generator

/** Run a pure core function; a throw is a server fault (the request already passed its Schema). */
const guarded = <A>(label: string, run: () => A) =>
  Effect.try({ try: run, catch: (cause) => cause }).pipe(
    Effect.catch((cause) => Effect.logError(label, cause).pipe(Effect.andThen(Effect.fail(new InternalError({ message: label })))))
  )

export const ToolpathGeneratorHandlers = HttpApiBuilder.group(Api, "toolpathGenerator", Effect.fn(function*(handlers) {
  const events = yield* LiveEvents
  const projects = yield* ProjectRepo
  return handlers
    .handle("manufacture", ({ payload }) => Effect.gen(function*() {
      // Progress frames go only to a project the caller can open: the same check the stream applies when it delivers them.
      const target = payload.progress
      if (target !== undefined) {
        const user = yield* CurrentUser
        const project = yield* projects.find(user.id, target.projectId).pipe(Effect.catch(() => Effect.succeed(undefined)))
        if (project === undefined) return yield* new BadRequest({ message: "Progress target: project not found" })
      }
      return yield* runKernelRequest(payload, target === undefined ? undefined : camProgressReporter(events, target.projectId, target.runId))
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
        Effect.map((analysis) => ({ warnings: analysis.warnings, stats: analysis.stats, program: analysis.program, motion: analysis.motion }))))
    .handle("verify", ({ payload }) =>
      guarded("Failed to verify toolpath", () => cam.verify.verifyToolpath(payload)))
}))
