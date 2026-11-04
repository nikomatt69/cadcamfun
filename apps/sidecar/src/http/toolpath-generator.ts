import { runKernelJobEffect } from "@cadcamfun/ai"
import { Api, BadRequest, type CamJobResult, isOnePartSource, type CamKernelPlanResult, CurrentUser, InternalError } from "@cadcamfun/api"
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
    .handle("plan", ({ payload }) => Effect.gen(function*() {
      // The same snapshot adapter as `manufacture`, then only the planner (`cam.kernel.planOnly`) in a worker: no strategy, post or replay runs.
      const { progress: _progress, ...snapshot } = payload
      const job = cam.kernel.jobOfSnapshot(snapshot)
      if (job.status === "failed") return yield* new BadRequest({ message: job.issues.map((i) => i.message).join("; ") })
      const plan = yield* kernelRun("cam-plan", job.value, "Failed to plan the kernel job")
      if (plan.status === "failed") return { status: "failed" as const, issues: plan.issues } as CamKernelPlanResult
      return { status: "ok" as const, value: { operations: plan.value.operations as unknown as ReadonlyArray<Record<string, unknown>>, notes: plan.value.notes, unmachined: plan.value.unmachined } }
    }))
    // A multi-setup job (plan, or run with every claim): the computation the assistant's `cam.job` runs, in the same worker queue.
    .handle("job", ({ payload }) => Effect.gen(function*() {
      if (!isOnePartSource(payload.part)) return yield* new BadRequest({ message: "Send exactly one of part.elements or part.meshes" })
      return (yield* kernelRun("cam-job", payload, "Failed to run the CAM job")) as unknown as CamJobResult
    }))
    .handle("lathe", ({ payload }) => Effect.gen(function*() {
      const result = yield* kernelRun("cam-lathe", payload, "Failed to run the lathe job")
      // A plan the turning planner refuses (a profile outside the bar, a tool that cannot reach) is the request's fault: 400 with its reasons.
      if (result.ok === false) return yield* new BadRequest({ message: result.error ?? "The lathe job was refused" })
      return result as never
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
    .handle("verifyNc", ({ payload }) => Effect.gen(function*() {
      const outcome = yield* kernelRun("cam-verify-nc", payload, "Failed to verify the NC program")
      if ("error" in outcome) return yield* new BadRequest({ message: outcome.error })
      return outcome
    }))
}))
