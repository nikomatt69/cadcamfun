/**
 * The CAM element explorer's pure rules: tree, filter, reveal, selection and the machinable set.
 */
import { describe, expect, test } from "bun:test"
import {
  allNodeIds,
  ancestorsOf,
  buildTree,
  elementName,
  filterTree,
  machinableSelection,
  nextSelection,
  selectionSummary
} from "../src/cam/lib/explorer.ts"

const elements = [
  { id: "g1", type: "group", layerId: "l1", name: "Bracket", childrenIds: ["c1"] },
  { id: "c1", type: "circle", layerId: "l1", parentId: "g1" },
  { id: "r1", type: "rectangle", layerId: "l1", name: "Plate" },
  { id: "w1", type: "workpiece", layerId: "l1" },
  { id: "orphan", type: "cube", layerId: "l1", parentId: "missing", visible: false }
]

describe("buildTree", () => {
  test("nests children once (parentId and childrenIds do not duplicate), orphans go to the root", () => {
    const tree = buildTree(elements)
    expect(tree.map(node => node.id)).toEqual(["g1", "r1", "w1", "orphan"])
    expect(tree[0]!.children.map(node => node.id)).toEqual(["c1"])
    expect(tree[3]!.visible).toBe(false)
  })

  test("names fall back to type and a short id", () => {
    expect(elementName({ id: "abcdef123", type: "cube" })).toBe("cube-abcdef")
    expect(elementName({ id: "x", type: "cube", name: "Block" })).toBe("Block")
  })
})

describe("filterTree", () => {
  const tree = buildTree(elements)
  test("keeps roots matching by name, type or a descendant", () => {
    expect(filterTree(tree, "plate").map(node => node.id)).toEqual(["r1"])
    expect(filterTree(tree, "CIRCLE").map(node => node.id)).toEqual(["g1"])
    expect(filterTree(tree, "  ").length).toBe(tree.length)
    expect(filterTree(tree, "nothing")).toEqual([])
  })

  test("allNodeIds lists every node depth first", () => {
    expect(allNodeIds(tree)).toEqual(["g1", "c1", "r1", "w1", "orphan"])
  })
})

describe("ancestorsOf", () => {
  test("walks up through parents, nearest first, and stops on cycles", () => {
    const nested = [
      { id: "a", type: "group" },
      { id: "b", type: "group", parentId: "a" },
      { id: "c", type: "box", parentId: "b" }
    ]
    expect(ancestorsOf(nested, "c")).toEqual(["b", "a"])
    expect(ancestorsOf(nested, "a")).toEqual([])
    const loop = [{ id: "a", type: "group", parentId: "b" }, { id: "b", type: "group", parentId: "a" }]
    expect(ancestorsOf(loop, "a")).toEqual(["b"])
  })
})

describe("selection", () => {
  test("a plain click replaces, an additive click adds or removes", () => {
    expect(nextSelection(["a", "b"], "c", false)).toEqual(["c"])
    expect(nextSelection(["a"], "b", true)).toEqual(["a", "b"])
    expect(nextSelection(["a", "b"], "a", true)).toEqual(["b"])
  })

  test("only existing, machinable elements are machined; the raw piece and helpers are not", () => {
    const all = [...elements, { id: "light", type: "light" }]
    expect(machinableSelection(all, ["w1", "r1", "gone", "light", "c1"])).toEqual(["r1", "c1"])
  })

  test("summary names what the generator will machine", () => {
    expect(selectionSummary(elements, [])).toBe("Select a CAD element to machine it")
    expect(selectionSummary(elements, ["r1"])).toBe("Machining: Plate")
    expect(selectionSummary(elements, ["r1", "c1"])).toBe("Machining 2 elements, starting with Plate")
  })
})
