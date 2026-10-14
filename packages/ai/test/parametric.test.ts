import { describe, expect, test } from "bun:test"
import { plateTemplate } from "@cadcamfun/core"
import { decodeHistory, parseHistory, parametricReport } from "../src/parametric.ts"
import { normalizeElement } from "../src/element-catalog.ts"

describe("parametric boundary and geometry", () => {
  test("identical decoded histories get independent complete reports and changed parameters invalidate evidence", () => {
    const history = plateTemplate()
    const first = parametricReport(history)
    const expected = structuredClone(first)
    Object.assign(first.parameters, { width: 999 })
    first.bounds!.max.x = 999
    first.solids.length = 0
    expect(parametricReport(structuredClone(history))).toEqual(expected)
    const changed = parametricReport({ ...history, parameters: { ...history.parameters, width: 80 } })
    expect(changed.parameters.width).toBe(80)
    expect(changed.bounds!.max.x).toBeCloseTo(80, 2)
    expect(changed.exact).not.toEqual(expected.exact)
  })
  test("existing plate rebuilds and dependent dimensions follow variants", () => {
    const base = plateTemplate()
    expect(decodeHistory(base).success).toBe(true)
    const original = parametricReport(base)
    expect(original.ok).toBe(true)
    for (const width of [30, 60, 90]) {
      const report = parametricReport({ ...base, parameters: { ...base.parameters, width, hole: 0.5 } })
      expect(report.ok).toBe(true)
      expect(report.bounds!.max.x).toBeCloseTo(width, 2)
      expect(report.volumeMm3!).toBeGreaterThan(width * 40 * 8 - 10)
    }
    expect(base.parameters.width).toBe(60)
  })
  test("malformed features, duplicate ids, forward references and missing points are refused", () => {
    const base = plateTemplate()
    for (const history of [
      { parameters: null, features: [] },
      { ...base, features: [...base.features, base.features[0]] },
      { ...base, features: [...base.features].reverse() },
      { ...base, features: [{ id: "s", type: "sketch", plane: "XY", sketch: { entities: [{ id: "l", kind: "line", p1: "missing", p2: "missing" }], constraints: [] } }] },
      { ...base, parameters: { ...base.parameters, width: Infinity } },
      { ...base, features: [...base.features, { id: "p", type: "pattern", feature: "plate", kind: "linear", count: 3 }] }
    ]) {
      expect(decodeHistory(history).success).toBe(false)
      expect(normalizeElement({ type: "parametric", history }).ok).toBe(false)
    }
  })
  test("a partial body with a failed feature is refused before persistence", () => {
    const base = plateTemplate()
    expect(normalizeElement({ type: "parametric", history: { ...base, parameters: { ...base.parameters, hole: "missing * 2" } } }).ok).toBe(false)
    expect(parametricReport({ ...base, parameters: { ...base.parameters, thick: -1 } }).ok).toBe(false)
  })
})
