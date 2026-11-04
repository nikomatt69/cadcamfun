/**
 * The sidecar's probing frames on the live bus (spec 73 §3.1): `probe.progress` moves the run badge, `probe.result` announces a
 * finished run (the assistant's included) and, when it moved a work offset, marks the table read in the panel as stale. Frames are
 * read structurally: a frame that does not read is ignored, never half applied.
 */
import { useProbingStore, type ProbeRunProgress, type ProbeRunSummary } from "../../store/probingStore.ts"
import { useWorkOffsetStore } from "../../store/workOffsetStore.ts"

const STAGES = ["queued", "plan", "touch", "check", "offsets", "record"] as const
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null
const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined)
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined)

/** True when the frame was a probing frame (and was applied). */
export const applyProbeEvent = (event: unknown): boolean => {
  if (!isRecord(event)) return false
  if (event["type"] === "probe.progress") {
    const runId = str(event["runId"]), phase = event["phase"]
    if (runId === undefined || (phase !== "running" && phase !== "done" && phase !== "cancelled")) return false
    const stage = STAGES.find((s) => s === event["stage"])
    const progress: ProbeRunProgress = {
      runId, phase, ...(stage !== undefined ? { stage } : {}), ...(str(event["operationId"]) !== undefined ? { operationId: str(event["operationId"])! } : {}),
      ...(num(event["index"]) !== undefined ? { index: num(event["index"])! } : {}), ...(num(event["count"]) !== undefined ? { count: num(event["count"])! } : {})
    }
    useProbingStore.getState().setProgress(progress)
    return true
  }
  if (event["type"] === "probe.result") {
    const runId = str(event["runId"]), verdict = str(event["verdict"]), checks = num(event["checks"]), failed = num(event["failed"])
    if (runId === undefined || verdict === undefined || checks === undefined || failed === undefined || typeof event["offsetsUpdated"] !== "boolean") return false
    const summary: ProbeRunSummary = {
      runId, verdict, checks, failed, offsetsUpdated: event["offsetsUpdated"], kind: str(event["kind"]) ?? "part",
      ...(str(event["reportId"]) !== undefined ? { reportId: str(event["reportId"])! } : {}), ...(str(event["operationId"]) !== undefined ? { operationId: str(event["operationId"])! } : {}),
      ...(num(event["maxDeviationMm"]) !== undefined ? { maxDeviationMm: num(event["maxDeviationMm"])! } : {})
    }
    useProbingStore.getState().setRemote(summary)
    if (summary.offsetsUpdated) useWorkOffsetStore.getState().markStale()
    return true
  }
  return false
}
