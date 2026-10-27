import { describe, expect, test } from "bun:test"
import { historyOf } from "./fixtures.ts"
import { CORPUS, REFUSALS, canonicalJson, classify, countOutcomes, hashOf, manifestProblems, renderTable, runEntry, type CorpusEntry, type Measurement } from "./runner.ts"

const entry: CorpusEntry = {
  id: "t", set: "c", kind: "history", source: { fixture: "rounded-box" }, licence: "project", hash: "sha256:x", budgetMs: 1000,
  capabilities: ["history.exact-rebuild"],
  expected: { outcome: "pass", bodies: 1, volume: 1000, formula: "10^3", volumeRelTol: 1e-9, meshRelTol: 0.005 }
}
const good: Measurement = { hash: "sha256:x", ms: 10, meshErrors: [], bodies: [{ volume: 1000, valid: true }], meshVolume: 1001 }

describe("corpus classification", () => {
  test("a result on its oracle and inside its budget passes", () => {
    expect(classify(entry, good).outcome).toBe("pass")
  })

  test("a correct result over the budget is slow, not wrong", () => {
    expect(classify(entry, { ...good, ms: 1500 })).toMatchObject({ outcome: "slow" })
  })

  test("a value off its oracle, an invalid solid, a wrong body count or a mesh off the oracle is wrong", () => {
    expect(classify(entry, { ...good, bodies: [{ volume: 1000.01, valid: true }] }).outcome).toBe("wrong")
    expect(classify(entry, { ...good, bodies: [{ volume: 1000, valid: false }] }).outcome).toBe("wrong")
    expect(classify(entry, { ...good, bodies: [{ volume: 1000, valid: true }, { volume: 1, valid: true }] }).outcome).toBe("wrong")
    expect(classify(entry, { ...good, meshVolume: 1010 }).outcome).toBe("wrong")
    // Wrong wins over slow: a wrong result is never hidden behind its time.
    expect(classify(entry, { ...good, ms: 5000, bodies: [{ volume: 2, valid: true }] }).outcome).toBe("wrong")
  })

  test("a changed input is wrong until the oracle is re-derived", () => {
    expect(classify(entry, { ...good, hash: "sha256:y" })).toMatchObject({ outcome: "wrong", detail: expect.stringContaining("input changed") })
  })

  test("a refusal is allowed only when the registry knows it, from a body or from the rebuild", () => {
    const known = REFUSALS[0]!
    expect(classify(entry, { ...good, bodies: [{ reason: `x: ${known.match}` }] })).toMatchObject({ outcome: "refused", detail: expect.stringContaining(known.id) })
    expect(classify(entry, { ...good, meshErrors: [`f1: ${known.match}`], bodies: [{ volume: 3, valid: true }] }).outcome).toBe("refused")
    expect(classify(entry, { ...good, bodies: [{ reason: "something nobody decided" }] })).toMatchObject({ outcome: "wrong", detail: expect.stringContaining("unregistered") })
    expect(classify(entry, { ...good, meshErrors: ["f1: the sketch is over-constrained"] })).toMatchObject({ outcome: "wrong", detail: expect.stringContaining("rebuild error") })
  })

  test("an expected refusal passes when it happens and is wrong when the kernel gains the model", () => {
    const refused: CorpusEntry = { ...entry, expected: { outcome: "refused", refusal: REFUSALS[0]!.id } }
    expect(classify(refused, { ...good, meshErrors: [REFUSALS[0]!.match] }).outcome).toBe("pass")
    expect(classify(refused, good)).toMatchObject({ outcome: "wrong", detail: expect.stringContaining("write its oracle") })
    expect(classify(refused, { ...good, bodies: [{ reason: REFUSALS[1]!.match }] }).outcome).toBe("wrong")
  })

  test("the report counts and the table name every entry", () => {
    const results = [{ id: "a", outcome: "pass" as const, detail: "ok", ms: 1 }, { id: "b", outcome: "slow" as const, detail: "late", ms: 9 }]
    expect(countOutcomes(results)).toEqual({ pass: 1, refused: 0, wrong: 0, slow: 1 })
    expect(renderTable(results)).toContain("1 pass, 0 refused, 0 wrong, 1 slow")
  })
})

describe("the corpus manifest", () => {
  test("is consistent: unique ids, known refusals, oracles with formulas and tolerances", () => {
    expect(manifestProblems(CORPUS, REFUSALS)).toEqual([])
    expect(manifestProblems([entry, entry], REFUSALS)).toEqual(["t: duplicate id"])
  })

  test("every hash is over the input the fixtures and recipes build today", () => {
    for (const e of CORPUS) expect({ id: e.id, hash: hashOf(historyOf(e.source)) }).toEqual({ id: e.id, hash: e.hash })
  })

  test("the canonical JSON does not depend on key order", () => {
    expect(canonicalJson({ b: 1, a: [{ d: 2, c: undefined, e: 3 }] })).toBe(canonicalJson({ a: [{ e: 3, d: 2 }], b: 1 }))
  })

  test("a real entry runs end to end", () => {
    expect(runEntry(CORPUS.find((e) => e.id === "a-stepped-shaft")!)).toMatchObject({ outcome: "pass" })
  })
})
