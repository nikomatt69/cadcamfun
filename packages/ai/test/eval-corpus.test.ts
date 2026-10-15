import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { brep, buildRecipe, rebuild, rebuildExact, type History } from "@cadcamfun/core"
import { acceptPart, type AcceptanceCheck } from "../src/acceptance.ts"
import { parseHistory } from "../src/parametric.ts"
import corpus from "./eval/corpus.v1.json"

setDefaultTimeout(120_000)

/**
 * The versioned evaluation corpus (AI-11 Step 11). Each case is a part as it would be asked for, the checks that decide
 * acceptance and the verdict the harness must reach. The nominal values are worked out from the request, not copied from a
 * measurement, so a kernel regression shows up as a changed verdict. No model is called: evaluation with real models is a
 * separate, authorised run with its own budget.
 */
interface CorpusCase {
  readonly id: string
  readonly part: string
  readonly source: { readonly recipe: string; readonly params?: Record<string, unknown> } | { readonly history: unknown }
  readonly checks: ReadonlyArray<AcceptanceCheck>
  readonly expect: { readonly rebuilt: boolean; readonly accepted: boolean; readonly failing: ReadonlyArray<string> }
  readonly stepRoundTrip?: boolean
}

const cases = corpus.cases as unknown as ReadonlyArray<CorpusCase>
const historyOf = (source: CorpusCase["source"]): History =>
  "recipe" in source ? buildRecipe(source.recipe as never, source.params ?? {}).history : parseHistory(source.history)

describe(`evaluation corpus v${corpus.version}`, () => {
  test("covers every part family the gate names, and negative cases", () => {
    const ids = cases.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const family of ["plate", "bracket", "shaft", "flange", "pocket", "assembly"]) expect(ids.some((id) => id.startsWith(family)), family).toBe(true)
    expect(cases.some((c) => c.stepRoundTrip)).toBe(true)
    expect(cases.filter((c) => !c.expect.accepted).length).toBeGreaterThanOrEqual(3)
  })

  for (const entry of cases) {
    test(`${entry.id}: ${entry.part}`, () => {
      const report = acceptPart(historyOf(entry.source), entry.checks)
      expect(report.rebuilt).toBe(entry.expect.rebuilt)
      expect(report.accepted).toBe(entry.expect.accepted)
      expect(report.checks.filter((check) => check.status === "fail").map((check) => check.name).sort()).toEqual([...entry.expect.failing].sort())
      // An accepted part has every check measured; a part that did not rebuild has none.
      if (entry.expect.accepted) expect(report.checks.every((check) => check.status === "pass")).toBe(true)
      if (!entry.expect.rebuilt) expect(report.checks.every((check) => check.status === "unmeasured")).toBe(true)
    })
  }

  for (const entry of cases.filter((c) => c.stepRoundTrip)) {
    test(`${entry.id}: the exact model survives a STEP export and import`, () => {
      const history = historyOf(entry.source)
      const exact = rebuildExact(history, rebuild(history))
      const parts = exact.bodies.map((body, i) => ({ name: `${entry.id}-${i}`, brep: body.brep! }))
      expect(parts.every((part) => part.brep !== undefined)).toBe(true)
      const read = brep.readStepBreps(brep.writeStepBreps(parts))
      expect(read.parts.length).toBe(parts.length)
      const volume = (list: ReadonlyArray<{ readonly brep: brep.Brep }>) => list.reduce((sum, part) => sum + brep.massProperties(part.brep).volume, 0)
      expect(Math.abs(volume(read.parts) - volume(parts)) / volume(parts)).toBeLessThan(1e-9)
      const holes = (list: ReadonlyArray<{ readonly brep: brep.Brep }>) => list.flatMap((part) => brep.recognizeHoles(part.brep).map((hole) => hole.diameter.toFixed(6))).sort()
      expect(holes(read.parts)).toEqual(holes(parts))
    })
  }
})
