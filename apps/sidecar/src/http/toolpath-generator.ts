import { runKernelJobEffect } from "@cadcamfun/ai"
import { Api, BadRequest, CurrentUser, InternalError } from "@cadcamfun/api"
import { cam } from "@cadcamfun/core"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { runKernelRequest } from "../services/cam-program.ts"
import { camProgressReporter } from "../services/cam-progress.ts"
import { explainKernelFailure, kernelRun } from "../services/kernel-errors.ts"
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
  // Progress frames go only to a project the caller can open: the same check the stream applies when it delivers them.
  const progressTarget = (projectId: string) => Effect.gen(function*() {
    const user = yield* CurrentUser
    const project = yield* projects.find(user.id, projectId).pipe(
      Effect.catchTag("DatabaseError", (cause) => Effect.logError("Progress target: project lookup failed", cause).pipe(
        Effect.andThen(Effect.fail(new InternalError({ message: "Progress target: project lookup failed" })))
      ))
    )
    if (project === undefined) return yield* new BadRequest({ message: "Progress target: project not found" })
  })
  return handlers
    .handle("manufacture", ({ payload }) => Effect.gen(function*() {
      const target = payload.progress
      if (target !== undefined) yield* progressTarget(target.projectId)
      return yield* runKernelRequest(payload, target === undefined ? undefined : camProgressReporter(events, target.projectId, target.runId))
    }))
    .handle("generate", ({ payload }) =>
      Effect.gen(function*() {
        const { progress: target, ...request } = payload
        if (target !== undefined) yield* progressTarget(target.projectId)
        const report = target === undefined ? undefined : camProgressReporter(events, target.projectId, target.runId)
        // In a scoped worker like the kernel: the event loop keeps serving, so each step's frame reaches the stream while the run works,
        // and a dropped request interrupts the fiber and terminates the worker.
        const outcome = yield* runKernelJobEffect("cam-generate", request, report === undefined ? {} : { onProgress: report }).pipe(
          Effect.catch(explainKernelFailure("Failed to generate toolpath")),
          Effect.onInterrupt(() => Effect.sync(() => report?.("cancelled")))
        )
        report?.("done")
        if (outcome.error !== undefined) return yield* new BadRequest({ message: outcome.error })
        return outcome.response
      }))
    .handle("suggest", ({ payload }) =>
      guarded("Failed to compute suggestions", () => g.suggestFor(payload.settings, payload.geometry)))
    .handle("parse", ({ payload }) =>
      // In a worker like the generator: a pasted program of hundreds of megabytes never stops the sidecar's other requests.
      kernelRun("cam-parse", { gcode: payload.gcode, name: payload.name ?? "Program" }, "Failed to parse G-code").pipe(
        Effect.map((analysis) => ({ warnings: analysis.warnings, stats: analysis.stats, program: analysis.program, motion: analysis.motion }))))
    .handle("verify", ({ payload }) => kernelRun("cam-verify", payload, "Failed to verify toolpath"))
}))
