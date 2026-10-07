import { describe, expect, test } from "bun:test"
import { bulkNext, classify, isolate, partition, renamed, showAll } from "../src/cad/lib/browser.ts"

const item = (id: string, type: string, layerId = "l1") => ({ id, type, layerId })

describe("CAD browser rules", () => {
  test("types fall into Fusion-style sections", () => {
    expect(["cube", "Sphere", "cylinder", "cone", "torus"].map(classify)).toEqual(["bodies", "bodies", "bodies", "bodies", "bodies"])
    expect(["line", "circle", "rectangle", "text", "mystery"].map(classify)).toEqual(["sketches", "sketches", "sketches", "sketches", "sketches"])
    expect(["component", "group", "assembly", "custom"].map(classify)).toEqual(["components", "components", "components", "components"])
  })

  test("by kind: fixed order, empty sections dropped", () => {
    const sections = partition([item("a", "circle"), item("b", "cube"), item("c", "group")], "kind", [])
    expect(sections.map((s) => [s.label, s.items.map((i) => i.id)])).toEqual([["Bodies", ["b"]], ["Sketches", ["a"]], ["Components", ["c"]]])
    expect(partition([item("a", "circle")], "kind", []).map((s) => s.id)).toEqual(["sketches"])
  })

  test("by layer: every layer is listed, orphans are not lost", () => {
    const layers = [{ id: "l1", name: "Default" }, { id: "l2", name: "Holes" }]
    const sections = partition([item("a", "circle"), item("b", "circle", "gone")], "layer", layers)
    expect(sections.map((s) => [s.label, s.items.length])).toEqual([["Default", 1], ["Holes", 0], ["No layer", 1]])
  })

  test("flat keeps one section with everything in order", () => {
    expect(partition([item("a", "x"), item("b", "y")], "flat", [])[0]!.items.map((i) => i.id)).toEqual(["a", "b"])
  })

  test("isolate shows only the kept items and changes nothing that is already right", () => {
    const items = [{ id: "a" }, { id: "b", visible: false }, { id: "c", visible: true }]
    expect(isolate(items, ["a"])).toEqual([{ id: "c", visible: false }])
    expect(isolate(items, ["b"])).toEqual([{ id: "a", visible: false }, { id: "b", visible: true }, { id: "c", visible: false }])
    expect(isolate(items, [])).toEqual([])
  })

  test("show all only touches hidden items", () => {
    expect(showAll([{ id: "a" }, { id: "b", visible: false }, { id: "c", visible: true }])).toEqual([{ id: "b", visible: true }])
  })

  test("renames trim and never produce an empty name", () => {
    expect(renamed("Old", "  New  ")).toBe("New")
    expect(renamed("Old", "   ")).toBe("Old")
  })

  test("a bulk toggle turns everything on unless everything is already on", () => {
    expect(bulkNext([true, true])).toBe(false)
    expect(bulkNext([true, false])).toBe(true)
    expect(bulkNext([false, false])).toBe(true)
  })
})
