import { describe, expect, test } from "bun:test"
import { visibleFeatureTrees } from "../lib/mesh-inspection"

const trees = [
  { elementId: "plate", name: "Plate", features: [{ id: "extrude", type: "Extrude", parameters: [] }] },
  { elementId: "bolt", name: "Bolt", features: [{ id: "revolve", type: "Revolve", parameters: [] }] },
]

describe("design feature inspection", () => {
  test("shows the original feature trees in order when no element is selected", () => {
    expect(visibleFeatureTrees(trees, undefined)).toEqual(trees)
  })

  test("focuses the selected element without changing the server data", () => {
    expect(visibleFeatureTrees(trees, "bolt")).toEqual([trees[1]!])
    expect(trees.map((tree) => tree.elementId)).toEqual(["plate", "bolt"])
  })

  test("does not attribute another element's history to a selection without features", () => {
    expect(visibleFeatureTrees(trees, "unmeshed")).toEqual([])
  })
})
