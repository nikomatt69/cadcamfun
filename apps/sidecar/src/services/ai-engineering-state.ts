/** Authorized repository snapshots for compaction, delegation and engineering acceptance. No geometry is inferred from prose. */
import { CamKernelArtifact } from "@cadcamfun/api"
import { createHash } from "node:crypto"
import {
  EngineeringGoalCriteria, engineeringAcceptance, engineeringCriteriaKey, engineeringDigest,
  parseProjectContext, projectContextKey, runKernelJob, validateDelegationReferences,
  type EngineeringAcceptance, type EngineeringLedger, type EngineeringOperationEvidence, type EngineeringResource
} from "@cadcamfun/ai"
import { Data, Effect, Schema } from "effect"
import type { ProjectRepo } from "../repos/project-repo.ts"
import type { DrawingRepo } from "../repos/drawing-repo.ts"
import type { ToolpathRepo } from "../repos/toolpath-repo.ts"
import type { KvStore } from "./kv.ts"
import { drawingRevision } from "./cam-program.ts"
import { elementsOf } from "./ai-elements.ts"

export interface EngineeringStateRequest {
  readonly actorId: string
  readonly projectId: string
  readonly sessionId: string
  readonly drawingId?: string
  readonly includeContext?: boolean
  readonly objective?: string
  readonly signal?: AbortSignal
}

export class EngineeringStateError extends Data.TaggedError("EngineeringStateError")<{
  readonly reason: "denied" | "unavailable" | "invalid_criteria"
  readonly message: string
}> {}

export interface AiEngineeringStateDeps {
  readonly projects: ProjectRepo["Service"]
  readonly drawings: DrawingRepo["Service"]
  readonly toolpaths: ToolpathRepo["Service"]
  readonly kv: KvStore["Service"]
  readonly authorizeSession: (actorId: string, projectId: string, sessionId: string) => Promise<boolean>
  readonly pendingTasks?: (projectId: string, sessionId: string) => ReadonlyArray<{ readonly id: string; readonly status: string }>
  /** Existing revision-bound review, executed as the admitted owner; no second CAM verifier lives here. */
  readonly reviewOperation?: (request: EngineeringStateRequest, operationId: string) => Promise<unknown>
}

const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
const text = (value: unknown): string | undefined => typeof value === "string" && value !== "" ? value : undefined
const error = (reason: EngineeringStateError["reason"], message: string) => new EngineeringStateError({ reason, message })
const unavailable = () => error("unavailable", "The engineering state could not be read. Refresh the drawing before relying on it.")

export const makeAiEngineeringState = (deps: AiEngineeringStateDeps) => {
  const authorize = Effect.fn("AiEngineeringState.authorize")(function*(request: EngineeringStateRequest, write = false) {
    const owned = yield* Effect.tryPromise({ try: () => deps.authorizeSession(request.actorId, request.projectId, request.sessionId), catch: () => error("denied", "The engineering session is not accessible.") })
    if (!owned) return yield* error("denied", "The engineering session is not accessible.")
    const access = yield* deps.projects.find(request.actorId, request.projectId).pipe(Effect.mapError(unavailable))
    if (!access) return yield* error("denied", "The engineering project is not accessible.")
    if (write && access.project.ownerId !== request.actorId && access.orgRole !== "ADMIN" && access.orgRole !== "MANAGER") return yield* error("denied", "Write access is required to change engineering acceptance criteria.")
  })

  const snapshot = Effect.fn("AiEngineeringState.snapshot")(function*(request: EngineeringStateRequest) {
    yield* authorize(request)
    const rows = yield* deps.drawings.listByProject(request.projectId).pipe(Effect.mapError(unavailable))
    const drawing = request.drawingId === undefined ? rows.length === 1 ? rows[0] : undefined : rows.find((row) => row.id === request.drawingId)
    if (!drawing) return undefined
    const data = record(drawing.data)
    const elements = elementsOf(data)
    const revision = drawingRevision({ id: drawing.id, elements, data })
    const operations = yield* deps.toolpaths.listForDrawing(drawing.id).pipe(Effect.mapError(unavailable))
    const rules = yield* deps.kv.get(projectContextKey(request.projectId)).pipe(Effect.mapError(unavailable))
    const storedCriteria = yield* deps.kv.get(engineeringCriteriaKey(request.actorId, request.projectId, request.sessionId)).pipe(Effect.mapError(unavailable))
    const decodedCriteria = storedCriteria === undefined ? undefined : Schema.decodeUnknownOption(EngineeringGoalCriteria)(storedCriteria.value)
    const resources: EngineeringResource[] = [{ id: drawing.id, kind: "drawing", revision }]
    for (const element of elements) {
      resources.push({ id: element.id, kind: "element", ...(element["history"] !== undefined ? { revision: engineeringDigest(element["history"]) } : {}) })
      const history = record(element["history"])
      const features = Array.isArray(history["features"]) ? history["features"] : []
      for (const feature of features) {
        const featureId = text(record(feature)["id"])
        if (featureId !== undefined) resources.push({ id: featureId, kind: "feature" })
      }
      if (typeof element.layerId === "string" && !resources.some((entry) => entry.kind === "layer" && entry.id === element.layerId)) resources.push({ id: element.layerId, kind: "layer" })
    }
    const evidence: EngineeringOperationEvidence[] = []
    for (const row of operations) {
      const metadata = record(row.data)
      const generated = typeof row.gcode === "string" && row.gcode.trim() !== ""
      const programHash = generated ? rawProgramHash(row.gcode ?? "") : undefined
      let status: EngineeringOperationEvidence["status"] = "unverified"
      let note = "No current deterministic verification was read for this program."
      const sourceRevision = text(metadata["sourceRevision"])
      const artifact = Schema.decodeUnknownOption(CamKernelArtifact)(metadata["kernelArtifact"])
      if (artifact._tag === "Some") {
        // The saved artifact's own identity uses the NC's raw SHA-256, unlike JSON identity in legacy reports.
        const nc = artifact.value.nc
        const original = row.gcode === nc && artifact.value.identity.nc === rawProgramHash(nc)
        status = sourceRevision !== revision || !original ? "stale" : artifact.value.release === "verified-program" ? "pass" : artifact.value.release === "blocked" ? "blocked" : "preview"
        note = "Native artifact verdict covers only its declared, modelled replay claims; it is not machine qualification."
      } else if (sourceRevision !== undefined && sourceRevision !== revision) {
        status = "stale"
        note = "The program was produced against another drawing or stock revision."
      }
      if (deps.reviewOperation !== undefined) {
        const reviewed = yield* Effect.tryPromise({ try: () => deps.reviewOperation!(request, row.id), catch: unavailable })
        const reviewedRecord = record(reviewed)
        const verdict = reviewedRecord["status"]
        if (reviewedRecord["operationId"] === row.id && verdict === "pass" && reviewedRecord["ok"] === true && reviewedRecord["revision"] === revision) status = "pass"
        else if (verdict === "stale" || verdict === "failed" || verdict === "preview" || verdict === "blocked" || verdict === "unverified") status = verdict
        else if (status === "pass") status = "unverified"
        note = text(reviewedRecord["note"]) ?? note
      }
      evidence.push({ id: row.id, generated, ...(programHash !== undefined ? { programHash } : {}), status, ...(sourceRevision !== undefined ? { drawingRevision: sourceRevision } : {}), ...(row.toolId !== null ? { toolId: row.toolId } : {}), ...(row.machineConfigId !== null ? { machineId: row.machineConfigId } : {}), ...(row.materialId !== null ? { materialId: row.materialId } : {}), note })
      resources.push({ id: row.id, kind: "operation", revision: engineeringDigest({ data: row.data, gcode: row.gcode }) })
    }
    // A slow review must not label an earlier drawing as the current one.
    const current = yield* deps.drawings.find(request.actorId, drawing.id).pipe(Effect.mapError(unavailable))
    if (!current || current.projectId !== request.projectId || drawingRevision({ id: drawing.id, data: record(current.data), elements: elementsOf(current.data) }) !== revision) return yield* unavailable()
    const currentOperations = yield* deps.toolpaths.listForDrawing(drawing.id).pipe(Effect.mapError(unavailable))
    const programIdentities = (rows: typeof operations) => rows.map((row) => ({ id: row.id, data: row.data, gcode: row.gcode, toolId: row.toolId, machineId: row.machineConfigId, materialId: row.materialId })).sort((a, b) => a.id.localeCompare(b.id))
    if (engineeringDigest(programIdentities(currentOperations)) !== engineeringDigest(programIdentities(operations))) return yield* unavailable()
    const ledger: EngineeringLedger = {
      version: 1, projectId: request.projectId, drawingId: drawing.id, revision, capturedAt: new Date().toISOString(), units: { length: "mm", angle: "rad" },
      ...(rules !== undefined ? { requirements: parseProjectContext(rules.value).text } : {}), resources,
      stock: { configured: data["stock"] !== undefined && data["stock"] !== null, digest: engineeringDigest(data["stock"] ?? null) },
      ...(decodedCriteria?._tag === "Some" ? { criteria: decodedCriteria.value } : {}),
      operations: evidence, pendingTasks: deps.pendingTasks?.(request.projectId, request.sessionId) ?? [], omissions: []
    }
    return { ledger, elements }
  })

  const read = Effect.fn("AiEngineeringState.read")(function*(request: EngineeringStateRequest) {
    if (request.includeContext === false) return undefined
    return (yield* snapshot(request))?.ledger
  })

  const setCriteria = Effect.fn("AiEngineeringState.setCriteria")(function*(request: EngineeringStateRequest, value: unknown) {
    yield* authorize(request, true)
    const criteria = yield* Schema.decodeUnknownEffect(EngineeringGoalCriteria)(value).pipe(Effect.mapError(() => error("invalid_criteria", "Acceptance criteria do not match the supported engineering contract.")))
    if (criteria.dimensions.length === 0 && criteria.operationIds.length === 0) return yield* error("invalid_criteria", "Configure at least one dimensional or operation acceptance criterion.")
    if (new Set(criteria.dimensions.map((item) => item.elementId)).size !== criteria.dimensions.length || new Set(criteria.operationIds).size !== criteria.operationIds.length || criteria.dimensions.some((item) => new Set(item.checks.map((check) => check.name)).size !== item.checks.length)) return yield* error("invalid_criteria", "Element, operation and per-element check identities must be unique within acceptance criteria.")
    if (request.objective !== undefined && request.objective.trim() !== criteria.objective.trim()) return yield* error("invalid_criteria", "Acceptance criteria must name the current goal objective exactly.")
    const target = yield* snapshot({ ...request, drawingId: criteria.drawingId })
    if (target === undefined || (request.drawingId !== undefined && request.drawingId !== criteria.drawingId)) return yield* error("invalid_criteria", "Acceptance criteria must refer to the drawing admitted for this session.")
    const elementIds = new Set(target.elements.map((element) => element.id))
    if (criteria.dimensions.some((item) => !elementIds.has(item.elementId)) || criteria.operationIds.some((id) => !target.ledger.operations.some((operation) => operation.id === id))) return yield* error("invalid_criteria", "Acceptance criteria refer to an element or operation outside the current drawing.")
    yield* deps.kv.set(engineeringCriteriaKey(request.actorId, request.projectId, request.sessionId), criteria).pipe(Effect.mapError(unavailable))
    return criteria
  })

  const accept = Effect.fn("AiEngineeringState.accept")(function*(request: EngineeringStateRequest): Effect.fn.Return<EngineeringAcceptance | undefined, EngineeringStateError> {
    const state = yield* snapshot(request)
    if (state === undefined) return undefined
    const stored = yield* deps.kv.get(engineeringCriteriaKey(request.actorId, request.projectId, request.sessionId)).pipe(Effect.mapError(unavailable))
    const decoded = stored === undefined ? undefined : Schema.decodeUnknownOption(EngineeringGoalCriteria)(stored.value)
    const criteria = decoded?._tag === "Some" ? decoded.value : undefined
    if (criteria === undefined) return engineeringAcceptance({ ledger: state.ledger })
    const dimensions: Array<{ elementId: string; report?: Awaited<ReturnType<typeof runKernelJob<"acceptance">>>; error?: string }> = []
    for (const target of criteria.dimensions) {
      const element = state.elements.find((candidate) => candidate.id === target.elementId)
      if (element?.["history"] === undefined) { dimensions.push({ elementId: target.elementId, error: "No supported parametric history exists for this criterion." }); continue }
      const measured = yield* Effect.tryPromise({
        try: () => runKernelJob("acceptance", { history: element["history"], checks: target.checks }, request.signal === undefined ? {} : { signal: request.signal }),
        catch: (cause) => error("unavailable", cause instanceof Error ? cause.message : "The dimensional measurement did not complete.")
      }).pipe(Effect.match({ onSuccess: (report) => ({ elementId: target.elementId, report }), onFailure: (cause) => ({ elementId: target.elementId, error: cause.message }) }))
      dimensions.push(measured)
    }
    const latest = yield* snapshot(request)
    if (latest === undefined || latest.ledger.revision !== state.ledger.revision || engineeringDigest(latest.ledger.operations) !== engineeringDigest(state.ledger.operations) || engineeringDigest(latest.ledger.criteria) !== engineeringDigest(criteria)) {
      return { status: "stale", projectId: request.projectId, drawingId: state.ledger.drawingId, revision: latest?.ledger.revision ?? state.ledger.revision, criteriaDigest: engineeringDigest(criteria), checks: [], note: "The drawing or program changed during measurement; evaluate the new revision before accepting it." }
    }
    return engineeringAcceptance({ ledger: latest.ledger, criteria, dimensions, ...(request.objective !== undefined ? { objective: request.objective } : {}) })
  })

  const validateDelegation = Effect.fn("AiEngineeringState.validateDelegation")(function*(request: EngineeringStateRequest, ids: ReadonlyArray<string>, observedIds: ReadonlySet<string>, expectedRevision?: string) {
    const state = yield* snapshot(request)
    if (state === undefined) return { ok: false, error: "Open and inspect the drawing before delegating references." }
    if (expectedRevision !== undefined && expectedRevision !== state.ledger.revision) return { ok: false, error: "The drawing changed after these references were read; inspect it again before delegating." }
    return validateDelegationReferences(state.ledger, ids, observedIds)
  })

  return { read, setCriteria, accept, validateDelegation }
}

const rawProgramHash = (value: string): string => createHash("sha256").update(value).digest("hex")
