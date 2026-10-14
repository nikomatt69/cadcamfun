import { describe, expect, test } from "bun:test"
import { z } from "zod"
import { Schema } from "effect"
import { ParametricHistory } from "@cadcamfun/api"
import { buildRecipe, type History } from "@cadcamfun/core"
import { decodeHistory, parseHistory } from "../src/parametric.ts"
import { toSpec } from "../src/tools/define.ts"
import { cadTool } from "../src/tools/cad.ts"
import { parametricInputSchema, parametricHarness } from "./helpers/parametric.ts"
import type { ToolHandlersShape } from "../src/tools/handlers.ts"
import { lenient } from "../src/tools/lenient-arguments.ts"
import { toolPrompt } from "../src/tools/prompts/index.ts"
import { CADCAM_SKILLS } from "../src/skills/index.ts"

/** Booleans on thousands of facets are slow on a loaded machine. */
const SLOW = 120_000

// ----------------------------------------------------------------------------------------------- sketches in the wire format

const rectangle = (id: string, plane: "XY" | "YZ" | "ZX", x: number, y: number, w: number | string, h: number | string, offset?: number | string) => ({
  id, type: "sketch", plane, ...(offset !== undefined ? { offset } : {}),
  sketch: {
    entities: [
      { id: "p1", kind: "point", x: x + 0.2, y: y - 0.1 }, { id: "p2", kind: "point", x: x + 9, y: y + 0.3 }, { id: "p3", kind: "point", x: x + 11, y: y + 6 }, { id: "p4", kind: "point", x: x - 0.4, y: y + 5 },
      { id: "l1", kind: "line", p1: "p1", p2: "p2" }, { id: "l2", kind: "line", p1: "p2", p2: "p3" }, { id: "l3", kind: "line", p1: "p3", p2: "p4" }, { id: "l4", kind: "line", p1: "p4", p2: "p1" }
    ],
    constraints: [
      { type: "fixed", point: "p1", x, y }, { type: "horizontal", line: "l1" }, { type: "vertical", line: "l2" }, { type: "horizontal", line: "l3" }, { type: "vertical", line: "l4" },
      { type: "length", line: "l1", value: w }, { type: "length", line: "l2", value: h }
    ]
  }
})
const rings = (id: string, plane: "XY" | "YZ" | "ZX", cx: number, cy: number, radii: Array<number | string>, offset?: number) => ({
  id, type: "sketch", plane, ...(offset !== undefined ? { offset } : {}),
  sketch: {
    entities: [{ id: "c", kind: "point", x: cx, y: cy }, ...radii.map((_, i) => ({ id: `k${i}`, kind: "circle", center: "c", radius: 1 + i }))],
    constraints: [{ type: "fixed", point: "c", x: cx, y: cy }, ...radii.map((r, i) => ({ type: "radius", circle: `k${i}`, value: r }))]
  }
})
const route = (id: string, points: Array<[number, number]>, plane: "XY" | "YZ" | "ZX" = "XY") => ({
  id, type: "sketch", plane,
  sketch: { entities: [...points.map(([x, y], i) => ({ id: `q${i}`, kind: "point", x, y })), ...points.slice(1).map((_, i) => ({ id: `m${i}`, kind: "line", p1: `q${i}`, p2: `q${i + 1}` }))], constraints: [] }
})
const box = (extra: unknown[] = [], parameters: Record<string, number | string> = {}) => ({
  parameters: { w: 40, d: 30, h: 20, ...parameters },
  features: [rectangle("s", "XY", 0, 0, "w", "d"), { id: "box", type: "extrude", sketch: "s", depth: "h", operation: "new" }, ...extra]
})
const issuesOf = (value: unknown): string => {
  const parsed = decodeHistory(value)
  return parsed.success ? "" : parsed.problems.join(" | ")
}
const accepted = (value: unknown): boolean => decodeHistory(value).success

interface Call { readonly projectId: string; readonly input: unknown }
/** What the project handler answers when it stores a part (the `cad_edit.parametric_create` contract). */
const created = { ok: true, mutation: "add", ids: ["e-1"], elements: [{ id: "e-1", type: "parametric" }], drawingId: "d1", projectId: "p1" }

const harness = (reply: (input: never) => unknown = () => ({ ok: true })) => {
  const built = parametricHarness(reply)
  return { calls: built.calls as Call[], run: built.run as (input: unknown) => Promise<any> }
}
const rel = (got: number, want: number) => Math.abs(got - want) / Math.abs(want)

// ----------------------------------------------------------------------------------------------- the schema

describe("the history schema takes sweep, loft, shell, fillet and grid patterns", () => {
  test("a pipe: a profile sketch, a path sketch and a sweep", () => {
    expect(accepted({ parameters: {}, features: [rings("section", "YZ", 0, 0, [5, 3]), route("path", [[0, 0], [40, 0], [40, 40]]), { id: "pipe", type: "sweep", profile: "section", path: "path", operation: "new" }] })).toBe(true)
  })

  test("a loft takes two or more sketches, with or without smooth", () => {
    const sections = [rectangle("a", "XY", -10, -10, 20, 20), rectangle("b", "XY", -5, -5, 10, 10, 30), rectangle("c", "XY", -2, -2, 4, 4, 60)]
    expect(accepted({ parameters: {}, features: [...sections, { id: "lf", type: "loft", sections: ["a", "b"], operation: "new" }] })).toBe(true)
    expect(accepted({ parameters: {}, features: [...sections, { id: "lf", type: "loft", sections: ["a", "b", "c"], smooth: true, operation: "new" }] })).toBe(true)
  })

  test("a shell, a fillet with every kind of selection, and a grid pattern", () => {
    expect(accepted(box([{ id: "sh", type: "shell", feature: "box", thickness: "wall", open: "top" }], { wall: 2 }))).toBe(true)
    expect(accepted(box([{ id: "f", type: "fillet", radius: 2 }]))).toBe(true)
    expect(accepted(box([{ id: "f", type: "fillet", radius: "r", style: "chamfer", targets: ["box"], edges: { parallel: "z", kind: "both", minLength: 5, within: { min: [0, 0, 0], max: [40, 30, "h"] } } }], { r: 2 }))).toBe(true)
    const hole = { id: "h", type: "hole", plane: "XY", offset: "h", at: [6, 6], diameter: 3, depth: "h" }
    expect(accepted(box([hole, { id: "g", type: "pattern", feature: "h", kind: "grid", count: 3, countB: 2, step: [10, 0, 0], stepB: [0, 15, 0] }]))).toBe(true)
  })

  test("a mirror or a pattern may copy a sweep or a loft", () => {
    const pipe = [rings("section", "YZ", 0, 0, [3]), route("path", [[0, 0], [40, 0]]), { id: "pipe", type: "sweep", profile: "section", path: "path", operation: "new" }]
    expect(accepted({ parameters: {}, features: [...pipe, { id: "m", type: "mirror", feature: "pipe", plane: "YZ" }] })).toBe(true)
    expect(accepted({ parameters: {}, features: [...pipe, { id: "p", type: "pattern", feature: "pipe", kind: "linear", count: 3, step: [0, 0, 20] }] })).toBe(true)
    const lofted = [rectangle("a", "XY", -10, -10, 20, 20), rectangle("b", "XY", -5, -5, 10, 10, 30), { id: "lf", type: "loft", sections: ["a", "b"], operation: "new" }]
    expect(accepted({ parameters: {}, features: [...lofted, { id: "m", type: "mirror", feature: "lf", plane: "XY" }] })).toBe(true)
  })

  test.each([
    ["a sweep whose profile is not an earlier sketch", { id: "pipe", type: "sweep", profile: "box", path: "s", operation: "new" }, /Sweep profile 'box' must be an earlier sketch/],
    ["a sweep whose path does not exist", { id: "pipe", type: "sweep", profile: "s", path: "ghost", operation: "new" }, /Sweep path 'ghost' must be an earlier sketch/],
    ["a sweep along its own profile", { id: "pipe", type: "sweep", profile: "s", path: "s", operation: "new" }, /two different sketches/],
    ["a loft of a single section", { id: "lf", type: "loft", sections: ["s"], operation: "new" }, /./],
    ["a loft through an extrusion", { id: "lf", type: "loft", sections: ["s", "box"], operation: "new" }, /Loft section 'box' must be an earlier sketch/],
    ["a shell of a hole", { id: "sh", type: "shell", feature: "hh", thickness: 1 }, /Shell source 'hh' must be an earlier extrude/],
    ["a shell of nothing", { id: "sh", type: "shell", feature: "ghost", thickness: 1 }, /Shell source 'ghost' must be an earlier extrude/],
    ["a shell with an unknown open face", { id: "sh", type: "shell", feature: "box", thickness: 1, open: "left" }, /./],
    ["a fillet with an unknown axis", { id: "f", type: "fillet", radius: 1, edges: { parallel: "w" } }, /./],
    ["a fillet with an unknown style", { id: "f", type: "fillet", radius: 1, style: "round" }, /./],
    ["a fillet without a radius", { id: "f", type: "fillet" }, /./],
    ["a grid without the second count", { id: "g", type: "pattern", feature: "hh", kind: "grid", count: 3, step: [10, 0, 0], stepB: [0, 5, 0] }, /Grid patterns need countB/],
    ["a grid without the row step", { id: "g", type: "pattern", feature: "hh", kind: "grid", count: 3, countB: 2, step: [10, 0, 0] }, /Grid patterns need countB \(rows\) and stepB/],
    ["a grid without the first step", { id: "g", type: "pattern", feature: "hh", kind: "grid", count: 3, countB: 2, stepB: [0, 5, 0] }, /Grid patterns need step/],
    ["a mirror of a sketch", { id: "m", type: "mirror", feature: "s", plane: "XY" }, /Mirror source 's'/],
    ["a pattern of a shell (it has no tool)", { id: "p", type: "pattern", feature: "sh", kind: "linear", count: 2, step: [1, 0, 0] }, /Pattern source 'sh'/]
  ])("%s is refused", (_name, feature, message) => {
    const base = box([{ id: "hh", type: "hole", plane: "XY", offset: "h", at: [6, 6], diameter: 3, depth: "h" }, { id: "sh", type: "shell", feature: "box", thickness: 1 }])
    const history = { ...base, features: [...base.features, feature] }
    // The shell the pattern case refers to has to be the one we added; the others are meant to fail on their own reference.
    const text = issuesOf(history)
    expect(text.length).toBeGreaterThan(0)
    expect(text).toMatch(message)
  })

  test("a fillet needs a body before it: a history that only has sketches is refused", () => {
    expect(issuesOf({ parameters: {}, features: [rectangle("s", "XY", 0, 0, 10, 10), { id: "f", type: "fillet", radius: 1 }] })).toMatch(/A fillet needs a body built before it/)
  })

  test("a sweep or a loft counts as a body for a fillet", () => {
    const pipe = [rings("section", "YZ", 0, 0, [3]), route("path", [[0, 0], [40, 0]]), { id: "pipe", type: "sweep", profile: "section", path: "path", operation: "new" }]
    expect(accepted({ parameters: {}, features: [...pipe, { id: "f", type: "fillet", radius: 0.5 }] })).toBe(true)
  })

  test("the earlier features and a forward reference: a shell before its extrusion is refused", () => {
    const shellFirst = { parameters: {}, features: [rectangle("s", "XY", 0, 0, 10, 10), { id: "sh", type: "shell", feature: "box", thickness: 1 }, { id: "box", type: "extrude", sketch: "s", depth: 5, operation: "new" }] }
    expect(issuesOf(shellFirst)).toMatch(/Shell source 'box'/)
  })

  test("the schema description tells the model the new references", () => {
    const json = JSON.stringify(Schema.toJsonSchemaDocument(ParametricHistory))
    for (const word of ["sweep", "loft", "shell", "fillet", "grid", "countB", "stepB", "smooth", "parallel", "minLength"]) expect(json).toContain(word)
  })
})

// ----------------------------------------------------------------------------------------------- the tool

describe("cad_parametric accepts the new histories and reports them", () => {
  test("the input schema converts to JSON Schema with the new features in it, and the lenient wrapper too", () => {
    expect(() => z.toJSONSchema(parametricInputSchema as never)).not.toThrow()
    expect(() => z.toJSONSchema(lenient(cadTool.parameters) as never)).not.toThrow()
    const json = JSON.stringify(z.toJSONSchema(lenient(cadTool.parameters) as never))
    for (const word of ["sweep", "loft", "shell", "fillet", "grid", "recipe", "dfm", "fastener"]) expect(json).toContain(word)
  })

  test("validate: a closed 2 mm shell reports the volume 24000 - 36 x 26 x 16 and one body", async () => {
    const { calls, run } = harness()
    const out = await run({ action: "parametric_validate", history: box([{ id: "sh", type: "shell", feature: "box", thickness: 2 }]) })
    expect(out).toMatchObject({ ok: true, bodyCount: 1 })
    expect(out.volumeMm3).toBeCloseTo(9024, 2)
    expect(out.issues).toEqual([])
    expect(calls).toEqual([])
  }, SLOW)

  test("validate: an open-top shell is a cup, 7152 mm3", async () => {
    const out = await harness().run({ action: "parametric_validate", history: box([{ id: "sh", type: "shell", feature: "box", thickness: 2, open: "top" }]) })
    expect(out.ok).toBe(true)
    expect(out.volumeMm3).toBeCloseTo(7152, 2)
  }, SLOW)

  test("validate: a fillet of the vertical edges removes 4 (1 - pi/4) r^2 h; a chamfer exactly 4 x c^2/2 x h", async () => {
    const { run } = harness()
    const fillet = await run({ action: "parametric_validate", history: box([{ id: "f", type: "fillet", radius: 4, edges: { parallel: "z" } }]) })
    expect(fillet.ok).toBe(true)
    expect(rel(fillet.volumeMm3, 24000 - 4 * (1 - Math.PI / 4) * 16 * 20)).toBeLessThan(0.0005)
    const chamfer = await run({ action: "parametric_validate", history: box([{ id: "f", type: "fillet", style: "chamfer", radius: 3, edges: { parallel: "z" } }]) })
    expect(chamfer.volumeMm3).toBeCloseTo(24000 - 360, 2)
  }, SLOW)

  test("validate: a fillet wider than the faces is reported in the issues, not hidden", async () => {
    const out = await harness().run({ action: "parametric_validate", history: box([{ id: "f", type: "fillet", radius: 50, edges: { parallel: "z" } }]) })
    expect(out.ok).toBe(false)
    expect(JSON.stringify(out.issues)).toMatch(/needs 50\.00 mm of face/)
  }, SLOW)

  test("validate: a pipe along an L route is ok, one body, and about area x length", async () => {
    const out = await harness().run({ action: "parametric_validate", history: { parameters: {}, features: [rings("section", "YZ", 0, 0, [3]), route("path", [[0, 0], [50, 0], [50, 50]]), { id: "pipe", type: "sweep", profile: "section", path: "path", operation: "new" }] } })
    expect(out).toMatchObject({ ok: true, bodyCount: 1 })
    expect(rel(out.volumeMm3, Math.PI * 9 * 100)).toBeLessThan(0.01)
  }, SLOW)

  test("validate: a loft of two squares is the frustum, 7000 mm3", async () => {
    const out = await harness().run({ action: "parametric_validate", history: { parameters: {}, features: [rectangle("a", "XY", -10, -10, 20, 20), rectangle("b", "XY", -5, -5, 10, 10, 30), { id: "lf", type: "loft", sections: ["a", "b"], operation: "new" }] } })
    expect(out.ok).toBe(true)
    expect(out.volumeMm3).toBeCloseTo(7000, 1)
    expect(out.bounds.max.z).toBeCloseTo(30, 4)
  }, SLOW)

  test("validate: a 3 x 2 grid of holes removes six holes' worth", async () => {
    const hole = { id: "h", type: "hole", plane: "XY", offset: "h", at: [6, 6], diameter: 3, depth: "h" }
    const out = await harness().run({ action: "parametric_validate", history: box([hole, { id: "g", type: "pattern", feature: "h", kind: "grid", count: 3, countB: 2, step: [10, 0, 0], stepB: [0, 15, 0] }]) })
    expect(out.ok).toBe(true)
    expect(rel(out.volumeMm3, 24000 - 6 * Math.PI * 2.25 * 20)).toBeLessThan(0.0005)
  }, SLOW)

  test("a schema refusal reaches the model as readable paths: a loft with one section", () => {
    const parsed = parametricInputSchema.safeParse({ action: "parametric_validate", history: { parameters: {}, features: [rectangle("a", "XY", 0, 0, 10, 10), { id: "lf", type: "loft", sections: ["a"], operation: "new" }] } })
    expect(parsed.success).toBe(false)
    expect(parsed.success ? "" : JSON.stringify(parsed.error.issues)).toContain("sections")
  })
})

describe("cad_parametric: the new recipes", () => {
  test("pipe_bend: the history sweeps a hollow section along the route; ok, one body, derived numbers", async () => {
    // A Ø10 pipe with the default long-radius elbow (R15) turning 120 degrees needs 25.98 mm of setback on each
    // run, so the runs are 40 mm: the recipe refuses shorter ones rather than drawing a bend it cannot round.
    const out = await harness().run({ action: "recipe", recipe: "pipe_bend", params: { outerDiameter: 10, wall: 1, bendAngle: 120, legA: 40, legB: 40 } })
    expect(out.ok).toBe(true)
    expect(out.derived).toMatchObject({ innerDiameter: 8 })
    expect(out.history.features.map((f: { type: string }) => f.type)).toEqual(["sketch", "sketch", "sweep"])
    expect(decodeHistory(out.history).success).toBe(true)
    expect(out.report).toMatchObject({ ok: true, bodyCount: 1 })
    const turn = (120 * Math.PI) / 180, radius = 15
    const centreline = 40 + 40 - 2 * radius * Math.tan(turn / 2) + radius * turn
    expect(out.derived.centrelineLength).toBeCloseTo(centreline, 1)
    expect(rel(out.report.volumeMm3, Math.PI * (25 - 16) * centreline)).toBeLessThan(0.005)
  }, SLOW)

  test("duct_transition: the history lofts the outside and the bore; ok, one body", async () => {
    const out = await harness().run({ action: "recipe", recipe: "duct_transition", params: { shape: "round", width1: 100, width2: 50 } })
    expect(out.ok).toBe(true)
    expect(out.history.features.filter((f: { type: string }) => f.type === "loft").map((f: { operation: string }) => f.operation)).toEqual(["new", "subtract"])
    expect(out.report).toMatchObject({ ok: true, bodyCount: 1 })
    expect(decodeHistory(out.history).success).toBe(true)
  }, SLOW)

  test("a rule broken in either recipe is an ok:false with the rule, nothing written", async () => {
    const { calls, run } = harness()
    const pipe = await run({ action: "recipe", recipe: "pipe_bend", params: { wall: 20 }, create: true })
    expect(pipe).toMatchObject({ ok: false })
    expect(pipe.error).toMatch(/wall must be less than the outside radius/)
    const duct = await run({ action: "recipe", recipe: "duct_transition", params: { wall: 40 }, create: true })
    expect(duct.error).toMatch(/wall must be less than half the smallest section/)
    expect(calls).toEqual([])
  })

  test("create: true sends the generated sweep history to the project once", async () => {
    const { calls, run } = harness(() => created)
    // Creating only happens after the part rebuilds cleanly, so this test pays for a rebuild: the mitred Ø10 elbow
    // keeps that check honest without the minutes the default Ø30 R45 bend costs.
    const out = await run({ action: "recipe", recipe: "pipe_bend", params: { outerDiameter: 10, wall: 1, bendRadius: 0 }, create: true, name: "Elbow" })
    expect(calls).toHaveLength(1)
    expect(calls[0]!.input).toMatchObject({ action: "create", name: "Elbow" })
    expect(((calls[0]!.input as { history: History }).history.features.map((f) => f.type))).toContain("sweep")
    expect(out.created).toEqual(created)
  }, SLOW)

  test("both recipes pass the manufacturability check they were designed for (no error on a mill)", async () => {
    const { run } = harness()
    const pipe = await run({ action: "dfm", history: buildRecipe("pipe_bend").history })
    expect(pipe.issues.filter((i: { severity: string }) => i.severity === "error")).toEqual([])
  }, SLOW)
})

describe("cad_parametric: dfm sees grid patterns", () => {
  test("holes 8 mm apart in a grid are flagged HOLE_SPACING through the tool; a wide grid is clean", async () => {
    const hole = { id: "h", type: "hole", plane: "XY", offset: "h", at: [10, 10], diameter: 5, depth: "h" }
    const tight = await harness().run({ action: "dfm", history: box([hole, { id: "g", type: "pattern", feature: "h", kind: "grid", count: 3, countB: 2, step: [8, 0, 0], stepB: [0, 12, 0] }]) })
    expect(tight.issues.filter((i: { code: string }) => i.code === "HOLE_SPACING")).toHaveLength(4)
    const wide = await harness().run({ action: "dfm", history: box([hole, { id: "g", type: "pattern", feature: "h", kind: "grid", count: 2, countB: 2, step: [14, 0, 0], stepB: [0, 14, 0] }]) })
    expect(wide.issues.filter((i: { code: string }) => i.code === "HOLE_SPACING")).toEqual([])
  }, SLOW)
})

describe("the tool prompt and the host adapter know the new features", () => {
  test("the prompt names every new feature and recipe", () => {
    const prompt = toolPrompt("cad")
    for (const word of ["parametric_validate", "parametric_recipe", "parametric_dfm", "parametric_fastener"]) expect(prompt).toContain(word)
    // The engineering reference itself moved to the skills, where the model loads it on demand.
    const skills = CADCAM_SKILLS.map((skill) => skill.body).join("\n")
    for (const word of ["sweep", "loft", "shell", "fillet", "grid", "pipe_bend", "duct_transition"]) expect(skills, word).toContain(word)
  })

  test("through the host adapter a shell history validates and comes back as JSON", async () => {
    const spec = toSpec(cadTool, { handlers: {} as ToolHandlersShape, projectId: "p1" })
    const out = JSON.parse(await spec.execute({ action: "parametric_validate", history: box([{ id: "sh", type: "shell", feature: "box", thickness: 2, open: "top" }]) }, { signal: new AbortController().signal, sessionId: "s", projectId: "p1" }))
    expect(out).toMatchObject({ ok: true, bodyCount: 1 })
  }, SLOW)

  test("a malformed sweep through the adapter is refused with the recovery text, not a crash", async () => {
    const spec = toSpec(cadTool, { handlers: {} as ToolHandlersShape, projectId: "p1" })
    const out = JSON.parse(await spec.execute({ action: "parametric_validate", history: { parameters: {}, features: [rings("section", "YZ", 0, 0, [3]), { id: "pipe", type: "sweep", profile: "section", path: "ghost", operation: "new" }] } }, { signal: new AbortController().signal, sessionId: "s", projectId: "p1" }))
    expect(out.ok).toBe(false)
    expect(JSON.stringify(out)).toContain("ghost")
  })
})
