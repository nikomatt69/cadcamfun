/**
 * Probing and work offsets over the typed HTTP API (`camProbing` group, spec 73 §3.1). The panel's stores are adapters over this
 * interface, not a second implementation: the sidecar refuses what the core refuses and answers with the same reasons the assistant
 * gets. A write to the work-offset table or the probe configuration expects the revision the editor last read; a write that lost the
 * race fails with `WorkOffsetConflict` (HTTP 409), never by silently replacing what someone saved on the machine.
 */
import { Effect, Schema } from "effect"
import type { CamProbingEmitRequest, CamProbingProgram, CamProbingSimulateRequest, CamProbingSimulation, CamRotaryCalibrationRequest, CamRotaryCalibrationResult, MachineProbeConfigBody, MachineProbeConfigDocument, ProbeReportDocument, ProbeReportSaveBody, ProbeReportSummary, WorkOffsetTableBody, WorkOffsetTableDocument } from "@cadcamfun/api"
import type { Client } from "../../../shared/state/client.ts"
import { isSaveConflict } from "../../cad/lib/stored-revision.ts"
import { ToolpathGeneratorError } from "./generator.ts"

/** The machine's table or probe configuration changed since the editor read it (someone else, the assistant, another window). */
export class WorkOffsetConflict extends Schema.TaggedError<WorkOffsetConflict>()("WorkOffsetConflict", {
  machineConfigId: Schema.String,
  message: Schema.String
}) {}

const failure = (cause: unknown): ToolpathGeneratorError => {
  const message = typeof cause === "object" && cause !== null && "message" in cause && typeof cause.message === "string" && cause.message !== "" ? cause.message : cause instanceof Error ? cause.message : String(cause)
  return new ToolpathGeneratorError({ message })
}

const conflictOr = (machineConfigId: string) => (cause: unknown): ToolpathGeneratorError | WorkOffsetConflict =>
  isSaveConflict(cause) ? new WorkOffsetConflict({ machineConfigId, message: failure(cause).message }) : failure(cause)

export type ProbingError = ToolpathGeneratorError
export type { WorkOffsetTableDocument, MachineProbeConfigDocument, ProbeReportDocument, ProbeReportSummary }

export interface ProbingService {
  /** Absent in a fake that only drives the table and the reports. */
  readonly program?: {
    readonly emit: (payload: CamProbingEmitRequest) => Effect.Effect<CamProbingProgram, ProbingError>
    readonly simulate: (payload: CamProbingSimulateRequest) => Effect.Effect<CamProbingSimulation, ProbingError>
    readonly calibrateRotary: (payload: CamRotaryCalibrationRequest) => Effect.Effect<CamRotaryCalibrationResult, ProbingError>
  }
  readonly workOffsets: {
    readonly get: (machineConfigId: string, setupId?: string) => Effect.Effect<WorkOffsetTableDocument, ProbingError>
    /** Writes the whole table; `baseUpdatedAt` is the revision the editor read. */
    readonly put: (machineConfigId: string, body: WorkOffsetTableBody, setupId?: string) => Effect.Effect<WorkOffsetTableDocument, ProbingError | WorkOffsetConflict>
  }
  readonly probeConfig: {
    readonly get: (machineConfigId: string) => Effect.Effect<MachineProbeConfigDocument, ProbingError>
    readonly put: (machineConfigId: string, body: MachineProbeConfigBody) => Effect.Effect<MachineProbeConfigDocument, ProbingError | WorkOffsetConflict>
  }
  readonly reports: {
    readonly list: (projectId: string, query?: { readonly operationId?: string; readonly limit?: number }) => Effect.Effect<ReadonlyArray<ProbeReportSummary>, ProbingError>
    readonly get: (projectId: string, reportId: string) => Effect.Effect<ProbeReportDocument, ProbingError>
    readonly save: (projectId: string, body: ProbeReportSaveBody) => Effect.Effect<ProbeReportDocument, ProbingError>
    readonly remove: (projectId: string, reportId: string) => Effect.Effect<void, ProbingError>
  }
}

export const makeProbingStoreService = (client: Client): ProbingService => ({
  program: {
    emit: (payload) => client.camProbing.emit({ payload }).pipe(Effect.mapError(failure)),
    simulate: (payload) => client.camProbing.simulate({ payload }).pipe(Effect.mapError(failure)),
    calibrateRotary: (payload) => client.camProbing.calibrateRotary({ payload }).pipe(Effect.mapError(failure))
  },
  workOffsets: {
    get: (id, setupId) => client.camProbing.workOffsetsGet({ params: { id }, query: setupId === undefined ? {} : { setupId } }).pipe(Effect.mapError(failure)),
    put: (id, payload, setupId) => client.camProbing.workOffsetsPut({ params: { id }, query: setupId === undefined ? {} : { setupId }, payload }).pipe(Effect.mapError(conflictOr(id)))
  },
  probeConfig: {
    get: (id) => client.camProbing.probeConfigGet({ params: { id } }).pipe(Effect.mapError(failure)),
    put: (id, payload) => client.camProbing.probeConfigPut({ params: { id }, payload }).pipe(Effect.mapError(conflictOr(id)))
  },
  reports: {
    list: (id, query) => client.camProbing.reportsList({ params: { id }, query: { ...(query?.operationId !== undefined ? { operationId: query.operationId } : {}), ...(query?.limit !== undefined ? { limit: String(query.limit) } : {}) } }).pipe(Effect.mapError(failure)),
    get: (id, reportId) => client.camProbing.reportsGet({ params: { id, reportId } }).pipe(Effect.mapError(failure)),
    save: (id, payload) => client.camProbing.reportsSave({ params: { id }, payload }).pipe(Effect.mapError(failure)),
    remove: (id, reportId) => client.camProbing.reportsRemove({ params: { id, reportId } }).pipe(Effect.asVoid, Effect.mapError(failure))
  }
})
