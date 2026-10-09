/** Geometry identity for correlating the stored drawing with an actual viewport capture. */
const PRESENTATION = new Set(["layer", "layerId", "name", "description", "visible", "locked", "selected", "color", "opacity", "wireframe", "linewidth", "originalData"])
const canonical = (value: unknown, element = false): unknown => {
  if (ArrayBuffer.isView(value)) return Array.from(value as unknown as ArrayLike<number>)
  if (Array.isArray(value)) return value.map((v) => canonical(v))
  if (value === null || typeof value !== "object") return value
  const record = value as Record<string, unknown>
  return Object.fromEntries(Object.keys(record).sort().filter((key) => (!element || !PRESENTATION.has(key)) && record[key] !== undefined).map((key) => [key, key === "elements" && Array.isArray(record[key]) ? record[key].map((child) => canonical(child, true)) : canonical(record[key])]))
}
export const sceneGeometryText = (elements: ReadonlyArray<unknown>): string => JSON.stringify(elements.map((e) => canonical(e, true)))
