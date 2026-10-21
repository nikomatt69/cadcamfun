import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { assemblyClearance, assemblyInterference, billOfMaterials, jointsFromHoles, type AssemblyPart } from "./assembly-analysis.ts"
import { frame, makeBox, type Brep } from "./brep/index.ts"
import { rebuildExact } from "./history-brep.ts"
import { model } from "./script.ts"
import { fastenerSolids, planFasteners } from "./smart-fasteners.ts"

setDefaultTimeout(60_000)

const near = (a: number, b: number, tol = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(tol)
const part = (id: string, brep: Brep, extra: Partial<AssemblyPart> = {}): AssemblyPart => ({ id, name: id, brep, ...extra })

/** A 60 x 30 block with two holes 30 mm apart, drilled from its top. */
const block = (z0: number, h: number, d: number, depth: number): Brep => {
  const m = model()
  m.extrude(m.sketch("XY", z0).rectangle([0, 0], 60, 30), { depth: h, id: "block" })
  m.hole({ plane: "XY", offset: z0 + h, at: [15, 15], diameter: d, depth, id: "a" })
  m.hole({ plane: "XY", offset: z0 + h, at: [45, 15], diameter: d, depth, id: "b" })
  const r = rebuildExact(m.build())
  expect(r.bodies.map((b) => b.reason)).toEqual([undefined])
  return r.bodies[0]!.brep!
}

describe("joints from coaxial holes", () => {
  test("two shared axes fix a plate to its base; one shared axis is a pin; a stack of three parts gives a chain", () => {
    const base = block(0, 20, 6.8, 16)
    const plate = block(20, 8, 9, 8)
    const [fixed] = jointsFromHoles([{ id: "plate", brep: plate }, { id: "base", brep: base }])
    expect(fixed).toMatchObject({ parent: "base", child: "plate", kind: "fixed", axes: 2 })
    near(fixed!.origin.z, 20)
    near(fixed!.axis.z, -1)

    // A link with one hole on the base's first hole: free to turn about it.
    const m = model()
    m.extrude(m.sketch("XY", 20).rectangle([5, 5], 40, 20), { depth: 5, id: "link" })
    m.hole({ plane: "XY", offset: 25, at: [15, 15], diameter: 9, depth: 5, id: "pin" })
    const link = rebuildExact(m.build()).bodies[0]!.brep!
    const [pin] = jointsFromHoles([{ id: "base", brep: base }, { id: "link", brep: link }])
    expect(pin).toMatchObject({ parent: "base", child: "link", kind: "revolute", axes: 1 })
    near(pin!.origin.x, 15)
    near(pin!.origin.y, 15)
    near(pin!.origin.z, 20)

    // Plate on a spacer on the base: plate-spacer and spacer-base.
    const spacer = block(20, 4, 9, 4)
    const lifted = block(24, 8, 9, 8)
    const chain = jointsFromHoles([{ id: "base", brep: base }, { id: "spacer", brep: spacer }, { id: "plate", brep: lifted }])
    expect(chain.map((j) => [j.child, j.parent, j.kind]).sort()).toEqual([["plate", "spacer", "fixed"], ["spacer", "base", "fixed"]])
  })
})

describe("exact interference", () => {
  test("overlapping boxes clash by their exact common volume; boxes in face contact only touch; distant ones are not checked", () => {
    const a = makeBox(10, 10, 10)
    const b = makeBox(10, 10, 10, frame({ x: 5, y: 0, z: 0 }))
    const c = makeBox(10, 10, 10, frame({ x: 0, y: 0, z: 10 }))
    const d = makeBox(10, 10, 10, frame({ x: 100, y: 0, z: 0 }))
    const r = assemblyInterference([part("a", a), part("b", b), part("c", c), part("d", d)])
    expect(r.interferences.map((i) => [i.a, i.b, i.kind])).toEqual([["a", "b", "clash"]])
    near(r.interferences[0]!.volume, 500)
    near(r.interferences[0]!.centroid.x, 7.5)
    expect(r.touching).toEqual([{ a: "a", b: "c" }, { a: "b", b: "c" }])
    expect(r.undetermined).toEqual([])
    expect(r.checked).toBe(3)
  })

  test("a fastened assembly: the threads in the tapped holes are the only overlaps, declared as expected", () => {
    const base = block(0, 20, 6.8, 16)
    const plate = block(20, 8, 9, 8)
    const { plans } = planFasteners([{ id: "plate", brep: plate }, { id: "base", brep: base }])
    expect(plans.map((p) => p.designation)).toEqual(["ISO 4762 M8x20", "ISO 4762 M8x20"])
    const parts: AssemblyPart[] = [part("base", base, { material: "aluminium", density: 2.7 }), part("plate", plate, { material: "aluminium", density: 2.7 })]
    const tapped = new Map<string, string>()
    for (const p of plans) {
      fastenerSolids(p).forEach((s, k) => {
        const id = `${p.id}-${s.role}-${k}`
        if (s.role === "screw" && p.tapped !== undefined) tapped.set(id, p.tapped)
        parts.push(part(id, s.brep, { designation: s.designation, material: "steel", density: 7.85 }))
      })
    }
    const r = assemblyInterference(parts, {
      expected: (a, b) => (tapped.get(a) === b || tapped.get(b) === a ? "thread engaged in the tapped hole" : undefined)
    })
    expect(r.undetermined).toEqual([])
    expect(r.interferences.filter((i) => i.kind === "clash")).toEqual([])
    const threads = r.interferences.filter((i) => i.kind === "expected")
    expect(threads.length).toBe(2)
    // Nominal diameter 8 against the 6.8 tap drill: 20 - (8 + 1.6) = 10.4 mm engaged, the last 0.8 mm a 45-degree tip chamfer
    // whose cone leaves the drill wall 0.6 mm from its start.
    const ring = Math.PI * (16 - 3.4 ** 2) * (10.4 - 0.8)
    const tip = Math.PI * ((4 ** 3 - 3.4 ** 3) / 3 - 3.4 ** 2 * 0.6)
    for (const t of threads) near(t.volume, ring + tip, 1e-6 * (ring + tip))
    // Screws and washers rest on the plate: contact, not interference.
    expect(r.touching.length).toBeGreaterThanOrEqual(2)

    const bom = billOfMaterials(parts)
    expect(bom.map((row) => [row.item, row.designation ?? row.name, row.quantity])).toEqual([
      [1, "base", 1], [2, "plate", 1], [3, "ISO 4762 M8x20", 2], [4, "ISO 7089 M8", 2]
    ])
    // Exact masses: the plate is 60 x 30 x 8 less two 9 mm holes, in aluminium.
    near(bom[1]!.mass!, ((60 * 30 * 8 - 2 * Math.PI * 4.5 ** 2 * 8) * 2.7) / 1000, 1e-6)
  })
})

describe("clearance between parts", () => {
  test("pairs are listed nearest first, with the gap and the closest points; far pairs are not measured", () => {
    const a = part("a", makeBox(10, 10, 10))
    const b = part("b", makeBox(10, 10, 10, frame({ x: 12.5, y: 0, z: 0 }, { x: 0, y: 0, z: 1 })))
    const c = part("c", makeBox(10, 10, 10, frame({ x: 0, y: 0, z: 14 }, { x: 0, y: 0, z: 1 })))
    const far = part("far", makeBox(10, 10, 10, frame({ x: 100, y: 0, z: 0 }, { x: 0, y: 0, z: 1 })))
    const r = assemblyClearance([a, b, c, far], 5)
    expect(r.map((x) => [x.a, x.b])).toEqual([["a", "b"], ["a", "c"], ["b", "c"]])
    near(r[0]!.distance, 2.5, 1e-9)
    near(r[1]!.distance, 4, 1e-9)
    near(r[2]!.distance, Math.hypot(2.5, 4), 1e-9)
    near(r[0]!.pointA.x, 10, 1e-9)
    near(r[0]!.pointB.x, 12.5, 1e-9)
  })
})
