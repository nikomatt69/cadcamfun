/**
 * Heidenhain legacy cycle 19 WORKING PLANE (spec 72 P4-6): the tilted work plane written with the old cycle instead of
 * `PLANE SPATIAL`, opt-in per work plane (`PostOptions.workPlanes[id].legacy`).
 *
 * Cycle 19 takes the same three spatial angles as `PLANE SPATIAL SPA SPB SPC` (rotations about the fixed X, Y, Z axes in that
 * order), so a program written with it must replay to the same tool-tip positions as the `PLANE SPATIAL` program. The exact
 * legacy syntax is not qualified on a real control: it is the iTNC 530-era cycle, and the TNC 640 / TNC7 prefer `PLANE`.
 *
 * Truth is geometric and independent of the writer: the toolpath is in its plane's coordinates, so its tool tip is at
 * `workToWorld(frame, p)` in the work offset. The tolerance is declared: coordinates are written with 3 decimals and the angles
 * with 4 decimals, 0.002 mm in all (the same budget as `tilted-planes.test.ts`).
 */
import { describe, expect, test } from "bun:test"
import { frameFromNormal } from "../../src/cam/indexing.ts"
import { makeProgram, type Program, type Toolpath } from "../../src/cam/ir.ts"
import type { WorkFrame } from "../../src/cam/setup.ts"
import { workToWorld } from "../../src/cam/setup.ts"
import { fanucPost, grblPost, heidenhainPost, siemensPost, type PostOptions } from "../../src/cam/post/index.ts"
import { interpretGcode } from "../../src/cam/testing/gcode-interpreter.ts"

const TOL = 0.002
const swivel = { dataRecord: "TABLE_AC" }

const op = (id: string, tool: string, moves: Toolpath["moves"]): Toolpath => ({ id, name: `Op ${id}`, toolId: tool, spindleRpm: 8000, coolant: "off", moves })
/** A pocket-like path in plane coordinates: down into the plane, a square, a quarter circle, up. */
const local = (): Toolpath["moves"] => [
  { _tag: "Rapid", to: { x: 5, y: 5, z: 10 } },
  { _tag: "Linear", to: { x: 5, y: 5, z: -3 }, feed: 200 },
  { _tag: "Linear", to: { x: 45, y: 5, z: -3 }, feed: 600 },
  { _tag: "Linear", to: { x: 45, y: 35, z: -3 }, feed: 600 },
  { _tag: "Arc", to: { x: 25, y: 55, z: -3 }, center: { x: 25, y: 35 }, clockwise: false, feed: 500 },
  { _tag: "Linear", to: { x: 5, y: 35, z: -3 }, feed: 600 },
  { _tag: "Rapid", to: { x: 5, y: 35, z: 10 } }
]
const world = (frame: WorkFrame, moves: Toolpath["moves"]) => moves.flatMap((m) => (m._tag === "Rapid" || m._tag === "Linear" ? [workToWorld(frame, m.to)] : []))
const lines = (text: string) => text.trimEnd().split("\n").map((l) => l.replace(/^\d+ /, ""))
const idx = (ls: ReadonlyArray<string>, re: RegExp, from = 0) => ls.findIndex((l, i) => i >= from && re.test(l))

const frames: ReadonlyArray<readonly [string, WorkFrame]> = [
  ["tilted 45 deg about X", frameFromNormal({ x: 12, y: -7, z: 30 }, { x: 0, y: -Math.SQRT1_2, z: Math.SQRT1_2 })],
  ["side face, tool along +X", frameFromNormal({ x: 100, y: 20, z: -15 }, { x: 1, y: 0, z: 0 })],
  ["general normal", frameFromNormal({ x: -20, y: 40, z: 5 }, { x: 0.3, y: -0.5, z: 0.8 }, { x: 0.2, y: 1, z: 0 })],
  ["back face, tool along -Y (Siemens gimbal region)", frameFromNormal({ x: 0, y: 80, z: 0 }, { x: 0, y: -1, z: 0 })],
  ["upside down, tool along -Z (Euler singularity at 180)", frameFromNormal({ x: 3, y: 4, z: 5 }, { x: 0, y: 0, z: -1 })]
]

const tipsOf = (text: string) => {
  const r = interpretGcode(text, { dwell: "seconds" })
  expect(r.errors).toEqual([])
  return r.segments.flatMap((s) => (s.kind === "rapid" || s.kind === "linear" ? [s.to] : []))
}

const legacy = (frame: WorkFrame): Partial<PostOptions> => ({ workPlanes: { a: { frame, layout: "table-AC", legacy: true } } })
const spatial = (frame: WorkFrame): Partial<PostOptions> => ({ workPlanes: { a: { frame, layout: "table-AC" } } })

describe("Heidenhain legacy CYCL DEF 19 WORKING PLANE", () => {
  test("golden NC: the two cycle rows carry the spatial angles, and no PLANE SPATIAL is written", () => {
    const [, frame] = frames[0]!
    const program = makeProgram("legacy", [op("a", "1", local())])
    const text = heidenhainPost.emit(program, { ...legacy(frame), header: false })
    const ls = lines(text)
    const set = idx(ls, /^CYCL DEF 19\.0 WORKING PLANE$/)
    expect(set).toBeGreaterThan(-1)
    expect(ls.slice(set, set + 2)).toEqual(["CYCL DEF 19.0 WORKING PLANE", "CYCL DEF 19.1 A+45.0000 B+0.0000 C+0.0000"])
    expect(text).not.toContain("PLANE SPATIAL")
    // The datum is still the plane's origin, written with cycle 7 before the plane cycle.
    expect(ls.slice(set - 4, set)).toEqual(["CYCL DEF 7.0 DATUM SHIFT", "CYCL DEF 7.1 X+12.000", "CYCL DEF 7.2 Y-7.000", "CYCL DEF 7.3 Z+30.000"])
    const reset = idx(ls, /^CYCL DEF 19\.1 A\+0\.0000 B\+0\.0000 C\+0\.0000$/)
    expect(reset).toBeGreaterThan(set)
    expect(ls[reset - 1]).toBe("CYCL DEF 19.0 WORKING PLANE")
    expect(ls.slice(reset + 1, reset + 5)).toEqual(["CYCL DEF 7.0 DATUM SHIFT", "CYCL DEF 7.1 X+0.000", "CYCL DEF 7.2 Y+0.000", "CYCL DEF 7.3 Z+0.000"])
  })

  test("the replay lands on the same five tool-tip frames as PLANE SPATIAL", () => {
    for (const [, frame] of frames) {
      const program = makeProgram("legacy", [op("a", "1", local())])
      const old = tipsOf(heidenhainPost.emit(program, spatial(frame)))
      const text = heidenhainPost.emit(program, legacy(frame))
      // The old code ignored the flag and wrote PLANE SPATIAL; the replay test must see the legacy words, not just equal geometry.
      expect(text).toContain("CYCL DEF 19.0 WORKING PLANE")
      expect(text).not.toContain("PLANE SPATIAL")
      const got = tipsOf(text)
      expect(got).toHaveLength(old.length)
      for (let i = 0; i < got.length; i++) {
        const a = got[i]!, b = old[i]!
        expect(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)).toBeLessThanOrEqual(TOL)
      }
      // And every expected tip of the toolpath is among the replayed points: both programs are in the plane, not ignored.
      for (const want of world(frame, local())) expect(got.some((p) => Math.hypot(p.x - want.x, p.y - want.y, p.z - want.z) <= TOL)).toBe(true)
    }
  })

  test("the plane is cancelled before a tool change, before another plane and at the end", () => {
    const [, frame] = frames[0]!
    const side = frames[1]![1]
    const two = (): Program => makeProgram("setups", [
      op("a", "1", local()),
      op("b", "1", local()),
      op("c", "2", local())
    ])
    const ls = lines(heidenhainPost.emit(two(), { workPlanes: { a: { frame, layout: "table-AC", legacy: true }, b: { frame: side, layout: "table-AC", legacy: true }, c: { frame, layout: "table-AC", legacy: true } } }))
    const resets = ls.flatMap((l, i) => (l === "CYCL DEF 19.1 A+0.0000 B+0.0000 C+0.0000" ? [i] : []))
    // Every cycle 19 block is a set unless its row is the all-zero cancel.
    const sets = ls.flatMap((l, i) => (l === "CYCL DEF 19.0 WORKING PLANE" && !/^CYCL DEF 19\.1 A\+0\.0000 B\+0\.0000 C\+0\.0000$/.test(ls[i + 1] ?? "") ? [i] : []))
    expect(sets).toHaveLength(3)
    expect(resets).toHaveLength(3)
    // a -> b: the first plane is cancelled before the second is set.
    expect(resets[0]).toBeLessThan(sets[1]!)
    // b -> c: cancelled before the tool change.
    const change = idx(ls, /^TOOL CALL 2 /)
    expect(change).toBeGreaterThan(-1)
    expect(resets[1]).toBeLessThan(change)
    // At the end: after the last operation and before M30.
    expect(resets[2]).toBeGreaterThan(sets[2]!)
    expect(resets[2]).toBeLessThan(idx(ls, /^M30$/))
  })

  test("a control without the legacy word refuses it instead of writing PLANE SPATIAL or cutting in the wrong place", () => {
    const [, frame] = frames[0]!
    const program = makeProgram("legacy", [op("a", "1", local())])
    expect(() => fanucPost.emit(program, legacy(frame))).toThrow(/legacy cycle 19|legacy/)
    expect(() => siemensPost.emit(program, { ...legacy(frame), swivel })).toThrow(/legacy cycle 19|legacy/)
    expect(() => grblPost.emit(program, legacy(frame))).toThrow(/no tilted-plane words/)
  })
})
