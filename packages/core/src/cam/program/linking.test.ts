import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import type { Toolpath } from "../ir.ts"
import { PocketParams, generatePocket } from "../operations/pocket.ts"
import type { Stock, Tool } from "../tool.ts"
import { airTime, cuttingMoves, linkReport, minimiseRetracts, orderForLinking, type LinkItem } from "./linking.ts"

const tool: Tool = { id: "t", name: "flat", kind: "endmill", diameter: 6, flutes: 3, maxRpm: 20000 }
const stock: Stock = { x: 200, y: 200, z: 10, origin: { x: 0, y: 0, z: 0 }, material: "aluminum" }
const rect = (x: number, y: number, w: number) => [{ x, y }, { x: x + w, y }, { x: x + w, y: y + w }, { x, y: y + w }]
const pocket = (x: number, y: number): Toolpath =>
  generatePocket(Schema.decodeUnknownSync(PocketParams)({ totalDepth: 4, stepdown: 2, clearanceHeight: 40, safeHeight: 30, retractHeight: 20 }), rect(x, y, 14), tool, stock)

describe("minimiseRetracts", () => {
  test("a link between two cuts climbs only to the lowest safe level; cutting moves are identical", () => {
    const a = pocket(10, 10), b = pocket(150, 150)
    const tp: Toolpath = { ...a, moves: [...a.moves, ...b.moves] }
    const r = minimiseRetracts(tp, { lowSafeZ: 6 })
    expect(r.rewritten).toBeGreaterThan(0)
    expect(r.savedSeconds).toBeGreaterThan(0)
    expect(cuttingMoves(r.toolpath)).toEqual(cuttingMoves(tp))
    let pos = { x: 0, y: 0, z: 0 }
    let started = false
    for (const m of r.toolpath.moves) {
      if (m._tag !== "Rapid" && m._tag !== "Linear" && m._tag !== "Arc") continue
      if (m._tag === "Rapid" && started && Math.hypot(m.to.x - pos.x, m.to.y - pos.y) > 1e-9) expect(Math.min(pos.z, m.to.z)).toBeGreaterThanOrEqual(6 - 1e-9)
      pos = m.to; started = true
    }
  })
  test("a stay-low link and a link already at the safe level are left alone", () => {
    const tp: Toolpath = { id: "x", name: "x", toolId: "t", spindleRpm: 1000, coolant: "off", moves: [
      { _tag: "Rapid", to: { x: 0, y: 0, z: 10 } }, { _tag: "Linear", to: { x: 0, y: 0, z: -2 }, feed: 100 },
      { _tag: "Rapid", to: { x: 20, y: 0, z: -2 } },
      { _tag: "Linear", to: { x: 20, y: 10, z: -2 }, feed: 100 }, { _tag: "Rapid", to: { x: 20, y: 10, z: 8 } }, { _tag: "Rapid", to: { x: 40, y: 10, z: 8 } }
    ] }
    const r = minimiseRetracts(tp, { lowSafeZ: 8 })
    expect(r.toolpath.moves).toEqual(tp.moves)
    expect(r.rewritten).toBe(0)
  })
  test("measured air time over eight scattered pockets", () => {
    const paths = [[10, 10], [150, 20], [20, 150], [160, 160], [90, 90], [10, 90], [150, 90], [90, 10]].map(([x, y]) => pocket(x!, y!))
    const joined: Toolpath = { ...paths[0]!, moves: paths.flatMap((p) => p.moves) }
    const { report } = linkReport([joined], { lowSafeZ: 6 })
    expect(report.airAfter).toBeLessThan(report.airBefore)
    expect(report.reduction).toBeGreaterThan(0.15) // measured 18.6 % on this set
    expect(airTime(joined)).toBeCloseTo(report.airBefore, 9)
  })
})

describe("orderForLinking", () => {
  const item = (id: string, x: number, y: number, extra: Partial<LinkItem> = {}): LinkItem => ({ id, tool: "t1", start: { x, y }, end: { x, y }, ...extra })
  test("shortens the links of one tool and keeps the other tools' blocks apart", () => {
    const items = [item("a", 0, 0), item("b", 100, 100), item("c", 5, 0), item("d", 100, 105), item("e", 10, 0), item("f", 50, 50, { tool: "t2" })]
    const r = orderForLinking(items, { x: 0, y: 0 })
    expect(r.after).toBeLessThan(r.before)
    expect([...r.order].sort()).toEqual(["a", "b", "c", "d", "e", "f"])
    expect(r.order.indexOf("f")).toBe(5)
  })
  test("a fixed-order operation is a barrier", () => {
    const items = [item("r1", 90, 90), item("r2", 0, 0), item("fin", 50, 50, { reorderable: false }), item("s1", 100, 0), item("s2", 0, 100)]
    const r = orderForLinking(items, { x: 0, y: 0 })
    expect(r.order[2]).toBe("fin")
    expect(r.order.slice(0, 2)).toEqual(["r2", "r1"])
  })
})
