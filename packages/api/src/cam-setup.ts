import { Schema } from "effect"
import { cam } from "@cadcamfun/core"

const p = cam.program
const num = Schema.Finite
const int = Schema.Int

/** Plan or validate: the setup alone, no geometry (spec 14 §4). */
export const CamSetupRequest = Schema.Struct({ setup: p.SetupSchema })
export type CamSetupRequest = typeof CamSetupRequest.Type

/**
 * Generate: the setup plus the elements its operations name, resolved by the caller (the core does no I/O, so the request carries the
 * elements by id). `stock` is the generator's stock, shared by every operation.
 */
export const CamSetupGenerateRequest = Schema.Struct({
  setup: p.SetupSchema,
  elements: Schema.Record(Schema.String, Schema.Record(Schema.String, Schema.Json)),
  stock: Schema.optionalKey(cam.generator.StockSchema)
})
export type CamSetupGenerateRequest = typeof CamSetupGenerateRequest.Type

export const CamSetupToolTableEntry = Schema.Struct({ pocket: int, tool: cam.ToolSchema, operationIds: Schema.Array(Schema.String) })

export const CamSetupPlannedProgram = Schema.Struct({
  name: Schema.String, programNumber: int, toolNumbers: Schema.Array(int), operations: Schema.Array(Schema.String)
})

export const CamSetupPlan = Schema.Struct({
  programs: Schema.Array(CamSetupPlannedProgram), toolTable: Schema.Array(CamSetupToolTableEntry),
  toolLoads: int, toolChanges: int, warnings: Schema.Array(Schema.String)
})
export type CamSetupPlan = typeof CamSetupPlan.Type

export const CamSetupIssue = Schema.Struct({ operationId: Schema.optionalKey(Schema.String), message: Schema.String })
export const CamSetupValidation = Schema.Struct({ issues: Schema.Array(CamSetupIssue) })
export type CamSetupValidation = typeof CamSetupValidation.Type

export const CamSetupProgram = Schema.Struct({
  name: Schema.String, programNumber: int, gcode: Schema.String, program: cam.ProgramSchema, stats: cam.generator.GcodeStatsSchema,
  warnings: Schema.Array(Schema.String), operationIds: Schema.Array(Schema.String), toolNumbers: Schema.Array(int)
})

export const CamSetupGenerated = Schema.Struct({
  programs: Schema.Array(CamSetupProgram), toolTable: Schema.Array(CamSetupToolTableEntry),
  totals: Schema.Struct({ programs: int, toolLoads: int, toolChanges: int, cutLength: num, rapidLength: num, estimatedSeconds: num }),
  warnings: Schema.Array(Schema.String), issues: Schema.Array(CamSetupIssue)
})
export type CamSetupGenerated = typeof CamSetupGenerated.Type
