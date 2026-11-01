/**
 * Export actions: `cad_edit.export` writes the exact solids of the open drawing (or a history sent inline) as a file, and
 * `cam_edit.export` writes a stored program or the stock a verified program leaves. Both store a real file in the project's
 * export folder and answer with its name, key, size and hash, never with the bytes (a mesh would swamp the context).
 */
import { Schema } from "effect"

const optional = Schema.optionalKey
const nonEmpty = Schema.String.check(Schema.isMinLength(1))
const positive = Schema.Finite.check(Schema.isGreaterThan(0))
const record = Schema.Record(Schema.String, Schema.Unknown)

export const CAD_EXPORT_FORMATS = ["stl", "stl_ascii", "obj", "3mf", "step", "iges"] as const
export const CAM_STOCK_EXPORT_FORMATS = ["stl", "stl_ascii", "obj", "3mf"] as const
export const NC_EXTENSIONS = ["nc", "tap", "gcode", "ngc", "mpf", "h", "txt"] as const

/** A file name without a folder or an extension: the host adds the extension of the format and keeps the file inside the project. */
const fileStem = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(80), Schema.isPattern(/^[A-Za-z0-9][A-Za-z0-9 _.\-()]*$/))
const unit = Schema.Literals(["micron", "millimeter", "centimeter", "meter", "inch", "foot"])

export const CadExportInput = Schema.Struct({
  format: Schema.Literals(CAD_EXPORT_FORMATS),
  /** Elements of the open drawing to export (each needs an exact solid); omit for every exact solid of the drawing. */
  ids: optional(Schema.Array(nonEmpty).check(Schema.isMinLength(1), Schema.isMaxLength(200))),
  /** Or a parametric history sent inline, rebuilt exactly (nothing is stored in the drawing). Not together with `ids`. */
  history: optional(record),
  name: optional(fileStem),
  /** 3MF only: the unit written (default millimeter). STL and OBJ are always millimetres. */
  unit: optional(unit),
  /** Chord tolerance of the triangles, mm (default from the kernel). Smaller is finer and larger. */
  tolerance: optional(positive)
}).annotate({ description: "Write the exact solids as an STL, OBJ, 3MF, STEP or IGES file in the project's export folder." })
export type CadExportInput = typeof CadExportInput.Type

export const CamExportInput = Schema.Struct({
  kind: Schema.Literals(["program", "stock"]),
  operationId: nonEmpty,
  /** stock: stl (default), stl_ascii, obj or 3mf. Ignored for a program. */
  format: optional(Schema.Literals(CAM_STOCK_EXPORT_FORMATS)),
  /** program: the file extension of the NC file (default nc; use the one the controller reads). */
  extension: optional(Schema.Literals(NC_EXTENSIONS)),
  name: optional(fileStem),
  unit: optional(unit)
}).annotate({ description: "Write a stored NC program, or the stock its verification leaves, as a file in the project's export folder." })
export type CamExportInput = typeof CamExportInput.Type

/** What the host stores for one export: `key` is relative to the project's export folder, never an absolute path. */
export const ExportedFile = Schema.Struct({
  name: Schema.String, key: Schema.String, mime: Schema.String,
  bytes: Schema.Int, sha256: Schema.String
})
export type ExportedFile = typeof ExportedFile.Type
