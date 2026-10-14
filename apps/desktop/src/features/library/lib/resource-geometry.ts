import { cam } from "@cadcamfun/core"
import { Schema } from "effect"
import type { Element } from "../../cad/store/elementsStore.ts"
import { componentChildren } from "../../cad/lib/component-assembly.ts"

const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
const Elements = Schema.Array(Schema.Record(Schema.String, Schema.Unknown))

const decodeDocument = (input: unknown): unknown => {
  let value = input
  for (let depth = 0; depth < 4 && typeof value === "string"; depth += 1) {
    try { value = JSON.parse(value) as unknown } catch { return input }
  }
  return value
}

const pointRecords = (vertices: unknown): unknown => {
  if (!Array.isArray(vertices)) return vertices
  if (typeof vertices[0] === "number") {
    const values = vertices as number[]
    return values.reduce<Array<{ x: number; y: number; z: number }>>((points, value, index) => {
      if (index % 3 === 0 && values[index + 1] !== undefined && values[index + 2] !== undefined) points.push({ x: value, y: values[index + 1]!, z: values[index + 2]! })
      return points
    }, [])
  }
  return vertices.map((vertex) => Array.isArray(vertex)
    ? { x: Number(vertex[0]) || 0, y: Number(vertex[1]) || 0, z: Number(vertex[2]) || 0 }
    : vertex)
}

const triangleRecords = (faces: unknown): unknown => {
  if (!Array.isArray(faces) || Array.isArray(faces[0])) return faces
  return (faces as number[]).reduce<number[][]>((triangles, value, index, values) => {
    if (index % 3 === 0 && values[index + 1] !== undefined && values[index + 2] !== undefined) triangles.push([value, values[index + 1]!, values[index + 2]!])
    return triangles
  }, [])
}

/** Read current saved documents and the nested envelopes used by older component records. */
export const resourceElements = (data: unknown): Element[] => {
  const value = decodeDocument(data)
  if (Array.isArray(value)) return resourceElements({ elements: value })
  const root = record(value)
  const envelopes = [root]
  let candidate: unknown
  for (let index = 0; index < envelopes.length && index < 16; index += 1) {
    const envelope = envelopes[index]!
    const geometry = record(decodeDocument(envelope["geometry"]))
    candidate = envelope["elements"] ?? envelope["children"] ?? envelope["parts"] ?? geometry["elements"]
    if (Array.isArray(candidate) && candidate.length > 0) break
    const mesh = Object.keys(geometry).length > 0 ? geometry : envelope
    if ((Array.isArray(mesh["vertices"]) && Array.isArray(mesh["faces"])) || (Array.isArray(mesh["positions"]) && Array.isArray(mesh["indices"]))) {
      const vertices = pointRecords(mesh["vertices"] ?? mesh["positions"])
      const faces = triangleRecords(mesh["faces"] ?? mesh["indices"])
      candidate = [{ ...mesh, type: "mesh", vertices, faces }]
      break
    }
    for (const key of ["data", "component", "componentData", "model", "assembly", "geometry"]) {
      const nested = record(decodeDocument(envelope[key]))
      if (Object.keys(nested).length > 0 && !envelopes.includes(nested)) envelopes.push(nested)
    }
    candidate = undefined
  }
  if (candidate === undefined && typeof root["type"] === "string") candidate = [root]
  const decoded = Schema.decodeUnknownOption(Elements)(candidate ?? [])
  if (decoded._tag === "None") return []
  return decoded.value.filter((element) => typeof element["type"] === "string").map((element, index) => {
    const rawType = String(element["type"])
    const type = rawType === "box" || rawType === "rectangular-prism" || rawType === "rectangularPrism" ? "cube" : rawType
    const rawVertices = element["vertices"]
    return {
      ...element,
      ...(type !== rawType ? { type } : {}),
      ...(Array.isArray(rawVertices) ? { vertices: pointRecords(rawVertices) } : {}),
      ...(Array.isArray(element["indices"]) && !Array.isArray(element["faces"]) ? { faces: triangleRecords(element["indices"]) } : {}),
      id: typeof element["id"] === "string" ? element["id"] : `preview-${index}`,
      type,
      x: typeof element["x"] === "number" ? element["x"] : 0,
      y: typeof element["y"] === "number" ? element["y"] : 0,
      z: typeof element["z"] === "number" ? element["z"] : 0,
      layerId: typeof element["layerId"] === "string" ? element["layerId"] : "default"
    } as Element
  })
}

/** Resolve Boolean operands in this saved document, never in the active editor's store. */
export const resourcePreviewElements = (elements: ReadonlyArray<Element>): Element[] => {
  const resolved = new Map<string, Element>(), consumed = new Set<string>()
  for (const element of elements) {
    if (!cam.model.isBooleanElement(element)) continue
    const result = cam.model.booleanElementMesh(elements, element)
    if (!result) continue
    const vertices = []
    for (let at = 0; at < result.mesh.positions.length; at += 3) vertices.push({ x: result.mesh.positions[at]!, y: result.mesh.positions[at + 1]!, z: result.mesh.positions[at + 2]! })
    const faces = []
    for (let at = 0; at < result.mesh.indices.length; at += 3) faces.push([result.mesh.indices[at]!, result.mesh.indices[at + 1]!, result.mesh.indices[at + 2]!])
    resolved.set(element.id, { id: element.id, type: "mesh", layerId: element.layerId, vertices, faces, color: element["color"] ?? "#8fa3b8" })
    if (Array.isArray(element["operands"])) for (const id of element["operands"]) if (typeof id === "string") consumed.add(id)
  }
  return elements.filter((element) => !consumed.has(element.id)).map((element) => {
    if (resolved.has(element.id)) return resolved.get(element.id)!
    if (cam.model.isBooleanElement(element)) throw new Error("Saved Boolean geometry is incomplete")
    const children = componentChildren(element)
    return { ...element, tolerance: element["tolerance"] ?? 0.01, ...(children.length ? { elements: resourcePreviewElements(children) } : {}) }
  })
}

