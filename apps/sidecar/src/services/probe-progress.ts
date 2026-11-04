/**
 * Probe progress as live frames (spec 73 §3.2, mirroring `cam-progress.ts`): one `probe.progress` frame per step a probe job
 * reports, then `done` or `cancelled`, on the project's stream. The kernel's callback is synchronous; the publish is forked, and
 * a lost frame only costs a progress label, never the run. Progress of another kind (a queued notice is translated; anything else
 * is not a probe frame) is dropped here, so a reporter can be handed to any kernel job.
 */
import type { KernelJobProgress } from "@cadcamfun/ai"
import { Effect } from "effect"
import type { LiveEvent } from "./live-events.ts"

export type ProbeRunProgress = KernelJobProgress | "done" | "cancelled"

export const probeProgressFrame = (projectId: string, runId: string, progress: ProbeRunProgress, at = new Date().toISOString()): LiveEvent | undefined => {
  if (typeof progress === "string") return { type: "probe.progress", projectId, runId, phase: progress, ahead: 0, at }
  if (progress.stage === "queued") return { type: "probe.progress", projectId, runId, phase: "running", stage: "queued", ahead: progress.ahead, at }
  if (progress.stage !== "probe") return undefined
  return {
    type: "probe.progress", projectId, runId, phase: "running", ahead: 0, at,
    ...(progress.phase !== undefined ? { stage: progress.phase } : {}),
    ...(progress.operationId !== undefined ? { operationId: progress.operationId } : {}),
    index: progress.step.index, count: progress.step.count
  }
}

export const probeProgressReporter = (events: { readonly publish: (event: LiveEvent) => Effect.Effect<void> }, projectId: string, runId: string) =>
  (progress: ProbeRunProgress): void => {
    const frame = probeProgressFrame(projectId, runId, progress)
    if (frame !== undefined) Effect.runFork(events.publish(frame))
  }
