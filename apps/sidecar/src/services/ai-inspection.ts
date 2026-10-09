import { historySchema } from "@cadcamfun/ai"
import { usesOf, resolveParameters } from "@cadcamfun/core"

type Element = Record<string, unknown> & { id: string; type: string }
/** Bound expensive property values, while providing an exact paging path for every omitted value. */
export const inspectProperties = (element: Element) => {
  let remaining = 6000
  return Object.fromEntries(Object.entries(element).map(([key, value]) => {
  const json = JSON.stringify(value)
  const length = (json?.length ?? 0) + key.length
  if (length <= Math.min(4000, remaining)) { remaining -= length; return [key, value] }
  return [key, { omitted: true, chars: json?.length, readWith: { action: "property", elementId: element.id, path: [key], offset: 0 } }]
  }))
}

export const readProperty = (element: Element, path: ReadonlyArray<string>, offset: number, maxChars: number) => {
  let value: unknown = element
  for (const key of path) {
    if (value === null || typeof value !== "object" || ["__proto__", "prototype", "constructor"].includes(key) || !Object.hasOwn(value, key)) return { ok: false, error: "Property path not found." }
    value = (value as Record<string, unknown>)[key]
  }
  const content = JSON.stringify(value)
  if (content === undefined || offset > content.length) return { ok: false, error: "Property offset is out of range." }
  return { ok: true, elementId: element.id, path, encoding: "json", content: content.slice(offset, offset + maxChars), totalChars: content.length, nextOffset: offset + maxChars < content.length ? offset + maxChars : null }
}

/** Real nominal relationships, with no guessed mating constraints or inferred shared parameter bindings. */
export const componentParameters = (element: Record<string, unknown>, prefix = "", depth = 0): unknown[] => {
  if (depth > 10) return [{ omitted: true, reason: "Maximum component nesting depth" }]
  const decoded = historySchema.safeParse(element["history"])
  const own = decoded.success ? [{ path: prefix || String(element["id"] ?? "root"), parameters: decoded.data.parameters, resolved: resolveParameters(decoded.data.parameters).values, dependencies: Object.keys(decoded.data.parameters).map((name) => ({ name, ...usesOf(decoded.data, name) })) }] : []
  const children = Array.isArray(element["elements"]) ? element["elements"] : []
  return [...own, ...children.slice(0, 100).flatMap((child, index) => child !== null && typeof child === "object" ? componentParameters(child as Record<string, unknown>, `${prefix}/elements/${index}`, depth + 1) : [])]
}
