import { describe, expect, test } from "bun:test"
import { MacroEmitter, familyOf } from "../../src/cam/post/macro-syntax.ts"
import {
  availableCycles, availableMacros, controllerOfPost, cycleSupport, defaultCycleValues, findCycle, generateCycleCode, generateMacro
} from "../../src/cam/cycles/index.ts"

const ISO = ["fanuc", "haas", "mazak", "okuma", "linuxcnc", "generic"] as const

describe("cycle catalog", () => {
  test("ISO posts insert the Fanuc blocks and Heidenhain inserts Klartext", () => {
    const drilling = findCycle("simple-drilling")!
    const fanuc = generateCycleCode(drilling, defaultCycleValues(drilling), "fanuc")
    for (const controller of ISO) {
      expect(availableCycles(controller)).toHaveLength(17)
      expect(generateCycleCode(drilling, defaultCycleValues(drilling), controller)).toBe(fanuc)
    }
    expect(availableCycles("heidenhain")).toHaveLength(17)
    expect(generateCycleCode(drilling, defaultCycleValues(drilling), "heidenhain")).toContain("CYCL DEF 200")
    expect(generateCycleCode(drilling, defaultCycleValues(drilling), "heidenhain")).not.toContain("G81")
  })

  test("Siemens inserts six native cycles and refuses the rest", () => {
    expect(availableCycles("siemens").map((cycle) => cycle.id)).toEqual([
      "simple-drilling", "peck-drilling", "tapping-cycle", "boring-cycle", "rectangular-pocket", "slot-milling"
    ])
    expect(cycleSupport("siemens").note).toContain("POCKET3")
    const drilling = findCycle("simple-drilling")!
    const block = generateCycleCode(drilling, defaultCycleValues(drilling), "siemens")
    expect(block).toContain("CYCLE81(5, 0, 1, , -20)")
    expect(block).not.toContain("G81")
    expect(generateCycleCode(findCycle("peck-drilling")!, defaultCycleValues(findCycle("peck-drilling")!), "siemens")).toContain("CYCLE83(")
    expect(generateCycleCode(findCycle("tapping-cycle")!, defaultCycleValues(findCycle("tapping-cycle")!), "siemens")).toContain("CYCLE84(")
    expect(generateCycleCode(findCycle("boring-cycle")!, defaultCycleValues(findCycle("boring-cycle")!), "siemens")).toContain("CYCLE85(")
    expect(generateCycleCode(findCycle("rectangular-pocket")!, defaultCycleValues(findCycle("rectangular-pocket")!), "siemens")).toContain("POCKET3(")
    expect(generateCycleCode(findCycle("slot-milling")!, defaultCycleValues(findCycle("slot-milling")!), "siemens")).toContain("SLOT1(")
    expect(() => generateCycleCode(findCycle("contour-milling")!, {}, "siemens")).toThrow(/contour-milling/)
    expect(() => generateCycleCode(drilling, { ...defaultCycleValues(drilling), depth: -1 }, "siemens")).toThrow(/depth/)
  })

  test("a dwell at the bottom of a Siemens drill is CYCLE82", () => {
    const drilling = findCycle("simple-drilling")!
    const block = generateCycleCode(drilling, { ...defaultCycleValues(drilling), dwellTime: 0.5 }, "siemens")
    expect(block).toContain("CYCLE82(5, 0, 1, , -20, 0.5)")
  })

  test("GRBL has neither cycles nor macros", () => {
    expect(controllerOfPost("grbl")).toBe("grbl")
    expect(controllerOfPost("brother")).toBe("generic")
    expect(cycleSupport("grbl")).toEqual({ cycles: false, macros: false, note: "GRBL has no variables, macros or fixed cycles." })
    expect(availableCycles("grbl")).toHaveLength(0)
    expect(availableMacros("grbl")).toHaveLength(0)
    expect(() => generateMacro("assign", { index: 100, value: 1 }, "grbl")).toThrow(/variable/)
  })
})

describe("macro snippets", () => {
  test("every macro family inserts the words its post would write", () => {
    for (const controller of ["fanuc", "haas", "okuma", "siemens", "heidenhain", "linuxcnc"] as const) {
      const family = familyOf(controller)
      const snippets = availableMacros(controller)
      expect(snippets.map((snippet) => snippet.id)).toContain("assign")
      const assign = snippets.find((snippet) => snippet.id === "assign")!
      const index = Number(assign.parameters.find((param) => param.name === "index")!.defaultValue)
      const value = Number(assign.parameters.find((param) => param.name === "value")!.defaultValue)
      const emitter = new MacroEmitter(family)
      const expected = emitter.node({ _tag: "Assign", variable: { scope: "global", index }, value }).map((line) => line.replace(/^KT:/, "")).join("\n")
      expect(generateMacro("assign", { index, value }, controller)).toBe(expected)

      const limit = 5
      const condition = { cmp: "lt" as const, a: { var: { scope: "global" as const, index } }, b: limit }
      const flow = new MacroEmitter(family)
      const body = family === "siemens" || family === "heidenhain" ? "; BODY" : "(BODY)"
      const ifLines = [...flow.node({ _tag: "If", condition }), body, ...flow.node({ _tag: "EndIf" })].map((line) => line.replace(/^KT:/, ""))
      expect(generateMacro("if", { index, limit }, controller)).toBe(ifLines.join("\n"))
      const loop = new MacroEmitter(family)
      const whileLines = [...loop.node({ _tag: "While", condition }), body, ...loop.node({ _tag: "EndWhile" })].map((line) => line.replace(/^KT:/, ""))
      expect(generateMacro("while", { index, limit }, controller)).toBe(whileLines.join("\n"))
      const note = new MacroEmitter(family)
      expect(generateMacro("message", { text: "Check part" }, controller)).toBe(note.node({ _tag: "Message", text: "Check part" }).map((line) => line.replace(/^KT:/, "")).join("\n"))
    }
  })

  test("Heidenhain adds a tool call and a cycle call, and refuses a reserved Q", () => {
    expect(generateMacro("tool-call", { tool: 2, speed: 8000 }, "heidenhain")).toBe("TOOL CALL 2 Z S8000")
    expect(generateMacro("tool-call", { tool: 2 }, "fanuc")).toBe("T2 M6")
    expect(generateMacro("cycle-call", { x: 10, y: 0 }, "heidenhain")).toBe("CYCL CALL\nL X+10 Y+0 R0 FMAX M99")
    expect(() => generateMacro("assign", { index: 150, value: 1 }, "heidenhain")).toThrow(/index/)
    expect(() => generateMacro("cycle-call", { x: 0, y: 0 }, "siemens")).toThrow(/cycle-call/)
  })
})
