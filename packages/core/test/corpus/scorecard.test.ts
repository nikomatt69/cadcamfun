import { describe, expect, test } from "bun:test"
import { join } from "node:path"
import parity from "./parity.json"
import { CORPUS, type CorpusEntry } from "./runner.ts"
import { renderScorecard, scoreRows, type Capability, type CorpusReport } from "./scorecard.ts"

const root = join(import.meta.dir, "..", "..")
const capabilities = parity.capabilities as ReadonlyArray<Capability>
const cap = (state: Capability["state"], evidence: string[] = ["src/cad/history-brep.test.ts"]): Capability => ({ id: "x.y", area: "x", title: "X", source: "test", state, evidence })
const entry = (id: string): CorpusEntry => ({ ...CORPUS[0]!, id, capabilities: ["x.y"] })
const report = (complete: boolean, outcomes: Record<string, "pass" | "slow" | "wrong" | "refused">): CorpusReport => ({
  generatedAt: "t", complete, results: Object.entries(outcomes).map(([id, outcome]) => ({ id, outcome, detail: "", ms: 1 }))
})
const level = (c: Capability, corpus: CorpusEntry[] = [], r?: CorpusReport) => scoreRows([c], corpus, r, root)[0]!

describe("scorecard levels", () => {
  test("the ledger state sets the level, and a claim without test evidence is absent", () => {
    expect(level(cap("open")).level).toBe(0)
    expect(level(cap("partial")).level).toBe(1)
    expect(level(cap("built")).level).toBe(2)
    expect(level(cap("built", []))).toMatchObject({ level: 0, why: "no test evidence" })
    expect(level(cap("partial", ["src/does-not-exist.test.ts"]))).toMatchObject({ level: 0, why: expect.stringContaining("evidence missing") })
  })

  test("robust needs every corpus entry of the capability to pass in a complete run", () => {
    const corpus = [entry("e1"), entry("e2")]
    expect(level(cap("built"), corpus, report(true, { e1: "pass", e2: "pass" })).level).toBe(3)
    expect(level(cap("built"), corpus, report(true, { e1: "pass", e2: "slow" }))).toMatchObject({ level: 2, why: "corpus: e2: slow" })
    expect(level(cap("built"), corpus, report(false, { e1: "pass", e2: "pass" }))).toMatchObject({ level: 2, why: "no complete corpus run" })
    expect(level(cap("built"), corpus).level).toBe(2)
    // A partial capability does not become robust by passing a corpus.
    expect(level(cap("partial"), corpus, report(true, { e1: "pass", e2: "pass" })).level).toBe(1)
  })

  test("the rendered card counts the levels and marks unresearched vendor cells", () => {
    const text = renderScorecard([level(cap("built"))], undefined, "2026-10-27")
    expect(text).toContain("2 functional: 1")
    expect(text).toContain("**no corpus report**")
    expect(text).toContain("| — | — | — | — |")
  })
})

describe("the capability list", () => {
  test("ids are unique, states valid, and evidence files exist", () => {
    expect(new Set(capabilities.map((c) => c.id)).size).toBe(capabilities.length)
    for (const c of capabilities) expect(["open", "partial", "built"]).toContain(c.state)
    const rows = scoreRows(capabilities, [], undefined, root)
    expect(rows.filter((r) => r.why.startsWith("evidence missing")).map((r) => r.why)).toEqual([])
  })

  test("every capability a corpus entry names is on the scorecard", () => {
    const known = new Set(capabilities.map((c) => c.id))
    expect(CORPUS.flatMap((e) => e.capabilities).filter((id) => !known.has(id))).toEqual([])
  })
})
