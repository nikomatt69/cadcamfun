/**
 * User parameters, expressions and configurations: units and functions, dependency cycles, rename propagation over every recipe,
 * validated parameter edits, deleting a feature without leaving the timeline fields dangling, and design-table configurations.
 */
import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { evaluate, inferKind, namesIn, parameterCycles, parameterDependencies, resolveParameters, dimensionValue, ExpressionError } from "./expr.ts"
import { historyVolume, rebuild, type Feature, type History } from "./history.ts"
import {
  activateConfiguration, addConfiguration, compareConfigurations, configurationHistory, designTable, removeConfiguration, renameConfiguration, setConfigurationSuppressed, setConfigurationValue, syncConfiguration
} from "./history-config.ts"
import { parameterProblem, removeFeature, setDimension, removalImpact, removeParameter, renameParameter, setParameter, plateTemplate } from "./history-edit.ts"
import { groupFeatures } from "./history-edit.ts"
import { withRollback, withSuppressed } from "./history-timeline.ts"
import { parameterTable, setParameterNote } from "./parameter-table.ts"
import { RECIPES, buildRecipe } from "./recipes.ts"

setDefaultTimeout(120_000)

describe("expression language", () => {
  test("units may be separated from the number, and cover microns, feet and thou", () => {
    expect(evaluate("2 in")).toBeCloseTo(50.8, 12)
    expect(evaluate("10 mm + 1 cm")).toBe(20)
    expect(evaluate("500um")).toBeCloseTo(0.5, 12)
    expect(evaluate("1ft")).toBeCloseTo(304.8, 12)
    expect(evaluate("90 deg")).toBeCloseTo(Math.PI / 2, 12)
    // A name that merely starts like a unit stays a name.
    expect(evaluate("2 * min_w", (n) => (n === "min_w" ? 3 : undefined))).toBe(6)
    expect(evaluate("3 * m", (n) => (n === "m" ? 2 : undefined))).toBe(6)
  })

  test("comparisons, logic and a lazy if", () => {
    expect(evaluate("3 < 4")).toBe(1)
    expect(evaluate("3 >= 4")).toBe(0)
    expect(evaluate("2 == 2 && 3 != 4")).toBe(1)
    expect(evaluate("0 || !0")).toBe(1)
    expect(evaluate("if(width > 40, 6, 4)", (n) => (n === "width" ? 50 : undefined))).toBe(6)
    expect(evaluate("if(width > 40, 6, 4)", (n) => (n === "width" ? 30 : undefined))).toBe(4)
    // The branch that is not taken is never evaluated, so it cannot divide by zero or hit an unknown name.
    expect(evaluate("if(w > 0, 100 / w, 7)", () => 0)).toBe(7)
    expect(evaluate("if(1, 5, nothing_here)")).toBe(5)
    expect(() => evaluate("if(1, 2)")).toThrow("takes 3 argument")
  })

  test("more functions", () => {
    expect(evaluate("clamp(12, 0, 10)")).toBe(10)
    expect(evaluate("clamp(-3, 0, 10)")).toBe(0)
    expect(evaluate("mod(-1, 5)")).toBe(4)
    expect(evaluate("trunc(-2.7)")).toBe(-2)
    expect(evaluate("cbrt(27)")).toBeCloseTo(3, 12)
    expect(evaluate("log2(8)")).toBeCloseTo(3, 12)
    expect(evaluate("tanh(0)")).toBe(0)
    expect(() => evaluate("5 % 0")).toThrow("Division by zero")
  })

  test("a parameter named like a constant is a parameter, and is a dependency", () => {
    const { values, errors } = resolveParameters({ b: "e + 1", e: 10 })
    expect(errors).toEqual({})
    expect(values["b"]).toBe(11)
    expect(namesIn("e + pi", (n) => n === "e")).toEqual(["e"])
  })

  test("the dimensional check tells lengths from angles and only warns", () => {
    const kinds: Record<string, "length" | "angle"> = { width: "length", tilt: "angle" }
    const kindOf = (n: string) => kinds[n] ?? "any"
    expect(inferKind("width + 3", kindOf)).toEqual({ kind: "length", problems: [] })
    expect(inferKind("sin(30deg) * width", kindOf).kind).toBe("length")
    expect(inferKind("width + tilt", kindOf).problems[0]).toContain("mixes length with angle")
    expect(inferKind("sin(width)", kindOf).problems[0]).toContain("sin() takes an angle")
    expect(inferKind("acos(0.5)", kindOf).kind).toBe("angle")
    expect(inferKind("if(width > 5, 2mm, 3deg)", kindOf).problems[0]).toContain("'if'")
    expect(inferKind("max(width, 4)", kindOf).kind).toBe("length")
  })
})

describe("dependency cycles", () => {
  test("every cycle is found once, whatever the order the parameters are written in", () => {
    const table = { a: "b + 1", b: "c + 1", c: "a + 1", x: "y", y: "x", self: "self * 2", ok: 5, user: "a * 2" }
    const cycles = parameterCycles(table).map((c) => c.join(" -> ")).sort()
    expect(cycles).toEqual(["a -> b -> c -> a", "self -> self", "x -> y -> x"])
    const reversed = Object.fromEntries(Object.entries(table).reverse())
    expect(parameterCycles(reversed).map((c) => c.length).sort()).toEqual([2, 3, 4])
  })

  test("a parameter that is not part of a loop but depends on one is not itself a cycle", () => {
    const deps = parameterDependencies({ a: "b", b: "a", user: "a + 1" })
    expect(deps.get("user")).toEqual(["a"])
    expect(parameterCycles({ a: "b", b: "a", user: "a + 1" })).toHaveLength(1)
  })

  test("a feature dimension that names a failed parameter says the parameter failed", () => {
    const { values, errors } = resolveParameters({ w: "d + 1", d: "w - 1" })
    expect(() => dimensionValue("w * 2", values, errors)).toThrow(/Parameter 'w' failed: circular definition/)
    expect(() => dimensionValue("w * 2", values)).toThrow(ExpressionError)
    let h = plateTemplate()
    h = { ...h, parameters: { ...h.parameters, width: "depth + 1", depth: "width - 1" } }
    const issues = rebuild(h).issues
    expect(issues.some((i) => i.feature === "sketch1" && /Parameter '(width|depth)' failed/.test(i.message))).toBe(true)
    expect(issues.some((i) => i.feature === "parameter width" && i.message.includes("circular"))).toBe(true)
  })
})

describe("validated parameter edits", () => {
  const h = plateTemplate()
  test("a loop, an unknown parameter and a bad formula are refused with the reason", () => {
    expect(() => setParameter(h, "width", "width + 1")).toThrow("circular definition: width -> width")
    const chained = setParameter(h, "half", "width / 2")
    expect(() => setParameter(chained, "width", "half * 2")).toThrow("circular definition: width -> half -> width")
    expect(() => setParameter(h, "extra", "nothing + 1")).toThrow("unknown parameter 'nothing'")
    expect(() => setParameter(h, "extra", "1 +")).toThrow("Unexpected end")
    expect(() => setParameter(h, "extra", "  ")).toThrow("needs a value")
    expect(() => setParameter(h, "1bad", 3)).toThrow("not a valid name")
    expect(parameterProblem(h, "extra", "width / 0")).toBeUndefined() // a value problem, shown by the replay, not a syntax one
    expect(parameterProblem(h, "extra", "sin(width) + if(depth > 3, 1, 2)")).toBeUndefined()
  })

  test("a valid edit goes through and a failed one leaves the history as it was", () => {
    const next = setParameter(h, "wall", "thick / 4")
    expect(next.parameters["wall"]).toBe("thick / 4")
    expect(h.parameters["wall"]).toBeUndefined()
  })
})

describe("rename propagation", () => {
  const strings = (value: unknown, out: string[] = []): string[] => {
    if (typeof value === "string") out.push(value)
    else if (Array.isArray(value)) for (const v of value) strings(v, out)
    else if (typeof value === "object" && value !== null) for (const [k, v] of Object.entries(value)) { if (k !== "type" && k !== "kind") strings(v, out) }
    return out
  }
  test("renaming keeps rollback, groups, notes and configurations, and rewrites formulas", () => {
    let h = plateTemplate()
    h = setParameter(h, "half", "width / 2")
    h = { ...h, notes: { width: { comment: "overall X", kind: "length" } } }
    h = groupFeatures(h, { id: "g", name: "Hole" }, ["hole1"]).history
    h = withRollback(h, "plate")
    h = addConfiguration(h, "Wide").history
    const renamed = renameParameter(h, "width", "w_x")
    expect(renamed.parameters["half"]).toBe("w_x / 2")
    expect(renamed.rollback).toBe("plate")
    expect(renamed.groups).toEqual(h.groups)
    expect(renamed.notes).toEqual({ w_x: { comment: "overall X", kind: "length" } })
    expect(renamed.configurations?.[1]?.values["w_x"]).toBe(60)
    expect("width" in (renamed.configurations?.[1]?.values ?? {})).toBe(false)
    expect(renamed.configuration).toBe(h.configuration)
  })

  test("over every recipe, renaming each parameter leaves no use of the old name anywhere in the history", () => {
    const small = { outerDiameter: 10, wall: 1, legA: 20, legB: 20, bendRadius: 8 }
    for (const spec of RECIPES) {
      const history = buildRecipe(spec.name, spec.name === "stepped_shaft" ? { sections: [{ diameter: 20, length: 30 }, { diameter: 30, length: 50 }] } : spec.name === "pipe_bend" ? small : {}).history
      for (const name of Object.keys(history.parameters)) {
        const to = `zz_${name}`
        const out = renameParameter(history, name, to)
        expect(to in out.parameters).toBe(true)
        expect(name in out.parameters).toBe(false)
        // Strings that are ids of features, sketch entities or constraints (an entity may be called like a parameter) are references, not formulas.
        const ids = new Set<string>()
        const collect = (v: unknown): void => { if (Array.isArray(v)) v.forEach(collect); else if (typeof v === "object" && v !== null) for (const [k, x] of Object.entries(v)) { if (k === "id" && typeof x === "string") ids.add(x); else collect(x) } }
        collect(out.features)
        const leftovers = [...strings(out.features), ...strings(out.parameters)].filter((s) => {
          if (ids.has(s)) return false
          try { return namesIn(s).includes(name) } catch { return false }
        })
        expect(leftovers, `${spec.name}.${name}`).toEqual([])
        // Same values under the new name.
        expect(resolveParameters(out.parameters).values[to]).toBe(resolveParameters(history.parameters).values[name])
      }
    }
  })

  test("renaming a parameter does not change the part", () => {
    const h = buildRecipe("mounting_plate").history
    const volume = historyVolume(rebuild(h))
    let out = h
    for (const name of Object.keys(h.parameters)) out = renameParameter(out, name, `p_${name}`)
    expect(historyVolume(rebuild(out))).toBeCloseTo(volume, 6)
    expect(rebuild(out).issues).toEqual(rebuild(h).issues)
  })

  test("removing a parameter drops its note and is refused while a configuration formula uses it", () => {
    let h = plateTemplate()
    h = { ...h, notes: { hole: { comment: "bore" } } }
    h = setParameter(h, "unused", 3)
    h = { ...h, notes: { ...h.notes, unused: { comment: "x" } } }
    const out = removeParameter(h, "unused")
    expect(out.notes).toEqual({ hole: { comment: "bore" } })
    const withCfg = addConfiguration(setParameter(h, "boss", "hole + 2"), "A").history
    const cfg = setConfigurationValue(withCfg, "a", "unused", "boss * 2")
    expect(cfg.refusal).toBeUndefined()
    expect(() => removeParameter(cfg.history, "boss")).toThrow(/still used by .*configuration a/)
  })
})

describe("deleting a feature", () => {
  test("the rollback marker, the groups and the configurations stay valid", () => {
    let h = plateTemplate()
    h = groupFeatures(h, { id: "g", name: "G" }, ["hole1"]).history
    h = withRollback(h, "hole1")
    h = addConfiguration(withSuppressed(h, ["hole1"]), "No hole").history
    const out = removeFeature(h, "hole1")
    expect(out.rollback).toBe("plate")
    expect(out.groups).toBeUndefined()
    expect(out.configurations?.every((c) => !c.suppressed.includes("hole1"))).toBe(true)
    expect(rebuild(out).issues).toEqual([])
    const first = removeFeature(withRollback(plateTemplate(), "sketch1"), "sketch1")
    expect(first.rollback).toBeUndefined()
  })

  test("the impact lists what depends by reference and what only acts on the bodies, and the mode chooses", () => {
    const h = plateTemplate()
    const impact = removalImpact(h, "sketch1")
    expect(impact.declared).toEqual(["plate"])
    expect(removalImpact(h, "plate")).toEqual({ declared: [], lineage: ["hole1"] })
    expect(removeFeature(h, "plate").features.map((f) => f.id)).toEqual(["sketch1", "hole1"]) // as before: declared dependents only
    expect(removeFeature(h, "plate", { dependents: "all" }).features.map((f) => f.id)).toEqual(["sketch1"])
    const bare = removeFeature(h, "plate", { dependents: "none" })
    const built = rebuild(bare)
    expect(built.issues.some((i) => i.feature === "hole1" && i.severity === "error")).toBe(true)
    expect(removeFeature(h, "sketch1", { dependents: "none" }).features.map((f) => f.id)).toEqual(["plate", "hole1"])
    expect(removalImpact(h, "nothing")).toEqual({ declared: [], lineage: [] })
  })
})

describe("configurations", () => {
  const base = (): History => plateTemplate()

  test("the first configuration records the part as Default and shows the new one", () => {
    const { history, refusal } = addConfiguration(base(), "Wide")
    expect(refusal).toBeUndefined()
    expect(history.configurations?.map((c) => c.name)).toEqual(["Default", "Wide"])
    expect(history.configuration).toBe("wide")
    expect(history.configurations?.[0]?.values["width"]).toBe(60)
    expect(addConfiguration(history, "wide").refusal).toContain("already a configuration")
  })

  test("a variant of values and suppression, switched back and forth, loses no edit", () => {
    let h = addConfiguration(base(), "Wide").history
    h = setParameter(h, "width", 100) // an edit made while Wide is shown belongs to Wide
    h = withSuppressed(h, ["hole1"])
    const toDefault = activateConfiguration(h, "default")
    expect(toDefault.refusal).toBeUndefined()
    expect(toDefault.history.parameters["width"]).toBe(60)
    expect(toDefault.history.features.find((f) => f.id === "hole1")?.suppressed).toBeUndefined()
    expect(toDefault.history.configurations?.find((c) => c.id === "wide")?.values["width"]).toBe(100)
    const back = activateConfiguration(toDefault.history, "wide").history
    expect(back.parameters["width"]).toBe(100)
    expect(back.features.find((f) => f.id === "hole1")?.suppressed).toBe(true)
    expect(back.configuration).toBe("wide")
  })

  test("each configuration builds its own part and the stored history is untouched", () => {
    let h = addConfiguration(base(), "Wide").history
    h = setConfigurationValue(h, "wide", "width", 100).history
    h = addConfiguration(h, "Plain").history
    h = setConfigurationSuppressed(h, "plain", ["hole1"], true).history
    h = activateConfiguration(h, "default").history
    const before = JSON.stringify(h)
    const rows = compareConfigurations(h)
    expect(JSON.stringify(h)).toBe(before)
    const volume = (id: string) => rows.find((r) => r.id === id)!.volume
    expect(rows.every((r) => r.errors === 0 && r.bodies === 1)).toBe(true)
    // Default 60x40x8 minus a diameter-10 hole (a polygon, so a hair under the circle).
    expect(volume("default")).toBeCloseTo(60 * 40 * 8 - Math.PI * 25 * 8, -1)
    expect(volume("wide")).toBeCloseTo(100 * 40 * 8 - Math.PI * 25 * 8, -1)
    expect(volume("plain")).toBeCloseTo(100 * 40 * 8, 6) // Plain was added while Wide was shown (so width 100) and suppresses the hole
    const variant = configurationHistory(h, "wide")
    expect(variant.history.configurations).toBeUndefined()
    expect(variant.history.parameters["width"]).toBe(100)
  })

  test("the design table shows what varies", () => {
    let h = addConfiguration(base(), "Wide").history
    h = setConfigurationValue(h, "wide", "width", 100).history
    h = setConfigurationSuppressed(h, "wide", ["hole1"], true).history
    const table = designTable(h)
    expect(table.configurations).toEqual([{ id: "default", name: "Default", active: false }, { id: "wide", name: "Wide", active: true }])
    expect(table.parameters.find((p) => p.name === "width")).toEqual({ name: "width", values: { default: 60, wide: 100 }, varies: true })
    expect(table.parameters.find((p) => p.name === "depth")?.varies).toBe(false)
    expect(table.features.find((f) => f.id === "hole1")).toEqual({ id: "hole1", suppressed: { default: false, wide: true }, varies: true })
    expect(table.features.find((f) => f.id === "plate")?.varies).toBe(false)
  })

  test("a value that would make a loop, an unknown parameter or feature, and a stale formula are refused", () => {
    let h = addConfiguration(setParameter(base(), "half", "width / 2"), "A").history
    expect(setConfigurationValue(h, "a", "width", "half * 2").refusal).toContain("circular definition")
    expect(setConfigurationValue(h, "a", "nope", 3).refusal).toContain("no parameter")
    expect(setConfigurationValue(h, "zz", "width", 3).refusal).toContain("no configuration")
    expect(setConfigurationSuppressed(h, "a", ["ghost"], true).refusal).toContain("no feature")
    expect(activateConfiguration(h, "zz").refusal).toContain("no configuration")
    // A configuration whose formula refers to a parameter that is gone cannot be shown.
    h = setConfigurationValue(h, "a", "hole", "half / 2").history
    const stale: History = { ...h, parameters: { width: 60, depth: 40, thick: 8, hole: 10 } }
    h = activateConfiguration({ ...stale, configuration: "default" }, "a").history
    expect(h.configuration).toBe("default")
  })

  test("rename, remove and sync", () => {
    let h = addConfiguration(base(), "Wide").history
    expect(renameConfiguration(h, "wide", "Default").refusal).toContain("already a configuration")
    h = renameConfiguration(h, "wide", "Extra wide").history
    expect(h.configurations?.[1]?.name).toBe("Extra wide")
    h = setParameter(h, "width", 77)
    expect(syncConfiguration(h).configurations?.[1]?.values["width"]).toBe(77)
    const removed = removeConfiguration(h, "wide").history
    expect(removed.configuration).toBeUndefined()
    expect(removed.parameters["width"]).toBe(77) // removing the shown one keeps the model as it is
    expect(removeConfiguration(removed, "default").history.configurations).toBeUndefined()
    expect(removeConfiguration(h, "nope").refusal).toContain("no configuration")
  })

  test("suppressing a feature on the shown configuration changes the model, on another it does not", () => {
    let h = addConfiguration(base(), "Wide").history
    h = setConfigurationSuppressed(h, "default", ["hole1"], true).history
    expect(h.features.find((f) => f.id === "hole1")?.suppressed).toBeUndefined()
    h = setConfigurationSuppressed(h, "wide", ["hole1"], true).history
    expect((h.features.find((f) => f.id === "hole1") as Feature).suppressed).toBe(true)
    h = setConfigurationSuppressed(h, "wide", ["hole1"], false).history
    expect(h.features.find((f) => f.id === "hole1")?.suppressed).toBeUndefined()
  })
})

describe("failure reporting", () => {
  test("a feature that acts on a body that was never built is skipped by the failure, not failed itself", () => {
    const h = setDimension(plateTemplate(), "plate", "depth", "thick / 0")
    const built = rebuild(h)
    expect(built.states["plate"]).toEqual({ state: "failed" })
    expect(built.states["hole1"]).toEqual({ state: "skipped", by: "plate" })
    expect(built.issues.find((i) => i.feature === "hole1")?.message).toContain("because 'plate' failed")
    // Without an earlier failure the same message stays a failure of that feature.
    const orphan = rebuild({ ...plateTemplate(), features: [plateTemplate().features[2]!] })
    expect(orphan.states["hole1"]).toEqual({ state: "failed" })
  })

  test("a dimension that uses a failed parameter says which one and why, once", () => {
    const h = { ...plateTemplate(), parameters: { ...plateTemplate().parameters, hole: "nope + 1" } }
    const built = rebuild(h)
    const message = built.issues.find((i) => i.feature === "hole1")?.message ?? ""
    expect(message).toContain("Parameter 'hole' failed: Unknown parameter 'nope'")
    expect(message.match(/\(at /g)?.length).toBe(1)
    expect(built.states["plate"]).toEqual({ state: "ok" })
  })
})

describe("parameter table", () => {
  test("rows carry value, kind, dependencies, users, comments and unit warnings", () => {
    let h = plateTemplate()
    h = setParameter(h, "tilt", "30deg")
    h = setParameter(h, "half", "width / 2")
    h = setParameter(h, "bad", "width + tilt")
    h = setParameter(h, "ratio", "width / half")
    h = setParameterNote(h, "width", { comment: "overall X", kind: "length", favorite: true })
    const rows = Object.fromEntries(parameterTable(h).map((r) => [r.name, r]))
    expect(rows["width"]).toMatchObject({ value: 60, kind: "length", declared: true, comment: "overall X", favorite: true })
    expect([...rows["width"]!.usedBy.parameters].sort()).toEqual(["bad", "half", "ratio"])
    expect(rows["width"]!.usedBy.features).toContain("sketch1")
    expect(rows["half"]).toMatchObject({ value: 30, kind: "length", dependsOn: ["width"] })
    expect(rows["tilt"]).toMatchObject({ kind: "angle" })
    expect(rows["tilt"]!.value).toBeCloseTo(Math.PI / 6, 12)
    expect(rows["bad"]!.warnings[0]).toContain("mixes length with angle")
    expect(rows["ratio"]!.kind).toBe("any")
    expect(rows["depth"]!.warnings).toEqual([])
  })

  test("a declared kind that contradicts the formula is a warning, a loop is flagged on every member", () => {
    let h = setParameterNote(setParameter(plateTemplate(), "span", "width * 2"), "width", { kind: "length" })
    h = setParameterNote(h, "span", { kind: "angle" })
    expect(parameterTable(h).find((r) => r.name === "span")!.warnings.join()).toContain("declared as angle")
    const loop: History = { ...plateTemplate(), parameters: { a: "b + 1", b: "a + 1", c: 3 } }
    const rows = parameterTable(loop)
    expect(rows.filter((r) => r.inCycle).map((r) => r.name).sort()).toEqual(["a", "b"])
    expect(rows.find((r) => r.name === "a")!.error).toContain("circular definition")
    expect(rows.find((r) => r.name === "c")!.inCycle).toBe(false)
  })

  test("notes are merged, cleared and dropped when empty", () => {
    let h = setParameterNote(plateTemplate(), "width", { comment: "  x  " })
    expect(h.notes).toEqual({ width: { comment: "x" } })
    h = setParameterNote(h, "width", { favorite: true })
    expect(h.notes).toEqual({ width: { comment: "x", favorite: true } })
    h = setParameterNote(h, "width", { comment: "" })
    h = setParameterNote(h, "width", { favorite: false })
    expect(h.notes).toBeUndefined()
    expect(() => setParameterNote(plateTemplate(), "nope", { comment: "x" })).toThrow("No parameter")
  })
})
