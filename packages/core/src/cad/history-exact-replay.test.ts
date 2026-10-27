import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { massProperties } from "./brep/mass.ts"
import { exactReplay, rebuildExact } from "./history-brep.ts"
import { rebuild } from "./history.ts"
import { model } from "./script.ts"
import type { History } from "./history.ts"

setDefaultTimeout(120_000)

/** A 40 x 30 plate with `steps` push/pulls that each name the top face they move, 2 mm at a time. */
const stepped = (steps: number): History => {
  const m = model()
  m.extrude(m.sketch("XY").rectangle([0, 0], 40, 30), { depth: 10, id: "plate" })
  for (let i = 0; i < steps; i++) m.pushPull({ near: [20, 15, 10 + 2 * i], distance: 2, name: "plate.top" })
  return m.build()
}

const volumeOf = (history: History, index: number, at: (index: number) => ReturnType<typeof rebuildExact>): number => {
  const brep = at(index).bodies[0]?.brep
  expect(brep, `exact body after ${index} features of ${history.features.length}`).toBeDefined()
  return massProperties(brep!).volume
}

describe("the exact replay advanced on demand", () => {
  test("answers at each feature what a replay of the prefix answers", () => {
    const history = stepped(4)
    const result = rebuild(history)
    expect(result.issues.filter((issue) => issue.severity === "error")).toEqual([])
    const replay = exactReplay(history, result)
    for (let index = 2; index <= history.features.length; index++) {
      const prefix = { ...history, features: history.features.slice(0, index) }
      const incremental = volumeOf(history, index, (i) => replay.at(i, result.bodies))
      const fresh = volumeOf(history, index, () => rebuildExact(prefix, rebuild(prefix)))
      expect(incremental).toBeCloseTo(fresh, 6)
      // Plate footprint times its height after the push/pulls replayed so far (sketch, then plate, then the steps).
      expect(incremental).toBeCloseTo(40 * 30 * (10 + 2 * (index - 2)), 3)
    }
  })

  test("an answer for an earlier feature after a later one is the model already reached, never a replay backwards", () => {
    const history = stepped(2)
    const result = rebuild(history)
    const replay = exactReplay(history, result)
    const late = volumeOf(history, history.features.length, (i) => replay.at(i, result.bodies))
    expect(volumeOf(history, 2, (i) => replay.at(i, result.bodies))).toBeCloseTo(late, 9)
    expect(late).toBeCloseTo(40 * 30 * 14, 3)
  })

  test("a rebuild with many named faces costs about one replay, not one replay per name", () => {
    const history = stepped(10)
    const t0 = performance.now()
    const result = rebuild(history)
    const rebuildMs = performance.now() - t0
    expect(result.issues.filter((issue) => issue.severity === "error")).toEqual([])
    expect(rebuildExact(history, result).bodies[0]!.brep).toBeDefined()
    // What the rebuild used to spend: the exact replay of every prefix that names the face, from the top each time.
    const t1 = performance.now()
    for (let index = 2; index < history.features.length; index++) {
      const prefix = { ...history, features: history.features.slice(0, index) }
      rebuildExact(prefix, rebuild(prefix))
    }
    const prefixesMs = performance.now() - t1
    expect(rebuildMs).toBeLessThan(prefixesMs / 2)
  })
})
