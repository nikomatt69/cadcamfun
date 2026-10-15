import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { Schema } from "effect"
import { runAction } from "../src/actions/catalogue.ts"
import { actionExists, actionReferences, jsonExamples, nestedActionPhrases, PROMPT_BUDGETS, promptCorpus } from "../src/prompts/corpus.ts"
import * as workflows from "../src/prompts/workflows.ts"
import { CADCAM_SKILLS, skillText } from "../src/skills/index.ts"
import type { ToolHandlersShape } from "../src/tools/handlers.ts"

setDefaultTimeout(60_000)

const corpus = promptCorpus()

describe("every text the model reads names real actions (AI-11 Step 7)", () => {
  test("the corpus covers every prompt family", () => {
    const kinds = new Set(corpus.map((entry) => entry.kind))
    expect([...kinds].sort()).toEqual(["description", "skill", "static", "workflow"])
    expect(corpus.filter((entry) => entry.kind === "skill")).toHaveLength(CADCAM_SKILLS.length)
    for (const entry of corpus) expect(entry.text.trim().length, entry.source).toBeGreaterThan(0)
  })

  test("each named tool action exists in the catalogue", () => {
    const missing = corpus.flatMap((entry) => actionReferences(entry.text)
      .filter((ref) => !actionExists(ref.tool, ref.action))
      .map((ref) => `${entry.source}: ${ref.tool}.${ref.action}`))
    expect(missing).toEqual([])
    // The scan reads the text: a renamed action would be caught.
    expect(actionReferences("run `cad` action `inspect_everything`").every((ref) => actionExists(ref.tool, ref.action))).toBe(false)
  })

  test("no text uses the retired nested action phrasing", () => {
    const nested = corpus.flatMap((entry) => nestedActionPhrases(entry.text).map((phrase) => `${entry.source}: ${phrase}`))
    expect(nested).toEqual([])
    expect(nestedActionPhrases("`cad` action `inspect_elements` with `action: \"search\"`")).toHaveLength(1)
    expect(nestedActionPhrases("await tools.cad_edit({ action: \"add\", elements: [] })")).toHaveLength(0)
  })

  test("a stock is read with cam.stock and set with cam_edit.stock_set", () => {
    for (const entry of corpus) expect(entry.text, entry.source).not.toMatch(/`cam` action `stock` (sets|reads or sets)/)
  })
})

describe("examples are executable", () => {
  const context = { handlers: {} as ToolHandlersShape, projectId: "p" }

  test("every quoted parametric history builds through cad.parametric_validate", async () => {
    const histories = corpus.flatMap((entry) => jsonExamples(entry.text).map((example) => ({ source: entry.source, example })))
      .filter(({ example }) => typeof example.value === "object" && example.value !== null && ("features" in example.value || "history" in example.value))
    expect(histories.length).toBeGreaterThanOrEqual(2)
    for (const { source, example } of histories) {
      const value = example.value as { history?: unknown }
      const report = await runAction("cad.parametric_validate", { history: value.history ?? value }, context) as { ok: boolean; bodyCount: number; volumeMm3: number; issues?: unknown }
      expect(report.ok, `${source}: ${JSON.stringify(report.issues)}`).toBe(true)
      expect(report.bodyCount, source).toBeGreaterThan(0)
      expect(report.volumeMm3, source).toBeGreaterThan(0)
    }
  })

  test("skill placeholders are all known", () => {
    expect(() => skillText("{{elementCatalogue}} {{toolTypes}} ${{ steps.a.outputs.b }}")).not.toThrow()
    expect(() => skillText("{{nope}}")).toThrow("Unknown skill placeholder")
    for (const skill of CADCAM_SKILLS) expect(skill.body, skill.name).not.toMatch(/\{\{[a-zA-Z]+\}\}/)
  })
})

describe("workflow prompts match their output contracts", () => {
  const pairs: ReadonlyArray<[workflows.PromptTemplate, Schema.Top]> = [
    [workflows.ANALYZE_DESIGN, workflows.DesignSuggestion],
    [workflows.OPTIMIZE_GCODE, workflows.OptimizeGcodeOutput],
    [workflows.RECOMMEND_MACHINING_PARAMETERS, workflows.MachiningParameters],
    [workflows.SUMMARIZE_DESIGN_SUGGESTIONS, workflows.DesignSuggestionsSummary],
    [workflows.TITLE_GENERATION, workflows.TitleOutput]
  ]
  const fieldsOf = (schema: Schema.Top): ReadonlyArray<string> => {
    const ast = schema.ast as { _tag: string; propertySignatures?: ReadonlyArray<{ name: PropertyKey }>; rest?: ReadonlyArray<Schema.Top["ast"]> }
    if (ast._tag === "Objects") return (ast.propertySignatures ?? []).map((p) => String(p.name))
    if (ast._tag === "Arrays") return fieldsOf(Schema.make(ast.rest![0]!))
    return []
  }

  test("the user prompt names every field of the schema, in the schema's spelling", () => {
    for (const [template, schema] of pairs) {
      const fields = fieldsOf(schema)
      expect(fields.length).toBeGreaterThan(0)
      for (const field of fields) expect(template.user, field).toContain(field)
      // The retired snake_case names asked for fields the decoder rejects.
      expect(template.user).not.toMatch(/\b[a-z]+_[a-z_]+:/)
    }
  })

  test("the design workflows do not limit the drawing to 2D", () => {
    expect(workflows.ANALYZE_DESIGN.system).not.toContain("2D drawing")
    expect(workflows.SUMMARIZE_DESIGN_SUGGESTIONS.user).not.toContain("2D drawing")
  })

  test("engineering data names its sources and editions", () => {
    const standards = CADCAM_SKILLS.find((skill) => skill.name === "industrial-standards")!.body
    for (const edition of ["ISO 2768-1:1989", "ISO 286-2:2010", "ISO 273:1979", "ISO 4762:2004", "DIN 6885-1:1968"]) expect(standards).toContain(edition)
    expect(CADCAM_SKILLS.find((skill) => skill.name === "cutting-parameters")!.body).toContain("starting values")
    // Nominal, limits and target are three numbers: the target of a 25 g6 shaft is the middle of 24.980 and 24.993.
    const precision = CADCAM_SKILLS.find((skill) => skill.name === "precision-and-tolerances")!.body
    expect(precision).toContain("limits 24.980 to 24.993 mm: 24.9865 mm")
    expect((24.980 + 24.993) / 2).toBeCloseTo(24.9865, 6)
  })

  test("advice says what it is not", () => {
    expect(workflows.OPTIMIZE_GCODE.system).toContain("not been simulated")
    expect(workflows.RECOMMEND_MACHINING_PARAMETERS.system).toContain("heuristic starting values")
  })
})

describe("separate budgets", () => {
  test("static prompts, descriptions, skills and workflows each stay inside their own budget", () => {
    const of = (kind: string) => corpus.filter((entry) => entry.kind === kind)
    expect(corpus.find((entry) => entry.source === "system")!.text.length).toBeLessThanOrEqual(PROMPT_BUDGETS.system)
    for (const entry of of("static").filter((e) => e.source !== "system")) expect(entry.text.length, entry.source).toBeLessThanOrEqual(PROMPT_BUDGETS.staticEntry)
    expect(of("description").reduce((n, entry) => n + entry.text.length, 0)).toBeLessThanOrEqual(PROMPT_BUDGETS.descriptions)
    for (const entry of of("description")) expect(entry.text.length, entry.source).toBeLessThanOrEqual(PROMPT_BUDGETS.description)
    for (const entry of of("skill")) expect(entry.text.length, entry.source).toBeLessThanOrEqual(PROMPT_BUDGETS.skill)
    expect(CADCAM_SKILLS.reduce((n, skill) => n + skill.description.length, 0)).toBeLessThanOrEqual(PROMPT_BUDGETS.skillDescriptions)
    for (const entry of of("workflow")) expect(entry.text.length, entry.source).toBeLessThanOrEqual(PROMPT_BUDGETS.workflow)
  })
})
