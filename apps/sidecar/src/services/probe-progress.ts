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

/** The frame that closes a run with its verdict, shared by the HTTP route and the assistant. */
export const probeResultFrame = (projectId: string, runId: string, doc: { readonly id: string; readonly kind: string; readonly data: unknown }, operationId: string, at = new Date().toISOString()): LiveEvent => {
  const data = doc.data !== null && typeof doc.data === "object" ? doc.data as { verdict?: unknown; checks?: unknown; failed?: unknown; maxDeviationMm?: unknown; updates?: unknown } : {}
  return {
    type: "probe.result", projectId, runId, reportId: doc.id, operationId, at,
    verdict: data.verdict === "warn" || data.verdict === "fail" || data.verdict === "missed" || data.verdict === "incomplete" ? data.verdict : "pass",
    checks: Array.isArray(data.checks) ? data.checks.length : 0, failed: typeof data.failed === "number" ? data.failed : 0,
    ...(typeof data.maxDeviationMm === "number" ? { maxDeviationMm: data.maxDeviationMm } : {}),
    offsetsUpdated: Array.isArray(data.updates) && data.updates.length > 0,
    kind: doc.kind === "rotary" ? "rotary" : "part"
  }
}
