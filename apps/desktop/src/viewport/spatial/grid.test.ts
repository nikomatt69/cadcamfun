import { expect, test } from "bun:test"
import { createSpatialIndex } from "./grid.ts"

test("zoomed-out queries include ordinary items even when the query spans too many cells", () => {
  const index = createSpatialIndex({ cellSize: 1 })
  index.build([{ id: "small", bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 } }])
  expect(index.query({ minX: -10000, minY: -10000, maxX: 10000, maxY: 10000 })).toEqual(["small"])
})
