import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { rebuildExact } from "./history-brep.ts"
import { rebuild } from "./history.ts"
import { model } from "./script.ts"
import { meshVolume } from "./solid.ts"
import type { History } from "./history.ts"

setDefaultTimeout(120_000)

/** A 40 x 30 plate, 10 mm thick, with a push/pull that names the face it moves. */
const plate = (name: string | undefined, height = 10): History => {
  const m = model()
  m.extrude(m.sketch("XY").rectangle([0, 0], 40, 30), { depth: height, id: "plate" })
  m.pushPull({ near: [20, 15, height], distance: 5, ...(name === undefined ? {} : { name }) })
  return m.build()
}

describe("a named face reference", () => {
  test("the named face is the one that is moved, and the mesh and the exact model agree", () => {
    const history = plate("plate.top")
    const result = rebuild(history)
    expect(result.issues.filter((issue) => issue.severity === "error")).toEqual([])
    // The top face grows by 5 mm: the plate's footprint times the distance.
    const expected = 40 * 30 * 15
    expect(Math.abs(meshVolume(result.bodies[0]!.mesh))).toBeCloseTo(expected, -1)
    const exact = rebuildExact(history, result)
    const body = exact.bodies[0]!.brep
    expect(body).toBeDefined()
    expect(body!.faces.some((face) => face.name === "plate.top")).toBe(true)
  })

  test("the reference survives an edit that moves the face", () => {
    const first = rebuild(plate("plate.top", 10))
    const second = rebuild(plate("plate.top", 20))
    expect(first.issues.filter((issue) => issue.severity === "error")).toEqual([])
    expect(second.issues.filter((issue) => issue.severity === "error")).toEqual([])
    // The face is 20 mm higher now, and the same 5 mm is added to it: the difference between the two is the height change.
    const grew = Math.abs(meshVolume(second.bodies[0]!.mesh)) - Math.abs(meshVolume(first.bodies[0]!.mesh))
    expect(grew).toBeCloseTo(40 * 30 * 10, -1)
  })

  test("a name that does not exist is reported, never replaced by a nearby face", () => {
    const history = plate("plate.gone")
    const result = rebuild(history)
    const errors = result.issues.filter((issue) => issue.severity === "error")
    expect(errors.length).toBe(1)
    expect(errors[0]!.message).toContain("does not exist any more")
    // The body keeps the plate it had: the feature changed nothing.
    expect(Math.abs(meshVolume(result.bodies[0]!.mesh))).toBeCloseTo(40 * 30 * 10, -1)
  })

  test("the exact replay inherits the error: the feature changed nothing", () => {
    const history = plate("plate.gone")
    const exact = rebuildExact(history, rebuild(history))
    // The mesh rebuild already refused the missing face, so the exact replay skips the feature and the body stays the plate.
    expect(exact.result.issues.some((issue) => issue.severity === "error" && issue.message.includes("does not exist any more"))).toBe(true)
    const body = exact.bodies[0]!.brep
    expect(body).toBeDefined()
    expect(body!.faces.some((face) => face.name === "plate.top")).toBe(true)
  })
})
