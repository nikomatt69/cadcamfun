import { Schema } from "effect"
import { cam } from "@cadcamfun/core"
import { CamKernelArtifact, CamKernelRequest } from "./cam-kernel.ts"

export const CamProgramOperation = Schema.Struct({
  id: Schema.NonEmptyString, name: Schema.String, gcode: Schema.String, program: cam.ProgramSchema,
  tool: Schema.optionalKey(Schema.String), settings: Schema.optionalKey(cam.generator.ToolpathSettingsSchema),
  elementIds: Schema.optionalKey(Schema.Array(Schema.String))
})
export type CamProgramOperation = typeof CamProgramOperation.Type

/** Preserve operation order and identity in both the saved document and workspace. */
export const combineCamOperations = (results: ReadonlyArray<CamProgramOperation>): { readonly program: cam.Program; readonly gcode: string } => {
  if (results.length === 0) return { program: cam.makeProgram("untitled", [], {}), gcode: "" }
  const first = results[0]!.program
  const toolpaths = results.flatMap((r) => r.program.toolpaths.map((tp) => ({ ...tp, id: `${r.id}:${tp.id}`, toolId: r.tool ?? `${r.id}:${tp.toolId}`, name: results.length > 1 ? `${r.name} · ${tp.name}` : tp.name })))
  const program = cam.makeProgram(results.length > 1 ? `${results.length} operations` : first.name, toolpaths, { units: first.units, workOffset: first.workOffset })
  const gcode = results.length === 1 ? results[0]!.gcode : results.map((r, i) => `; ===== Operation ${i + 1}/${results.length}: ${r.name} =====\n${r.gcode.trimEnd()}`).join("\n\n")
  return { program, gcode }
}

/** Portable export and Toolpath.data use one contract; NC and IR travel together. */
export const CamProgramDocument = Schema.Struct({
  format: Schema.Literal("cadcamfun-cam"), version: Schema.Literal(1), gcode: Schema.String,
  program: cam.ProgramSchema, settings: cam.generator.ToolpathSettingsSchema, printer: cam.generator.PrinterExtrasSchema,
  stock: cam.generator.StockSchema, drawing: Schema.Record(Schema.String, Schema.Unknown),
  operations: Schema.optionalKey(Schema.Array(CamProgramOperation)),
  kernelArtifact: Schema.optionalKey(CamKernelArtifact), kernelRequest: Schema.optionalKey(CamKernelRequest)
})
export type CamProgramDocument = typeof CamProgramDocument.Type
