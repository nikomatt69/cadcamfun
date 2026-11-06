import { describe, expect, test } from "bun:test"
import { DEFAULT_GEOMETRY, DEFAULT_SETTINGS, type GeometryInput } from "../../src/cam/generator/index.ts"
import { program, indexPlane, indexMatrix, boxInPartFrame } from "../../src/cam/index.ts"
import { interpretGcode } from "../../src/cam/testing/gcode-interpreter.ts"
import { analyseGcode } from "../../src/cam/generator/analysis.ts"

const { assignPockets, buildToolTable, generateSetup, planPrograms, reorderByTool, validateSetup, DEFAULT_POST_CONFIG } = program

const tool = (id: string, diameter: number): program.Operation["tool"] => ({ id, name: `Endmill Ø${diameter}`, kind: "endmill", diameter, flutes: 2, maxRpm: 18000 })
const rect = { id: "r", type: "rectangle", x: 0, y: 0, z: 0, width: 40, height: 30, depth: 5 }
const hole = { id: "h", type: "circle", x: 0, y: 0, z: 0, radius: 4, depth: 5 }

const op = (id: string, t: ReturnType<typeof tool>, over: Partial<program.Operation> = {}, params: Partial<typeof DEFAULT_SETTINGS> = {}): program.Operation => ({
  id, name: `Op ${id}`, elementIds: [id], tool: t, enabled: true, fromPreviousStock: false,
  params: { ...DEFAULT_SETTINGS, depth: 2, stepdown: 1, toolDiameter: t.diameter, operationType: "pocket", ...params },
  ...over
})
const geometryOf = (o: program.Operation): GeometryInput => ({ ...DEFAULT_GEOMETRY, geometryType: "selected", selectedElements: [o.id === "a" || o.id === "c" ? rect : hole] })

const t6 = tool("t6", 6), t3 = tool("t3", 3)
const setup = (operations: ReadonlyArray<program.Operation>, over: Partial<program.Setup> = {}): program.Setup => ({
  id: "s", name: "Bracket", machineType: "mill", workOffset: "G54", post: { ...DEFAULT_POST_CONFIG, postId: "fanuc" },
  grouping: "single", retractBeforeToolChange: false, operations, ...over
})

describe("pockets and the tool table", () => {
  test("explicit pockets are honoured, a tool keeps one pocket, automatic numbers skip the taken ones", () => {
    const ops = [op("a", t6), op("b", t3, { pocket: 1 }), op("c", t6), op("d", tool("t8", 8))]
    const pockets = assignPockets(ops)
    expect(pockets.get("b")).toBe(1)
    expect(pockets.get("a")).toBe(2)
    expect(pockets.get("c")).toBe(2)
    expect(pockets.get("d")).toBe(3)
    const table = buildToolTable(ops)
    expect(table.entries.map((e) => [e.pocket, e.tool.id, e.operationIds])).toEqual([[1, "t3", ["b"]], [2, "t6", ["a", "c"]], [3, "t8", ["d"]]])
    expect(table.warnings).toEqual([])
  })

  test("two tools in one pocket are reported, not thrown", () => {
    const issues = validateSetup(setup([op("a", t6, { pocket: 2 }), op("b", t3, { pocket: 2 })]))
    expect(issues.some((i) => /Pocket T2 holds/.test(i.message))).toBe(true)
  })
})

describe("planning", () => {
  const ops = [op("a", t6), op("b", t3), op("c", t6)]

  test("single: one program, a tool change per switch, and the avoidable one is named", () => {
    const plan = planPrograms(setup(ops))
    expect(plan.programs).toHaveLength(1)
    expect(plan.programs[0]).toMatchObject({ programNumber: 1000, toolNumbers: [1, 2], operations: ["a", "b", "c"] })
    expect(plan.toolChanges).toBe(2)
    expect(plan.toolLoads).toBe(3)
    expect(plan.warnings.join(" ")).toMatch(/used again after another tool/)
  })

  test("reordering by tool saves the change; perTool and perOperation cut the program differently", () => {
    const sorted = reorderByTool(ops)
    expect(sorted.map((o) => o.id)).toEqual(["a", "c", "b"])
    expect(planPrograms(setup(sorted)).toolChanges).toBe(1)
    const perTool = planPrograms(setup(ops, { grouping: "perTool" }))
    expect(perTool.programs.map((p) => p.operations)).toEqual([["a", "c"], ["b"]])
    expect(perTool.programs.map((p) => p.programNumber)).toEqual([1000, 1001])
    expect(perTool.toolChanges).toBe(0)
    expect(perTool.toolLoads).toBe(2)
    expect(planPrograms(setup(ops, { grouping: "perOperation" })).programs).toHaveLength(3)
  })

  test("a disabled operation is not planned", () => {
    expect(planPrograms(setup([op("a", t6), op("b", t3, { enabled: false })])).programs[0]!.operations).toEqual(["a"])
  })
})

describe("generating a setup: one program, one emit", () => {
  test("two tools post one program: one header, one M30, T1 M6 and T2 M6 in order", () => {
    const g = generateSetup(setup([op("a", t6), op("b", t3)]), geometryOf)
    expect(g.programs).toHaveLength(1)
    const nc = g.programs[0]!.gcode
    expect((nc.match(/M30/g) ?? []).length).toBe(1)
    expect((nc.match(/^%$/gm) ?? []).length).toBeLessThanOrEqual(2)
    const t1 = nc.search(/T1\s*M6/), t2 = nc.search(/T2\s*M6/)
    expect(t1).toBeGreaterThanOrEqual(0)
    expect(t2).toBeGreaterThan(t1)
    expect(nc).toMatch(/O1000/)
    expect(g.totals).toMatchObject({ programs: 1, toolChanges: 1, toolLoads: 2 })
    expect(g.totals.cutLength).toBeGreaterThan(0)
    expect(g.programs[0]!.program.toolpaths.map((t) => t.toolId)).toEqual(["t6", "t3"])
  })

  test("the carousel numbers are the setup's: an explicit pocket is written as that T", () => {
    const nc = generateSetup(setup([op("a", t6, { pocket: 7 }), op("b", t3, { pocket: 3 })]), geometryOf).programs[0]!.gcode
    expect(nc).toMatch(/T7\s*M6/)
    expect(nc).toMatch(/T3\s*M6/)
  })

  test("perTool writes one file per tool, each with its own header and end, numbered one after the other", () => {
    const g = generateSetup(setup([op("a", t6), op("b", t3), op("c", t6)], { grouping: "perTool" }), geometryOf)
    expect(g.programs.map((p) => p.programNumber)).toEqual([1000, 1001])
    expect(g.programs.map((p) => p.operationIds)).toEqual([["a", "c"], ["b"]])
    for (const p of g.programs) expect((p.gcode.match(/M30/g) ?? []).length).toBe(1)
    expect(g.programs[1]!.gcode).toMatch(/O1001/)
  })

  test("retractBeforeToolChange is handed to the post: a program that already ends its operation at the highest Z is unchanged", () => {
    const ops = [op("a", t6), op("b", t3)]
    const off = generateSetup(setup(ops), geometryOf).programs[0]!.gcode
    const on = generateSetup(setup(ops, { retractBeforeToolChange: true }), geometryOf).programs[0]!.gcode
    // Each pocket retracts to clearance (Z30) at its end, the highest Z of the program, so the change needs no extra rise.
    expect(on).toBe(off)
    expect(off).toMatch(/G0 Z30\.000\n\(OPERATION: OP B\)\nM5\nM9\nT2 M6/)
  })

  test("an operation with a validation problem is skipped with the reason, the rest still posts", () => {
    const bad = op("b", t3, { elementIds: [] })
    const g = generateSetup(setup([op("a", t6), bad]), geometryOf)
    expect(g.issues.some((i) => i.operationId === "b")).toBe(true)
    expect(g.programs[0]!.operationIds).toEqual(["a"])
    expect(g.warnings.join(" ")).toMatch(/Op b is skipped/)
  })

  test("an operation whose geometry cannot be read fails alone: the others still post and the failure is named", () => {
    const g = generateSetup(setup([op("a", t6), op("b", t3), op("c", t6)]), (o) => { if (o.id === "b") throw new RangeError("Op b: no element for gone"); return geometryOf(o) })
    expect(g.programs[0]!.operationIds).toEqual(["a", "c"])
    expect(g.warnings.join(" ")).toMatch(/Op b produced nothing: Op b: no element for gone/)
  })

  test("the same setup gives the same bytes", () => {
    const s = setup([op("a", t6), op("b", t3)])
    expect(generateSetup(s, geometryOf).programs[0]!.gcode).toBe(generateSetup(s, geometryOf).programs[0]!.gcode)
  })
})

describe("several workpieces on one fixture: one program, one work offset per part", () => {
  const fixture: program.Setup["workpieces"] = [
    { id: "w1", name: "Part 1", workOffset: "G54" }, { id: "w2", name: "Part 2", workOffset: "G55" }, { id: "w3", name: "Part 3", workOffset: "G56" }
  ]
  const ops = [op("a", t6), op("b", t3)]
  const nc = (over: Partial<program.Setup>) => generateSetup(setup(ops, { workpieces: fixture, ...over }), geometryOf).programs[0]!

  test("tool first: each tool is loaded once and runs on all three parts, a G55 and a G56 block between them", () => {
    const p = nc({})
    const lines = p.gcode.split("\n")
    expect(p.program.toolpaths.map((t) => [t.id, t.workOffset])).toEqual([
      ["a@w1", "G54"], ["a@w2", "G55"], ["a@w3", "G56"], ["b@w1", "G54"], ["b@w2", "G55"], ["b@w3", "G56"]
    ])
    expect(p.gcode.match(/T\d+\s*M6/g)).toHaveLength(2)
    // The datum blocks are real blocks: G54 once in the header and again for the second tool, G55 / G56 each time their part is reached.
    expect(lines.filter((l) => /^G55\b/.test(l.trim()))).toHaveLength(2)
    expect(lines.filter((l) => /^G56\b/.test(l.trim()))).toHaveLength(2)
    expect(lines.filter((l) => /^G54\b/.test(l.trim()))).toHaveLength(2)
    expect(p.operationIds).toEqual(["a", "b"])
  })

  test("part first repeats the tool changes: 5 against 1, and the plan says what ordering by tool would save", () => {
    const part = planPrograms(setup(ops, { workpieces: fixture, workpieceOrder: "partFirst" }))
    expect(part.toolChanges).toBe(5)
    expect(part.warnings.join(" ")).toMatch(/saves 4 tool changes/)
    expect(planPrograms(setup(ops, { workpieces: fixture })).toolChanges).toBe(1)
  })

  test("the program says how much faster the other order is, with the changer time it assumed", () => {
    const part = generateSetup(setup(ops, { workpieces: fixture, workpieceOrder: "partFirst" }), geometryOf)
    expect(part.programs[0]!.warnings.join(" ")).toMatch(/Tool first runs about \d+ s faster than part first \(6 s per tool change, indicative, uncalibrated\)/)
    const tool = generateSetup(setup(ops, { workpieces: fixture }), geometryOf)
    expect(tool.programs[0]!.warnings.join(" ")).not.toMatch(/Part first runs about/)
    expect(generateSetup(setup(ops), geometryOf).programs[0]!.warnings.join(" ")).not.toMatch(/faster than/)
  })

  test("the moves of every part are the moves of the operation: only the register differs", () => {
    const p = nc({})
    const [a1, a2] = p.program.toolpaths
    expect(a2!.moves).toEqual(a1!.moves)
    expect(p.program.metadata?.["workpieces"]).toBe("Part 1=G54, Part 2=G55, Part 3=G56")
  })

  test("an operation limited to some parts runs only there", () => {
    const g = generateSetup(setup([op("a", t6, { workpieceIds: ["w2"] }), op("b", t3)], { workpieces: fixture }), geometryOf).programs[0]!
    expect(g.program.toolpaths.map((t) => t.id)).toEqual(["a@w2", "b@w1", "b@w2", "b@w3"])
  })

  test("two parts on one register, or a part that is not there, generate nothing and say why", () => {
    const twice = generateSetup(setup(ops, { workpieces: [fixture![0]!, { id: "w2", name: "Part 2", workOffset: "G54" }] }), geometryOf)
    expect(twice.programs).toHaveLength(0)
    expect(twice.issues.map((i) => i.message).join(" ")).toMatch(/share G54/)
    const missing = validateSetup(setup([op("a", t6, { workpieceIds: ["w9"] })], { workpieces: fixture }))
    expect(missing.some((i) => i.operationId === "a" && /w9/.test(i.message))).toBe(true)
  })

  test("the stored text read back keeps the part of every toolpath: the preview and a conversion see the same registers", () => {
    const p = nc({})
    const read = analyseGcode(p.gcode, "back").program
    expect(read.toolpaths.map((t) => t.workOffset)).toEqual(p.program.toolpaths.map((t) => t.workOffset))
    expect(read.workOffset).toBe("G54")
  })

  test("more than six parts: the extra ones sit on extended registers, G54.1 P1.., each selected before its toolpath", () => {
    const many: program.Setup["workpieces"] = Array.from({ length: 8 }, (_, k) => k < 6
      ? { id: `w${k + 1}`, name: `Part ${k + 1}`, workOffset: (["G54", "G55", "G56", "G57", "G58", "G59"] as const)[k]! }
      : { id: `w${k + 1}`, name: `Part ${k + 1}`, workOffset: "G54" as const, workOffsetRef: { kind: "extended" as const, p: k - 5 } })
    const p = generateSetup(setup([op("a", t6)], { workpieces: many }), geometryOf).programs[0]!
    const lines = p.gcode.split("\n").map((l) => l.trim())
    expect(lines.filter((l) => /^G54\.1 P[12]\b/.test(l))).toEqual(["G54.1 P1", "G54.1 P2"])
    expect(p.program.toolpaths).toHaveLength(8)
    // The same register twice is still refused, whichever way it is spelled.
    const twice = [...many.slice(0, 6), { id: "x", name: "Dup", workOffset: "G54" as const, workOffsetRef: { kind: "g5x" as const, code: "G55" as const } }]
    expect(generateSetup(setup([op("a", t6)], { workpieces: twice }), geometryOf).programs).toHaveLength(0)
  })

  test("placed parts whose blanks overlap generate nothing; touching blanks and different blanks are fine", () => {
    const stock = { x: 50, y: 50, z: 10, origin: { x: 0, y: 0, z: 0 }, material: "aluminum" }
    const at = (x: number) => ({ x, y: 0, z: 0 })
    const parts = (gap: number): program.Setup["workpieces"] => [{ id: "w1", name: "Part 1", workOffset: "G54", placement: at(0) }, { id: "w2", name: "Part 2", workOffset: "G55", placement: at(gap) }]
    expect(generateSetup(setup(ops, { stock, workpieces: parts(40) }), geometryOf).programs).toHaveLength(0)
    expect(validateSetup(setup(ops, { stock, workpieces: parts(40) })).map((i) => i.message).join(" ")).toMatch(/Part 1 and Part 2 overlap/)
    expect(generateSetup(setup(ops, { stock, workpieces: parts(50) }), geometryOf).programs).toHaveLength(1)
    // A smaller blank of its own fits where the setup's would not.
    const small = [{ id: "w1", name: "Part 1", workOffset: "G54" as const, placement: at(0) }, { id: "w2", name: "Part 2", workOffset: "G55" as const, placement: at(40), stock: { ...stock, x: 10 } }]
    expect(validateSetup(setup(ops, { stock, workpieces: small })).filter((i) => /overlap/.test(i.message))).toHaveLength(1)
    const apart = [small[0]!, { ...small[1]!, placement: at(60) }]
    expect(validateSetup(setup(ops, { stock, workpieces: apart })).filter((i) => /overlap/.test(i.message))).toHaveLength(0)
  })

  test("an operation depends on one that runs before it; a missing, disabled or later one is an issue on that operation", () => {
    const b = op("b", t3, { dependsOn: ["a"] })
    expect(validateSetup(setup([op("a", t6), b])).filter((i) => /depends/.test(i.message))).toEqual([])
    expect(validateSetup(setup([b, op("a", t6)])).find((i) => i.operationId === "b")!.message).toMatch(/runs after it/)
    expect(validateSetup(setup([op("a", t6, { enabled: false }), b])).find((i) => i.operationId === "b")!.message).toMatch(/disabled/)
    expect(validateSetup(setup([op("a", t6), op("b", t3, { dependsOn: ["zz"] })])).find((i) => i.operationId === "b")!.message).toMatch(/does not have/)
    // The operation with the broken dependency is skipped, the other still makes its program.
    const g = generateSetup(setup([b, op("a", t6)]), geometryOf).programs[0]!
    expect(g.operationIds).toEqual(["a"])
  })

  test("a tool table larger than the magazine is an issue on the operations that do not fit", () => {
    const three = [op("a", t6), op("b", t3), op("c", tool("t8", 8))]
    expect(validateSetup(setup(three, { magazineSize: 3 })).filter((i) => /magazine/.test(i.message))).toEqual([])
    const issues = validateSetup(setup(three, { magazineSize: 2 })).filter((i) => /magazine/.test(i.message))
    expect(issues.map((i) => i.operationId)).toEqual(["c"])
    expect(issues[0]!.message).toMatch(/T3, the magazine holds 2/)
  })

  test("a tombstone: each face has its register and turns the table to its angle first", () => {
    const faces: program.Setup["workpieces"] = [
      { id: "f0", name: "Face 0", workOffset: "G54", index: { b: 0 } }, { id: "f1", name: "Face 90", workOffset: "G55", index: { b: 90 } }, { id: "f2", name: "Face 180", workOffset: "G56", index: { b: 180 } }
    ]
    const p = generateSetup(setup([op("a", t6)], { workpieces: faces }), geometryOf).programs[0]!
    const lines = p.gcode.split("\n").map((l) => l.trim())
    for (const [register, angle] of [["G55", "B90.000"], ["G56", "B180.000"]] as const) {
      const at = lines.indexOf(register)
      expect(at).toBeGreaterThan(0)
      expect(lines.slice(at, at + 3).some((l) => l.includes(angle))).toBe(true)
    }
    expect(p.program.toolpaths.map((t) => t.moves[0]!._tag)).toEqual(["Orient", "Orient", "Orient"])
  })

  test("a setup without workpieces is unchanged: no register block, no suffix on ids", () => {
    const p = generateSetup(setup(ops), geometryOf).programs[0]!
    expect(p.program.toolpaths.map((t) => t.id)).toEqual(["a", "b"])
    expect(p.program.toolpaths.every((t) => t.workOffset === undefined)).toBe(true)
    expect(p.gcode.split("\n").filter((l) => /^G55\b/.test(l.trim()))).toHaveLength(0)
  })
})

describe("workholding: clamps and the machine's travel", () => {
  const stock = { x: 50, y: 50, z: 10, origin: { x: -25, y: -25, z: 0 }, material: "aluminum" }
  const parts: program.Setup["workpieces"] = [{ id: "w1", name: "Part 1", workOffset: "G54", placement: { x: 0, y: 0, z: 0 } }, { id: "w2", name: "Part 2", workOffset: "G55", placement: { x: 80, y: 0, z: 0 } }]
  const ops = [op("a", t6)]
  const clamp = (x0: number, x1: number) => ({ id: "c1", name: "Clamp 1", min: { x: x0, y: -30, z: -12 }, max: { x: x1, y: 30, z: 4 } })

  test("a blank standing in a clamp, or past the machine's travel, is an issue and nothing is generated", () => {
    const inside = setup(ops, { stock, workpieces: parts, fixtures: [clamp(20, 40)] })
    expect(validateSetup(inside).map((i) => i.message).join(" ")).toMatch(/Part 1's blank overlaps Clamp 1/)
    expect(generateSetup(inside, geometryOf).programs).toHaveLength(0)
    const clear = setup(ops, { stock, workpieces: parts, fixtures: [clamp(30, 50)] })
    expect(validateSetup(clear).filter((i) => /overlaps Clamp/.test(i.message))).toHaveLength(0)
    const tight = setup(ops, { stock, workpieces: parts, envelope: { min: { x: -30, y: -30, z: -12 }, max: { x: 100, y: 30, z: 10 } } })
    expect(validateSetup(tight).map((i) => i.message).join(" ")).toMatch(/Part 2's blank lies outside the machine travel/)
    const wide = setup(ops, { stock, workpieces: parts, envelope: { min: { x: -30, y: -30, z: -12 }, max: { x: 120, y: 30, z: 10 } } })
    expect(validateSetup(wide).filter((i) => /travel/.test(i.message))).toHaveLength(0)
    expect(validateSetup(setup(ops, { stock, workpieces: parts, fixtures: [{ id: "bad", name: "Bad", min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 5, z: 5 } }] })).some((i) => /Bad: max must be larger/.test(i.message))).toBe(true)
  })

  test("a toolpath that reaches a clamp is named once for the operation, the part and the clamp; a clamp out of reach is not", () => {
    // The outside profile of the 40 x 30 plate runs 3 mm beyond it (the cutter's radius): a clamp 1 mm off the blank is in its way.
    const snug = { ...stock, x: 44, origin: { x: -22, y: -25, z: 0 } }
    const outside = [op("a", t6, {}, { operationType: "profile" })]
    const near = generateSetup(setup(outside, { stock: snug, workpieces: parts, fixtures: [clamp(23, 40)] }), geometryOf)
    expect(near.programs).toHaveLength(1)
    expect(near.warnings.filter((w) => /reaches/.test(w))).toEqual(["Op a on Part 1: the tool reaches Clamp 1 (Endmill Ø6 Ø6, 34 mm out of the holder)"])
    const away = generateSetup(setup(outside, { stock: snug, workpieces: parts, fixtures: [clamp(30, 50)] }), geometryOf)
    expect(away.warnings.filter((w) => /reaches/.test(w))).toEqual([])
    // The pocket stays inside the plate: the same clamp is not touched.
    expect(generateSetup(setup(ops, { stock: snug, workpieces: parts, fixtures: [clamp(23, 40)] }), geometryOf).warnings.filter((w) => /reaches/.test(w))).toEqual([])
  })
})

describe("tool life and sister tools", () => {
  const parts: program.Setup["workpieces"] = [{ id: "w1", name: "Part 1", workOffset: "G54" }, { id: "w2", name: "Part 2", workOffset: "G55" }, { id: "w3", name: "Part 3", workOffset: "G56" }]
  const sister = { ...t6, id: "t6b", name: "Endmill Ø6 sister" }
  const perRun = generateSetup(setup([op("a", t6)], { workpieces: [parts![0]!] }), geometryOf).programs[0]!.stats.estimatedSeconds / 60

  test("the minutes every tool cuts over the setup are counted against its life", () => {
    const life = perRun * 5
    const made = generateSetup(setup([op("a", { ...t6, lifeMinutes: life })], { workpieces: parts }), geometryOf)
    expect(made.toolLife).toHaveLength(1)
    expect(made.toolLife[0]).toMatchObject({ toolId: "t6", pocket: 1, lifeMinutes: life })
    expect(made.toolLife[0]!.minutes).toBeGreaterThan(perRun * 2)
    expect(made.warnings.join(" ")).not.toMatch(/no life left/)
  })

  test("a spent tool without a sister is named; with a sister the runs after it take its pocket and the post calls it", () => {
    const short = { ...t6, lifeMinutes: perRun * 1.5 }
    const alone = generateSetup(setup([op("a", short)], { workpieces: parts }), geometryOf)
    expect(alone.warnings.join(" ")).toMatch(/Endmill .6 has no life left for Op a/)
    const backed = generateSetup(setup([op("a", short)], { workpieces: parts, sisters: [{ toolId: "t6", tool: { ...sister, lifeMinutes: perRun * 10 } }] }), geometryOf)
    const p = backed.programs[0]!
    expect(p.program.toolpaths.map((t) => t.toolId)).toEqual(["t6", "t6b", "t6b"])
    expect(p.pockets).toEqual({ t6: 1, t6b: 2 })
    expect(p.toolNumbers).toEqual([1, 2])
    expect(p.gcode.match(/T\d+\s*M6/g)).toEqual(["T1 M6", "T2 M6"])
    expect(backed.toolTable.map((e) => [e.pocket, e.tool.id])).toEqual([[1, "t6"], [2, "t6b"]])
    expect(backed.toolLife.map((l) => [l.toolId, l.sisterOf ?? null])).toEqual([["t6", null], ["t6b", "t6"]])
    expect(p.warnings.join(" ")).toMatch(/takes over from Op a/)
  })

  test("a sister that no operation backs, or that shares a tool's id, is an issue; the magazine counts sisters", () => {
    expect(validateSetup(setup([op("a", t6)], { sisters: [{ toolId: "nope", tool: sister }] })).map((i) => i.message).join(" ")).toMatch(/backs nope/)
    expect(validateSetup(setup([op("a", t6), op("b", t3)], { sisters: [{ toolId: "t6", tool: t3 }] })).map((i) => i.message).join(" ")).toMatch(/already a tool of an operation/)
    expect(validateSetup(setup([op("a", t6), op("b", t3)], { magazineSize: 2, sisters: [{ toolId: "t6", tool: sister }] })).map((i) => i.message).join(" ")).toMatch(/need 3 pockets, the magazine holds 2/)
  })
})

describe("replay of a generated program: inputs and release", () => {
  const stock = { x: 60, y: 50, z: 10, origin: { x: -30, y: -25, z: 0 }, material: "aluminum" }
  const parts: program.Setup["workpieces"] = [{ id: "w1", name: "Part 1", workOffset: "G54" }, { id: "w2", name: "Part 2", workOffset: "G55", stock: { ...stock, x: 70, origin: { x: -35, y: -25, z: 0 } } }]
  const made = generateSetup(setup([op("a", t6), op("b", t3)], { workpieces: parts, stock }), geometryOf)
  const replay = program.setupReplay(setup([op("a", t6), op("b", t3)], { workpieces: parts, stock }), made.programs[0]!, geometryOf)
  const result = (verdict: "clean" | "faults" | "incomplete") => ({ verdict, complete: verdict !== "incomplete", reasons: [], findings: verdict === "faults" ? [{ kind: "gouge" as const, message: "cut", line: 12 }] : [], gouge: { volume: 0, depth: 0, rays: 0 }, left: { volume: 0, depth: 0, rays: 0 }, detached: 0, stockVolume: 1000, removedVolume: 100, cell: 0.1, errorBound: 0.1, threshold: 0.1, moves: 10, feedMoves: 5 })

  test("one blank per register (the part's own, else the setup's), each tool under its pocket as a kernel cutter", () => {
    expect(replay.registers.map((r) => [r.register, r.stock.min.x, r.stock.max.x])).toEqual([["G54", -30, 30], ["G55", -35, 35]])
    expect(replay.tools.map((t) => [t.number, t.cutter.kind, t.cutter.diameter])).toEqual([[1, "flat", 6], [2, "flat", 3]])
    expect(replay.part).toHaveLength(0)
    expect(replay.notes.join(" ")).toMatch(/not a finished solid/)
  })

  test("a fault blocks, a clean replay of everything with holders described is verified, anything less is a preview", () => {
    const gcode = made.programs[0]!.gcode
    const bare = made.programs[0]!.tools
    expect(program.setupEvidence(gcode, replay, [result("faults"), result("clean")], bare).release).toBe("blocked")
    const solid = { ...replay, part: [{ positions: new Float32Array(9), indices: new Uint32Array(3) }] }
    const held = bare.map((t) => ({ ...t, holder: { diameter: 30, length: 40 } }))
    expect(program.setupEvidence(gcode, solid, [result("clean"), result("clean")], held).release).toBe("verified-program")
    const noHolder = program.setupEvidence(gcode, solid, [result("clean"), result("clean")], bare)
    expect(noHolder.release).toBe("preview")
    expect(noHolder.notes.join(" ")).toMatch(/No holder is described/)
    expect(program.setupEvidence(gcode, replay, [result("clean"), result("clean")], held).release).toBe("preview")
    expect(program.setupEvidence(gcode, solid, [result("clean"), result("incomplete")], held).release).toBe("preview")
    expect(program.setupEvidence(gcode, solid, [result("clean"), result("clean")], held).programHash).toHaveLength(64)
  })

  test("the parts of a program with several registers are seen in one frame: each blank where its placement puts it, a cut into another part's blank blocks", () => {
    const gcode = made.programs[0]!.gcode
    const held = made.programs[0]!.tools.map((t) => ({ ...t, holder: { diameter: 30, length: 40 } }))
    const solid = { ...replay, part: [{ positions: new Float32Array(9), indices: new Uint32Array(3) }] }
    expect(program.setupEvidence(gcode, solid, [result("clean"), result("clean")], held).notes.join(" ")).toMatch(/Part 2 has no placement/)
    const apart = { ...solid, registers: solid.registers.map((r) => (r.register === "G55" ? { ...r, datum: { x: 120, y: 0, z: 0 } } : r)) }
    const good = program.setupEvidence(gcode, apart, [result("clean"), result("clean")], held)
    expect(good.fixture?.parts.map((q) => [q.register, q.blank.min.x, q.blank.max.x, q.removedMm3, q.remainingMm3])).toEqual([["G54", -30, 30, 100, 900], ["G55", 85, 155, 100, 900]])
    // The moves of G55 are carried to its placement: they reach into x 85..155 and nowhere near the first part.
    expect(good.fixture!.parts[1]!.reach!.min.x).toBeGreaterThan(80)
    expect(good.fixture!.parts[0]!.reach!.max.x).toBeLessThan(40)
    expect(good.fixture!.crossings).toEqual([])
    expect(good.release).toBe("verified-program")
    // The same program with the second part placed on top of the first: the first part's cuts run inside the second blank.
    const onTop = { ...solid, registers: solid.registers.map((r) => (r.register === "G55" ? { ...r, datum: { x: 10, y: 0, z: 0 } } : r)) }
    const bad = program.setupEvidence(gcode, onTop, [result("clean"), result("clean")], held)
    expect(bad.fixture!.crossings.length).toBeGreaterThan(0)
    expect(bad.fixture!.crossings[0]!.message).toMatch(/cuts into the blank of Part/)
    expect(bad.release).toBe("blocked")
    // One register: nothing to compare, no fixture section.
    expect(program.setupEvidence(gcode, { ...solid, registers: [solid.registers[0]!] }, [result("clean")], held).fixture).toBeUndefined()
  })
})

describe("the fixture on one tri-dexel: the tool's radius counts, and the clamps are obstacles too", () => {
  const stock = { x: 60, y: 50, z: 10, origin: { x: -30, y: -25, z: 0 }, material: "aluminum" }
  const parts: program.Setup["workpieces"] = [{ id: "w1", name: "Part 1", workOffset: "G54" }, { id: "w2", name: "Part 2", workOffset: "G55", stock: { ...stock, x: 70, origin: { x: -35, y: -25, z: 0 } } }]
  const fixture = setup([op("a", t6), op("b", t3)], { workpieces: parts, stock })
  const made = generateSetup(fixture, geometryOf)
  const replay = program.setupReplay(fixture, made.programs[0]!, geometryOf)
  const gcode = made.programs[0]!.gcode
  const held = made.programs[0]!.tools.map((t) => ({ ...t, holder: { diameter: 30, length: 40 } }))
  const solid = { ...replay, part: [{ positions: new Float32Array(9), indices: new Uint32Array(3) }] }
  const clean = { verdict: "clean" as const, complete: true, reasons: [], findings: [], gouge: { volume: 0, depth: 0, rays: 0 }, left: { volume: 0, depth: 0, rays: 0 }, detached: 0, cell: 0.5, errorBound: 0.5, poses: 1, feedMoves: 10, removedVolume: 100, stockVolume: 1000 } as never
  const at = (x: number) => ({ ...solid, registers: solid.registers.map((r) => (r.register === "G55" ? { ...r, datum: { x, y: 0, z: 0 } } : r)) })

  test("a part whose blank the other part's tool edge reaches, with the axis still outside it, is a crossing; a part beyond the radius is not", () => {
    // Part 1's moves reach x 17 on the tool axis (a Ø6 cutter: its edge at x 20). Part 2's blank starts at 18 with the datum at 53.
    const near = program.setupEvidence(gcode, at(53), [clean, clean], held)
    expect(near.fixture!.complete).toBe(true)
    expect(near.fixture!.method).toBe("tri-dexel")
    expect(near.fixture!.crossings.map((c) => [c.register, c.other])).toEqual([["G54", "G55"]])
    expect(near.fixture!.crossings[0]!.message).toMatch(/counted with its radius/)
    expect(near.release).toBe("blocked")
    // The blank starts at 25: the edge (x 20) stays 5 mm clear of it.
    const clear = program.setupEvidence(gcode, at(60), [clean, clean], held)
    expect(clear.fixture!.crossings).toEqual([])
    expect(clear.fixture!.complete).toBe(true)
    expect(clear.release).toBe("verified-program")
  })

  test("a clamp the tool's edge or holder reaches is a crossing named by the clamp, one beyond the radius is not, and a single part with clamps gets the view", () => {
    const one = { ...solid, registers: [solid.registers[0]!] }
    const clamp = (min: number) => ({ id: "c1", name: "Clamp 1", min: { x: min, y: -20, z: -10 }, max: { x: min + 20, y: 20, z: 5 } })
    // The axis reaches 17, the Ø6 edge 20: a clamp from 19 is touched by 1 mm; one from 26 is not.
    const hit = program.setupEvidence(gcode, { ...one, fixtures: [clamp(18)] }, [clean], held)
    expect(hit.fixture?.clamps?.map((c) => c.id)).toEqual(["c1"])
    expect(hit.fixture!.crossings.map((c) => [c.register, c.other])).toEqual([["G54", "c1"]])
    expect(hit.fixture!.crossings[0]!.message).toMatch(/reaches the clamp Clamp 1 at NC line/)
    expect(hit.release).toBe("blocked")
    const miss = program.setupEvidence(gcode, { ...one, fixtures: [clamp(26)] }, [clean], held)
    expect(miss.fixture!.crossings).toEqual([])
    expect(miss.fixture!.complete).toBe(true)
    // The holder is judged when it is described: a bridge high above the stock is reached by the Ø30 holder (it starts 34 mm above the tip), not by the flutes.
    const bridge = { id: "c2", name: "Bridge", min: { x: 20, y: -20, z: 30 }, max: { x: 45, y: 20, z: 60 } }
    const above = program.setupEvidence(gcode, { ...one, fixtures: [bridge] }, [clean], held)
    expect(above.fixture!.crossings.map((c) => c.other)).toEqual(["c2"])
    expect(above.fixture!.crossings[0]!.message).toMatch(/and holder/)
    // A tool with no holder described is not judged where only its holder could reach: nothing is claimed beyond the flutes and shank.
    const noHolder = program.setupEvidence(gcode, { ...one, fixtures: [bridge] }, [clean], made.programs[0]!.tools)
    expect(noHolder.fixture!.crossings).toEqual([])
    expect(noHolder.notes.join(" ")).toMatch(/No holder is described/)
  })
})

describe("the fixture as ONE body: every part's remaining stock from the same solid, clamps judged exactly", () => {
  const stock = { x: 60, y: 50, z: 10, origin: { x: -30, y: -25, z: 0 }, material: "aluminum" }
  const parts: program.Setup["workpieces"] = [{ id: "w1", name: "Part 1", workOffset: "G54" }, { id: "w2", name: "Part 2", workOffset: "G55", stock: { ...stock, x: 70, origin: { x: -35, y: -25, z: 0 } } }]
  const fixture = setup([op("a", t6), op("b", t3)], { workpieces: parts, stock })
  const made = generateSetup(fixture, geometryOf)
  const replay = program.setupReplay(fixture, made.programs[0]!, geometryOf)
  const gcode = made.programs[0]!.gcode
  const held = made.programs[0]!.tools.map((t) => ({ ...t, holder: { diameter: 30, length: 40 } }))
  const solid = { ...replay, part: [{ positions: new Float32Array(9), indices: new Uint32Array(3) }] }
  const clean = { verdict: "clean" as const, complete: true, reasons: [], findings: [], gouge: { volume: 0, depth: 0, rays: 0 }, left: { volume: 0, depth: 0, rays: 0 }, detached: 0, cell: 0.5, errorBound: 0.5, poses: 1, feedMoves: 10, removedVolume: 100, stockVolume: 1000 } as never
  const apart = { ...solid, registers: solid.registers.map((r) => (r.register === "G55" ? { ...r, datum: { x: 120, y: 0, z: 0 } } : r)) }
  const one = { ...solid, registers: [solid.registers[0]!] }
  const clamp = (min: number) => ({ id: "c1", name: "Clamp 1", min: { x: min, y: -20, z: -10 }, max: { x: min + 20, y: 20, z: 5 } })

  test("both parts are read from one lattice after the program: each lost material of its own blank, the lattice and its error are declared", () => {
    const view = program.setupEvidence(gcode, apart, [clean, clean], held).fixture!
    expect(view.complete).toBe(true)
    expect(view.body).toBeDefined()
    expect(view.body!.errorBoundMm).toBeGreaterThan(0)
    for (const part of view.parts) {
      expect(part.bodyRemovedMm3, part.register).toBeGreaterThan(0)
      expect(part.bodyRemainingMm3!).toBeGreaterThan(0)
    }
    // Both parts run the same operations on blanks of 60 and 70 mm: the same cuts, so about the same material gone from each.
    expect(Math.abs(view.parts[0]!.bodyRemovedMm3! - view.parts[1]!.bodyRemovedMm3!)).toBeLessThan(0.1 * view.parts[0]!.bodyRemovedMm3!)
    // The body holds both blanks (60x50x10 and 70x50x10) less what was cut.
    expect(view.body!.volumeMm3).toBe(view.parts[0]!.bodyRemainingMm3! + view.parts[1]!.bodyRemainingMm3!)
  })

  test("a graze of 0.3 mm into a clamp is a crossing (the lattice cell is 0.25+ and would not tell it); one 0.05 mm clear is not", () => {
    // Part 1's moves reach x 17: a Ø6 edge at 20. A clamp from 19.7 is entered by 0.3 mm, one from 20.05 is clear by 0.05.
    const grazed = program.setupEvidence(gcode, { ...one, fixtures: [clamp(19.7)] }, [clean], held)
    expect(grazed.fixture!.crossings.map((c) => [c.register, c.other])).toEqual([["G54", "c1"]])
    expect(grazed.fixture!.crossings[0]!.message).toMatch(/0\.3 mm into it by the exact box test, within 0\.05 mm/)
    expect(grazed.fixture!.clampMethod).toBe("exact-box")
    expect(grazed.fixture!.clampErrorMm).toBe(0.05)
    expect(grazed.release).toBe("blocked")
    const clear = program.setupEvidence(gcode, { ...one, fixtures: [clamp(20.05)] }, [clean], held)
    expect(clear.fixture!.crossings).toEqual([])
    expect(clear.fixture!.complete).toBe(true)
  })
})

describe("operation templates: a cycle of operations applied to features", () => {
  const rough = { id: "rough", name: "Rough", tool: t6, params: { ...DEFAULT_SETTINGS, depth: 4, stepdown: 2, toolDiameter: 6, operationType: "pocket" as const } }
  const finish = { id: "finish", name: "Finish", tool: t3, params: { ...DEFAULT_SETTINGS, depth: 4, stepdown: 4, toolDiameter: 3, operationType: "contour" as const }, dependsOn: ["rough"] }
  const cycle: program.OperationTemplate = { id: "pocket-cycle", name: "Pocket", steps: [rough, finish] }
  const use = (over: Partial<program.TemplateUse> = {}): program.TemplateUse => ({ id: "u", templateId: "pocket-cycle", elementIds: ["a", "b", "c"], perElement: true, ...over })
  const withUses = (uses: ReadonlyArray<program.TemplateUse>, operations: ReadonlyArray<program.Operation> = [], over: Partial<program.Setup> = {}): program.Setup =>
    setup(operations, { templates: [cycle], uses, ...over })

  test("one instance per element, step by step: every roughing before any finishing, so each tool is loaded once", () => {
    const { setup: expanded, issues } = program.expandSetup(withUses([use()]))
    expect(issues).toEqual([])
    expect(expanded.templates).toBeUndefined()
    expect(expanded.uses).toBeUndefined()
    expect(expanded.operations.map((o) => o.id)).toEqual(["u[1]:rough", "u[2]:rough", "u[3]:rough", "u[1]:finish", "u[2]:finish", "u[3]:finish"])
    expect(expanded.operations.map((o) => o.elementIds)).toEqual([["a"], ["b"], ["c"], ["a"], ["b"], ["c"]])
    expect(expanded.operations[3]).toMatchObject({ name: "Pocket #1 - Finish", dependsOn: ["u[1]:rough"], enabled: true, fromPreviousStock: false })
    expect(planPrograms(expanded).toolChanges).toBe(1)
    // The planner takes the setup as the user saved it, uses and all (the desktop plans a saved setup directly).
    expect(planPrograms(withUses([use()])).toolChanges).toBe(1)
    expect(validateSetup(withUses([use()]))).toEqual([])
  })

  test("feature by feature: an instance is finished before the next starts, and the changes show", () => {
    const expanded = program.expandSetup(withUses([use({ order: "perFeature" })])).setup
    expect(expanded.operations.map((o) => o.id)).toEqual(["u[1]:rough", "u[1]:finish", "u[2]:rough", "u[2]:finish", "u[3]:rough", "u[3]:finish"])
    expect(planPrograms(expanded).toolChanges).toBe(5)
  })

  test("one instance over all the elements, a position among the setup's own operations, overrides, workpieces and a disabled use", () => {
    const own = [op("a", t6), op("b", t3)]
    const { setup: expanded, issues } = program.expandSetup(withUses([use({ perElement: false, position: 1, overrides: { depth: 7 }, workpieceIds: ["w1"], name: "Pockets" })], own))
    expect(issues).toEqual([])
    expect(expanded.operations.map((o) => o.id)).toEqual(["a", "u:rough", "u:finish", "b"])
    expect(expanded.operations[1]).toMatchObject({ name: "Pockets - Rough", elementIds: ["a", "b", "c"], workpieceIds: ["w1"] })
    expect(expanded.operations[1]!.params.depth).toBe(7)
    expect(expanded.operations[2]!.params.depth).toBe(7)
    const off = program.expandSetup(withUses([use({ enabled: false })])).setup
    expect(off.operations.every((o) => !o.enabled)).toBe(true)
  })

  test("expansion is idempotent and leaves a setup without uses untouched", () => {
    const once = program.expandSetup(withUses([use()])).setup
    expect(program.expandSetup(once).setup).toBe(once)
    const plain = setup([op("a", t6)])
    expect(program.expandSetup(plain).setup).toBe(plain)
  })

  test("what cannot be expanded is an issue and the use is skipped", () => {
    const messages = (s: program.Setup): string => validateSetup(s).map((i) => i.message).join(" | ")
    expect(messages(withUses([use({ templateId: "nope" })], [op("a", t6)]))).toMatch(/template nope, which the setup does not have/)
    expect(messages(withUses([use({ elementIds: [] })], [op("a", t6)]))).toMatch(/no elements to machine/)
    expect(messages(withUses([use({ overrides: { notASetting: 1 } })], [op("a", t6)]))).toMatch(/notASetting, which are not settings/)
    expect(messages(withUses([use({ overrides: { depth: "deep" } })], [op("a", t6)]))).toMatch(/not valid settings/)
    expect(messages(withUses([use(), use()], [op("a", t6)]))).toMatch(/use id u is used twice/)
    expect(messages(withUses([use({ id: "x", elementIds: ["a"], perElement: false })], [op("x:rough", t6)]))).toMatch(/already has/)
    expect(messages(setup([op("a", t6)], { templates: [{ ...cycle, steps: [rough, { ...finish, dependsOn: ["gone"] }] }], uses: [] }))).toMatch(/depends on gone/)
    const rest = { ...cycle, steps: [rough, { ...finish, fromPreviousStock: true }] }
    expect(messages(withUses([use()], [], { templates: [rest] }))).toMatch(/use order perFeature/)
    // A step that dropped out of the setup does not leave a lone dependency: the setup keeps the operations of the valid uses.
    const mixed = program.expandSetup(withUses([use({ id: "bad", templateId: "nope" }), use({ id: "good", elementIds: ["a"] })], [])).setup
    expect(mixed.operations.map((o) => o.id)).toEqual(["good:rough", "good:finish"])
  })

  test("a setup of templates generates one program with the tool changes of its order, and the pieces are the same on every part", () => {
    const parts = [{ id: "w1", name: "Part 1", workOffset: "G54" as const }, { id: "w2", name: "Part 2", workOffset: "G55" as const }]
    const expanded = program.expandSetup(withUses([use({ elementIds: ["a", "b"] })], [], { workpieces: parts })).setup
    const generated = generateSetup(expanded, geometryOf)
    expect(generated.issues).toEqual([])
    expect(generated.programs).toHaveLength(1)
    const text = generated.programs[0]!.gcode
    expect(text.match(/T\d+\s*M6/g)).toHaveLength(2)
    expect(text.match(/^G55\b/gm)).toHaveLength(4)
    expect(generated.programs[0]!.operationIds).toEqual(["u[1]:rough", "u[2]:rough", "u[1]:finish", "u[2]:finish"])
  })
})

describe("the probe of every part before it is cut", () => {
  const parts = [{ id: "w1", name: "Part 1", workOffset: "G54" as const }, { id: "w2", name: "Part 2", workOffset: "G55" as const }, { id: "w3", name: "Part 3", workOffset: "G56" as const, index: { b: 90 } }]
  const partProbe: program.PartProbe = { cycles: [{ kind: "z-surface", at: { x: 5, y: 5 }, expectedZ: 0 }, { kind: "corner", corner: { x: 0, y: 0 }, inside: false, xSense: 1, ySense: 1, depth: 5 }] }
  const probed = (over: Partial<program.Setup> = {}): program.Setup => setup([op("a", t6), op("b", t3)], { workpieces: parts, stock: { x: 60, y: 50, z: 10, origin: { x: -30, y: -25, z: 0 }, material: "aluminum" }, partProbe, ...over })

  test("every part is measured in its own register: the program reads each datum into the register its toolpaths run under", () => {
    const { plan, generated } = program.partProbeProgram(probed(), 2000)
    expect(plan.refused).toBeUndefined()
    expect(plan.toolNumber).toBe(3)
    expect(plan.parts.map((p) => [p.register, p.axes.join("")])).toEqual([["G54", "ZXY"], ["G55", "ZXY"], ["G56", "ZXY"]])
    expect(generated).toBeDefined()
    const text = generated!.gcode
    expect(generated).toMatchObject({ programNumber: 2000, toolNumbers: [3], pockets: { "part-probe": 3 } })
    expect(text.match(/T3\s*M6/g)).toHaveLength(1)
    const lines = text.split("\n").map((l) => l.trim())
    // Fanuc writes the work offsets of G54 as #5221-#5223 and of G55 as #5241-#5243: each part corrects its own register, never another's.
    expect(lines.filter((l) => /^#5223=#5223\+/.test(l))).toHaveLength(1)
    expect(lines.filter((l) => /^#5243=#5243\+/.test(l))).toHaveLength(1)
    expect(lines.filter((l) => /^#5263=#5263\+/.test(l))).toHaveLength(1)
    expect(lines.filter((l) => /^G55\b/.test(l))).toHaveLength(1)
    expect(lines.filter((l) => /^G56\b/.test(l))).toHaveLength(1)
    // The part on an indexed face is measured on that face; the spindle never turns; a correction beyond the limit alarms instead of writing.
    expect(generated!.program.toolpaths[2]!.moves[0]).toMatchObject({ _tag: "Orient", b: 90 })
    expect(generated!.program.toolpaths.every((t) => t.spindleRpm === 0)).toBe(true)
    expect(text).toMatch(/OFFSET CORRECTION OUT OF RANGE/)
    expect(text).toMatch(/G31 /)
    expect(generated!.warnings.join(" ")).toMatch(/Run this program first/)
  })

  test("the probe takes a pocket of its own, the limit and the stylus are the setup's, an extended register is measured as such", () => {
    expect(program.planPartProbe(probed({ partProbe: { ...partProbe, toolNumber: 1 } })).refused).toMatch(/T1 is a pocket of the operations/)
    expect(program.planPartProbe(probed({ partProbe: { ...partProbe, toolNumber: 9, limit: 1 } })).toolNumber).toBe(9)
    const text = program.partProbeProgram(probed({ partProbe: { ...partProbe, limit: 1 } }), 1).generated!.gcode
    expect(text).toMatch(/IF \[#\d+ LE 1\] GOTO/)
    const extended = probed({ workpieces: [{ id: "w1", name: "P1", workOffset: "G54", workOffsetRef: { kind: "extended", p: 7 } }] })
    const plan = program.planPartProbe(extended)
    expect(plan.refused).toBeUndefined()
    expect(plan.parts[0]!.register).toBe("G54.1 P7")
  })

  test("a setup without a probe, a lathe and a post without probing words are refused with the reason", () => {
    expect(program.planPartProbe(setup([op("a", t6)])).refused).toMatch(/no partProbe/)
    expect(program.planPartProbe(probed({ machineType: "lathe" })).refused).toMatch(/milling accessory/)
    expect(validateSetup(probed({ machineType: "lathe" })).map((i) => i.message).join(" ")).toMatch(/part probe is a milling accessory/)
    // Every post of the catalogue either writes the probe program or says why it cannot: none throws, none writes nothing.
    for (const postId of ["generic", "fanuc", "grbl", "linuxcnc", "haas", "siemens", "heidenhain", "okuma", "mazak", "mitsubishi", "brother"] as const) {
      const made = program.partProbeProgram(probed({ post: { ...DEFAULT_POST_CONFIG, postId } }), 1)
      expect(made.plan.refused !== undefined || (made.generated !== undefined && made.generated.gcode.length > 100), postId).toBe(true)
    }
  })
})

describe("the probe program replayed against a blank that is not where the setup believes it", () => {
  const block = { x: 60, y: 50, z: 10, origin: { x: 0, y: 0, z: 0 }, material: "aluminum" }
  const zSurface = { kind: "z-surface" as const, at: { x: 30, y: 25 }, expectedZ: 0 }
  const corner = (touchesPerEdge?: 1 | 2) => ({ kind: "corner" as const, corner: { x: 0, y: 0 }, inside: false, xSense: 1 as const, ySense: 1 as const, depth: 5, ...(touchesPerEdge !== undefined ? { touchesPerEdge } : {}) })
  const probed = (partProbe: program.PartProbe, over: Partial<program.Setup> = {}): program.Setup => setup([op("a", t6)], { stock: block, partProbe, ...over })

  const lcnc = { post: { ...DEFAULT_POST_CONFIG, postId: "linuxcnc" as const } }
  const atCorner = { stock: { ...block, origin: { x: -30, y: -25, z: 0 } } }
  const replayOf = (partProbe: program.PartProbe, over: Partial<program.Setup> = {}) => {
    const plan = program.planPartProbe(probed(partProbe, over))
    if (plan.refused !== undefined) throw new Error(plan.refused)
    return plan.parts[0]!.replay!
  }

  test("a blank displaced by a few tenths is found by the program: the corrected register is where the blank is, to the tolerance", () => {
    const r = replayOf({ cycles: [zSurface, corner()] })
    expect(r.status).toBe("within")
    expect(r.displacement).toEqual({ x: 0.8, y: -0.6, z: 0.3, rotation: 0 })
    // Before the probe the register is 1.04 mm off at the far corner; after it, nothing.
    expect(r.beforeMm!).toBeCloseTo(Math.hypot(0.8, 0.6, 0.3), 3)
    expect(r.corrected!.X).toBeCloseTo(0.8, 6)
    expect(r.corrected!.Y).toBeCloseTo(-0.6, 6)
    expect(r.corrected!.Z).toBeCloseTo(0.3, 6)
    expect(r.residualMm!).toBeLessThan(1e-6)
    // The displacement is the setup's to choose, per part, and the tolerance too.
    const big = replayOf({ cycles: [zSurface, corner()], replay: { displacements: [{ x: -2.5, y: 1.5, z: -0.4 }], tolerance: 0.01 } })
    expect(big).toMatchObject({ status: "within", displacement: { x: -2.5, y: 1.5, z: -0.4, rotation: 0 }, toleranceMm: 0.01 })
    expect(big.corrected!.X).toBeCloseTo(-2.5, 6)
  })

  test("a cycle that does not meet the blank where the setup puts it is a miss, named; a correction beyond the limit stops the program", () => {
    const miss = replayOf({ cycles: [{ ...zSurface, at: { x: 300, y: 25 } }] })
    expect(miss.status).toBe("missed")
    expect(miss.reason).toMatch(/touch found nothing/)
    // The search distance is 6 mm by default: a blank 8 mm toward the probe is met by the probe on its protected approach and stops it; 8 mm the other way
    // is found, and its correction is beyond the limit of 5 mm: the program alarms instead of writing it. A face past the search is a miss.
    expect(replayOf({ cycles: [zSurface, corner()], replay: { displacements: [{ x: -8, z: 0 }] } })).toMatchObject({ status: "stopped", reason: expect.stringMatching(/touched during a protected move/) })
    expect(replayOf({ cycles: [zSurface, corner()], replay: { displacements: [{ x: 8, z: 0 }] } })).toMatchObject({ status: "stopped", reason: expect.stringMatching(/OFFSET CORRECTION OUT OF RANGE/) })
    // A limit of 0.5 mm: a 0.8 mm correction is a wrong datum, the program alarms instead of writing.
    const limited = replayOf({ cycles: [zSurface, corner()], limit: 0.5 })
    expect(limited.status).toBe("stopped")
    expect(limited.reason).toMatch(/OFFSET CORRECTION OUT OF RANGE/)
  })

  test("a web and an outside rectangle are measured on a block; a web gives its own direction only, and the replay says which axis nothing measured", () => {
    const rectangle = replayOf({ cycles: [zSurface, { kind: "rectangle", inside: false, centre: { x: 30, y: 25 }, size: { x: 60, y: 50 }, depth: 5 }] })
    expect(rectangle.status).toBe("within")
    const web = { kind: "web" as const, centre: { x: 30, y: 25 }, width: 60, angle: 0, depth: 5 }
    const both = replayOf({ cycles: [zSurface, web] })
    expect(both.status).toBe("outside")
    expect(both.reason).toMatch(/no cycle measures Y, in which the blank is displaced/)
    expect(both.residualMm!).toBeCloseTo(0.6, 3)
    expect(replayOf({ cycles: [zSurface, web], replay: { displacements: [{ x: 0.8, z: 0.3 }] } }).status).toBe("within")
  })

  test("a rotation: two touches per edge measure it, the register takes it about its zero (so the datum on the corner), g68 about the measured point (any datum)", () => {
    const twice = { cycles: [zSurface, corner(2)] }
    const r = replayOf({ ...twice, rotation: "offset-r" }, lcnc)
    expect(r).toMatchObject({ status: "within", displacement: { rotation: 0.5 } })
    expect(r.corrected!.R).toBeCloseTo(0.5, 6)
    expect(r.corrected!.X).toBeCloseTo(0.8, 6)
    // The datum in the middle of the blank: the register's rotation turns about the zero, the corner measured is 38 mm away from it.
    const cornerOfCentred = { cycles: [zSurface, { ...corner(2), corner: { x: -30, y: -25 } }] }
    const off = replayOf({ ...cornerOfCentred, rotation: "offset-r" }, { ...lcnc, ...atCorner })
    expect(off.status).toBe("outside")
    expect(off.reason).toMatch(/turns the part about its zero.*g68/)
    expect(off.residualMm!).toBeGreaterThan(0.3)
    // The same measurement written as a coordinate rotation about the measured corner is right for any datum.
    const g68 = replayOf({ ...cornerOfCentred, rotation: "g68" }, atCorner)
    expect(g68.status).toBe("within")
    expect(g68.g68).toBeCloseTo(0.5, 6)
    // Without a rotation to write, the angle is measured and dropped: the replay says what that leaves (a displacement without rotation here).
    expect(replayOf(twice, lcnc).displacement!.rotation).toBe(0)
    // A table's C axis is not replayed; a post that cannot write the register's rotation refuses the probe with the post's reason.
    expect(replayOf({ ...twice, rotation: "table-c" }, lcnc)).toMatchObject({ status: "unreplayed", reason: expect.stringMatching(/C axis/) })
  })

  test("a rotation the post cannot write the way the setup asked is written the way it can: Fanuc's register has no rotation (G68 instead), LinuxCNC writes both, Siemens has no G68 (the frame's rotation instead)", () => {
    const twice = { cycles: [zSurface, corner(2)] }
    // Fanuc: offset-r would write the R of G54, which the control does not have: the same measurement goes into G68 about the measured corner, and the plan says so.
    const fanuc = program.planPartProbe(probed({ ...twice, rotation: "offset-r" }))
    expect(fanuc.refused).toBeUndefined()
    expect(fanuc.notes.join(" ")).toMatch(/no rotation in a work offset: the measured rotation is written as G68/)
    expect(fanuc.parts[0]!.replay).toMatchObject({ status: "within", g68: 0.5 })
    expect(program.partProbeProgram(probed({ ...twice, rotation: "offset-r" }), 7).generated!.gcode).toMatch(/G68 X/)
    // LinuxCNC has G68 too, with the Fanuc words; and G10 L2 R for the register.
    const lcncG68 = program.partProbeProgram(probed({ ...twice, rotation: "g68" }, lcnc), 7)
    expect(lcncG68.plan.refused).toBeUndefined()
    expect(lcncG68.generated!.gcode).toMatch(/G68 X/)
    expect(lcncG68.generated!.gcode).toMatch(/G69/)
    expect(replayOf({ ...twice, rotation: "g68" }, lcnc)).toMatchObject({ status: "within", g68: 0.5 })
    expect(program.partProbeProgram(probed({ ...twice, rotation: "offset-r" }, lcnc), 7).generated!.gcode).toMatch(/G10 L2 P1 .*R/)
    // Siemens: a G68 is written as the frame's rotation, and the note says it turns about the frame's zero.
    const siemens = program.planPartProbe(probed({ ...twice, rotation: "g68" }, { post: { ...DEFAULT_POST_CONFIG, postId: "siemens" as const } }))
    expect(siemens.refused).toBeUndefined()
    expect(siemens.notes.join(" ")).toMatch(/writes no G68: the measured rotation is written into the register/)
    // Where no equivalent exists the post refuses with its own reason.
    expect(program.planPartProbe(probed({ ...twice, rotation: "g68" }, { post: { ...DEFAULT_POST_CONFIG, postId: "okuma" as const } })).refused).toMatch(/okuma post cannot write a coordinate rotation/)
  })

  test("the angle of a face alone (edge-angle) is a rotation of the register; it needs a rotation to write to", () => {
    const edge = { kind: "edge-angle" as const, start: { x: 10, y: 0 }, along: { x: 1, y: 0 }, pitch: 30, normal: { x: 0, y: -1 }, depth: 5 }
    const r = replayOf({ cycles: [zSurface, edge], rotation: "offset-r", replay: { displacements: [{ z: 0.3, rotation: 0.5 }] } }, lcnc)
    expect(r.status).toBe("within")
    expect(r.corrected!.R).toBeCloseTo(0.5, 6)
    // The face is touched along Y only: the default displacement in X is not found.
    expect(replayOf({ cycles: [zSurface, edge], rotation: "offset-r" }, lcnc).reason).toMatch(/no cycle measures X, in which the blank is displaced/)
    expect(program.planPartProbe(probed({ cycles: [zSurface, edge] }, lcnc)).refused).toMatch(/no rotation to write its angle to/)
  })

  test("a part on an indexed face is probed after its table turn, on the table's own pose, and found", () => {
    const face = replayOf({ cycles: [zSurface, corner()] }, { workpieces: [{ id: "w1", name: "Face", workOffset: "G54", index: { a: 90 } }] })
    expect(face.status).toBe("within")
    expect(face.corrected!.X).toBeCloseTo(0.8, 6)
    const b = replayOf({ cycles: [zSurface, corner()] }, { workpieces: [{ id: "w1", name: "Face", workOffset: "G54", index: { b: 90 } }] })
    expect(b.status).toBe("within")
    // A part on its own place in the fixture and a displaced blank on a turned face: the register of THAT part is the one that moves.
    const two = program.planPartProbe(probed({ cycles: [zSurface, corner()] }, { workpieces: [{ id: "w1", name: "P1", workOffset: "G54", placement: { x: 0, y: 0, z: 0 } }, { id: "w2", name: "P2", workOffset: "G55", placement: { x: 100, y: 0, z: 0 }, index: { a: 90 } }] }))
    expect(two.parts.map((q) => [q.register, q.replay!.status])).toEqual([["G54", "within"], ["G55", "within"]])
    expect(two.parts[1]!.replay!.corrected!.X).toBeCloseTo(100.8, 6)
  })

  test("the cycles that need a feature are replayed against a blank that has it: a bore, a boss, a slot, an inside rectangle and an inside corner", () => {
    const flat = { kind: "z-surface" as const, at: { x: 8, y: 8 }, expectedZ: 0 }
    const cases: ReadonlyArray<readonly [string, program.PartProbe["cycles"][number]]> = [
      ["bore", { kind: "bore", centre: { x: 30, y: 25 }, diameter: 20, depth: 5 }],
      ["boss", { kind: "boss", centre: { x: 30, y: 25 }, diameter: 20, depth: 5 }],
      ["slot", { kind: "pocket", centre: { x: 30, y: 25 }, width: 14, angle: 0, depth: 5 }],
      ["web", { kind: "web", centre: { x: 30, y: 25 }, width: 14, angle: Math.PI / 2, depth: 5 }],
      ["inside rectangle", { kind: "rectangle", inside: true, centre: { x: 30, y: 25 }, size: { x: 30, y: 20 }, depth: 5 }],
      ["inside corner", { kind: "corner", corner: { x: 45, y: 40 }, inside: true, xSense: 1, ySense: 1, depth: 5, touchesPerEdge: 2 }]
    ]
    for (const [name, cycle] of cases) {
      const r = replayOf({ cycles: [cycle] })
      expect(r.status, `${name}: ${r.reason}`).not.toBe("unreplayed")
      // Whatever the probe makes of it, it is the feature that was touched: either the register lands on the blank, or the miss/stop is named.
      if (r.status === "within") expect(r.residualMm!).toBeLessThan(0.05)
    }
    // A bore is found where the blank really is: the register takes the displacement the bore measures in X and Y.
    const bore = replayOf({ cycles: [flat, cases[0]![1]] })
    expect(bore.status, bore.reason).toBe("within")
    expect(bore.corrected!.X).toBeCloseTo(0.8, 3)
    expect(bore.corrected!.Y).toBeCloseTo(-0.6, 3)
    // The combinations the replay does not model are named, never passed.
    expect(replayOf({ cycles: [cases[0]![1], cases[1]![1]] })).toMatchObject({ status: "unreplayed", reason: expect.stringMatching(/one kind of feature at a time/) })
    expect(replayOf({ cycles: [{ kind: "pocket", centre: { x: 30, y: 25 }, width: 14, angle: 0.3, depth: 5 }] })).toMatchObject({ status: "unreplayed", reason: expect.stringMatching(/across X or across Y/) })
    expect(replayOf({ cycles: [cases[0]![1]] }, { workpieces: [{ id: "w1", name: "Face", workOffset: "G54", index: { a: 90 } }] })).toMatchObject({ status: "unreplayed", reason: expect.stringMatching(/indexed face with a feature/) })
  })

  test("a failed replay is in the probe program's warnings, and a setup without a blank has nothing to replay against", () => {
    const noBlank = program.planPartProbe(setup([op("a", t6)], { partProbe: { cycles: [zSurface] } })).parts[0]!.replay!
    expect(noBlank).toMatchObject({ status: "unreplayed", reason: expect.stringMatching(/no blank/) })
    const web = { kind: "web" as const, centre: { x: 30, y: 25 }, width: 60, angle: 0, depth: 5 }
    const made = program.partProbeProgram(probed({ cycles: [zSurface, web] }), 7)
    expect(made.generated!.warnings.join(" ")).toMatch(/Replay of Workpiece 1's probe on a displaced blank: outside - .*no cycle measures Y/)
    const fine = program.partProbeProgram(probed({ cycles: [zSurface, corner()] }), 7)
    expect(fine.generated!.warnings.join(" ")).not.toMatch(/Replay of/)
  })
})

describe("a part indexed as a tilted work plane", () => {
  const planeSetup = (postId: program.PostConfig["postId"], over: Partial<program.Setup> = {}, post: Partial<program.PostConfig> = {}): program.Setup => setup([op("a", t6)], {
    post: { ...DEFAULT_POST_CONFIG, postId, ...post },
    workpieces: [{ id: "w1", name: "Part 1", workOffset: "G54" }, { id: "w2", name: "Part 2", workOffset: "G55", index: { a: 90 }, indexAs: "plane" }], ...over
  })

  test("the plane is the table's orientation: its axes are the rows of the table rotation", () => {
    const { frame, layout } = indexPlane({ a: 90 })
    expect(layout).toBe("table-AC")
    expect(frame.zAxis.y).toBeCloseTo(1, 12)
    expect(frame.yAxis.z).toBeCloseTo(-1, 12)
    expect(indexPlane({ b: 90 }).layout).toBe("table-BC")
    expect(indexPlane({ b: 90 }).frame.zAxis.x).toBeCloseTo(-1, 12)
  })

  test("Fanuc writes G68.2 + G53.1 and G69 around the part, with no table turn, and the control's frame lands the tool where the table turn would", () => {
    const made = generateSetup(planeSetup("fanuc"), geometryOf)
    expect(made.issues).toEqual([])
    const p = made.programs[0]!
    expect(p.program.toolpaths.flatMap((t) => t.moves).some((m) => m._tag === "Orient")).toBe(false)
    const lines = p.gcode.split("\n").map((l) => l.trim())
    expect(lines.filter((l) => /^G68\.2\b/.test(l))).toHaveLength(1)
    expect(lines.filter((l) => l === "G53.1")).toHaveLength(1)
    expect(lines.filter((l) => l === "G69").length).toBeGreaterThanOrEqual(1)
    // Replay: the second part's moves, in the part's frame, are the first part's moves seen through the plane (the frame's rows).
    const run = interpretGcode(p.gcode, { track: true })
    const first = run.segments.filter((_, i) => (run.states![i]!.workOffset ?? "G54") === "G54")
    const second = run.segments.filter((_, i) => run.states![i]!.workOffset === "G55")
    const m = indexMatrix({ a: 90 })
    expect(second.length).toBeGreaterThanOrEqual(first.length)
    first.forEach((seg, i) => {
      const q = (seg as { to: { x: number; y: number; z: number } }).to
      const expected = { x: m[0] * q.x + m[3] * q.y + m[6] * q.z, y: m[1] * q.x + m[4] * q.y + m[7] * q.z, z: m[2] * q.x + m[5] * q.y + m[8] * q.z }
      const got = (second[i] as { to: { x: number; y: number; z: number } }).to
      for (const axis of ["x", "y", "z"] as const) expect(got[axis], `${i} ${axis}`).toBeCloseTo(expected[axis], 9)
    })
  })

  test("Siemens writes CYCLE800 with the machine's swivel record and refuses without it; Heidenhain writes PLANE SPATIAL", () => {
    const refused = generateSetup(planeSetup("siemens"), geometryOf)
    expect(refused.programs).toEqual([])
    expect(refused.issues.map((i) => i.message).join(" ")).toMatch(/CYCLE800.*swivel\.dataRecord/)
    const siemens = generateSetup(planeSetup("siemens", {}, { swivel: { dataRecord: "TC1" } }), geometryOf).programs[0]!
    expect(siemens.gcode).toMatch(/CYCLE800\(1,"TC1"/)
    const klartext = generateSetup(planeSetup("heidenhain"), geometryOf).programs[0]!
    expect(klartext.gcode).toMatch(/PLANE SPATIAL SPA-90/)
    expect(klartext.gcode).toMatch(/PLANE RESET/)
  })

  test("a post without tilted-plane words refuses the setup with the reason, and a plane of A and B together is an issue", () => {
    for (const postId of ["generic", "grbl", "linuxcnc"] as const) {
      const made = generateSetup(planeSetup(postId), geometryOf)
      expect(made.programs, postId).toEqual([])
      expect(made.issues[0]!.message, postId).toMatch(/no tilted-plane words/)
    }
    const both = validateSetup(planeSetup("fanuc", { workpieces: [{ id: "w1", name: "Part 1", workOffset: "G54" }, { id: "w2", name: "Part 2", workOffset: "G55", index: { a: 30, b: 20 }, indexAs: "plane" }] }))
    expect(both.map((i) => i.message).join(" ")).toMatch(/one axis \(A or B\) and C/)
    // The same part as a table turn is fine on a post that cannot do planes.
    const table = generateSetup(planeSetup("generic", { workpieces: [{ id: "w1", name: "Part 1", workOffset: "G54" }, { id: "w2", name: "Part 2", workOffset: "G55", index: { a: 90 } }] }), geometryOf)
    expect(table.issues).toEqual([])
  })

  test("a clamp of the fixture seen from a part indexed 90 degrees about A or Z is the box the table turn carries it to", () => {
    const clamp = { min: { x: 10, y: 0, z: -5 }, max: { x: 20, y: 30, z: 0 } }
    const datum = { x: 100, y: 0, z: 0 }
    expect(boxInPartFrame(clamp, datum, undefined)).toBe(clamp)
    // About Z (c 90): x - datum.x = -90..-80 turns to y = -90..-80 (about the datum), y 0..30 turns to x = -30..0 (plus the datum).
    const c90 = boxInPartFrame(clamp, datum, { c: 90 })
    expect(c90.min.x).toBeCloseTo(70, 9); expect(c90.max.x).toBeCloseTo(100, 9)
    expect(c90.min.y).toBeCloseTo(-90, 9); expect(c90.max.y).toBeCloseTo(-80, 9)
    expect(c90.min.z).toBeCloseTo(-5, 9); expect(c90.max.z).toBeCloseTo(0, 9)
    // About A (tilt 90 about X): y becomes z, z becomes -y.
    const a90 = boxInPartFrame(clamp, datum, { a: 90 })
    expect(a90.min.y).toBeCloseTo(0, 9); expect(a90.max.y).toBeCloseTo(5, 9)
    expect(a90.min.z).toBeCloseTo(0, 9); expect(a90.max.z).toBeCloseTo(30, 9)
    // At 45 degrees the box returned is the bounding box of the turned one: it covers it.
    const c45 = boxInPartFrame(clamp, datum, { c: 45 })
    expect(c45.max.x - c45.min.x).toBeGreaterThan(30 * Math.SQRT1_2)
  })
})
