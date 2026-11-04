import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import type { Stock, Tool } from "../tool.ts"
import type { Toolpath } from "../ir.ts"
import { EngraveParams, generateEngrave } from "./engrave.ts"
import { ProfileParams, generateProfile } from "./profile.ts"

const tool: Tool = { id: "t", name: "t", kind: "endmill", diameter: 3, flutes: 2, maxRpm: 20000 }
const stock: Stock = { x: 200, y: 200, z: 10, origin: { x: 0, y: 0, z: 0 }, material: "aluminum" }

/** Pseudo-random scattered strokes (fixed seed). */
const strokes = (n: number) => {
  let s = 12345
  const r = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff }
  return Array.from({ length: n }, () => { const x = r() * 180, y = r() * 180; return { points: [{ x, y }, { x: x + 4 + r() * 6, y: y + r() * 6 }], closed: false } })
}

/** Length of the moves made above the stock top (rapids between cuts). */
const airLength = (tp: Toolpath): number => {
  let p = { x: 0, y: 0, z: 0 }, len = 0
  for (const m of tp.moves) {
    if (m._tag === "Comment") continue
    if (m._tag === "Rapid") len += Math.hypot(m.to.x - p.x, m.to.y - p.y)
    if ("to" in m) p = m.to
  }
  return len
}
const cutLength = (tp: Toolpath): number => {
  let p = { x: 0, y: 0, z: 0 }, len = 0
  for (const m of tp.moves) {
    if (m._tag === "Linear") len += Math.hypot(m.to.x - p.x, m.to.y - p.y)
    if ("to" in m) p = m.to
  }
  return len
}

describe("shortest chain ordering in the operations (spec 69 F11)", () => {
  test("engrave: 40 scattered strokes, the air travel falls at least 15 % and the cutting length is unchanged", () => {
    const paths = strokes(40)
    const make = (ordering: "input" | "shortest") => generateEngrave(Schema.decodeUnknownSync(EngraveParams)({ totalDepth: 0.5, stepdown: 0.5, ordering }), paths as never, tool, stock)
    const input = make("input"), shortest = make("shortest")
    expect(cutLength(shortest)).toBeCloseTo(cutLength(input), 6)
    expect(airLength(shortest)).toBeLessThanOrEqual(airLength(input) * 0.85)
  })

  test("profile: ordering is a parameter, defaults to shortest and keeps every contour", () => {
    const squares = Array.from({ length: 12 }, (_, i) => { const x = (i * 37) % 160 + 5, y = ((i * 71) % 160) + 5; return { points: [{ x, y }, { x: x + 10, y }, { x: x + 10, y: y + 10 }, { x, y: y + 10 }], closed: true } })
    const make = (ordering: "input" | "shortest") => generateProfile(Schema.decodeUnknownSync(ProfileParams)({ totalDepth: 1, stepdown: 1, side: "outside", ordering }), squares as never, tool, stock)
    const input = make("input"), shortest = make("shortest")
    expect(Schema.decodeUnknownSync(ProfileParams)({ totalDepth: 1, stepdown: 1, side: "outside" }).ordering).toBe("shortest")
    expect(cutLength(shortest)).toBeCloseTo(cutLength(input), 6)
    expect(airLength(shortest)).toBeLessThanOrEqual(airLength(input))
  })
})
