import { describe, expect, test } from "bun:test"
import { DEFAULT_GEOMETRY, DEFAULT_SETTINGS, type GeometryInput } from "../../src/cam/generator/index.ts"
import { program } from "../../src/cam/index.ts"
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
