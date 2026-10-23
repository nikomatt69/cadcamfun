import { expect, test } from "bun:test"
import { boundsRows, depthForSelection, stockForSelection } from "../src/features/cam/lib/job.ts"

const current = { width: 100, height: 100, depth: 20, radius: 0, x: 0, y: 0, topZ: 0, allowance: 1 }

test("the stock of one element is its bounding box, top at its highest face", () => {
  const plate = { id: "a", type: "cube", x: 10, y: 5, z: 2, width: 30, height: 20, depth: 6 }
  expect(stockForSelection([plate], current, 2)).toMatchObject({ width: 30, height: 20, depth: 6, x: 10, y: 5, topZ: 5, allowance: 2 })
  expect(depthForSelection(plate, 1)).toBe(6)
  expect(boundsRows(plate).map(([label]) => label)).toContain("Size Z:")
})

test("the stock of several elements contains all of them", () => {
  const a = { id: "a", type: "cube", x: 0, y: 0, z: 0, width: 10, height: 10, depth: 4 }
  const b = { id: "b", type: "cube", x: 30, y: 10, z: 3, width: 10, height: 10, depth: 4 }
  expect(stockForSelection([a, b], current, 0)).toMatchObject({ width: 40, height: 20, depth: 7, x: 15, y: 5, topZ: 5 })
})

test("flat elements keep the current stock depth and nothing selected gives no stock", () => {
  expect(stockForSelection([{ id: "c", type: "rectangle", x: 0, y: 0, width: 8, height: 6 }], current, 0)?.depth).toBe(20)
  expect(stockForSelection([], current, 0)).toBeUndefined()
})
