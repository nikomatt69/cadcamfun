/**
 * What gets printed: the solids among the CAD elements the user selected. A Boolean element is its real result (the operands it
 * consumes are not printed on their own); containers are printed through their members; anything that has no volume (a line,
 * a sketch, text drawn as strokes) is reported and left out.
 */
import { booleanAll } from "../../cad/csg.ts"
import { flattenElements } from "../generator/elements.ts"
import type { CadElement } from "../generator/schema.ts"
import { booleanElementMesh, consumedOperands, isBooleanElement } from "../model/boolean-mesh.ts"
import { elementMesh, meshBounds, type Mesh64 } from "../model/element-mesh.ts"
import { printSolidIssue } from "./slice.ts"

export interface PrintBodies {
  readonly meshes: ReadonlyArray<Mesh64>
  /** Elements that are not solids, by type and name. */
  readonly skipped: ReadonlyArray<string>
  readonly warnings: ReadonlyArray<string>
  /** Invalid declared geometry. A request with any error produces no subset of its meshes. */
  readonly errors: ReadonlyArray<string>
}

const label = (e: CadElement): string => `${String(e["type"])}${typeof e["name"] === "string" ? ` "${e["name"]}"` : typeof e["id"] === "string" ? ` (${e["id"]})` : ""}`

const wide = (m: { readonly positions: ArrayLike<number>; readonly indices: ArrayLike<number> }): Mesh64 => ({ positions: Float64Array.from(m.positions), indices: Uint32Array.from(m.indices) })

/** Read source values before legacy placement and mesh adapters can replace malformed data with defaults. */
const sourceIssue = (e: CadElement): string | undefined => {
  for (const field of ["x", "y", "z", "translateX", "translateY", "translateZ"]) {
    if (e[field] !== undefined && !Number.isFinite(e[field])) return `${label(e)}: ${field} must be finite`
  }
  for (const field of ["rotation", "scale"]) {
    const vector = e[field]
    if (vector === undefined) continue
    if (typeof vector !== "object" || vector === null || Array.isArray(vector)) return `${label(e)}: ${field} must be an XYZ object`
    for (const axis of ["x", "y", "z"]) {
      const value = (vector as Readonly<Record<string, unknown>>)[axis]
      if (value !== undefined && !Number.isFinite(value)) return `${label(e)}: ${field}.${axis} must be finite`
    }
  }
  if (e["type"] === "mesh") {
    const vertices = e["vertices"], faces = e["faces"]
    if (!Array.isArray(vertices) || vertices.length < 3) return `${label(e)}: mesh vertices are missing`
    if (!Array.isArray(faces) || faces.length === 0) return `${label(e)}: mesh faces are missing`
    for (let i = 0; i < vertices.length; i++) {
      const vertex: unknown = vertices[i]
      if (typeof vertex !== "object" || vertex === null || ["x", "y", "z"].some((a) => !Number.isFinite((vertex as Readonly<Record<string, unknown>>)[a]))) return `${label(e)}: mesh vertex ${i} requires finite XYZ coordinates`
    }
    for (let i = 0; i < faces.length; i++) {
      const face: unknown = faces[i]
      if (!Array.isArray(face) || face.length < 3) return `${label(e)}: mesh face ${i} needs at least three vertex indices`
      if (!face.every((v) => Number.isInteger(v) && v >= 0 && v < vertices.length)) return `${label(e)}: mesh face ${i} contains an invalid vertex index`
    }
  }
  if (["component", "group", "composite"].includes(String(e["type"]))) {
    const children = e["elements"]
    if (children !== undefined && !Array.isArray(children)) return `${label(e)}: container elements must be an array`
    if (Array.isArray(children)) for (const child of children) {
      if (typeof child !== "object" || child === null || Array.isArray(child)) return `${label(e)}: a container child is not an element`
      const problem = sourceIssue(child as CadElement)
      if (problem !== undefined) return problem
    }
  }
  return undefined
}

const overlap = (a: Mesh64, b: Mesh64): boolean => {
  const p = meshBounds(a)
  const q = meshBounds(b)
  return p.min[0] < q.max[0] && p.max[0] > q.min[0] && p.min[1] < q.max[1] && p.max[1] > q.min[1] && p.min[2] < q.max[2] && p.max[2] > q.min[2]
}

export const printBodies = (selected: ReadonlyArray<CadElement>): PrintBodies => {
  const sourceErrors = selected.flatMap((e) => { const problem = sourceIssue(e); return problem === undefined ? [] : [problem] })
  if (sourceErrors.length > 0) return { meshes: [], skipped: [], warnings: [], errors: sourceErrors }
  const flat = flattenElements(selected)
  const consumed = consumedOperands(flat)
  const meshes: Mesh64[] = []
  const skipped: string[] = []
  const warnings: string[] = []
  const errors: string[] = []
  const append = (mesh: Mesh64, e: CadElement, keep = true): void => {
    const problem = printSolidIssue(mesh)
    if (problem !== undefined) errors.push(`${label(e)}: ${problem}`)
    else if (keep) meshes.push(mesh)
  }
  for (const e of flat) {
    const id = typeof e["id"] === "string" ? e["id"] : undefined
    try {
      if (id !== undefined && consumed.has(id)) {
        // A Boolean must not conceal an invalid source mesh among its consumed operands.
        if (e["type"] === "mesh") { const mesh = elementMesh(e); if (mesh === undefined) errors.push(`${label(e)}: source mesh could not be read`); else append(mesh, e, false) }
        continue
      }
      if (isBooleanElement(e)) {
        const result = booleanElementMesh(flat, e)
        warnings.push(...(result?.warnings ?? []))
        if (result === undefined) errors.push(`${label(e)}: Boolean result could not be meshed`)
        else append(wide(result.mesh), e)
        continue
      }
      const mesh = elementMesh(e)
      if (mesh !== undefined) append(mesh, e)
      else if (["mesh", "brep", "parametric"].includes(String(e["type"]))) errors.push(`${label(e)}: declared solid could not be meshed`)
      else skipped.push(label(e))
    } catch (cause) {
      errors.push(`${label(e)}: ${cause instanceof Error ? cause.message : String(cause)}`)
    }
  }
  if (errors.length > 0) return { meshes: [], skipped, warnings, errors }
  // Solids that cross each other are one body: their union is what gets printed, not two shells through each other.
  const touching = meshes.some((a, i) => meshes.some((b, j) => j > i && overlap(a, b)))
  if (touching && meshes.length > 1) {
    try {
      const united = booleanAll(meshes.map((m) => ({ positions: Float32Array.from(m.positions), indices: m.indices })), "union")
      const result = wide(united)
      const problem = printSolidIssue(result)
      if (problem !== undefined) return { meshes: [], skipped, warnings, errors: [`United print bodies: ${problem}`] }
      return { meshes: [result], skipped, warnings, errors }
    } catch (cause) {
      return { meshes: [], skipped, warnings, errors: [`Overlapping solids could not be united (${cause instanceof Error ? cause.message : String(cause)}); no partial print was produced`] }
    }
  }
  return { meshes, skipped, warnings, errors }
}
