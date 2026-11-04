import { BadRequest, Conflict, WORK_OFFSET_ROWS_MAX, Forbidden, InternalError, NotFound, type MachineProbeConfigBody, type MachineProbeConfigDocument, type ProbeReportDocument, type ProbeReportSaveBody, type ProbeReportSummary, type WorkOffsetTableDocument } from "@cadcamfun/api"
import { cam } from "@cadcamfun/core"
import { Context, Effect, Layer } from "effect"
import { MachineConfigRepo } from "../repos/machine-config-repo.ts"
import { ProbeReportRepo } from "../repos/probe-report-repo.ts"
import { ProjectRepo } from "../repos/project-repo.ts"
import { WorkOffsetStore, type OffsetEntries, type StoreRefusal } from "../repos/work-offset-store.ts"

export type ProbingError = BadRequest | Forbidden | NotFound | Conflict | InternalError
/** A read of machine state: never a conflict. */
type ReadError = BadRequest | Forbidden | NotFound | InternalError
/** A project read or removal: access is "not found", never forbidden. */
type ProjectError = BadRequest | NotFound | InternalError

/** Default and ceiling of a report list page. */
const LIST_DEFAULT = 50
const LIST_MAX = 200

function refusal(r: StoreRefusal): Forbidden | NotFound | Conflict {
  return r.refused === "not-found" ? new NotFound({ message: r.message }) : r.refused === "forbidden" ? new Forbidden({ message: r.message }) : new Conflict({ message: r.message })
}

/** A read never races: a conflict there would be a store bug, reported as a server fault. */
const readRefusal = (r: StoreRefusal): Forbidden | NotFound | InternalError =>
  r.refused === "conflict" ? new InternalError({ message: r.message }) : refusal(r) as Forbidden | NotFound

const dbFault = (message: string) => (cause: unknown) =>
  Effect.logError(message, cause).pipe(Effect.andThen(Effect.fail(new InternalError({ message }))))

/**
 * Probing, work offsets and inspection reports (spec 73 §3.2): one service the HTTP group and the assistant's `cam_edit` probe
 * actions share, so both refuse the same things with the same reasons. Work offsets and the probe configuration are machine
 * state (`WorkOffsetStore`); reports are project state (`ProbeReportRepo`) and need access to the project.
 */
export class Probing extends Context.Service<Probing, {
  readonly workOffsets: {
    get(userId: string, machineConfigId: string, setupId?: string | undefined): Effect.Effect<WorkOffsetTableDocument, ReadError>
    put(userId: string, machineConfigId: string, input: { entries: OffsetEntries; setupId?: string | undefined; baseUpdatedAt?: string | undefined }, by?: string): Effect.Effect<WorkOffsetTableDocument, ProbingError>
  }
  readonly probeConfig: {
    get(userId: string, machineConfigId: string): Effect.Effect<MachineProbeConfigDocument, ReadError>
    put(userId: string, machineConfigId: string, input: MachineProbeConfigBody, by?: string): Effect.Effect<MachineProbeConfigDocument, ProbingError>
  }
  readonly reports: {
    list(userId: string, projectId: string, query: { operationId?: string | undefined; limit?: string | undefined; before?: string | undefined }): Effect.Effect<ReadonlyArray<ProbeReportSummary>, ProjectError>
    get(userId: string, projectId: string, reportId: string): Effect.Effect<ProbeReportDocument, ProjectError>
    /** The latest report of a probe operation, if any (the verdict `cam review` and the panel show). */
    latest(userId: string, projectId: string, toolpathId: string): Effect.Effect<ProbeReportDocument | undefined, ProjectError>
    save(userId: string, projectId: string, body: ProbeReportSaveBody): Effect.Effect<ProbeReportDocument, ProjectError | Forbidden>
    remove(userId: string, projectId: string, reportId: string): Effect.Effect<void, ProjectError>
  }
}>()("cadcamfun/Probing") {
  static readonly layer = Layer.effect(Probing, Effect.gen(function*() {
    const store = yield* WorkOffsetStore
    const reports = yield* ProbeReportRepo
    const projects = yield* ProjectRepo
    const machines = yield* MachineConfigRepo
    const projectAccess = Effect.fn("Probing.projectAccess")(function*(userId: string, projectId: string) {
      const found = yield* projects.find(userId, projectId).pipe(Effect.catchTag("DatabaseError", dbFault("Failed to read the project")))
      if (!found) return yield* new NotFound({ message: "Project not found or access denied" })
    })
    return Probing.of({
      workOffsets: {
        get: Effect.fn("Probing.workOffsets.get")(function*(userId, id, setupId) {
          const view = yield* store.get(userId, id, setupId).pipe(Effect.catchTag("DatabaseError", dbFault("Failed to read the work offsets")))
          return "refused" in view ? yield* readRefusal(view) : view
        }),
        put: Effect.fn("Probing.workOffsets.put")(function*(userId, id, input, by) {
          // Keys must be the canonical spelling of an offset the core can address (`G54`, `G54.1 P3`, `G505`, `G59.1`, `preset 4`).
          const problems = cam.probing.tableProblems({ entries: input.entries })
          if (problems.length > 0) return yield* new BadRequest({ message: problems.slice(0, 5).join("; ") })
          if (Object.keys(input.entries).length > WORK_OFFSET_ROWS_MAX) return yield* new BadRequest({ message: `At most ${WORK_OFFSET_ROWS_MAX} work offsets` })
          const view = yield* store.put(userId, id, input, by).pipe(Effect.catchTag("DatabaseError", dbFault("Failed to save the work offsets")))
          return "refused" in view ? yield* refusal(view) : view
        })
      },
      probeConfig: {
        get: Effect.fn("Probing.probeConfig.get")(function*(userId, id) {
          const view = yield* store.getProbeConfig(userId, id).pipe(Effect.catchTag("DatabaseError", dbFault("Failed to read the probe configuration")))
          return "refused" in view ? yield* readRefusal(view) : view
        }),
        put: Effect.fn("Probing.probeConfig.put")(function*(userId, id, input, by) {
          if (input.probing === undefined && input.toolSetter === undefined && input.rotaryCalibration === undefined) {
            return yield* new BadRequest({ message: "No probe configuration fields provided" })
          }
          const view = yield* store.putProbeConfig(userId, id, input, by).pipe(Effect.catchTag("DatabaseError", dbFault("Failed to save the probe configuration")))
          return "refused" in view ? yield* refusal(view) : view
        })
      },
      reports: {
        list: Effect.fn("Probing.reports.list")(function*(userId, projectId, query) {
          yield* projectAccess(userId, projectId)
          const limit = query.limit === undefined ? LIST_DEFAULT : Number(query.limit)
          if (!Number.isInteger(limit) || limit < 1 || limit > LIST_MAX) return yield* new BadRequest({ message: `limit must be an integer from 1 to ${LIST_MAX}` })
          if (query.before !== undefined && Number.isNaN(Date.parse(query.before))) return yield* new BadRequest({ message: "before must be an ISO timestamp" })
          return yield* reports.list(projectId, { toolpathId: query.operationId, limit, before: query.before }).pipe(Effect.catchTag("DatabaseError", dbFault("Failed to list the probe reports")))
        }),
        get: Effect.fn("Probing.reports.get")(function*(userId, projectId, reportId) {
          yield* projectAccess(userId, projectId)
          const found = yield* reports.get(projectId, reportId).pipe(Effect.catchTag("DatabaseError", dbFault("Failed to read the probe report")))
          if (!found) return yield* new NotFound({ message: "Probe report not found" })
          return found
        }),
        latest: Effect.fn("Probing.reports.latest")(function*(userId, projectId, toolpathId) {
          yield* projectAccess(userId, projectId)
          return yield* reports.latestFor(projectId, toolpathId).pipe(Effect.catchTag("DatabaseError", dbFault("Failed to read the probe report")))
        }),
        save: Effect.fn("Probing.reports.save")(function*(userId, projectId, body) {
          yield* projectAccess(userId, projectId)
          if (body.measuredAt !== undefined && Number.isNaN(Date.parse(body.measuredAt))) return yield* new BadRequest({ message: "measuredAt must be an ISO timestamp" })
          if (body.machineConfigId) {
            const machine = yield* machines.find(userId, body.machineConfigId).pipe(Effect.catchTag("DatabaseError", dbFault("Failed to read the machine configuration")))
            if (!machine) return yield* new NotFound({ message: "Machine configuration not found" })
            if (!machine.permission.hasAccess) return yield* new Forbidden({ message: "You do not have permission to access this machine configuration" })
          }
          const saved = yield* reports.create(projectId, userId, {
            name: body.name.trim(), kind: body.kind, source: body.source, verdict: body.verdict, data: body.data,
            toolpathId: body.toolpathId, drawingId: body.drawingId, machineConfigId: body.machineConfigId, setupId: body.setupId, runId: body.runId,
            workOffset: body.workOffset, programHash: body.programHash, sourceRevision: body.sourceRevision,
            measuredAt: body.measuredAt !== undefined ? new Date(body.measuredAt) : undefined
          }).pipe(Effect.catchTag("DatabaseError", dbFault("Failed to save the probe report")))
          if ("refused" in saved) return yield* new BadRequest({ message: saved.refused })
          return saved
        }),
        remove: Effect.fn("Probing.reports.remove")(function*(userId, projectId, reportId) {
          yield* projectAccess(userId, projectId)
          const removed = yield* reports.remove(projectId, reportId).pipe(Effect.catchTag("DatabaseError", dbFault("Failed to delete the probe report")))
          if (!removed) return yield* new NotFound({ message: "Probe report not found" })
        })
      }
    })
  }))
}
