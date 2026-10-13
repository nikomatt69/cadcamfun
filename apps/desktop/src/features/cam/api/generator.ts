/**
 * The toolpath generator as an Effect service over the typed HTTP API.
 *
 * The UI never builds G-code itself: it describes the job (settings, geometry, stock, selected
 * elements) and the sidecar's `toolpathGenerator` group runs `cam.generator` from `@cadcamfun/core`.
 * Every call is typed by the endpoint Schemas and fails with one tagged error whose `message` is what
 * the panel shows (the legacy panel's toast / red box).
 */
import { Context, Effect, Layer, Schema } from "effect"
import { cam } from "@cadcamfun/core"
import type { Client } from "../../../shared/state/client.ts"
import type { CamKernelRequest, CamKernelResult } from "@cadcamfun/api"

export type GenerateRequest = Parameters<Client["toolpathGenerator"]["generate"]>[0]["payload"]
export type SuggestRequest = Parameters<Client["toolpathGenerator"]["suggest"]>[0]["payload"]
export type GenerateResponse = typeof cam.generator.GenerateResponseSchema.Type
export type SuggestResponse = typeof cam.generator.SuggestResponseSchema.Type
export type ParseResponse = typeof cam.generator.ParseResponseSchema.Type
export type VerifyRequest = typeof cam.verify.VerifyRequestSchema.Type
export type VerifyResponse = typeof cam.verify.VerifyResponseSchema.Type

export class ToolpathGeneratorError extends Schema.TaggedError<ToolpathGeneratorError>()("ToolpathGeneratorError", {
  message: Schema.String
}) {}

const messageOf = (cause: unknown): string => {
  if (typeof cause === "object" && cause !== null && "message" in cause && typeof cause.message === "string" && cause.message !== "") return cause.message
  return cause instanceof Error ? cause.message : String(cause)
}

const failure = (cause: unknown): ToolpathGeneratorError => new ToolpathGeneratorError({ message: messageOf(cause) })

export interface ToolpathGeneratorService {
  readonly manufacture: (request: CamKernelRequest) => Effect.Effect<CamKernelResult, ToolpathGeneratorError>
  /** Runs the generator for a job. */
  readonly generate: (request: GenerateRequest) => Effect.Effect<GenerateResponse, ToolpathGeneratorError>
  /** Element-driven parameters, cutting feedback and stock warnings for the current job. */
  readonly suggest: (request: SuggestRequest) => Effect.Effect<SuggestResponse, ToolpathGeneratorError>
  /** Statistics and IR of arbitrary G-code text (pasted, imported or edited). */
  readonly parse: (gcode: string, name?: string) => Effect.Effect<ParseResponse, ToolpathGeneratorError>
  /** Replays G-code against the stock: removal, collisions, gouges. */
  readonly verify: (request: VerifyRequest) => Effect.Effect<VerifyResponse, ToolpathGeneratorError>
}

export const makeToolpathGenerator = (client: Client): ToolpathGeneratorService => ({
  manufacture: (payload) => client.toolpathGenerator.manufacture({ payload }).pipe(Effect.mapError(failure)),
  generate: (payload) => client.toolpathGenerator.generate({ payload }).pipe(Effect.mapError(failure)),
  suggest: (payload) => client.toolpathGenerator.suggest({ payload }).pipe(Effect.mapError(failure)),
  parse: (gcode, name) => client.toolpathGenerator.parse({ payload: { gcode, name: name ?? "Program" } }).pipe(Effect.mapError(failure)),
  verify: (payload) => client.toolpathGenerator.verify({ payload }).pipe(Effect.mapError(failure))
})

export class ToolpathGenerator extends Context.Service<ToolpathGenerator, ToolpathGeneratorService>()("cadcamfun/ToolpathGenerator") {
  static readonly layer = (client: Client): Layer.Layer<ToolpathGenerator> => Layer.succeed(ToolpathGenerator, makeToolpathGenerator(client))
}
