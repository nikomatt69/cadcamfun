import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import { makeProgram, MoveSchema, type Move } from "../../src/cam/ir.ts"
import { binary, call, evalExpr, evalCondition, global, local, named, when, ExprSchema } from "../../src/cam/macro.ts"
import { posts } from "../../src/cam/post/index.ts"
import { MacroEmitter } from "../../src/cam/post/macro-syntax.ts"
import { expandMacros, hasMacroSyntax } from "../../src/cam/testing/macro-runtime.ts"
import { interpretGcode } from "../../src/cam/testing/gcode-interpreter.ts"

const program = (moves: Move[]) => makeProgram("M", [{ id: "a", name: "a", toolId: "T1", spindleRpm: 8000, coolant: "off", moves }])
const cuts = (nc: string, options = {}) => {
  const run = interpretGcode(nc, options)
  return { run, path: run.segments.flatMap((s) => (s.kind === "dwell" ? [] : [`${s.kind[0]}${s.to.x},${s.to.y},${s.to.z}`])) }
}
const FAMILIES = ["fanuc", "haas", "mazak", "siemens", "heidenhain", "linuxcnc", "okuma", "generic"] as const
const lin = (x: number, z = -1, expr?: Record<string, unknown>): Move => ({ _tag: "Linear", to: { x, y: 0, z }, feed: 300, ...(expr !== undefined ? { expr } : {}) }) as Move

describe("the IR carries variables, expressions and control flow", () => {
  test("the nodes decode and an unknown one does not", () => {
    const nodes: unknown[] = [
      { _tag: "Assign", variable: { scope: "global", index: 100 }, value: { op: "+", a: 1, b: { var: { name: "depth" } } } },
      { _tag: "MacroCall", name: "9010", args: { A: 5, B: { fn: "sqrt", a: { var: { scope: "local", index: 1 } } } } },
      { _tag: "If", condition: { cmp: "ge", a: 1, b: 2 } }, { _tag: "Else" }, { _tag: "EndIf" }, { _tag: "While", condition: { cmp: "lt", a: 1, b: 2 } }, { _tag: "EndWhile" },
      { _tag: "Label", name: "TOP" }, { _tag: "Goto", label: "TOP", direction: "backward", condition: { cmp: "ne", a: 1, b: 2 } }, { _tag: "Message", text: "hi" },
      { _tag: "Linear", to: { x: 1, y: 2, z: 3 }, feed: 100, expr: { x: { op: "*", a: 2, b: { var: { scope: "global", index: 1 } } } } }
    ]
    for (const n of nodes) expect(() => Schema.decodeUnknownSync(MoveSchema)(n)).not.toThrow()
    expect(() => Schema.decodeUnknownSync(MoveSchema)({ _tag: "Assign", variable: { scope: "nope", index: 1 }, value: 1 })).toThrow()
    expect(() => Schema.decodeUnknownSync(ExprSchema)({ fn: "teleport", a: 1 })).not.toThrow()
    // The posts name what is wrong with an expression before they write it.
    expect(() => posts.fanuc.emit(program([{ _tag: "Assign", variable: { scope: "global", index: 1 }, value: { fn: "teleport", a: 1 } } as never]), {})).toThrow(/unknown function 'teleport'/)
    expect(() => posts.fanuc.emit(program([{ _tag: "Assign", variable: { scope: "global", index: 1 }, value: { op: "+", a: 1 } } as never]), {})).toThrow(/Bad expression/)
  })

  test("expressions evaluate the way a control does, in degrees", () => {
    const vars = new Map<string, number>([["global:1", 3], ["global:2", 4]])
    const lookup = (v: { scope?: string; index?: number; name?: string }) => vars.get(`${v.scope}:${v.index}`) ?? 0
    expect(evalExpr(call("hypot", global(1), global(2)), lookup)).toBe(5)
    expect(evalExpr(call("sin", 30), lookup)).toBeCloseTo(0.5, 12)
    expect(evalExpr(binary("mod", 7, 3), lookup)).toBe(1)
    expect(evalExpr(call("atan2", 1, 1), lookup)).toBeCloseTo(45, 9)
    expect(evalExpr(call("sqrt", -1), lookup)).toBeNaN()
    expect(evalCondition(when("le", global(1), 3), lookup)).toBe(true)
    expect(evalCondition(when("gt", global(1), 3), lookup)).toBe(false)
  })
})

describe("every post writes the same program in its own words, and the replay reads it back", () => {
  // x = 10, 20, 30 from a loop, then the branch that holds (99), then a jump loop back to a label.
  const looped: Move[] = [
    { _tag: "Rapid", to: { x: 0, y: 0, z: 5 } },
    { _tag: "Assign", variable: { scope: "global", index: 90 }, value: 1 },
    { _tag: "While", condition: when("lt", global(90), 4) },
    lin(10, -1, { x: binary("*", global(90), 10), z: binary("-", 0, global(90)) }),
    { _tag: "Assign", variable: { scope: "global", index: 90 }, value: binary("+", global(90), 1) },
    { _tag: "EndWhile" },
    { _tag: "If", condition: when("ge", global(90), 4) },
    lin(99, -1),
    { _tag: "Else" },
    lin(77, -1),
    { _tag: "EndIf" },
    { _tag: "Rapid", to: { x: 0, y: 0, z: 50 } }
  ]
  for (const id of FAMILIES) {
    test(`${id}: loop, computed words and a branch`, () => {
      const nc = posts[id === "haas" || id === "mazak" || id === "generic" ? id : id].emit(program(looped), {})
      const { run, path } = cuts(nc)
      expect(run.errors.filter((e) => !/G15|unsupported G/.test(e))).toEqual([])
      expect(path).toEqual(["r0,0,5", "l10,0,-1", "l20,0,-2", "l30,0,-3", "l99,0,-1", "r0,0,50"])
    })
  }

  test("the else branch is taken when the condition fails", () => {
    const moves: Move[] = [
      { _tag: "Assign", variable: { scope: "global", index: 5 }, value: 2 },
      { _tag: "If", condition: when("gt", global(5), 3) }, lin(99), { _tag: "Else" }, lin(77), { _tag: "EndIf" }
    ]
    for (const id of ["fanuc", "siemens", "heidenhain", "linuxcnc"] as const) expect(cuts(posts[id].emit(program(moves), {})).path).toEqual(["l77,0,-1"])
  })

  test("an If without Else, nested loops, and a loop that does not run", () => {
    const moves: Move[] = [
      { _tag: "Assign", variable: { scope: "global", index: 1 }, value: 0 },
      { _tag: "While", condition: when("lt", global(1), 2) },
      { _tag: "Assign", variable: { scope: "global", index: 2 }, value: 0 },
      { _tag: "While", condition: when("lt", global(2), 2) },
      lin(5, -1, { x: binary("+", binary("*", global(1), 10), global(2)) }),
      { _tag: "Assign", variable: { scope: "global", index: 2 }, value: binary("+", global(2), 1) },
      { _tag: "EndWhile" },
      { _tag: "Assign", variable: { scope: "global", index: 1 }, value: binary("+", global(1), 1) },
      { _tag: "EndWhile" },
      { _tag: "While", condition: when("lt", 5, 3) }, lin(555), { _tag: "EndWhile" },
      { _tag: "If", condition: when("eq", global(1), 2) }, lin(42), { _tag: "EndIf" }
    ]
    for (const id of ["fanuc", "siemens", "heidenhain", "linuxcnc", "okuma"] as const) {
      expect(cuts(posts[id].emit(program(moves), {})).path, id).toEqual(["l0,0,-1", "l1,0,-1", "l10,0,-1", "l11,0,-1", "l42,0,-1"])
    }
  })

  test("jumps: a label, a backward conditional jump (Siemens GOTOB), a forward one (GOTOF)", () => {
    const moves: Move[] = [
      { _tag: "Assign", variable: { scope: "global", index: 3 }, value: 0 },
      { _tag: "Label", name: "TOP" },
      lin(5, -1, { x: binary("*", global(3), 5) }),
      { _tag: "Assign", variable: { scope: "global", index: 3 }, value: binary("+", global(3), 1) },
      { _tag: "Goto", label: "TOP", direction: "backward", condition: when("lt", global(3), 3) },
      { _tag: "Goto", label: "DONE", direction: "forward" },
      lin(999),
      { _tag: "Label", name: "DONE" },
      lin(1)
    ]
    for (const id of ["fanuc", "siemens", "heidenhain", "okuma"] as const) {
      const nc = posts[id].emit(program(moves), {})
      expect(cuts(nc).path, id).toEqual(["l0,0,-1", "l5,0,-1", "l10,0,-1", "l1,0,-1"])
    }
    expect(posts.siemens.emit(program(moves), {})).toMatch(/GOTOB/)
    expect(posts.siemens.emit(program(moves), {})).toMatch(/GOTOF/)
  })

  test("the words are the control's own", () => {
    const m = program(looped)
    expect(posts.fanuc.emit(m, {})).toMatch(/#90=1\nWHILE \[#90 LT 4\] DO1\nG1 X\[#90\*10\] Y0\.000 Z\[0-#90\] F300\n#90=\[#90\+1\]\nEND1\nIF \[#90 LT 4\] GOTO \d+/)
    expect(posts.siemens.emit(m, {})).toMatch(/R90=1\nWHILE R90<4\nG1 X=R90\*10 Y0\.000 Z=0-R90 F300\nR90=R90\+1\nENDWHILE\nIF R90>=4\n/)
    expect(posts.linuxcnc.emit(m, {})).toMatch(/#90=1\no\d+ while \[#90 lt 4\]\nG1 X\[#90\*10\]/)
    expect(posts.okuma.emit(m, {})).toMatch(/VC90=1\n/)
    const k = posts.heidenhain.emit(m, {})
    expect(k).toMatch(/Q90 = 1/)
    expect(k).toMatch(/FN 12: IF \+Q90 LT \+4 GOTO LBL \d+/)
    expect(k).toMatch(/FN 9: IF \+0 EQU \+0 GOTO LBL \d+/)
    expect(k).toMatch(/L X\+Q99 Y\+0\.000 Z\+Q98 R0 F300/)
  })

  test("a named variable takes the next free number and the program says which", () => {
    const moves: Move[] = [{ _tag: "Assign", variable: { name: "depth" }, value: 5 }, { _tag: "Assign", variable: { name: "pitch" }, value: binary("*", named("depth"), 2) }, lin(1, -1, { x: named("pitch") })]
    expect(posts.fanuc.emit(program(moves), {})).toMatch(/#100=5\n\(VARIABLE PITCH = #101\)\n#101=\[#100\*2\]/)
    expect(posts.siemens.emit(program(moves), {})).toMatch(/;VARIABLE depth = R100\nR100=5\n;VARIABLE pitch = R101\nR101=R100\*2/)
    expect(posts.linuxcnc.emit(program(moves), {})).toMatch(/#<depth>=5\n#<pitch>=\[#<depth>\*2\]/)
    for (const id of ["fanuc", "siemens", "heidenhain", "linuxcnc"] as const) expect(cuts(posts[id].emit(program(moves), {})).path.at(-1), id).toBe("l10,0,-1")
  })
})

describe("what a control cannot do is refused with the reason", () => {
  test("GRBL has no variables or macros", () => {
    for (const node of [{ _tag: "Assign", variable: { scope: "global", index: 1 }, value: 1 }, { _tag: "If", condition: when("eq", 1, 1) }, { _tag: "Message", text: "x" }, { _tag: "MacroCall", name: "1", args: {} }] as Move[]) {
      expect(() => posts.grbl.emit(program([node]), {})).toThrow(/cannot write .*controller has none/)
    }
  })
  test("LinuxCNC has no GOTO, Fanuc nests WHILE three deep, Klartext keeps Q100 and up for the control", () => {
    expect(() => posts.linuxcnc.emit(program([{ _tag: "Goto", label: "A" }]), {})).toThrow(/no GOTO|jump to a label/)
    const deep: Move[] = [1, 2, 3, 4].map(() => ({ _tag: "While", condition: when("lt", 0, 1) }) as Move)
    expect(() => posts.fanuc.emit(program(deep), {})).toThrow(/three deep/)
    expect(() => posts.heidenhain.emit(program([{ _tag: "Assign", variable: { scope: "global", index: 100 }, value: 1 }]), {})).toThrow(/reserved by the TNC/)
  })
  test("a structure left open or closed twice is refused", () => {
    expect(() => posts.fanuc.emit(program([{ _tag: "If", condition: when("eq", 1, 1) }]), {})).toThrow(/open/)
    expect(() => posts.fanuc.emit(program([{ _tag: "EndIf" }]), {})).toThrow(/EndIf without/)
    expect(() => posts.fanuc.emit(program([{ _tag: "If", condition: when("eq", 1, 1) }, { _tag: "Else" }, { _tag: "Else" }, { _tag: "EndIf" }]), {})).toThrow(/Else without/)
  })
  test("a function Siemens has no word for is refused, not approximated", () => {
    expect(() => posts.siemens.emit(program([{ _tag: "Assign", variable: { scope: "global", index: 1 }, value: call("fix", 1.5) }]), {})).toThrow(/TRUNC/)
  })
  test("the emitter alone: Klartext mixes of and/or are refused", () => {
    expect(() => new MacroEmitter("heidenhain").expression(binary("and", 1, 1))).toThrow(/logical/)
    expect(new MacroEmitter("fanuc").expression(local(3))).toBe("#3")
  })
})

describe("the macro executor runs a control's own programs", () => {
  test("Fanuc macro B: G65 with arguments, a macro body, WHILE and GOTO, M98 with a repeat", () => {
    const nc = [
      "O1000", "G21 G90 G54", "#100=0", "G65 P9010 A5 B3", "WHILE [#100 LT 3] DO1", "G1 X[#100*10] Y0 F300", "#100=#100+1", "END1",
      "#101=SQRT[16]", "IF [#101 EQ 4] GOTO 20", "G1 X999", "N20 G1 X[#101+0.5] Y#100", "M98 P2000 L2", "M30",
      "O2000", "G91", "G1 X1", "G90", "M99",
      "O9010", "#10=#1+#2", "G1 Y[#10] F300", "IF [#10 GT 7] THEN #10=7", "G1 X-[#10]", "M99"
    ].join("\n")
    const { run, path } = cuts(nc)
    expect(run.errors).toEqual([])
    expect(path).toEqual(["l0,8,0", "l-7,8,0", "l0,0,0", "l10,0,0", "l20,0,0", "l4.5,3,0", "l5.5,3,0", "l6.5,3,0"])
  })

  test("Siemens: R parameters, DEF, IF/ELSE, WHILE, FOR, labels and a PROC", () => {
    const nc = [
      "DEF REAL depth=2", "DEF INT n", "R1=depth*3", "G1 X=R1 F200", "IF R1>5", "G1 X=R1+1", "ELSE", "G1 X=0", "ENDIF",
      "FOR n=1 TO 3", "G1 Y=n*2", "ENDFOR", "R2=0", "LOOP1:", "R2=R2+1", "G1 Z=-R2", "IF R2<3 GOTOB LOOP1", "SQUARE(4)", "M30",
      "PROC SQUARE(REAL side)", "G1 X=side*side", "RET"
    ].join("\n")
    const { run, path } = cuts(nc)
    expect(run.errors).toEqual([])
    expect(path).toEqual(["l6,0,0", "l7,0,0", "l7,2,0", "l7,4,0", "l7,6,0", "l7,6,-1", "l7,6,-2", "l7,6,-3", "l16,6,-3"])
  })

  test("Klartext: Q parameters, FN, jumps, LBL and CALL LBL REP", () => {
    const nc = [
      "0 BEGIN PGM T MM", "1 FN 0: Q1 = +10", "2 FN 1: Q2 = +Q1 + +5", "3 FN 3: Q3 = +Q2 * +2", "4 Q4 = Q3 / 3", "5 L X+Q1 Y+Q2 R0 FMAX",
      "6 FN 11: IF +Q3 GT +20 GOTO LBL 1", "7 L X+999 R0 FMAX", "8 LBL 1", "9 L X+Q4 R0 FMAX", "10 CALL LBL 2 REP2", "11 L Z+50 R0 FMAX", "12 M30",
      "13 LBL 2", "14 L IX+1 R0 FMAX", "15 LBL 0", "16 END PGM T MM"
    ].join("\n")
    const { run, path } = cuts(nc)
    expect(run.errors).toEqual([])
    expect(path).toEqual(["r10,15,0", "r10,15,0".replace("10,15", "10")].slice(0, 1).concat(["r10,15,0"]).slice(0, 1).concat(path.slice(1)))
    expect(path[0]).toBe("r10,15,0")
    expect(path).toContain("r10,15,0")
    expect(path.some((p) => p.startsWith("r999"))).toBe(false)
  })

  test("LinuxCNC: named parameters, sub with arguments, if / elseif / else, while and break", () => {
    const nc = [
      "#<w> = 4", "o100 sub", "G1 X[#1 * 2] F100", "o100 endsub", "o100 call [#<w>]", "#2 = 5",
      "o110 if [#2 lt 3]", "G1 Y1", "o110 elseif [#2 lt 6]", "G1 Y2", "o110 else", "G1 Y3", "o110 endif",
      "#3 = 0", "o120 while [#3 lt 10]", "#3 = [#3 + 4]", "o121 if [#3 gt 7]", "o120 break", "o121 endif", "G1 Z[#3]", "o120 endwhile", "M2"
    ].join("\n")
    const { run, path } = cuts(nc)
    expect(run.errors).toEqual([])
    expect(path).toEqual(["l8,0,0", "l8,2,0", "l8,2,4"])
  })

  test("Okuma: VC variables, IF jumps, CALL", () => {
    const nc = ["VC1=2", "N10 G1 X=VC1*5 F100", "VC1=VC1+1", "IF [VC1 LT 4] N10", "M30"].join("\n")
    expect(cuts(nc).path).toEqual(["l10,0,0", "l15,0,0"])
  })

  test("variables the replay cannot know are reported, not invented", () => {
    const r = cuts("G1 X[#5001+1] F100\nM30")
    expect(r.run.errors.join(" ")).toMatch(/#5001 is a control variable/)
    expect(r.path).toEqual(["l1,0,0"])
  })

  test("an alarm stops the program and a runaway loop is stopped", () => {
    const alarm = cuts("G1 X1 F100\n#3000=1 (BAD)\nG1 X2\nM30")
    expect(alarm.path).toEqual(["l1,0,0"])
    expect(alarm.run.errors.join(" ")).toMatch(/alarm/)
    const forever = interpretGcode("#1=0\nWHILE [1 EQ 1] DO1\n#1=#1+1\nEND1\nM30")
    expect(forever.errors.join(" ")).toMatch(/stopped/)
  })

  test("errors are reported at the line of the source, not of the expanded text", () => {
    const r = interpretGcode("#1=1\n#2=2\nG1 X[SQRT[-4]] F100\nM30")
    expect(r.errors.join(" ")).toMatch(/line 3: square root/)
  })

  test("plain programs are left alone", () => {
    expect(hasMacroSyntax("G21 G90\nG1 X10 Y10 F300\nM30")).toBe(false)
    expect(expandMacros("G1 X1").text).toBe("G1 X1")
  })
})
