import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { resetStores } from "./helpers/reset-stores.ts"
import { applyOps, mirrorToolResult, opsFor } from "../src/features/ai/lib/editor-sync.ts"
import { useElementsStore } from "../src/features/cad/store/elementsStore.ts"
import { useLayerStore } from "../src/features/cad/store/layerStore.ts"
import { useCADStore } from "../src/features/cad/store/cadStore.ts"
import { plateTemplate } from "@cadcamfun/core"

const json = (value: unknown) => JSON.stringify(value)
const cube = { id: "e1", type: "cube", layerId: "default", x: 1, y: 2, z: 3, width: 10, height: 10, depth: 10 }

beforeEach(() => {
  for (const element of [...useElementsStore.getState().elements]) useElementsStore.getState().deleteElement(element.id)
})

afterEach(() => resetStores())

describe("assistant results -> editor", () => {
  test("only successful CAD tool results produce changes", () => {
    expect(opsFor("cad_add_elements", json({ ok: true, elements: [cube] }))).toEqual([{ kind: "add", elements: [cube] }])
    expect(opsFor("cad_add_entities", json({ ok: false, elements: [cube] }))).toEqual([])
    expect(opsFor("cam_generate_gcode", json({ ok: true, elements: [cube] }))).toEqual([])
    expect(opsFor("cad_add_elements", "not json")).toEqual([])
    expect(opsFor("cad_delete_entities", json({ ok: true, ids: ["a", 3, "b"] }))).toEqual([{ kind: "delete", ids: ["a", "b"] }])
    expect(opsFor("cad_modify_entities", json({ ok: true, elements: [cube, { nope: 1 }] }))).toEqual([{ kind: "update", elements: [cube] }])
  })

  test("added elements appear in the store with the tool's ids, on the active layer", () => {
    const result = mirrorToolResult("cad_add_elements", true, json({ ok: true, elements: [cube] }))
    expect(result).toEqual({ added: 1, updated: 0, removed: 0 })
    const stored = useElementsStore.getState().elements.find((e) => e.id === "e1")!
    expect(stored).toMatchObject({ type: "cube", x: 1, z: 3 })
    expect(stored.layerId).toBe(useLayerStore.getState().activeLayer)
  })

  test("the same result applied twice adds nothing the second time", () => {
    applyOps([{ kind: "add", elements: [cube] }])
    expect(applyOps([{ kind: "add", elements: [cube] }]).added).toBe(0)
    expect(useElementsStore.getState().elements.filter((e) => e.id === "e1")).toHaveLength(1)
  })

  test("a requested layer is found by name, or created", () => {
    const layers = useLayerStore.getState()
    applyOps([{ kind: "add", elements: [{ ...cube, id: "a", layerId: "Car" }, { ...cube, id: "b", layerId: "car" }, { ...cube, id: "c", layer: "Wheels" }] }])
    const all = useLayerStore.getState().layers
    expect(all.filter((l) => l.name === "Car")).toHaveLength(1)
    expect(all.some((l) => l.name === "Wheels")).toBe(true)
    const elements = useElementsStore.getState().elements
    expect(elements.find((e) => e.id === "a")!.layerId).toBe(elements.find((e) => e.id === "b")!.layerId)
    expect(layers.layers.length).toBeLessThanOrEqual(all.length)
  })

  test("modify updates in place and delete removes; unknown ids are ignored", () => {
    applyOps([{ kind: "add", elements: [cube] }])
    expect(applyOps([{ kind: "update", elements: [{ ...cube, radius: 4, x: 50 }, { id: "ghost", type: "cube" }] }]).updated).toBe(1)
    expect(useElementsStore.getState().elements.find((e) => e.id === "e1")).toMatchObject({ x: 50, radius: 4 })
    expect(applyOps([{ kind: "delete", ids: ["e1", "ghost"] }]).removed).toBe(1)
    expect(useElementsStore.getState().elements.some((e) => e.id === "e1")).toBe(false)
  })

  test("a solid the assistant builds (a parametric part, an extrusion, a Boolean) switches a 2D view to 3D", () => {
    for (const element of [{ id: "p1", type: "parametric", history: plateTemplate() }, { id: "x1", type: "extrusion" }, { id: "b1", type: "boolean-union", operands: [] }]) {
      useCADStore.getState().setViewMode("2d")
      applyOps([{ kind: "add", elements: [{ ...element, layerId: "default" }] }])
      expect(useCADStore.getState().viewMode).toBe("3d")
    }
  })
})
