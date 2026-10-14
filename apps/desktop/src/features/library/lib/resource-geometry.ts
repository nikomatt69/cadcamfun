import { cam } from "@cadcamfun/core"
import { Schema } from "effect"
import type { Element } from "../../cad/store/elementsStore.ts"
import { componentChildren } from "../../cad/lib/component-assembly.ts"

const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
const Elements = Schema.Array(Schema.Record(Schema.String, Schema.Unknown))

/** Read saved documents, legacy geometry envelopes and direct component records. */
export const resourceElements = (data: unknown): Element[] => {
  if (typeof data === "string") { try { data = JSON.parse(data) } catch { return [] } }
  const value = record(data), geometry = record(value["geometry"])
  const decoded = Schema.decodeUnknownOption(Elements)(value["elements"] ?? geometry["elements"] ?? (value["type"] ? [value] : []))
  if (decoded._tag === "None") return []
  return decoded.value.filter((element) => typeof element["type"] === "string").map((element, index) => ({
    ...element, id: typeof element["id"] === "string" ? element["id"] : `preview-${index}`,
    type: String(element["type"]), layerId: typeof element["layerId"] === "string" ? element["layerId"] : "default"
  }))
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

