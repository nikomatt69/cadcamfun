import { expect, test } from "bun:test"
import { groupElements, transformElements } from "../src/services/ai-transform.ts"

const cube = (id: string, x: number, extra: Record<string, unknown> = {}) => ({ id, type: "cube", layerId: "L", x, y: 0, z: 0, width: 10, height: 10, depth: 10, ...extra })
let n = 0
const id = () => `new-${++n}`

test("a ring of copies: the originals stay, each copy is turned once more about the point", () => {
  const result = transformElements([cube("a", 10)], { ids: ["a"], transform: { rotate: { axis: "z", degrees: 90, about: { x: 0, y: 0, z: 0 } } }, copies: 3 }, id)
  expect(result.ok).toBe(true)
  if (!result.ok) return
  expect(result.copied).toBe(true)
  const at = result.elements.map((e) => [Math.round(Number(e["x"])) + 0, Math.round(Number(e["y"])) + 0])
  expect(at).toEqual([[0, 10], [-10, 0], [0, -10]])
  expect(new Set(result.elements.map((e) => e.id)).size).toBe(3)
})

test("what cannot be done is refused with a reason, not guessed", () => {
  const wall = { id: "w", type: "wall", layerId: "L", x: 0, y: 0, z: 0, length: 100, height: 30, thickness: 5 }
  expect(transformElements([wall], { ids: ["w"], transform: { rotate: { axis: "z", degrees: 45, about: { x: 5, y: 5, z: 0 } } }, copies: 0 }, id)).toMatchObject({ ok: false, error: expect.stringContaining("own centre") })
  expect(transformElements([wall], { ids: ["w"], transform: { move: { x: 5, y: 0, z: 0 } }, copies: 0 }, id).ok).toBe(true)
  expect(transformElements([cube("a", 0)], { ids: ["ghost"], transform: { move: { x: 1, y: 0, z: 0 } }, copies: 0 }, id)).toMatchObject({ ok: false })
  const boolean = { id: "b", type: "boolean-union", layerId: "L", operands: ["a", "c"] }
  expect(transformElements([boolean], { ids: ["b"], transform: { move: { x: 1, y: 0, z: 0 } }, copies: 2 }, id)).toMatchObject({ ok: false, error: expect.stringContaining("operands") })
})

test("grouping refuses Booleans and their operands, and a turned component cannot be opened", () => {
  const all = [cube("a", 0), cube("c", 20), { id: "b", type: "boolean-union", layerId: "L", operands: ["a", "c"] }]
  expect(groupElements(all, { ids: ["a"], ungroup: false }, id)).toMatchObject({ ok: false, error: expect.stringContaining("operand") })
  expect(groupElements(all, { ids: ["b"], ungroup: false }, id)).toMatchObject({ ok: false })
  const turned = { id: "g", type: "component", layerId: "L", x: 0, y: 0, z: 0, rotation: { z: 30 }, elements: [{ type: "cube", x: 5, y: 0, z: 0 }] }
  expect(groupElements([turned], { ids: ["g"], ungroup: true }, id)).toMatchObject({ ok: false, error: expect.stringContaining("turned") })
})
