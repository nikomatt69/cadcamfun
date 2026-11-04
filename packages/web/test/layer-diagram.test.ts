import { expect, test } from "bun:test"
import { dependencyConnector } from "../src/components/stage/layer-diagram"

test("dependency arrows point from the importing layer toward the dependency in both layouts", () => {
  const dependency = { x: 20, y: 20, width: 112, height: 34 }
  const horizontal = dependencyConnector({ ...dependency, x: 170 }, dependency, false)
  expect(horizontal?.from.x).toBeGreaterThan(horizontal!.to.x)
  expect(horizontal?.from.y).toBe(horizontal!.to.y)
  const vertical = dependencyConnector({ ...dependency, y: 68 }, dependency, true)
  expect(vertical?.from.y).toBeGreaterThan(vertical!.to.y)
  expect(vertical?.from.x).toBe(vertical!.to.x)
  expect(dependencyConnector({ x: 0, y: 0, width: 0, height: 0 }, dependency, false)).toBeUndefined()
})
