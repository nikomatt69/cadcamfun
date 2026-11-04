import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"
import { BadRequest, Conflict, Forbidden, InternalError, NotFound } from "../errors.ts"
import {
  CamProbingEmitRequest, CamProbingPlan, CamProbingPlanRequest, CamProbingProgram, CamProbingSimulateRequest, CamProbingSimulation, CamRotaryCalibrationRequest,
  CamRotaryCalibrationResult, ProbeReportRunBody,
  MachineProbeConfigBody, MachineProbeConfigDocument, ProbeReportDocument, ProbeReportListQuery, ProbeReportSaveBody, ProbeReportSummary,
  WorkOffsetTableBody, WorkOffsetTableDocument, WorkOffsetTableQuery
} from "../cam-probing.ts"

const machine = { id: Schema.String }
const project = { id: Schema.String }
const report = { id: Schema.String, reportId: Schema.String }
const created = <S extends Schema.Top>(schema: S) => schema.pipe(Schema.annotate({ httpApiStatus: 201 }))

/**
 * Probing and in-process inspection (spec 73 §3.1). Work offsets and the probe configuration are machine state, stored on the
 * machine configuration (reads need access to it, writes ownership; a stale `baseUpdatedAt` is 409 and writes nothing). Reports
 * belong to a project and outlive the probe operation they measured.
 */
export class CamProbingGroup extends HttpApiGroup.make("camProbing")
  .add(
    HttpApiEndpoint.post("plan", "/api/cam/probing/plan", { payload: CamProbingPlanRequest, success: CamProbingPlan, error: [BadRequest, Forbidden, NotFound, InternalError] }),
    HttpApiEndpoint.post("emit", "/api/cam/probing/emit", { payload: CamProbingEmitRequest, success: CamProbingProgram, error: [BadRequest, Forbidden, NotFound, InternalError] }),
    HttpApiEndpoint.post("simulate", "/api/cam/probing/simulate", { payload: CamProbingSimulateRequest, success: CamProbingSimulation, error: [BadRequest, Forbidden, NotFound, InternalError] }),
    HttpApiEndpoint.post("calibrateRotary", "/api/cam/probing/calibrate-rotary", { payload: CamRotaryCalibrationRequest, success: CamRotaryCalibrationResult, error: [BadRequest, Forbidden, NotFound, InternalError] }),
    HttpApiEndpoint.get("workOffsetsGet", "/api/machine-configs/:id/work-offsets", {
      params: machine, query: WorkOffsetTableQuery, success: WorkOffsetTableDocument, error: [BadRequest, Forbidden, NotFound, InternalError]
    }),
    HttpApiEndpoint.put("workOffsetsPut", "/api/machine-configs/:id/work-offsets", {
      params: machine, query: WorkOffsetTableQuery, payload: WorkOffsetTableBody, success: WorkOffsetTableDocument,
      error: [BadRequest, Forbidden, NotFound, Conflict, InternalError]
    }),
    HttpApiEndpoint.get("probeConfigGet", "/api/machine-configs/:id/probe", {
      params: machine, success: MachineProbeConfigDocument, error: [BadRequest, Forbidden, NotFound, InternalError]
    }),
    HttpApiEndpoint.put("probeConfigPut", "/api/machine-configs/:id/probe", {
      params: machine, payload: MachineProbeConfigBody, success: MachineProbeConfigDocument, error: [BadRequest, Forbidden, NotFound, Conflict, InternalError]
    }),
    HttpApiEndpoint.get("reportsList", "/api/projects/:id/probe-reports", {
      params: project, query: ProbeReportListQuery, success: Schema.Array(ProbeReportSummary), error: [BadRequest, NotFound, InternalError]
    }),
    HttpApiEndpoint.get("reportsGet", "/api/projects/:id/probe-reports/:reportId", {
      params: report, success: ProbeReportDocument, error: [BadRequest, NotFound, InternalError]
    }),
    HttpApiEndpoint.post("reportsRun", "/api/projects/:id/probe-reports", {
      params: project, payload: ProbeReportRunBody, success: created(ProbeReportDocument), error: [BadRequest, Forbidden, NotFound, InternalError]
    }),
    HttpApiEndpoint.put("reportsSave", "/api/projects/:id/probe-reports", {
      params: project, payload: ProbeReportSaveBody, success: created(ProbeReportDocument), error: [BadRequest, Forbidden, NotFound, InternalError]
    }),
    HttpApiEndpoint.delete("reportsRemove", "/api/projects/:id/probe-reports/:reportId", {
      params: report, success: Schema.Struct({ message: Schema.String }), error: [BadRequest, NotFound, InternalError]
    })
  )
{}
