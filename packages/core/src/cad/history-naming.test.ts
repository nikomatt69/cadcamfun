import { describe, expect, setDefaultTimeout, test } from "bun:test"
import type { Feature, History } from "./history.ts"
import { rebuildExact } from "./history-brep.ts"

setDefaultTimeout(60_000)

const rect = (id: string): Feature => ({
  id, type: "sketch", plane: "XY",
  sketch: {
    entities: [
      { id: "p1", kind: "point", x: 0, y: 0 }, { id: "p2", kind: "point", x: 40, y: 0 }, { id: "p3", kind: "point", x: 40, y: 25 }, { id: "p4", kind: "point", x: 0, y: 25 },
      { id: "l1", kind: "line", p1: "p1", p2: "p2" }, { id: "l2", kind: "line", p1: "p2", p2: "p3" }, { id: "l3", kind: "line", p1: "p3", p2: "p4" }, { id: "l4", kind: "line", p1: "p4", p2: "p1" }
    ],
    constraints: [
      { type: "fixed", point: "p1", x: 0, y: 0 }, { type: "horizontal", line: "l1" }, { type: "vertical", line: "l2" }, { type: "horizontal", line: "l3" }, { type: "vertical", line: "l4" },
      { type: "length", line: "l1", value: "width" }, { type: "length", line: "l2", value: 25 }
    ]
  }
} as Feature)
const hole: Feature = { id: "s2", type: "sketch", plane: "XY", sketch: { entities: [{ id: "c", kind: "point", x: 20, y: 12 }, { id: "k", kind: "circle", center: "c", radius: 1 }], constraints: [{ type: "fixed", point: "c" }, { type: "radius", circle: "k", value: 4 }] } } as Feature
const base = (width: number, more: Feature[] = []): History => ({
  parameters: { width },
  features: [rect("s1"), { id: "plate", type: "extrude", sketch: "s1", depth: 6, operation: "new" } as Feature, hole, { id: "bore", type: "extrude", sketch: "s2", depth: 6, operation: "subtract" } as Feature, ...more]
})
const names = (h: History): string[] => {
  const b = rebuildExact(h).bodies[0]!
  expect(b.reason).toBeUndefined()
  return b.brep!.faces.map((f) => f.name ?? "")
}
const unique = (n: string[]) => new Set(n).size === n.length

describe("persistent face names of the exact replay", () => {
  test("a plain history names every face once, and an upstream dimension edit keeps the names", () => {
    const a = names(base(40)), b = names(base(55))
    expect(unique(a)).toBe(true)
    expect(a.every((n) => n !== "")).toBe(true)
    expect([...a].sort()).toEqual([...b].sort())
  })
  test("the copies of a pattern are told apart, deterministically", () => {
    const pat = { id: "pat", type: "pattern", feature: "bore", kind: "linear", count: 2, step: [-10, 0, 0] } as Feature
    const a = names(base(40, [pat])), b = names(base(40, [pat]))
    expect(unique(a)).toBe(true)
    expect(a).toEqual(b)
    expect(a.filter((n) => n.startsWith("bore.side0.0#")).length).toBe(2)
  })
  test("the faces of a blend are named after the faces they join, so a dimension edit keeps them", () => {
    const fil = { id: "fil", type: "fillet", radius: 1.5, edges: {} } as Feature
    const a = names(base(40, [fil])), b = names(base(55, [fil]))
    expect(unique(a)).toBe(true)
    expect(a.some((n) => n.startsWith("blend") && n.includes("plate.top"))).toBe(true)
    expect([...a].sort()).toEqual([...b].sort())
  })
})

import { faceByName, matchFaces } from "./brep/index.ts"

describe("finding faces again after a rebuild", () => {
  test("every face of the plate is found by name after a width edit, and the bore wall follows", () => {
    const a = rebuildExact(base(40)).bodies[0]!.brep!, b = rebuildExact(base(55)).bodies[0]!.brep!
    const m = matchFaces(a, b)
    expect(m.every((x) => x.by === "name" && x.to !== undefined)).toBe(true)
    expect(faceByName(b, "bore.side0.0")).toBeDefined()
    expect(faceByName(b, "nothing")).toBeUndefined()
  })
  test("a renamed feature's faces are found by what surrounds them and by kind", () => {
    const renamed = base(40)
    const swap = (s: string) => s.replaceAll("plate", "base")
    const b = rebuildExact(JSON.parse(swap(JSON.stringify(renamed))) as History).bodies[0]!.brep!
    const a = rebuildExact(base(40)).bodies[0]!.brep!
    const m = matchFaces(a, b)
    expect(m.every((x) => x.to !== undefined)).toBe(true)
    const top = a.faces.findIndex((f) => f.name === "plate.top")
    expect(b.faces[m[top]!.to!]!.name).toBe("base.top")
    expect(new Set(m.map((x) => x.to)).size).toBe(a.faces.length)
  })
})
