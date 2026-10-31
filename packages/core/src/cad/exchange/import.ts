/**
 * Mesh import with a validity report (spec 50 X8): one entry point for STL, OBJ and 3MF bytes that parses, converts to millimetres,
 * repairs and tells the truth about the result. `requireSolid` turns a mesh that is still not a closed manifold after repair into a
 * refusal that carries the defect list, so a caller never receives a leaky body as if it were sound.
 */
import { parseObj, parseStl, MeshFormatError, type NamedMesh } from "./mesh-formats.ts"
import { repairMesh, type MeshData, type MeshReport, type RepairOptions } from "./mesh-repair.ts"
import { read3mf, flatten3mf } from "./threemf.ts"

export type MeshFormat = "stl" | "obj" | "3mf"

export interface ImportOptions extends RepairOptions {
  /** Format; detected from the bytes when omitted. */
  readonly format?: MeshFormat
  /** Unit of an STL or OBJ (3MF declares its own). Default millimeter. */
  readonly unit?: string
  /** Refuse a mesh that is not a closed manifold after repair (default false: the report says so). */
  readonly requireSolid?: boolean
  /** Skip repair (the report still describes the raw mesh). */
  readonly repair?: boolean
}

export interface ImportedMesh {
  readonly name: string
  readonly mesh: MeshData
  readonly report: MeshReport
  /** Closed manifold with outward faces. */
  readonly solid: boolean
}

export type ImportResult =
  | { readonly ok: true; readonly format: MeshFormat; readonly meshes: ReadonlyArray<ImportedMesh> }
  | { readonly ok: false; readonly format?: MeshFormat; readonly error: string; readonly defects: ReadonlyArray<string> }

export const detectMeshFormat = (bytes: Uint8Array): MeshFormat | undefined => {
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b) return "3mf"
  const head = new TextDecoder().decode(bytes.subarray(0, 512))
  if (/^\s*solid\b/i.test(head) || (bytes.length >= 84 && 84 + 50 * new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(80, true) === bytes.length)) return "stl"
  if (/^\s*(#|v\s|o\s|g\s|mtllib)/m.test(head)) return "obj"
  return undefined
}

/** Imports STL, OBJ or 3MF bytes. Never throws for a bad file: the result is `ok: false` with the reason. */
export const importMesh = (bytes: Uint8Array, options: ImportOptions = {}): ImportResult => {
  const format = options.format ?? detectMeshFormat(bytes)
  if (format === undefined) return { ok: false, error: "The file is not recognised as STL, OBJ or 3MF", defects: [] }
  let raw: NamedMesh[]
  try {
    raw = format === "stl" ? parseStl(bytes, options.unit) : format === "obj" ? parseObj(new TextDecoder().decode(bytes), options.unit) : flatten3mf(read3mf(bytes)).map((o) => ({ name: o.name, mesh: o.mesh }))
  } catch (e) {
    if (e instanceof MeshFormatError || (e instanceof Error && e.name === "ZipError")) return { ok: false, format, error: e.message, defects: [] }
    throw e
  }
  if (raw.length === 0) return { ok: false, format, error: "The file contains no mesh", defects: [] }
  const meshes: ImportedMesh[] = raw.map(({ name, mesh }) => {
    const { mesh: out, report } = options.repair === false ? { mesh, report: repairMesh(mesh, { orient: false, tolerance: 0 }).report } : repairMesh(mesh, options)
    return { name, mesh: options.repair === false ? mesh : out, report, solid: report.after.solid }
  })
  if (options.requireSolid === true) {
    const bad = meshes.filter((m) => !m.solid)
    if (bad.length > 0) return { ok: false, format, error: `${bad.length} mesh(es) are not closed manifolds after repair`, defects: bad.flatMap((m) => m.report.remaining.map((r) => `${m.name}: ${r}`)) }
  }
  return { ok: true, format, meshes }
}
