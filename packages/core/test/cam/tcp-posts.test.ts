/**
 * Tool-centre-point commands in the posts (spec 51 F9): each control that has them opens a simultaneous five-axis section with its
 * own words and closes it again, a three-axis program is written exactly as before, and the replay interpreter reads every one of
 * the programs back to the same tool-tip path.
 */
import { describe, expect, test } from "bun:test"
import { type Program, type Toolpath, makeProgram } from "../../src/cam/ir.ts"
import { fanucPost, genericPost, haasPost, heidenhainPost, siemensPost, grblPost } from "../../src/cam/post/index.ts"
import { interpretGcode } from "../../src/cam/testing/gcode-interpreter.ts"

const tp = (moves: Toolpath["moves"]): Toolpath => ({ id: "t", name: "Five axis", toolId: "6", spindleRpm: 8100, coolant: "off", moves })
const program = (moves: Toolpath["moves"]): Program => makeProgram("Five axis", [tp(moves)], { metadata: { programNumber: "1234" } })

const simultaneous: Toolpath["moves"] = [
  { _tag: "Rapid", to: { x: 0, y: 0, z: 40 }, rotary: { b: 30, c: 0 } },
  { _tag: "Linear", to: { x: 5, y: 0, z: -2 }, feed: 1200, rotary: { b: 30, c: 0 } },
  { _tag: "Linear", to: { x: 6, y: 0, z: -2 }, feed: 1200, rotary: { b: 32, c: 0 } },
  { _tag: "Rapid", to: { x: 6, y: 0, z: 40 }, rotary: { b: 32, c: 0 } },
  { _tag: "Rapid", to: { x: 6, y: 0, z: 40 } },
  { _tag: "Linear", to: { x: 20, y: 0, z: -2 }, feed: 800 }
]
const threeAxis: Toolpath["moves"] = [
  { _tag: "Rapid", to: { x: 0, y: 0, z: 40 } },
  { _tag: "Linear", to: { x: 5, y: 0, z: -2 }, feed: 1200 },
  { _tag: "Linear", to: { x: 20, y: 0, z: -2 }, feed: 1200 }
]
const at = (text: string, word: string, from = 0): number => text.indexOf(word, from)
const TCP_WORDS = /G43\.4|G234|TRAORI|TRAFOOF|M128|M129/

describe("tool-centre-point commands, post by post", () => {
  test("Fanuc: G43.4 H before the first rotary block, G43 H after the section, the rotary words in between", () => {
    const text = fanucPost.emit(program(simultaneous))
    const on = at(text, "G43.4 H6"), b30 = at(text, "B30.000"), b32 = at(text, "B32.000"), off = at(text, "G43 H6", on)
    expect(on).toBeGreaterThan(-1)
    expect(on).toBeLessThan(b30)
    expect(off).toBeGreaterThan(b32)
    // The tail after the section runs with ordinary tool length compensation: no tip control is left on, and none is switched on twice.
    expect(text.match(/G43\.4 H6/g)).toHaveLength(1)
    expect(text.match(/G43 H6/g)).toHaveLength(2) // after the tool change, and back after the section
    expect(text.trimEnd().endsWith("%")).toBe(true)
  })

  test("Siemens: TRAORI before the section, TRAFOOF after it, no tool-length word (the edge data carries it)", () => {
    const text = siemensPost.emit(program(simultaneous))
    const on = at(text, "TRAORI"), b30 = at(text, "B30.000"), off = at(text, "TRAFOOF", on)
    expect(on).toBeGreaterThan(-1)
    expect(on).toBeLessThan(b30)
    expect(off).toBeGreaterThan(at(text, "B32.000"))
    expect(text).not.toContain("G43")
  })

  test("Heidenhain Klartext: M128 before the section, M129 after it, each on its own block", () => {
    const text = heidenhainPost.emit(program(simultaneous))
    const lines = text.trimEnd().split("\n").map((l) => l.replace(/^\d+ /, ""))
    const on = lines.indexOf("M128"), off = lines.indexOf("M129")
    expect(on).toBeGreaterThan(-1)
    expect(off).toBeGreaterThan(on)
    const firstTilted = lines.findIndex((l) => l.includes("B+30"))
    expect(on).toBeLessThan(firstTilted)
    expect(lines.findIndex((l) => l.includes("B+32"))).toBeLessThan(off)
  })

  test("Haas keeps G234 exactly as before", () => {
    const text = haasPost.emit(program(simultaneous))
    expect(at(text, "G234 H6")).toBeGreaterThan(-1)
    expect(at(text, "G43 H6", at(text, "G234 H6"))).toBeGreaterThan(at(text, "B32.000"))
  })

  test("each control switches the tip control off again after a section, and never leaves it on at the end", () => {
    const open: Toolpath["moves"] = simultaneous.slice(0, 3)
    const fanuc = fanucPost.emit(program(open)), siemens = siemensPost.emit(program(open)), klartext = heidenhainPost.emit(program(open))
    expect(fanuc.indexOf("G43 H6", fanuc.indexOf("G43.4 H6"))).toBeGreaterThan(-1)
    expect(fanuc.indexOf("G43 H6", fanuc.indexOf("G43.4 H6"))).toBeLessThan(fanuc.indexOf("M5"))
    expect(siemens.indexOf("TRAFOOF")).toBeGreaterThan(siemens.indexOf("TRAORI"))
    expect(siemens.indexOf("TRAFOOF")).toBeLessThan(siemens.indexOf("M5"))
    expect(klartext.indexOf("M129")).toBeGreaterThan(klartext.indexOf("M128"))
    expect(klartext.indexOf("M129")).toBeLessThan(klartext.indexOf("M5"))
  })

  test("a three-axis program carries no tool-centre-point word on any control", () => {
    for (const post of [fanucPost, siemensPost, haasPost, genericPost, grblPost]) expect(post.emit(program(threeAxis))).not.toMatch(TCP_WORDS)
    expect(heidenhainPost.emit(program(threeAxis))).not.toMatch(TCP_WORDS)
  })
})

describe("the replay reads each program back to the same tool-tip path", () => {
  const tip = (text: string) => {
    const r = interpretGcode(text)
    expect(r.errors).toEqual([])
    return r.segments.filter((s) => s.kind === "linear" || s.kind === "rapid").map((s) => s).length
  }

  test("Fanuc, Haas and Siemens replay without an error and with the same number of motions", () => {
    const counts = [fanucPost, haasPost, siemensPost].map((post) => tip(post.emit(program(simultaneous))))
    expect(new Set(counts).size).toBe(1)
    expect(counts[0]).toBeGreaterThan(3)
  })

  test("the command words are recorded, not silently dropped", () => {
    expect(interpretGcode(fanucPost.emit(program(simultaneous))).errors).toEqual([])
    expect(interpretGcode(heidenhainPost.emit(program(simultaneous))).mCodes).toEqual(expect.arrayContaining(["M128", "M129"]))
  })
})

describe("a program in machine coordinates carries no tip-control word", () => {
  test("tcp: false keeps every control from writing its TCP command, the rotary words stay", () => {
    for (const post of [fanucPost, siemensPost, haasPost, heidenhainPost]) {
      const text = post.emit(program(simultaneous), { tcp: false })
      expect(text).not.toMatch(TCP_WORDS)
      expect(text).toMatch(/B\+?30\.000/)
    }
  })

  test("by default the section is still bracketed", () => {
    for (const [post, word] of [[fanucPost, "G43.4"], [siemensPost, "TRAORI"], [haasPost, "G234"], [heidenhainPost, "M128"]] as const) {
      expect(post.emit(program(simultaneous))).toContain(word)
    }
  })
})
