/**
 * The two-click drawing tools: what two points make, the rubber band, the start point the relative snaps need, and the
 * keyboard commands that start them.
 */
import { describe, expect, test } from "bun:test"
import { DRAW_TOOLS, anchorOf, elementFromPoints, nextStart, previewOutline } from "../src/features/cad/lib/draw-tools.ts"
import { SnapType, defaultSnapSettings, snapPoint } from "../src/features/cad/lib/enanchedSnapService.ts"
import { buildKeymap } from "../src/shared/keybindings/keymap.ts"
import { formatChord } from "../src/shared/keybindings/chord.ts"

const p = (x: number, y: number, z = 0) => ({ x, y, z })

describe("what two clicks make", () => {
  test("a line runs from the first point to the second", () => {
    expect(elementFromPoints("line", p(0, 0), p(30, 40, 2))).toMatchObject({ type: "line", x1: 0, y1: 0, z1: 0, x2: 30, y2: 40, z2: 2, linewidth: 1 })
  })

  test("a circle is centred on the first point and passes through the second", () => {
    expect(elementFromPoints("circle", p(10, 10), p(13, 14))).toMatchObject({ type: "circle", x: 10, y: 10, z: 0, radius: 5 })
  })

  test("a rectangle takes the two points for opposite corners, in any order, and is stored by its centre", () => {
    const a = elementFromPoints("rectangle", p(0, 0), p(40, 20))
    const b = elementFromPoints("rectangle", p(40, 20), p(0, 0))
    expect(a).toMatchObject({ type: "rectangle", x: 20, y: 10, width: 40, height: 20 })
    expect(b).toMatchObject({ x: 20, y: 10, width: 40, height: 20 })
  })

  test("the same point twice, or a flat rectangle, makes nothing", () => {
    expect(elementFromPoints("line", p(5, 5), p(5, 5))).toBeUndefined()
    expect(elementFromPoints("circle", p(5, 5), p(5, 5))).toBeUndefined()
    expect(elementFromPoints("rectangle", p(0, 0), p(30, 0))).toBeUndefined()
    expect(elementFromPoints("rectangle", p(0, 0), p(0, 30))).toBeUndefined()
  })

  test("a line carries on from its end; the other shapes start over", () => {
    expect(nextStart("line", p(1, 2))).toEqual(p(1, 2))
    expect(nextStart("circle", p(1, 2))).toBeUndefined()
    expect(nextStart("rectangle", p(1, 2))).toBeUndefined()
  })
})

describe("the rubber band", () => {
  test("a line is two points, a rectangle a closed loop of four sides, a circle a closed ring at the radius", () => {
    expect(previewOutline("line", p(0, 0), p(3, 4))).toEqual([p(0, 0), p(3, 4)])
    const loop = previewOutline("rectangle", p(0, 0), p(4, 2))
    expect(loop).toHaveLength(5)
    expect(loop[0]).toEqual(loop[4])
    expect(loop.map((point) => `${point.x},${point.y}`)).toEqual(["0,0", "4,0", "4,2", "0,2", "0,0"])
    const ring = previewOutline("circle", p(10, 10), p(13, 14))
    expect(ring).toHaveLength(65)
    for (const point of ring) expect(Math.hypot(point.x - 10, point.y - 10)).toBeCloseTo(5, 9)
    expect(ring[0]!.x).toBeCloseTo(ring[64]!.x, 9)
  })
})

describe("the start point reaches the relative snaps", () => {
  test("only a line has an anchor, and with it the perpendicular snap now applies while drawing", () => {
    expect(anchorOf("line", p(30, 50))).toEqual(p(30, 50))
    expect(anchorOf("circle", p(30, 50))).toBeUndefined()
    expect(anchorOf("rectangle", p(30, 50))).toBeUndefined()
    const none = Object.fromEntries(Object.values(SnapType).map((type) => [type, false])) as Record<SnapType, boolean>
    const settings = { ...defaultSnapSettings, tolerance: 10, types: { ...none, perpendicular: true, parallel: true, tangent: true } }
    const wall = { id: "w", type: "line", x1: 0, y1: 0, z1: 0, x2: 100, y2: 0, z2: 0 }
    const hit = snapPoint(p(33, 4), [wall as never], settings, anchorOf("line", p(30, 50)))
    expect(hit).toMatchObject({ x: 30, y: 0, type: SnapType.PERPENDICULAR })
    // Drawing a circle has no start point to be perpendicular from.
    expect(snapPoint(p(33, 4), [wall as never], settings, anchorOf("circle", p(30, 50))).type).toBe(SnapType.NEAREST)
  })
})

describe("the commands", () => {
  test("L, C and B start the tools, and the user can change them", () => {
    const keymap = buildKeymap()
    expect(DRAW_TOOLS).toEqual(["line", "circle", "rectangle"])
    expect(keymap.entry("cad.draw.line")!.chords.map(formatChord)).toEqual(["L"])
    expect(keymap.entry("cad.draw.circle")!.chords.map(formatChord)).toEqual(["C"])
    expect(keymap.entry("cad.draw.rectangle")!.chords.map(formatChord)).toEqual(["B"])
    expect(buildKeymap({ "cad.draw.line": ["Shift+L"] }).issues).toEqual([])
  })
})
