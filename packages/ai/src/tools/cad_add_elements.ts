import { z } from "zod"
import { ELEMENT_TYPES, MAX_ELEMENTS_PER_CALL, normalizeElement } from "../element-catalog.ts"
import { defineTool } from "./define.ts"

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
    const first = group[0]!.element
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

/** Builds geometry in the editor's own element format: the way objects are created, in 3D. */
export const cadAddElements = defineTool("cad_add_elements", {
  parameters: z.object({ elements: z.array(z.looseObject({ type: z.enum(ELEMENT_TYPES as unknown as [string, ...string[]]) })).min(1).max(MAX_ELEMENTS_PER_CALL) }),
  execute: async ({ elements }, { handlers, projectId }) => {
    // Every element is judged on its own: the valid ones are added and the rest are named, so one slip never costs the whole call.
    const checked = elements.map((element, index) => ({ index, result: normalizeElement(element) }))
    const skipped: Array<{ index: number; error: string }> = []
    const warnings: string[] = []
    let kept = checked.flatMap(({ index, result }) => {
      if (!result.ok) { skipped.push({ index, error: result.error }); return [] }
      if (result.warning !== undefined) warnings.push(`elements[${index}]: ${result.warning}`)
      return [{ index, element: result.element }]
    })
    // A boolean whose operand (an earlier element of this call, by index) was skipped cannot be built; that goes on until stable.
    for (let changed = true; changed;) {
      changed = false
      const alive = new Set(kept.map((k) => k.index))
      kept = kept.filter(({ index, element }) => {
        if (!isBoolean(element) || !Array.isArray(element["operands"])) return true
        const missing = (element["operands"] as unknown[]).find((o) => typeof o === "number" && !alive.has(o))
        if (missing === undefined) return true
        skipped.push({ index, error: `its operand elements[${String(missing)}] was not added` })
        changed = true
        return false
      })
    }
    if (kept.length === 0) {
      return { ok: false, error: "Nothing was added: every element was invalid.", problems: skipped.sort((a, b) => a.index - b.index).map((s) => `elements[${s.index}]: ${s.error}`) }
    }
    kept = groupIntoComponents(kept)
    // The handler counts operand indexes in the batch it receives, which is now the kept elements.
    const newIndex = new Map(kept.map((k, position) => [k.index, position]))
    const batch = kept.map(({ element }) => isBoolean(element) && Array.isArray(element["operands"])
      ? { ...element, operands: (element["operands"] as unknown[]).map((o) => (typeof o === "number" ? newIndex.get(o) ?? o : o)) }
      : element)
    const stored = await handlers.addElements(projectId, batch)
    if (stored === null || typeof stored !== "object") return stored
    const out: Record<string, unknown> = { ...stored }
    if (skipped.length > 0) {
      out["skipped"] = skipped.sort((a, b) => a.index - b.index).map((s) => ({ index: s.index, error: s.error }))
      out["note"] = `${kept.length} of ${elements.length} elements were added. Send only the skipped ones again, corrected; the rest are already in the drawing.`
    }
    if (warnings.length > 0) out["warnings"] = warnings
    return out
  }
})
