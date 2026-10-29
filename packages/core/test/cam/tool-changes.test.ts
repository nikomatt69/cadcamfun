import { describe, expect, test } from "bun:test"
import { analyseGcode } from "../../src/cam/generator/analysis.ts"
import { findOperationMarkers, findToolChanges, nameTools } from "../../src/cam/testing/tool-words.ts"
import { parseToolpath } from "../../src/cam/viewer/toolpath.ts"
import { interpretGcode } from "../../src/cam/testing/gcode-interpreter.ts"

const cut = (z: number, x: number) => `G0 X0 Y0 Z5\nG1 Z${z} F300\nX${x}`

describe("tool changes, whatever the control writes (spec 69 G4b)", () => {
  const cases: Record<string, { gcode: string; tools: number[] }> = {
    "Fanuc: T and M6 in one block, then T on its own line before M6": {
      gcode: `G21 G90\nT1 M6\n${cut(-1, 10)}\nT2\nM6\n${cut(-2, 20)}\nM30`, tools: [1, 2]
    },
    "M6 before T (LinuxCNC)": { gcode: `G21 G90\nM6 T1\n${cut(-1, 10)}\nM6 T3\n${cut(-2, 20)}\nM2`, tools: [1, 3] },
    "Siemens named tools": { gcode: `G71 G90\nT="ENDMILL6"\nM6\n${cut(-1, 10)}\nT="DRILL4"\nM6\n${cut(-2, 20)}\nT="ENDMILL6"\nM6\n${cut(-3, 30)}\nM30`, tools: [1, 2, 1] },
    "Siemens numeric T=": { gcode: `G71 G90\nT=5 M6\n${cut(-1, 10)}\nT=7 M6\n${cut(-2, 20)}\nM30`, tools: [5, 7] },
    "Heidenhain TOOL CALL": { gcode: "BEGIN PGM A MM\nTOOL CALL 1 Z S5000\nL X+0 Y+0 Z+5 FMAX\nL Z-1 F300\nL X+10\nTOOL CALL 4 Z S3000\nL X+0 Y+0 Z+5 FMAX\nL Z-2 F300\nL X+20\nEND PGM A MM", tools: [1, 4] },
    "a turret lathe: T0101 with no M6 changes the tool itself": { gcode: "G21 G18 G97\nT0101\nG0 X20 Z2\nG1 Z-10 F0.2\nT0202\nG0 X30 Z2\nG1 Z-5 F0.2\nM30", tools: [101, 202] }
  }
  for (const [title, c] of Object.entries(cases)) {
    test(title, () => {
      const changes = findToolChanges(c.gcode)
      expect(changes.map((x) => x.number)).toEqual(c.tools)
      // The change happens on the line that does it: the `M6`, the `TOOL CALL`, or the `T0101` of a lathe.
      const doing = c.gcode.split("\n").flatMap((l, i) => (/\bM0?6\b|TOOL CALL|^T\d{4}$/.test(l) ? [i + 1] : []))
      expect(changes.map((x) => x.line)).toEqual(doing)
      expect(parseToolpath(c.gcode).toolChanges.map((x) => x.number)).toEqual(c.tools)
    })
  }

  test("a tool named by Siemens keeps its name", () => {
    const named = nameTools('T="ENDMILL6"\nT="DRILL4"\nT="ENDMILL6"')
    expect(named.text).toBe("T1\nT2\nT1")
    expect(findToolChanges('M6 T="DRILL4"\n').map((x) => x.name)).toEqual(["DRILL4"])
  })

  test("a T read before M6 is a preselect: the moves in between belong to the tool still in the spindle", () => {
    const gcode = `G21 G90\nT1 M6\n${cut(-1, 10)}\nT2\nX15\nG0 Z50\nM6\n${cut(-2, 20)}\nM30`
    const run = interpretGcode(gcode, { track: true })
    const at = (x: number) => run.states![run.segments.findIndex((s) => s.kind === "linear" && Math.abs(s.to.x - x) < 1e-9)]!.tool
    expect(at(10)).toBe(1)
    expect(at(15)).toBe(1)
    expect(at(20)).toBe(2)
    expect(run.tools).toEqual([1, 2])
  })

  test("the analysis splits the program at every tool change and names Siemens tools", () => {
    const a = analyseGcode(cases["Siemens named tools"]!.gcode)
    expect(a.program.toolpaths.map((t) => t.toolId)).toEqual(["T1", "T2", "T1"])
    expect(a.program.toolpaths[1]!.name).toContain("DRILL4")
    expect(a.toolChanges.map((x) => x.number)).toEqual([1, 2, 1])
  })
})

describe("operations that use more than one tool", () => {
  const nc = [
    "G21 G90 G54", "(OP 1: Rough the pocket | T1)", "T1 M6", "M3 S8000", cut(-3, 10), "T2", "M6", cut(-3, 20),
    "(OP 2: Finish the pocket | T2)", cut(-5, 30), "(OP 3: Drill | T3)", "T3 M6", cut(-8, 40), "M30"
  ].join("\n")

  test("the comments name the operations", () => {
    expect(findOperationMarkers(nc).map((m) => [m.number, m.name])).toEqual([[1, "Rough the pocket"], [2, "Finish the pocket"], [3, "Drill"]])
  })

  test("an operation with two tools is one operation with two toolpaths, and two operations with one tool stay two", () => {
    const a = analyseGcode(nc)
    expect(a.operations.map((o) => [o.name, o.tools, o.multiTool])).toEqual([
      ["Rough the pocket", [1, 2], true],
      ["Finish the pocket", [2], false],
      ["Drill", [3], false]
    ])
    // Operation 2 starts with tool 2 still in the spindle: a toolpath of its own, not merged into operation 1's second tool.
    expect(a.program.toolpaths.map((t) => [t.operation?.id, t.toolId])).toEqual([["op-1", "T1"], ["op-1", "T2"], ["op-2", "T2"], ["op-3", "T3"]])
    expect(a.operations[0]!.toolpaths).toEqual([0, 1])
  })

  test("a kernel program with comment markers keeps its operations", () => {
    const kernelLike = ["O1000", "(OP 1: Face | T1 [FLAT-6])", "(OPERATION: Face)", "(OP1 Face)", "T1 M6", "M3 S8000", cut(-1, 10), "(OP 2: Pocket | T1 [FLAT-6])", "(OPERATION: Pocket)", cut(-3, 20), "M30"].join("\n")
    const a = analyseGcode(kernelLike)
    expect(a.operations.map((o) => o.name)).toEqual(["Face", "Pocket"])
    expect(a.program.toolpaths).toHaveLength(2)
  })

  test("a program with no operation comments is analysed as before", () => {
    const a = analyseGcode(`G21 G90\nT1 M6\n${cut(-1, 10)}\nM30`)
    expect(a.operations).toEqual([])
    expect(a.program.toolpaths).toHaveLength(1)
    expect(a.program.toolpaths[0]!.operation).toBeUndefined()
  })
})
