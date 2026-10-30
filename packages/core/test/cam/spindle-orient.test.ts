/**
 * Spindle orientation (IR `SpindleOrient`): back-boring through every post, the refusal of a control without the word, the replay
 * and the NC conversion. The tests read the NC text itself; none asserts a comment.
 */
import { describe, expect, test } from "bun:test"
import { makeProgram, type Move, type Program, type Toolpath, validate, estimateTime } from "../../src/cam/ir.ts"
import { generateBackBore } from "../../src/cam/operations/hole-cycles.ts"
import { DEFAULT_CUTTERS, findCutter } from "../../src/cam/kernel/cutters.ts"
import { convertNc, posts, vendorPosts } from "../../src/cam/post/index.ts"
import { definitionIssues, compileDefinition } from "../../src/cam/post/definition.ts"
import { interpretGcode } from "../../src/cam/testing/gcode-interpreter.ts"
import { buildTimeline } from "../../src/cam/viewer/timeline.ts"
import type { PostId } from "../../src/cam/post/types.ts"

const bar = findCutter(DEFAULT_CUTTERS, "boringbar-b16")!

const backBore = (): Toolpath =>
  generateBackBore({
    id: "bb", name: "Back bore", cycle: { kind: "back-bore", diameter: 16, pilotDiameter: 12, face: 0 }, tool: bar,
    points: [{ x: 10, y: 5 }], top: 12, bottom: -3.5, clearanceZ: 40, retractZ: 32, feed: 120, rpm: 2000, coolant: "flood"
  })

const program = (): Program => makeProgram("backbore", [backBore()])

/** Per post: how to recognise the orientation block and the angle-0 text. */
const WORDS: ReadonlyArray<{ readonly id: PostId | "mitsubishi" | "brother"; readonly word: RegExp }> = [
  { id: "generic", word: /^M19$/ },
  { id: "fanuc", word: /^M19$/ },
  { id: "mazak", word: /^M19$/ },
  { id: "okuma", word: /^M19$/ },
  { id: "mitsubishi", word: /^M19$/ },
  { id: "brother", word: /^M19$/ },
  { id: "haas", word: /^M19 P0$/ },
  { id: "siemens", word: /^SPOS=0$/ },
  { id: "linuxcnc", word: /^M19 R0 Q10$/ },
  { id: "heidenhain", word: /^CYCL DEF 13\.0 ORIENTATION$/ }
]

const emit = (id: PostId | "mitsubishi" | "brother", p: Program = program()): string[] => {
  const post = id === "mitsubishi" || id === "brother" ? vendorPosts[id] : posts[id]
  return post.emit(p, { header: false }).trimEnd().split("\n").map((l) => l.replace(/^\d+ /, "").trim())
}

describe("back-boring NC carries the orientation word", () => {
  for (const { id, word } of WORDS) {
    test(`${id}: before the shift and again before the withdrawal, with the spindle restarted before the feed`, () => {
      const lines = emit(id)
      const at = lines.flatMap((l, i) => (word.test(l) ? [i] : []))
      expect(at).toHaveLength(2)
      // The shift is the rapid onto X = 10 - 2.5 = 7.5 and it comes after the word, both times.
      const shiftLines = lines.flatMap((l, i) => (/X\+?7\.5\d*(?!\d)/.test(l) ? [i] : []))
      expect(shiftLines.length).toBeGreaterThanOrEqual(2)
      const firstShiftAfterFirst = shiftLines.find((i) => i > at[0]!)!
      expect(firstShiftAfterFirst).toBeGreaterThan(at[0]!)
      expect(firstShiftAfterFirst).toBeLessThan(at[1]!)
      expect(shiftLines.some((i) => i > at[1]!)).toBe(true)
      // The first word is not the first motion: the bar is over the hole already.
      expect(lines.slice(0, at[0]!).some((l) => /X\+?10(\.0+)?(?!\d)/.test(l))).toBe(true)
      // M3 S2000 (or, in Klartext, the TOOL CALL speed + M3) is written again after the first orientation, before the cutting feed.
      const feed = lines.findIndex((l, i) => i > at[0]! && /F120/.test(l))
      expect(feed).toBeGreaterThan(at[0]!)
      const restart = lines.findIndex((l, i) => i > at[0]! && i < feed && (/^M3 S2000$/.test(l) || (id === "heidenhain" && /^TOOL CALL Z S2000$/.test(l))))
      expect(restart).toBeGreaterThan(at[0]!)
    })
  }

  test("a control that takes no angle refuses a non-zero one; the others write it", () => {
    const at = (angle: number): Program => makeProgram("o", [{ ...backBore(), moves: backBore().moves.map((m): Move => (m._tag === "SpindleOrient" ? { _tag: "SpindleOrient", angle } : m)) }])
    for (const id of ["fanuc", "generic", "mazak", "okuma", "mitsubishi", "brother"] as const) expect(() => emit(id, at(90))).toThrow(/only to its own fixed mark/)
    expect(emit("haas", at(90))).toContain("M19 P90")
    expect(emit("haas", at(22.5))).toContain("M19 R22.5")
    expect(emit("siemens", at(90))).toContain("SPOS=90")
    expect(emit("linuxcnc", at(90))).toContain("M19 R90 Q10")
    expect(emit("heidenhain", at(90))).toContain("CYCL DEF 13.1 ANGLE90")
  })
})

describe("a post without the word refuses with a reason", () => {
  test("grbl", () => {
    expect(() => posts.grbl.emit(program())).toThrow(/grbl: this control has no spindle orientation/)
  })

  test("a post definition on the grbl base refuses too, and one on the Haas base writes it", () => {
    const grbl = compileDefinition({ schemaVersion: 1, name: "G", base: "grbl" })
    expect(definitionIssues({ schemaVersion: 1, name: "G", base: "grbl" })).toEqual([])
    expect(grbl.ok && (() => grbl.post.emit(program()))).toThrow(/no spindle orientation/)
    const haas = compileDefinition({ schemaVersion: 1, name: "H", base: "haas" })
    expect(haas.ok && haas.post.emit(program())).toContain("M19 P0")
  })

  test("the refusal comes before any output and names the cause even when the orientation is deep in a later toolpath", () => {
    const later: Toolpath = { id: "t2", name: "Later", toolId: "2", spindleRpm: 1000, coolant: "off", moves: [{ _tag: "Rapid", to: { x: 0, y: 0, z: 5 } }, { _tag: "SpindleOrient", angle: 0 }] }
    expect(() => posts.grbl.emit(makeProgram("p", [{ id: "a", name: "A", toolId: "1", spindleRpm: 1000, coolant: "off", moves: [{ _tag: "Rapid", to: { x: 0, y: 0, z: 5 } }] }, later]))).toThrow(/spindle orientation/)
  })
})

describe("replay and conversion", () => {
  for (const { id } of WORDS.filter((w) => w.id !== "mitsubishi" && w.id !== "brother")) {
    test(`${id}: the interpreter reads two orientation events, no motion, no unsupported word`, () => {
      const text = (id === "mitsubishi" ? vendorPosts.mitsubishi : posts[id as PostId]).emit(program(), { header: false })
      const run = interpretGcode(text, { dwell: id === "fanuc" || id === "mazak" ? "milliseconds" : "seconds", okuma: id === "okuma" })
      expect(run.errors).toEqual([])
      expect(run.unsupported).toEqual([])
      expect(run.orients).toHaveLength(2)
      expect(run.orients.map((o) => o.angle)).toEqual([0, 0])
      // The event sits between segments: after the rapid onto the hole and the dwell, never inside a motion.
      expect(run.orients[0]!.at).toBeGreaterThan(0)
      expect(run.orients[1]!.at).toBeGreaterThan(run.orients[0]!.at)
    })

    test(`${id}: convertNc to the same post keeps both orientations and the cutting path`, () => {
      const code = posts[id as PostId].emit(program(), { header: false })
      const converted = convertNc(code, { source: id as PostId, target: id as PostId })
      expect(converted.errors ?? []).toEqual([])
      expect(converted.ok).toBe(true)
      const moves = converted.program!.toolpaths.flatMap((t) => t.moves)
      expect(moves.filter((m) => m._tag === "SpindleOrient")).toHaveLength(2)
      // One operation: the stopped spindle does not split it (Klartext puts M5 M9 on the closing rapid, which is a toolpath of its own).
      expect(converted.program!.toolpaths[0]!.moves.filter((m) => m._tag === "SpindleOrient")).toHaveLength(2)
      expect(converted.program!.toolpaths[0]!.spindleRpm).toBe(2000)
      expect(converted.code.split("\n").filter((l) => /M19|SPOS|ORIENTATION/.test(l))).toHaveLength(2)
    })
  }

  test("a Haas angle survives the round trip into Siemens and LinuxCNC words", () => {
    const text = "G21 G90\nT1 M6\nM3 S2000\nG0 X10 Y5 Z30\nM19 P90\nG0 X7.5\nM3 S2000\nG1 Z10 F100\nG0 Z30\nM30\n"
    const run = interpretGcode(text)
    expect(run.orients.map((o) => o.angle)).toEqual([90])
    const siemens = convertNc(text, { source: "haas", target: "siemens" })
    expect(siemens.ok).toBe(true)
    expect(siemens.code).toContain("SPOS=90")
    expect(convertNc(text, { source: "haas", target: "linuxcnc" }).code).toContain("M19 R90 Q10")
    const refused = convertNc(text, { source: "haas", target: "grbl" })
    expect(refused.ok).toBe(false)
    expect(refused.errors?.join(" ")).toMatch(/no spindle orientation/)
    const fanuc = convertNc(text, { source: "haas", target: "fanuc" })
    expect(fanuc.ok).toBe(false)
    expect(fanuc.errors?.join(" ")).toMatch(/fixed mark/)
  })
})

describe("the move is data, not motion", () => {
  test("validation checks the angle, estimateTime and the timeline count a beat, nothing moves", () => {
    const tp = backBore()
    expect(estimateTime(tp, 5000)).toBeGreaterThan(estimateTime({ ...tp, moves: tp.moves.filter((m) => m._tag !== "SpindleOrient") }, 5000))
    const bad: Toolpath = { ...tp, moves: [{ _tag: "Rapid", to: { x: 0, y: 0, z: 5 } }, { _tag: "SpindleOrient", angle: 400 }] }
    const issues = validate(makeProgram("v", [bad]), { id: "m", travel: { minX: -500, maxX: 500, minY: -500, maxY: 500, minZ: -500, maxZ: 500 } })
    expect(issues.some((i) => i._tag === "InvalidInput" && /outside 0..360/.test(i.message))).toBe(true)
    const timeline = buildTimeline(makeProgram("t", [tp]))
    const beats = timeline.moves.filter((m) => m.kind === "dwell" && m.duration === 2)
    expect(beats).toHaveLength(2)
    for (const beat of beats) expect(beat.to).toEqual(beat.from)
  })
})
