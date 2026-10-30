import { describe, expect, test } from "bun:test"
import { DEFAULT_GEOMETRY, DEFAULT_SETTINGS, type GeometryInput } from "../../src/cam/generator/index.ts"
import { program } from "../../src/cam/index.ts"

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

  test("the same setup gives the same bytes", () => {
    const s = setup([op("a", t6), op("b", t3)])
    expect(generateSetup(s, geometryOf).programs[0]!.gcode).toBe(generateSetup(s, geometryOf).programs[0]!.gcode)
  })
})
