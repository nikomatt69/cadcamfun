import { describe, expect, test } from "bun:test"
import { buildRecipe, plateTemplate, recipeNames, RECIPES, type History } from "@cadcamfun/core"
import { decodeHistory, parseHistory, parametricReport } from "../src/parametric.ts"
import { toSpec } from "../src/tools/define.ts"
import { BUILT_IN_TOOLS } from "../src/tools/registry.ts"
import { parametricInputSchema, parametricHarness } from "./helpers/parametric.ts"
import type { ToolHandlersShape } from "../src/tools/handlers.ts"
import { toolPrompt } from "../src/tools/prompts/index.ts"

/** Recipe builds run Boolean meshes: give them room on a loaded machine. */
const SLOW = 120_000

const base = plateTemplate()
const plateWith = (...extra: unknown[]): unknown => ({ ...base, features: [...base.features, ...extra] })
const plateEdited = (plate: Record<string, unknown>): unknown => ({ ...base, features: base.features.map((f) => (f.id === "plate" ? { ...f, ...plate } : f)) })

type Call = { readonly projectId: string; readonly input: unknown }
const harness = (reply: (input: never) => unknown = () => ({ ok: true })) => {
  const built = parametricHarness(reply)
  return { calls: built.calls as Call[], run: built.run as (input: unknown) => Promise<any>, handlers: built.handlers }
}
const withoutHandler = (input: unknown) => parametricHarness().withoutHandler(input)

describe("the history schema takes the engineering features", () => {
  test("the existing minimal cylinder history and the starting plate are still accepted", () => {
    const cylinder = { parameters: { radius: 10, height: 20 }, features: [
      { id: "profile", type: "sketch", plane: "XY", sketch: { entities: [{ id: "origin", kind: "point", x: 0, y: 0 }, { id: "outline", kind: "circle", center: "origin", radius: 10 }], constraints: [{ type: "fixed", point: "origin", x: 0, y: 0 }, { type: "radius", circle: "outline", value: "radius" }] } },
      { id: "body", type: "extrude", sketch: "profile", depth: "height", operation: "new" }
    ] }
    expect(decodeHistory(cylinder).success).toBe(true)
    expect(decodeHistory(base).success).toBe(true)
  })

  test("extrude accepts an edge and a corner treatment, with numbers or expressions", () => {
    expect(decodeHistory(plateEdited({ edge: { style: "chamfer", size: 1 }, corner: { style: "fillet", size: "thick / 4" } })).success).toBe(true)
    expect(decodeHistory(plateEdited({ edge: { style: "fillet", size: "hole / 10", ends: "top", holes: true } })).success).toBe(true)
  })

  test.each([
    ["an unknown style", { edge: { style: "round", size: 1 } }],
    ["a missing size", { edge: { style: "chamfer" } }],
    ["an unknown end", { edge: { style: "chamfer", size: 1, ends: "side" } }],
    ["a corner without a style", { corner: { size: 2 } }],
    ["a non-finite size", { edge: { style: "chamfer", size: Infinity } }]
  ])("%s is refused", (_name, patch) => {
    expect(decodeHistory(plateEdited(patch)).success).toBe(false)
  })

  test("a counterbore needs headDiameter and headDepth; a countersink needs headDiameter", () => {
    const hole = { id: "cb", type: "hole", plane: "XY", offset: "thick", at: [10, 10], diameter: 4, depth: "thick" }
    expect(decodeHistory(plateWith({ ...hole, kind: "counterbore", headDiameter: 8, headDepth: 3 })).success).toBe(true)
    expect(decodeHistory(plateWith({ ...hole, kind: "counterbore", headDiameter: 8 })).success).toBe(false)
    expect(decodeHistory(plateWith({ ...hole, kind: "counterbore", headDepth: 3 })).success).toBe(false)
    expect(decodeHistory(plateWith({ ...hole, kind: "countersink", headDiameter: 8, angle: 90 })).success).toBe(true)
    expect(decodeHistory(plateWith({ ...hole, kind: "countersink", angle: 90 })).success).toBe(false)
    expect(decodeHistory(plateWith({ ...hole, kind: "simple" })).success).toBe(true)
    expect(decodeHistory(plateWith({ ...hole, kind: "tapered" })).success).toBe(false)
    const refused = decodeHistory(plateWith({ ...hole, kind: "counterbore", headDiameter: 8 }))
    expect(refused.success ? "" : refused.problems.join(" ")).toMatch(/headDiameter and headDepth/)
  })

  test("a mirror needs an earlier extrude, revolve, hole or mirror; a pattern may copy a mirror", () => {
    const mirror = { id: "m", type: "mirror", feature: "hole1", plane: "YZ", offset: "width / 2" }
    expect(decodeHistory(plateWith(mirror)).success).toBe(true)
    expect(decodeHistory(plateWith(mirror, { id: "m2", type: "mirror", feature: "m", plane: "ZX" })).success).toBe(true)
    expect(decodeHistory(plateWith(mirror, { id: "p", type: "pattern", feature: "m", kind: "linear", count: 2, step: [0, 5, 0] })).success).toBe(true)
    const unknown = decodeHistory(plateWith({ ...mirror, feature: "ghost" }))
    expect(unknown.success).toBe(false)
    expect(unknown.success ? "" : unknown.problems.join(" ")).toContain("Mirror source 'ghost'")
    expect(decodeHistory(plateWith({ ...mirror, feature: "sketch1" })).success).toBe(false) // a sketch has no tool
    expect(decodeHistory({ ...base, features: [{ id: "m", type: "mirror", feature: "hole1", plane: "XY" }, ...base.features] }).success).toBe(false) // forward reference
    expect(decodeHistory(plateWith({ ...mirror, plane: "XZ" })).success).toBe(false)
  })

  test("a pattern still refuses a source that is a sketch or does not exist", () => {
    expect(decodeHistory(plateWith({ id: "p", type: "pattern", feature: "sketch1", kind: "linear", count: 2, step: [1, 0, 0] })).success).toBe(false)
    expect(decodeHistory(plateWith({ id: "p", type: "pattern", feature: "nowhere", kind: "linear", count: 2, step: [1, 0, 0] })).success).toBe(false)
  })

  test("the report of a part with the new features: bodies, volume smaller than the plain plate, bounds unchanged", () => {
    const plain = parametricReport(base as History)
    const treated = parseHistory(plateWith(
      { id: "cb", type: "hole", plane: "XY", offset: "thick", at: [10, 10], diameter: 4, depth: "thick", kind: "counterbore", headDiameter: 8, headDepth: 3 },
      { id: "m", type: "mirror", feature: "cb", plane: "YZ", offset: "width / 2" }
    ))
    const edged = parseHistory({ ...treated, features: treated.features.map((f) => (f.id === "plate" ? { ...f, edge: { style: "chamfer", size: 1 } } : f)) })
    const report = parametricReport(edged)
    expect(report.ok).toBe(true)
    expect(report.bodyCount).toBe(1)
    expect(report.volumeMm3!).toBeLessThan(plain.volumeMm3! - 2 * Math.PI * 4 * 8 * 0.9)
    expect(report.bounds!.max.x).toBeCloseTo(plain.bounds!.max.x, 5)
    expect(report.issues).toEqual([])
    // The report's exact model blends the chamfered rims with exact Booleans (about a second each on a loaded machine).
  }, 60_000)
})

describe("cad_parametric input schema", () => {
  test("the recipe action takes exactly the core's recipe names", () => {
    for (const recipe of recipeNames()) expect(parametricInputSchema.safeParse({ action: "recipe", recipe }).success).toBe(true)
    expect(parametricInputSchema.safeParse({ action: "recipe", recipe: "rocket" }).success).toBe(false)
    expect(parametricInputSchema.safeParse({ action: "recipe" }).success).toBe(false)
  })

  test("params, create, name and placement are accepted; params must be an object", () => {
    expect(parametricInputSchema.safeParse({ action: "recipe", recipe: "flange", params: { boltCount: 8 }, create: true, name: "F1", x: 10, y: 0, z: 5, layer: "Parts" }).success).toBe(true)
    expect(parametricInputSchema.safeParse({ action: "recipe", recipe: "flange", params: "boltCount=8" }).success).toBe(false)
    expect(parametricInputSchema.safeParse({ action: "recipe", recipe: "flange", x: Infinity }).success).toBe(false)
  })

  test("dfm takes a process, a cutter, a material, a wall and an envelope; unknown values are refused", () => {
    expect(parametricInputSchema.safeParse({ action: "dfm", elementId: "e", process: "turn", toolDiameter: 4, material: "plastic", minWall: 1.2, envelope: { x: 100, y: 100, z: 50 } }).success).toBe(true)
    expect(parametricInputSchema.safeParse({ action: "dfm", elementId: "e", process: "laser" }).success).toBe(false)
    expect(parametricInputSchema.safeParse({ action: "dfm", elementId: "e", toolDiameter: -1 }).success).toBe(false)
    expect(parametricInputSchema.safeParse({ action: "dfm", elementId: "e", envelope: { x: 1, y: 1 } }).success).toBe(false)
  })

  test("fastener takes nothing, a size, a fit and a shaft diameter; a bad fit is refused", () => {
    for (const ok of [{}, { size: "M8" }, { size: "M8", fit: "fine" }, { shaftDiameter: 30 }]) expect(parametricInputSchema.safeParse({ action: "fastener", ...ok }).success).toBe(true)
    expect(parametricInputSchema.safeParse({ action: "fastener", fit: "loose" }).success).toBe(false)
    expect(parametricInputSchema.safeParse({ action: "fastener", shaftDiameter: 0 }).success).toBe(false)
  })

  test("the tool prompt documents the new actions and features", () => {
    const prompt = toolPrompt("cad")
    for (const word of ["parametric_recipe", "parametric_dfm", "parametric_fastener"]) expect(prompt).toContain(word)
    for (const name of recipeNames()) expect(prompt).toContain(name)
  })
})

describe("cad_parametric: recipe", () => {
  test.each(RECIPES.map((r) => r.name))("%s: builds, validates against the schema, reports ok, and writes nothing without create", async (name) => {
    const { calls, run } = harness()
    const params = name === "stepped_shaft" ? { sections: [{ diameter: 20, length: 30 }, { diameter: 30, length: 50 }], keywaySection: 1 } : {}
    const result = await run({ action: "recipe", recipe: name, params })
    expect(result.ok).toBe(true)
    expect(result.recipe).toBe(name)
    expect(result.summary.length).toBeGreaterThan(10)
    expect(result.rules.length).toBeGreaterThan(0)
    expect(result.report).toMatchObject({ ok: true, bodyCount: 1 })
    expect(result.report.volumeMm3).toBeGreaterThan(0)
    expect(decodeHistory(result.history).success).toBe(true)
    expect(result.history).toEqual(buildRecipe(name, params).history)
    expect(calls).toEqual([])
    expect(JSON.stringify(result)).not.toContain("NaN")
  }, SLOW)

  test("a rule the recipe enforces comes back as ok:false with the rule's own message, and nothing is written", async () => {
    const { calls, run } = harness()
    const result = await run({ action: "recipe", recipe: "mounting_plate", params: { edgeDistance: 10 }, create: true })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/edge distance 10 mm is below 1\.5 x the hole diameter/)
    expect(calls).toEqual([])
    const unknown = await run({ action: "recipe", recipe: "flange", params: { fastener: "M7" } })
    expect(unknown).toMatchObject({ ok: false })
    expect(unknown.error).toContain("Unknown metric thread")
  })

  test("params that are the wrong type are a message, not a throw", async () => {
    const { run } = harness()
    const result = await run({ action: "recipe", recipe: "flange", params: { boltCount: "many" } })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/'boltCount' must be a number/)
  })

  test("create: true calls the project handler exactly once with the generated history, the name and the placement", async () => {
    const { calls, run } = harness(() => ({ ok: true, mutation: "add", ids: ["el-9"], elements: [{ id: "el-9", type: "parametric" }], drawingId: "d1", projectId: "p1" }))
    const result = await run({ action: "recipe", recipe: "l_bracket", params: { holesPerLeg: 2 }, create: true, name: "Bracket A", x: 10, y: 20, z: 5, layer: "Parts" })
    expect(calls).toHaveLength(1)
    expect(calls[0]!.projectId).toBe("p1")
    expect(calls[0]!.input).toEqual({ action: "create", history: buildRecipe("l_bracket", { holesPerLeg: 2 }).history, name: "Bracket A", x: 10, y: 20, z: 5, layer: "Parts" })
    expect(result.ok).toBe(true)
    expect(result.created).toMatchObject({ ok: true, mutation: "add", ids: ["el-9"] })
    expect(result.history).toEqual((calls[0]!.input as { history: unknown }).history)
  }, SLOW)

  test("without a name the part is called after the recipe; placement fields that were not sent are not sent on", async () => {
    const { calls, run } = harness()
    await run({ action: "recipe", recipe: "mounting_plate", create: true })
    expect(calls).toHaveLength(1)
    expect(calls[0]!.input).toMatchObject({ action: "create", name: "Mounting plate" })
    for (const key of ["x", "y", "z", "layer"]) expect(Object.keys(calls[0]!.input as object)).not.toContain(key)
  }, SLOW)

  test("when the project refuses the part the result says so", async () => {
    const { run } = harness(() => ({ ok: false, error: "No project is open." }))
    const result = await run({ action: "recipe", recipe: "mounting_plate", create: true })
    expect(result.ok).toBe(false)
    expect(result.created).toEqual({ ok: false, error: "No project is open." })
  }, SLOW)

  test("create without parametric handlers reports that instead of pretending", async () => {
    const result = await withoutHandler({ action: "recipe", recipe: "mounting_plate", create: true })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/unavailable/)
    expect(result.history).toBeDefined() // the generated part is still returned
  }, SLOW)
})

describe("cad_parametric: dfm", () => {
  const bracket = buildRecipe("l_bracket").history
  const plate = buildRecipe("mounting_plate").history

  test("with an inline history: the report of the rules, process and cutter, and the sharp inside corner is an error", async () => {
    const { calls, run } = harness()
    const result = await run({ action: "dfm", history: bracket })
    expect(calls).toEqual([])
    expect(result).toMatchObject({ process: "mill", toolDiameter: 6, ok: false })
    expect(result.issues.map((i: { code: string }) => i.code)).toContain("INTERNAL_CORNER")
    expect(result.metrics.bodies).toBe(1)
    expect(result.metrics.volumeMm3).toBeGreaterThan(20000)
  }, SLOW)

  test("a clean part is ok; the options reach the engine (cutter, process, material, minimum wall, envelope)", async () => {
    const { run } = harness()
    expect(await run({ action: "dfm", history: plate })).toMatchObject({ ok: true, process: "mill", toolDiameter: 6 })
    expect(await run({ action: "dfm", history: plate, toolDiameter: 12, process: "print" })).toMatchObject({ process: "print", toolDiameter: 12 })
    const tight = await run({ action: "dfm", history: plate, envelope: { x: 50, y: 50, z: 50 } })
    expect(tight.ok).toBe(false)
    expect(tight.issues.filter((i: { code: string }) => i.code === "EXCEEDS_ENVELOPE")).toHaveLength(2)
    const wall = await run({ action: "dfm", history: plate, minWall: 50 })
    expect(wall.issues.some((i: { code: string }) => i.code === "THIN_WALL")).toBe(true)
    const cutter = await run({ action: "dfm", history: bracket, toolDiameter: 2 })
    expect(cutter.issues.find((i: { code: string }) => i.code === "INTERNAL_CORNER")).toMatchObject({ required: 1 })
  }, SLOW)

  test("with an elementId the part is read through the project handler (inspect) and then checked", async () => {
    const { calls, run } = harness((input) => ((input as { action?: string }).action === "inspect" ? { ok: true, history: bracket, revision: "r7" } : { ok: false }))
    const result = await run({ action: "dfm", elementId: "el-3" })
    expect(calls).toHaveLength(1)
    expect(calls[0]!.input).toEqual({ action: "inspect", elementId: "el-3" })
    expect(result.issues.map((i: { code: string }) => i.code)).toContain("INTERNAL_CORNER")
  }, SLOW)

  test("exactly one of elementId and history", async () => {
    const { calls, run } = harness()
    expect((await run({ action: "dfm" })).error).toMatch(/exactly one of elementId/)
    expect((await run({ action: "dfm", elementId: "e", history: plate })).error).toMatch(/exactly one of elementId/)
    expect(calls).toEqual([])
  })

  test("a part that cannot be read comes back as the handler's own failure or a clear message", async () => {
    expect(await harness(() => ({ ok: false, error: "No such element." })).run({ action: "dfm", elementId: "ghost" })).toEqual({ ok: false, _tag: "ActionRefused", actionId: "cad.parametric_dfm", error: "No such element." })
    const noHistory = await harness(() => ({ ok: true })).run({ action: "dfm", elementId: "e" })
    expect(noHistory).toMatchObject({ ok: false })
    expect(noHistory.error).toMatch(/no readable parametric history/)
    const invalid = await harness(() => ({ ok: true, history: { parameters: {}, features: [] } })).run({ action: "dfm", elementId: "e" })
    expect(invalid.ok).toBe(false)
    expect((await withoutHandler({ action: "dfm", elementId: "e" })).error).toMatch(/unavailable/)
  })
})

describe("cad_parametric: fastener", () => {
  test("a size: the thread, its tap drill, the clearance hole for the fit, the counterbore", async () => {
    const result = await withoutHandler({ action: "fastener", size: "M8", fit: "medium" })
    expect(result.ok).toBe(true)
    expect(result.thread).toMatchObject({ name: "M8", d: 8, pitch: 1.25, tapDrill: 6.8, counterboreDiameter: 15, counterboreDepth: 9 })
    expect(result.clearanceHole).toBe(9)
    expect((await withoutHandler({ action: "fastener", size: "m10", fit: "fine" })).clearanceHole).toBe(10.5)
    expect((await withoutHandler({ action: "fastener", size: "M10" })).clearanceHole).toBeUndefined()
  })

  test("an unknown size is ok:false and lists the sizes the table has", async () => {
    const result = await withoutHandler({ action: "fastener", size: "M7" })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/Unknown metric thread 'M7'.*M3.*M30/)
  })

  test("no size lists every thread, with the fit's clearance when asked", async () => {
    const all = await withoutHandler({ action: "fastener" })
    expect(all.ok).toBe(true)
    expect(all.threads).toHaveLength(14)
    expect(all.threads[0].name).toBe("M2")
    const fit = await withoutHandler({ action: "fastener", fit: "coarse" })
    expect(fit.threads.find((t: { name: string }) => t.name === "M6").clearanceHole).toBe(7)
  })

  test("a shaft diameter returns the DIN 6885 key: Ø30 is 8 x 7 with t1 4.0; Ø5 and Ø80 are outside the standard", async () => {
    const key = await withoutHandler({ action: "fastener", shaftDiameter: 30 })
    expect(key.keyway).toMatchObject({ b: 8, h: 7, t1: 4, t2: 3.3 })
    for (const d of [5, 80]) {
      const none = await withoutHandler({ action: "fastener", shaftDiameter: d })
      expect(none.keyway).toBeNull()
      expect(none.keywayNote).toMatch(/6 up to 75/)
    }
    const both = await withoutHandler({ action: "fastener", size: "M6", shaftDiameter: 22.5 })
    expect(both.thread.name).toBe("M6")
    expect(both.keyway).toMatchObject({ b: 8 })
  })
})

describe("cad_parametric: the existing actions are untouched", () => {
  test("validate answers by itself and sees the new features", async () => {
    const { calls, run } = harness()
    const history = parseHistory(plateEdited({ edge: { style: "chamfer", size: 1 }, corner: { style: "fillet", size: 3 } }))
    const result = await run({ action: "validate", history })
    expect(result.ok).toBe(true)
    expect(calls).toEqual([])
    expect(result.volumeMm3).toBeLessThan(60 * 40 * 8 - Math.PI * 25 * 8 * 0.99)
  }, SLOW)

  test("inspect, create, update and test go to the project handler unchanged", async () => {
    const { calls, run } = harness(() => ({ ok: true }))
    const history = parseHistory(base)
    const inputs = [
      { action: "inspect", elementId: "e1" },
      { action: "create", history, name: "Plate", x: 1, y: 2, z: 3 },
      { action: "update", elementId: "e1", parameters: { width: 70 }, expectedRevision: "abc" },
      { action: "test", elementId: "e1", cases: [{ name: "wide", parameters: { width: 90 }, expectedBodies: 1 }] }
    ]
    for (const input of inputs) await run(input)
    expect(calls.map((c) => c.input)).toEqual(inputs)
    expect(calls.every((c) => c.projectId === "p1")).toBe(true)
  })

  test("without handlers they say so", async () => {
    expect((await withoutHandler({ action: "inspect", elementId: "e1" })).error).toMatch(/unavailable/)
  })
})

describe("through the host tool adapter", () => {
  const spec = (tool: string, handlers: ToolHandlersShape = {} as ToolHandlersShape) =>
    toSpec(BUILT_IN_TOOLS.find((entry) => entry.id === tool)!, { handlers, projectId: "p1" })
  const call = () => ({ signal: new AbortController().signal, sessionId: "s", projectId: "p1" })

  test("a recipe call arrives as JSON the model can read", async () => {
    const out = JSON.parse(await spec("cad").execute({ action: "parametric_recipe", recipe: "mounting_plate" }, call()))
    expect(out).toMatchObject({ ok: true, recipe: "mounting_plate" })
    expect(out.history.features.length).toBeGreaterThan(4)
  }, SLOW)

  test("a recipe name the model made up is refused before anything runs, with the recovery text", async () => {
    const out = JSON.parse(await spec("cad").execute({ action: "parametric_recipe", recipe: "rocket" }, call()))
    expect(out.ok).toBe(false)
    expect(JSON.stringify(out)).toContain("cad")
  })

  test("dfm and fastener through the adapter", async () => {
    const dfm = JSON.parse(await spec("cad").execute({ action: "parametric_dfm", history: buildRecipe("mounting_plate").history }, call()))
    expect(dfm).toMatchObject({ ok: true, process: "mill" })
    const fastener = JSON.parse(await spec("cad").execute({ action: "parametric_fastener", size: "M6" }, call()))
    expect(fastener.thread.tapDrill).toBe(5)
  }, SLOW)
})
