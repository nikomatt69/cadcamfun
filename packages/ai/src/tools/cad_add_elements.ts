import { z } from "zod"
import { ELEMENT_TYPES, MAX_ELEMENTS_PER_CALL, normalizeElement } from "../element-catalog.ts"
import { defineTool } from "./define.ts"

const isBoolean = (e: Record<string, unknown>): boolean => typeof e["type"] === "string" && (e["type"] as string).startsWith("boolean-")

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
