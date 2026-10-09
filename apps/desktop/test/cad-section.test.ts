import { afterEach, describe, expect, test } from "bun:test"
import { resetStores } from "./helpers/reset-stores.ts"
import { DEFAULT_SECTION, clipPlaneFor, keeps, mergeSection } from "../src/cad/lib/section.ts"
import { mirrorToolResult, opsFor } from "../src/ai/editor-sync.ts"
import { useCADStore } from "../src/cad/store/cadStore.ts"

afterEach(() => resetStores())

const json = (value: unknown) => JSON.stringify(value)
const at = (x: number, y: number, z: number) => ({ x, y, z })

describe("section plane", () => {
  test("not inverted keeps what is at or below the position, inverted keeps what is at or above", () => {
    const cut = { ...DEFAULT_SECTION, enabled: true, axis: "z" as const, position: 40 }
    expect(keeps(cut, at(0, 0, 10))).toBe(true)
    expect(keeps(cut, at(0, 0, 40))).toBe(true)
    expect(keeps(cut, at(0, 0, 41))).toBe(false)
    const flipped = { ...cut, inverted: true }
    expect(keeps(flipped, at(0, 0, 41))).toBe(true)
    expect(keeps(flipped, at(0, 0, 10))).toBe(false)
  })

  test("it works along each axis and does nothing while disabled", () => {
    expect(keeps({ enabled: true, axis: "x", position: 5, inverted: false }, at(6, 0, 0))).toBe(false)
    expect(keeps({ enabled: true, axis: "y", position: 5, inverted: false }, at(100, 4, 100))).toBe(true)
    expect(keeps({ enabled: false, axis: "x", position: 5, inverted: false }, at(600, 0, 0))).toBe(true)
  })

  test("the three.js plane agrees with the maths: normal · p + constant >= 0 is kept", () => {
    const { normal, constant } = clipPlaneFor({ axis: "y", position: 12, inverted: false })
    expect(normal).toEqual([0, -1, 0])
    expect(constant).toBe(12)
    expect(clipPlaneFor({ axis: "x", position: 12, inverted: true })).toEqual({ normal: [1, 0, 0], constant: -12 })
  })

  test("a request merges into the current section and ignores nonsense", () => {
    const base = { enabled: true, axis: "z" as const, position: 10, inverted: false }
    expect(mergeSection(base, { axis: "x", position: 30 })).toEqual({ enabled: true, axis: "x", position: 30, inverted: false })
    expect(mergeSection(base, { axis: "w", position: Number.NaN, inverted: "yes" })).toEqual(base)
    expect(mergeSection(base, { inverted: true }).inverted).toBe(true)
  })
})

describe("the assistant cuts the model open (cad_editor)", () => {
  test("section_on sets the plane in the editor and shows the 3D view; section_off lifts it", () => {
    useCADStore.getState().setViewMode("2d")
    mirrorToolResult("cad_editor", true, json({ ok: true, actions: [{ action: "section_on", axis: "x", position: 25, inverted: true }] }))
    expect(useCADStore.getState().section).toEqual({ enabled: true, axis: "x", position: 25, inverted: true })
    expect(useCADStore.getState().viewMode).toBe("3d")
    // Moving the cut keeps the other choices.
    mirrorToolResult("cad_editor", true, json({ ok: true, actions: [{ action: "section_on", position: 60 }] }))
    expect(useCADStore.getState().section).toEqual({ enabled: true, axis: "x", position: 60, inverted: true })
    mirrorToolResult("cad_editor", true, json({ ok: true, actions: [{ action: "section_off" }] }))
    expect(useCADStore.getState().section.enabled).toBe(false)
    expect(useCADStore.getState().section.position).toBe(60)
  })

  test("the result of the tool carries the section fields through", () => {
    expect(opsFor("cad_editor", json({ ok: true, actions: [{ action: "section_on", axis: "z", position: 5 }] }))).toEqual([
      { kind: "editor", actions: [{ action: "section_on", axis: "z", position: 5 }] }
    ])
  })
})
