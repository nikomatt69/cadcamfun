/** Adding a feature while the model is rolled back inserts it at the marker, as Fusion 360 and SolidWorks do. */
import { describe, expect, test } from "bun:test"
import { historyVolume, rebuild, type Feature } from "./history.ts"
import { addFeature, plateTemplate } from "./history-edit.ts"
import { withRollback } from "./history-timeline.ts"

const chamfer = (id: string): Feature => ({ id, type: "fillet", style: "chamfer", radius: 1, edges: { parallel: "z", minLength: 3 } })

describe("addFeature", () => {
  test("without a rollback marker the feature is appended", () => {
    const { history, refusal } = addFeature(plateTemplate(), chamfer("c1"))
    expect(refusal).toBeUndefined()
    expect(history.features.map((f) => f.id)).toEqual(["sketch1", "plate", "hole1", "c1"])
    expect(history.rollback).toBeUndefined()
  })

  test("while rolled back it goes right after the marker, the marker moves onto it and the later features are kept", () => {
    const rolled = withRollback(plateTemplate(), "plate")
    const { history, refusal } = addFeature(rolled, chamfer("c1"))
    expect(refusal).toBeUndefined()
    expect(history.features.map((f) => f.id)).toEqual(["sketch1", "plate", "c1", "hole1"])
    expect(history.rollback).toBe("c1")
    const built = rebuild(history)
    expect(built.states["hole1"]?.state).toBe("rolled-back")
    expect(built.states["c1"]?.state).toBe("ok")
    // Rolling forward builds all of it: the chamfer on the plate, then the hole.
    const full = rebuild(withRollback(history, undefined))
    expect(full.issues).toEqual([])
    expect(historyVolume(full)).toBeLessThan(60 * 40 * 8 - Math.PI * 25 * 8)
  })

  test("a taken id, or a feature that names a later one, is refused", () => {
    const rolled = withRollback(plateTemplate(), "sketch1")
    expect(addFeature(rolled, chamfer("plate")).refusal).toContain("already used")
    const needsLater: Feature = { id: "p", type: "pattern", feature: "hole1", kind: "linear", count: 2, step: [10, 0, 0] }
    expect(addFeature(rolled, needsLater).refusal).toContain("comes after the insertion point")
    expect(addFeature(rolled, needsLater).history).toBe(rolled)
  })
})
