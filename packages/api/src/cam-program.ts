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

/**
 * The stored form of one program a setup generated: the post-emitted multi-tool text with its IR (the per-part work offsets travel in
 * the toolpaths), under the first operation's settings. The CAM page opens it like any saved program; it holds no per-operation split
 * because the post wrote one program with its tool changes, not a concatenation of operations.
 */
export const setupProgramDocument = (input: {
  readonly program: { readonly gcode: string; readonly program: cam.Program }
  readonly setup: cam.program.Setup
  readonly stock: typeof cam.generator.StockSchema.Type
}): CamProgramDocument => ({
  format: "cadcamfun-cam", version: 1, gcode: input.program.gcode, program: input.program.program,
  settings: input.setup.operations.find((op) => op.enabled)?.params ?? input.setup.operations[0]!.params,
  printer: cam.generator.DEFAULT_PRINTER_EXTRAS, stock: input.stock, drawing: {}
})

/**
 * The generator stock a setup's programs are stored with: the drawing's configured stock, else the setup's own block (its corner and
 * top face turned into the centre and top the generator uses). Neither: undefined, and the caller says a stock is needed.
 */
export const stockOfSetup = (setup: cam.program.Setup, configured: typeof cam.generator.StockSchema.Type | undefined): typeof cam.generator.StockSchema.Type | undefined => {
  if (configured !== undefined) return configured
  const block = setup.stock
  if (block === undefined) return undefined
  return { width: block.x, height: block.y, depth: block.z, radius: 0, x: block.origin.x + block.x / 2, y: block.origin.y + block.y / 2, topZ: block.origin.z, allowance: 0, material: block.material }
}
