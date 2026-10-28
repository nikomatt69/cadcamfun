import { meshAttachment } from "../../ai/lib/mesh-attachment.ts"

/**
 * The elements a mesh file (STL, OBJ, PLY) adds to the drawing, decoded with the same Three.js loaders the
 * assistant attachments use, so an imported mesh renders, measures and machines like one the assistant added.
 * Throws the loader's own reason when the file holds no usable triangles.
 */
export const meshFileElements = async (
  file: Pick<File, "name" | "arrayBuffer" | "text">
): Promise<ReadonlyArray<Record<string, unknown>>> => {
  const parsed: unknown = JSON.parse(await meshAttachment(file))
  const elements = parsed !== null && typeof parsed === "object" ? (parsed as { elements?: unknown }).elements : undefined
  if (!Array.isArray(elements) || elements.length === 0) throw new Error("No triangle mesh was found in the file.")
  return elements as ReadonlyArray<Record<string, unknown>>
}
