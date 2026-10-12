import type { OcctModule, OcctNode } from "occt-import-js"
export type NeutralCadFormat = "step" | "iges" | "brep"

/** Convert OpenCascade's actual triangulation to the editor's established mesh representation. */
export const decodeCadFile = (kernel: OcctModule, format: NeutralCadFormat, bytes: Uint8Array, name: string, tolerance = 0.01) => {
  if (bytes.length === 0 || bytes.length > 5 * 1024 * 1024) throw new Error("Neutral CAD files must contain at most 5 MB.")
  if (!Number.isFinite(tolerance) || tolerance <= 0) throw new Error("CAD tessellation tolerance must be positive mm.")
  const parameters = { linearUnit: "millimeter", linearDeflectionType: format === "brep" ? "bounding_box_ratio" : "absolute_value", linearDeflection: format === "brep" ? 0.001 : tolerance, angularDeflection: 0.1 }
  const result = format === "step" ? kernel.ReadStepFile(bytes, parameters) : format === "iges" ? kernel.ReadIgesFile(bytes, parameters) : kernel.ReadBrepFile(bytes, parameters)
  if (!result.success || !result.meshes?.length) throw new Error(`OpenCascade could not read triangle geometry from this ${format.toUpperCase()} file.`)
  if (result.meshes.length > 40) throw new Error("CAD file contains more than 40 mesh objects. Split the source assembly.")
  const paths = new Map<number, string[][]>()
  const visit = (node: OcctNode, path: string[], depth = 0) => {
    if (depth > 24) throw new Error("CAD assembly hierarchy exceeds 24 levels.")
    const next = [...path, node.name]
    for (const index of node.meshes) paths.set(index, [...(paths.get(index) ?? []), next])
    for (const child of node.children) visit(child, next, depth + 1)
  }
  if (result.root) visit(result.root, [])
  let triangles = 0
  const elements = result.meshes.map((mesh, meshIndex) => {
    const positions = mesh.attributes.position.array, indices = mesh.index.array
    triangles += indices.length / 3
    if (positions.length % 3 !== 0 || indices.length % 3 !== 0 || positions.length < 9 || indices.length < 3 || triangles > 30_000 || positions.length > 270_000) throw new Error("CAD tessellation exceeds supported mesh limits or has invalid topology. Use a simpler source model.")
    if (!positions.every(Number.isFinite) || !indices.every((i) => Number.isInteger(i) && i >= 0 && i < positions.length / 3)) throw new Error("OpenCascade returned invalid mesh coordinates or vertex indexes.")
    const vertices: Array<{ x: number; y: number; z: number }> = [], faces: number[][] = []
    for (let i = 0; i < positions.length; i += 3) vertices.push({ x: positions[i]!, y: positions[i + 1]!, z: positions[i + 2]! })
    for (let i = 0; i < indices.length; i += 3) faces.push([indices[i]!, indices[i + 1]!, indices[i + 2]!])
    const color = mesh.color?.map((c) => Math.round(Math.max(0, Math.min(1, c)) * 255).toString(16).padStart(2, "0")).join("")
    return { type: "mesh", name: mesh.name || name, vertices, faces, ...(color ? { color: `#${color}` } : {}), sourceMetadata: { decoder: "OpenCascade", format, units: format === "brep" ? "source units (BREP has no unit declaration)" : "mm", tessellation: parameters, assemblyPaths: paths.get(meshIndex) ?? [], brepFaces: mesh.brep_faces } }
  })
  const text = JSON.stringify({ format: "cadcamfun-mesh", source: { name, format, units: format === "brep" ? "source units" : "mm", decoder: "OpenCascade" }, elements })
  if (text.length > 2_000_000) throw new Error("Decoded CAD geometry exceeds the attachment size limit. Split or simplify the source model.")
  return text
}
