import { expect, test } from "bun:test"
import { ELEMENT_SPECS, ELEMENT_TYPES, normalizeElement } from "../../../packages/ai/src/element-catalog.ts"
import { plateTemplate } from "@cadcamfun/core"
import { buildElementObject } from "../src/features/cad/lib/sceneHelpers.ts"
import { useElementsStore } from "../src/features/cad/store/elementsStore.ts"

// What the assistant creates must be drawable: each element type, as the catalogue normalises it, builds a Three object.
test("every element the assistant can create is drawn in the 3D view", () => {
  const store = useElementsStore.getState()
  const a = store.addElement({ type: "cube", x: 0, y: 0, z: 0, width: 20, height: 20, depth: 20 })
  const b = store.addElement({ type: "cylinder", x: 0, y: 0, z: 0, radius: 4, height: 40 })
  const needs: Record<string, Record<string, unknown>> = {
    "boolean-union": { operands: [a, b] }, "boolean-subtract": { operands: [a, b] }, "boolean-intersect": { operands: [a, b] },
    component: { elements: [{ type: "cube" }, { type: "cylinder", x: 30 }] }, group: { elements: [{ type: "sphere" }] },
    mesh: {}, parametric: {}
  }
  const missing: string[] = []
  for (const type of ELEMENT_TYPES) {
    const spec = ELEMENT_SPECS[type] as { required?: ReadonlyArray<string> }
    let input: Record<string, unknown> = { type, ...(needs[type] ?? {}) }
    if (type === "parametric") { input = { type, history: plateTemplate() } }
    const result = normalizeElement(input)
    if (!result.ok) { if (spec.required?.length) continue; missing.push(`${type}: ${result.error}`); continue }
    let object: unknown = null
    try { object = buildElementObject({ id: `t-${type}`, layerId: "default", ...result.element } as never) } catch (cause) { missing.push(`${type}: threw ${String(cause)}`); continue }
    if (!object) missing.push(`${type}: no object`)
  }
  expect(missing).toEqual([])
})
