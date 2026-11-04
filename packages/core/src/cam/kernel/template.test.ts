import { describe, expect, test } from "bun:test"
import { DEFAULT_CUTTERS, type Cutter } from "./cutters.ts"
import { applyTemplate, captureTemplate, selectTool, validateTemplate, type CamTemplate, type TemplateFeature, type ToolCandidate } from "./template.ts"

const candidates: ReadonlyArray<ToolCandidate> = DEFAULT_CUTTERS.map((cutter) => ({ cutter }))
const ring = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 30 }, { x: 0, y: 30 }]

const template: CamTemplate = {
  name: "Aluminium plate", version: 3,
  rules: [
    { id: "through-holes", priority: 10, because: "through holes under 12 mm: spot then drill", when: { kind: "hole", diameter: { max: 12 }, through: true },
      then: [
        { strategy: "drill", tool: { kinds: ["spot"] }, params: { cut: "spot", bottom: { expr: "top - 1" } } },
        { strategy: "drill", tool: { kinds: ["drill"], diameter: { min: 2 } }, params: { bottom: { expr: "bottom - 0.5" } } }
      ] },
    { id: "pocket", priority: 5, because: "pockets: adaptive roughing with a 0.3 mm allowance", when: { kind: "pocket" },
      then: [{ strategy: "adaptive", tool: { kinds: ["flat", "bull"], maxFractionOf: { of: "R", fraction: 0.8 } }, params: { allowance: 0.3, stepdown: { expr: "min(depth / 2, 4)" } } }] },
    { id: "outer-chamfer", priority: 1, exclusive: false, because: "break every outer edge", when: { kind: "outline" },
      then: [{ strategy: "chamfer", tool: { kinds: ["chamfer"] }, params: { width: 0.5 } }] }
  ]
}

const hole: TemplateFeature = { id: "h1", kind: "hole", diameter: 5, depth: 8, top: 0, bottom: -8, through: true, points: [{ x: 5, y: 5 }, { x: 35, y: 5 }] }
const pocket: TemplateFeature = { id: "p1", kind: "pocket", depth: 6, top: 0, bottom: -6, cornerRadius: 5, boundary: ring }

describe("validateTemplate", () => {
  test("a good template has no problems", () => expect(validateTemplate(template)).toEqual([]))
  test("a bad predicate kind is refused with its path", () => {
    const bad = JSON.parse(JSON.stringify(template)); bad.rules[1].when.kind = "slot"
    const p = validateTemplate(bad)
    expect(p.length).toBeGreaterThan(0)
    expect(p[0]!.path).toContain("rules")
  })
  test("a bad expression, an unknown name and a forbidden parameter are refused", () => {
    const bad = JSON.parse(JSON.stringify(template))
    bad.rules[1].then[0].params.stepdown = { expr: "min(depth /" }
    bad.rules[0].then[1].params.feed = 5000
    bad.rules[0].then[0].params.bottom = { expr: "nonsense + 1" }
    const paths = validateTemplate(bad).map((p) => p.path)
    expect(paths).toContain("rules.1.then.0.params.stepdown.expr")
    expect(paths).toContain("rules.0.then.1.params.feed")
    expect(paths).toContain("rules.0.then.0.params.bottom.expr")
  })
})

describe("selectTool", () => {
  const long = (over: Partial<Cutter>): ToolCandidate => ({ cutter: { ...DEFAULT_CUTTERS.find((c) => c.id === "bull-6-r0.5")!, ...over }, maxStickout: 60 })
  test("a deeper reach raises the stick-out step by step to the minimum that clears", () => {
    const c = long({ id: "long", fluteLength: 40, stickout: 20 })
    const a = selectTool({ kinds: ["bull"], reach: 18 }, [c])
    const b = selectTool({ kinds: ["bull"], reach: 33 }, [c])
    expect(a.status === "ok" && a.cutter.stickout).toBe(20)
    expect(b.status === "ok" && b.cutter.stickout).toBe(35)
  })
  test("no candidate returns the failed constraint of the closest, never a wrong tool", () => {
    const r = selectTool({ kinds: ["bull"], reach: 80 }, [long({ fluteLength: 100 })])
    expect(r.status).toBe("no-tool")
    if (r.status === "no-tool") { expect(r.constraint).toContain("stick-out"); expect(r.closest).toBeDefined() }
    expect(selectTool({ kinds: ["tap"], reach: 1 }, candidates.filter((c) => c.cutter.kind !== "tap")).status).toBe("no-tool")
  })
  test("a tool already chosen wins a tie", () => {
    const r = selectTool({ kinds: ["flat"], reach: 5 }, candidates, new Set(["flat-6"]))
    expect(r.status === "ok" && r.cutter.id).toBe("flat-6")
  })
})

describe("applyTemplate", () => {
  test("gives the expected sequence, with origin and trace, and lists unmatched features", () => {
    const boss: TemplateFeature = { id: "b1", kind: "boss", top: 0, bottom: -3 }
    const r = applyTemplate(template, [hole, pocket, boss], { candidates, material: "N" })
    expect(r.refused).toBeUndefined()
    expect(r.operations.map((o) => `${o.spec.strategy}:${o.origin.rule}:${o.origin.feature}`)).toEqual(["drill:through-holes:h1", "drill:through-holes:h1", "adaptive:pocket:p1"])
    expect(r.operations[0]!.spec).toMatchObject({ cut: "spot", bottom: -1 })
    expect(r.operations[1]!.spec).toMatchObject({ bottom: -8.5 })
    expect(r.operations[2]!.spec).toMatchObject({ allowance: 0.3, stepdown: 3 })
    expect(r.operations[2]!.origin).toEqual({ template: "Aluminium plate", version: 3, rule: "pocket", feature: "p1" })
    expect(r.unmatched).toEqual(["b1"])
    expect(r.trace.some((t) => t.feature === "p1" && t.rule === "through-holes" && t.verdict === "no-match")).toBe(true)
    const tool = r.tools.find((t) => t.id === r.operations[2]!.spec.tool)!
    expect(tool.diameter).toBeLessThanOrEqual(8)
  })
  test("a non-exclusive rule fires beside the exclusive one", () => {
    const outline: TemplateFeature = { id: "o1", kind: "outline", top: 0, bottom: -10, boundary: ring }
    const r = applyTemplate(template, [outline], { candidates, material: "N" })
    expect(r.operations.map((o) => o.spec.strategy)).toEqual(["chamfer"])
    expect(r.unmatched).toEqual([])
  })
  test("a recipe with no tool emits nothing and says why", () => {
    const r = applyTemplate(template, [pocket], { candidates: candidates.filter((c) => c.cutter.kind !== "flat" && c.cutter.kind !== "bull"), material: "N" })
    expect(r.operations).toEqual([])
    expect(r.unmatched).toEqual(["p1"])
    expect(r.trace.find((t) => t.verdict === "no-tool")?.reason).toContain("no tool")
  })
  test("an invalid template or a wrong material is refused", () => {
    expect(applyTemplate({ ...template, applies: { materials: ["P"] } }, [pocket], { candidates, material: "N" }).refused).toContain("material")
    expect(applyTemplate({ ...template, rules: [] } as CamTemplate, [pocket], { candidates, material: "N" }).refused).toContain("invalid template")
  })
})

describe("captureTemplate", () => {
  const features: TemplateFeature[] = [hole, pocket, { id: "b1", kind: "boss", top: 0, bottom: -3 }]
  const applied = applyTemplate(template, features, { candidates, material: "N" })
  const ops = applied.operations.map((o) => o.spec)
  const strip = (list: ReadonlyArray<{ spec: unknown }>) => list.map((o) => { const { id: _id, ...rest } = o.spec as Record<string, unknown>; return rest })

  test("capturing a program and applying the template to the same part reproduces the operations", () => {
    const cap = captureTemplate("captured", ops, features, DEFAULT_CUTTERS)
    expect(cap.notCaptured).toEqual([])
    expect(validateTemplate(cap.template)).toEqual([])
    const again = applyTemplate(cap.template, features, { candidates, material: "N" })
    expect(again.unmatched).toEqual(["b1"])
    expect(strip(again.operations)).toEqual(strip(applied.operations))
    expect(JSON.stringify(cap.template)).toContain("bottom - 0.5")
  })
  test("an operation that maps to no feature or a missing tool is reported as not captured", () => {
    const stray = { ...ops[2]!, id: "stray", region: { boundary: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }] } } as typeof ops[number]
    const ghost = { ...ops[0]!, id: "ghost", tool: "no-such-tool" }
    const cap = captureTemplate("c", [stray, ghost, ops[2]!], features, DEFAULT_CUTTERS)
    expect(cap.captured).toEqual([ops[2]!.id])
    expect(cap.notCaptured.map((n) => n.operation).sort()).toEqual(["ghost", "stray"])
  })
})
