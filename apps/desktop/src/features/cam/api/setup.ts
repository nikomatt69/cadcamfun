/**
 * The multi-operation setup as an Effect service over the typed HTTP API (`camSetup` group, spec 14 §4). The desktop store is an
 * adapter over this interface, not a second planner.
 */
import { Effect } from "effect"
import type { CamSetupGenerated, CamSetupPlan, CamSetupValidation } from "@cadcamfun/api"
import type { Client } from "../../../shared/state/client.ts"
import { ToolpathGeneratorError } from "./generator.ts"

export type SetupRequest = Parameters<Client["camSetup"]["plan"]>[0]["payload"]
export type SetupGenerateRequest = Parameters<Client["camSetup"]["generate"]>[0]["payload"]

const failure = (cause: unknown): ToolpathGeneratorError => {
  const message = typeof cause === "object" && cause !== null && "message" in cause && typeof cause.message === "string" && cause.message !== "" ? cause.message : cause instanceof Error ? cause.message : String(cause)
  return new ToolpathGeneratorError({ message })
}

export interface SetupService {
  readonly plan: (request: SetupRequest) => Effect.Effect<CamSetupPlan, ToolpathGeneratorError>
  readonly validate: (request: SetupRequest) => Effect.Effect<CamSetupValidation, ToolpathGeneratorError>
  readonly generate: (request: SetupGenerateRequest) => Effect.Effect<CamSetupGenerated, ToolpathGeneratorError>
}

export const makeSetupService = (client: Client): SetupService => ({
  plan: (payload) => client.camSetup.plan({ payload }).pipe(Effect.mapError(failure)),
  validate: (payload) => client.camSetup.validate({ payload }).pipe(Effect.mapError(failure)),
  generate: (payload) => client.camSetup.generate({ payload }).pipe(Effect.mapError(failure))
})
