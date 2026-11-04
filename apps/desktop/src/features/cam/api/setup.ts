/**
 * The multi-operation setup as an Effect service over the typed HTTP API (`camSetup` group, spec 14 §4). The desktop store is an
 * adapter over this interface, not a second planner.
 *
 * Saved setups (RM-02 deliverable 5) are project documents revisioned by `updatedAt`: `persist` creates the document the first
 * time and afterwards replaces it only while the revision the editor last read is still current. A write that lost that race
 * fails with `SetupConflict` (HTTP 409), never by silently replacing a setup saved elsewhere.
 */
import { Effect, Schema } from "effect"
import type { CamSetupDocument, CamSetupGenerated, CamSetupPlan, CamSetupValidation } from "@cadcamfun/api"
import type { cam } from "@cadcamfun/core"
import type { Client } from "../../../shared/state/client.ts"
import { isSaveConflict } from "../../cad/lib/stored-revision.ts"
import { ToolpathGeneratorError } from "./generator.ts"

export type SetupRequest = Parameters<Client["camSetup"]["plan"]>[0]["payload"]
export type SetupGenerateRequest = Parameters<Client["camSetup"]["generate"]>[0]["payload"]

/** The saved setup the editor last read or wrote: what a later save replaces, and the revision it expects. */
export interface SavedSetupRef {
  readonly id: string
  readonly projectId: string
  readonly name: string
  readonly updatedAt: string
}

/** The saved setup changed since the editor read it (someone else, the assistant or another window saved it). */
export class SetupConflict extends Schema.TaggedError<SetupConflict>()("SetupConflict", {
  setupId: Schema.String,
  message: Schema.String
}) {}

const failure = (cause: unknown): ToolpathGeneratorError => {
  const message = typeof cause === "object" && cause !== null && "message" in cause && typeof cause.message === "string" && cause.message !== "" ? cause.message : cause instanceof Error ? cause.message : String(cause)
  return new ToolpathGeneratorError({ message })
}

export const refOfDocument = (document: CamSetupDocument): SavedSetupRef =>
  ({ id: document.id, projectId: document.projectId, name: document.name, updatedAt: document.updatedAt })

export interface SetupService {
  readonly plan: (request: SetupRequest) => Effect.Effect<CamSetupPlan, ToolpathGeneratorError>
  readonly validate: (request: SetupRequest) => Effect.Effect<CamSetupValidation, ToolpathGeneratorError>
  readonly generate: (request: SetupGenerateRequest) => Effect.Effect<CamSetupGenerated, ToolpathGeneratorError>
  /** The project's saved setups. */
  readonly list: (projectId: string) => Effect.Effect<ReadonlyArray<CamSetupDocument>, ToolpathGeneratorError>
  readonly load: (projectId: string, setupId: string) => Effect.Effect<CamSetupDocument, ToolpathGeneratorError>
  /**
   * Writes the setup under `name`: a new document when `saved` is undefined (or names another project), otherwise the saved one,
   * expecting `saved.updatedAt` as its current revision.
   */
  readonly persist: (input: {
    readonly projectId: string
    readonly saved: SavedSetupRef | undefined
    readonly name: string
    readonly setup: cam.program.Setup
  }) => Effect.Effect<CamSetupDocument, ToolpathGeneratorError | SetupConflict>
  readonly remove: (projectId: string, setupId: string) => Effect.Effect<void, ToolpathGeneratorError>
}

export const makeSetupService = (client: Client): SetupService => ({
  plan: (payload) => client.camSetup.plan({ payload }).pipe(Effect.mapError(failure)),
  validate: (payload) => client.camSetup.validate({ payload }).pipe(Effect.mapError(failure)),
  generate: (payload) => client.camSetup.generate({ payload }).pipe(Effect.mapError(failure)),
  list: (id) => client.camSetup.list({ params: { id } }).pipe(Effect.mapError(failure)),
  load: (id, setupId) => client.camSetup.get({ params: { id, setupId } }).pipe(Effect.mapError(failure)),
  persist: Effect.fn("cam.setup.persist")(function*({ projectId, saved, name, setup }) {
    if (saved === undefined || saved.projectId !== projectId) {
      return yield* client.camSetup.save({ params: { id: projectId }, payload: { name, setup } }).pipe(Effect.mapError(failure))
    }
    return yield* client.camSetup.update({ params: { id: projectId, setupId: saved.id }, payload: { name, setup, baseUpdatedAt: saved.updatedAt } }).pipe(
      Effect.mapError((cause): ToolpathGeneratorError | SetupConflict =>
        isSaveConflict(cause) ? new SetupConflict({ setupId: saved.id, message: failure(cause).message }) : failure(cause))
    )
  }),
  remove: (id, setupId) => client.camSetup.remove({ params: { id, setupId } }).pipe(Effect.asVoid, Effect.mapError(failure))
})
