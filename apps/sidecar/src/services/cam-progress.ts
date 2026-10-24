/**
 * Kernel and generator progress as live frames (spec 29): one `cam.progress` frame per operation and stage (or generator step), then `done` or `cancelled`, on the
 * project's stream, so the desktop and a paired phone follow the same run. The kernel's callback is synchronous; the publish is
 * forked, and a lost frame only costs a progress label, never the run.
 */
import { cam } from "@cadcamfun/core"
import { Effect } from "effect"
import type { LiveEvent } from "./live-events.ts"

export type CamRunProgress = cam.kernel.KernelProgress | cam.generator.GenerateProgress | "done" | "cancelled"

export const camProgressFrame = (projectId: string, runId: string, progress: CamRunProgress, at = new Date().toISOString()): LiveEvent =>
  typeof progress === "string"
    ? { type: "cam.progress", projectId, runId, phase: progress, at }
    : {
        type: "cam.progress", projectId, runId, phase: "running", stage: progress.stage, at,
        ...("operation" in progress && progress.operation !== undefined ? { operationId: progress.operation.id, index: progress.operation.index, count: progress.operation.count } : {}),
        // A generator step has no operation: its place among the steps of the run is the index and the count.
        ...("step" in progress ? { index: progress.step.index, count: progress.step.count } : {})
      }

export const camProgressReporter = (events: { readonly publish: (event: LiveEvent) => Effect.Effect<void> }, projectId: string, runId: string) =>
  (progress: CamRunProgress): void => { Effect.runFork(events.publish(camProgressFrame(projectId, runId, progress))) }
