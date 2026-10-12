import { expect, test } from "bun:test"
import { stockOf } from "../src/features/cam/lib/job.ts"

test("an explicitly configured stock keeps its placement and dimensions despite a linked smaller element", () => {
  const stock = stockOf({ elements: [{ id: "part", type: "cube", width: 10, height: 5, depth: 2 }], selectedElement: null, selectedIds: [], workpiece: { configured: true, elementId: "part", width: 100, height: 80, depth: 20, x: 23, y: -8, topZ: 6, allowance: 2, material: "aluminum" }, workpieceElementId: "part", stockAllowance: 0 })
  expect(stock).toEqual({ elementId: "part", width: 100, height: 80, depth: 20, radius: 0, x: 23, y: -8, topZ: 6, allowance: 2, material: "aluminum" })
})
