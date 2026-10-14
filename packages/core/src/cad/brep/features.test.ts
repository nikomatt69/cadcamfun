import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { rebuildExact } from "../history-brep.ts"
import type { History } from "../history.ts"
import { buildRecipe } from "../recipes.ts"
import { model } from "../script.ts"
import { recognizeHoles, type RecognizedHole } from "./features.ts"
import { readStepBreps, writeStepBreps } from "./step.ts"
import type { Brep } from "./topology.ts"

setDefaultTimeout(60_000)

const exact = (h: History): Brep => {
  const r = rebuildExact(h)
  expect(r.bodies.map((b) => b.reason)).toEqual([undefined])
  return r.bodies[0]!.brep!
}
const near = (a: number, b: number, tol = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(tol)
const at = (holes: ReadonlyArray<RecognizedHole>, x: number, y: number): RecognizedHole => {
  const h = holes.find((q) => Math.hypot(q.entry.x - x, q.entry.y - y) < 1e-6)
  if (h === undefined) throw new Error(`no hole at ${x}, ${y}: ${JSON.stringify(holes.map((q) => q.entry))}`)
  return h
}

/** A 60 x 30 x 10 plate with one hole of every form, all drilled from the top face (z = 10). */
const plate = (): History => {
  const m = model()
  m.extrude(m.sketch("XY").rectangle([0, 0], 60, 30), { depth: 10, id: "plate" })
  m.hole({ plane: "XY", offset: 10, at: [8, 8], diameter: 6.6, depth: 10, id: "through" })
  m.hole({ plane: "XY", offset: 10, at: [22, 15], diameter: 9, depth: 10, kind: "counterbore", headDiameter: 15, headDepth: 8.6, id: "cbore" })
  m.hole({ plane: "XY", offset: 10, at: [38, 15], diameter: 6.6, depth: 10, kind: "countersink", headDiameter: 12, id: "csink" })
  m.hole({ plane: "XY", offset: 10, at: [52, 15], diameter: 6.8, depth: 6, id: "blind" })
  return m.build()
}

describe("hole recognition on the exact model", () => {
  test("simple, counterbored, countersunk and blind holes are told apart and measured", () => {
    const holes = recognizeHoles(exact(plate()))
    expect(holes.length).toBe(4)
    for (const h of holes) {
      // Every hole is entered from the top face, going down.
      near(h.entry.z, 10)
      near(h.direction.z, -1)
    }
    const through = at(holes, 8, 8)
    expect(through.form).toBe("simple")
    expect(through.bottom).toBe("through")
    near(through.diameter, 6.6)
    near(through.depth, 10)

    const cbore = at(holes, 22, 15)
    expect(cbore.form).toBe("counterbore")
    expect(cbore.bottom).toBe("through")
    near(cbore.diameter, 9)
    near(cbore.headDiameter!, 15)
    near(cbore.headDepth!, 8.6)
    expect(cbore.segments.map((s) => [s.kind, Number(s.start.toFixed(6)), Number(s.end.toFixed(6))])).toEqual([["cylinder", 0, 8.6], ["cylinder", 8.6, 10]])

    const csink = at(holes, 38, 15)
    expect(csink.form).toBe("countersink")
    expect(csink.bottom).toBe("through")
    near(csink.diameter, 6.6)
    near(csink.headDiameter!, 12)
    expect(csink.segments[0]!.kind).toBe("cone")
    // 90 degree cone: depth = (12 - 6.6) / 2.
    near(csink.segments[0]!.end, 2.7)

    const blind = at(holes, 52, 15)
    expect(blind.form).toBe("simple")
    expect(blind.bottom).toBe("flat")
    near(blind.diameter, 6.8)
    near(blind.depth, 6)
  })

  test("the flange: six bolt holes on the pitch circle and the bore, all through", () => {
    const holes = recognizeHoles(exact(buildRecipe("flange", {}).history))
    const bolts = holes.filter((h) => Math.abs(h.diameter - 11) < 1e-6)
    expect(bolts.length).toBe(6)
    for (const h of bolts) {
      near(Math.hypot(h.entry.x, h.entry.y), 40)
      expect(h.bottom).toBe("through")
    }
    const bore = holes.find((h) => Math.abs(h.diameter - 40) < 1e-6)
    expect(bore?.bottom).toBe("through")
    expect(holes.length).toBe(7)
  })

  test("outer cylinders and fillets are not holes", () => {
    const m = model()
    m.extrude(m.sketch("XY").rectangle([0, 0], 40, 25), { depth: 6, corner: { style: "fillet", size: 5 }, id: "plate" })
    m.extrude(m.sketch("XY", 6).circle([20, 12.5], 10), { depth: 4, id: "boss" })
    expect(recognizeHoles(exact(m.build()))).toEqual([])
  })

  test("coaxial holes separated by air are two holes, and a STEP import is recognised like its source", () => {
    // A U channel: two 5 mm walls 20 mm apart, one M6 clearance hole through both along x.
    const m = model()
    m.extrude(m.sketch("XY").polyline([[0, 0], [30, 0], [30, 30], [25, 30], [25, 5], [5, 5], [5, 30], [0, 30]]), { depth: 20, id: "u" })
    m.hole({ plane: "YZ", offset: 30, at: [15, 10], diameter: 6.6, depth: 30, id: "cross" })
    const b = exact(m.build())
    const holes = recognizeHoles(b)
    expect(holes.length).toBe(2)
    for (const h of holes) {
      near(h.diameter, 6.6)
      near(h.depth, 5)
      expect(h.bottom).toBe("through")
      near(Math.abs(h.direction.x), 1)
    }
    const back = readStepBreps(writeStepBreps([{ name: "u", brep: b }], { timestamp: "2026-01-01T00:00:00" })).parts[0]!.brep
    const again = recognizeHoles(back)
    expect(again.map((h) => [h.form, h.bottom, Number(h.diameter.toFixed(9)), Number(h.depth.toFixed(9))]))
      .toEqual(holes.map((h) => [h.form, h.bottom, Number(h.diameter.toFixed(9)), Number(h.depth.toFixed(9))]))
  })
})
