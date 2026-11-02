import { normalizeElement } from "./element-catalog.ts"

const isBoolean = (e: Record<string, unknown>): boolean => typeof e["type"] === "string" && (e["type"] as string).startsWith("boolean-")
const isContainer = (e: Record<string, unknown>): boolean => e["type"] === "component" || e["type"] === "group"

/**
 * Elements that name the same `component` become the children of one `component` element (placed at its first child's
 * position, children relative to it), so a model that cannot write nested arguments still builds assemblies: it only names the
 * part each solid belongs to. An element a Boolean refers to by index, a Boolean and a container stay on their own.
 */
export const groupIntoComponents = <T extends { readonly index: number; readonly element: Record<string, unknown> }>(kept: ReadonlyArray<T>): T[] => {
  const referenced = new Set<number>()
  for (const { element } of kept) if (isBoolean(element) && Array.isArray(element["operands"])) for (const o of element["operands"] as unknown[]) if (typeof o === "number") referenced.add(o)
  const members = new Map<string, T[]>()
  for (const entry of kept) {
    const name = entry.element["component"]
    if (typeof name !== "string" || name.trim() === "" || isBoolean(entry.element) || isContainer(entry.element) || referenced.has(entry.index)) continue
    members.set(name.trim(), [...(members.get(name.trim()) ?? []), entry])
  }
  const grouped = new Set<T>()
  const out: T[] = []
  for (const entry of kept) {
    const name = typeof entry.element["component"] === "string" ? entry.element["component"].trim() : ""
    const group = members.get(name)
    // Not a member (a Boolean operand, a container, no name): it stays as it is.
    if (group === undefined || !group.includes(entry)) { out.push(entry); continue }
    if (grouped.has(entry)) continue
    for (const member of group) grouped.add(member)
    const first = group[0]?.element
    if (first === undefined) { out.push(entry); continue }
    const origin = { x: Number(first["x"]) || 0, y: Number(first["y"]) || 0, z: Number(first["z"]) || 0 }
    const children = group.map(({ element }) => {
      const { component: _component, layer: _layer, layerId: _layerId, ...child } = element
      return { ...child, x: (Number(child["x"]) || 0) - origin.x, y: (Number(child["y"]) || 0) - origin.y, z: (Number(child["z"]) || 0) - origin.z }
    })
    const layer = first["layer"] ?? first["layerId"]
    const container = normalizeElement({ type: "component", name, ...origin, elements: children, ...(layer !== undefined ? { layer } : {}) })
    if (container.ok) out.push({ ...entry, element: container.element })
    else for (const member of group) out.push(member)
  }
  return out
}

