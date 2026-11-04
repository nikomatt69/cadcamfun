import { describe, expect, setDefaultTimeout, test } from "bun:test"
import parity from "./parity.json"
import { ALL_CORPUS, allManifestProblems } from "./all.ts"
import { CAM_CORPUS, camJobOf, camManifestProblems, classifyCam, runCamEntry, type CamMeasurement } from "./cam-runner.ts"
import { hashOf } from "./runner.ts"

setDefaultTimeout(60_000)

const entry = CAM_CORPUS[0]!
const good: CamMeasurement = {
  hash: entry.hash, ms: 10, release: entry.expected.release, claims: { ...entry.expected.claims }, partVolume: entry.expected.partVolume
}

describe("CAM program classification", () => {
  test("a job on its expectation passes; over its budget it is slow", () => {
    expect(classifyCam(entry, good).outcome).toBe("pass")
    expect(classifyCam(entry, { ...good, ms: entry.budgetMs + 1 }).outcome).toBe("slow")
  })

  test("a moved release, a moved claim, a refusal, a changed job or a wrong volume is wrong", () => {
    expect(classifyCam(entry, { ...good, release: "preview" })).toMatchObject({ outcome: "wrong", detail: expect.stringContaining("release") })
    expect(classifyCam(entry, { ...good, claims: { ...good.claims, "no-gouge": "unresolved" } })).toMatchObject({ outcome: "wrong", detail: expect.stringContaining("no-gouge") })
    expect(classifyCam(entry, { ...good, claims: {} })).toMatchObject({ outcome: "wrong", detail: expect.stringContaining("absent") })
    expect(classifyCam(entry, { ...good, failure: "no tool" }).outcome).toBe("wrong")
    expect(classifyCam(entry, { ...good, hash: "sha256:x" })).toMatchObject({ outcome: "wrong", detail: expect.stringContaining("job changed") })
    expect(classifyCam(entry, { ...good, partVolume: entry.expected.partVolume * 1.1 }).outcome).toBe("wrong")
    // Wrong wins over slow.
    expect(classifyCam(entry, { ...good, ms: 1e9, release: "blocked" }).outcome).toBe("wrong")
  })
})

describe("the CAM corpus manifest", () => {
  test("is consistent and does not collide with the history entries", () => {
    expect(camManifestProblems(CAM_CORPUS)).toEqual([])
    expect(allManifestProblems()).toEqual([])
    expect(camManifestProblems([entry, entry])).toContain(`${entry.id}: duplicate id`)
  })

  test("every hash is over the job the fixtures build today, and every capability is in the ledger", () => {
    const ids = new Set(parity.capabilities.map((c) => c.id))
    for (const e of CAM_CORPUS) {
      expect({ id: e.id, hash: hashOf(camJobOf(e.source)) }).toEqual({ id: e.id, hash: e.hash })
      for (const c of e.capabilities) expect({ id: e.id, capability: c, known: ids.has(c) }).toEqual({ id: e.id, capability: c, known: true })
    }
  })

  test("the corpus holds a clean release, a blocked collision and an open (preview) case", () => {
    const releases = new Set(CAM_CORPUS.map((e) => e.expected.release))
    expect([...releases].sort()).toEqual(["blocked", "preview", "verified-program"])
    expect(ALL_CORPUS.length).toBeGreaterThan(CAM_CORPUS.length)
  })

  test("every entry runs end to end and passes", () => {
    for (const e of CAM_CORPUS) expect(runCamEntry(e)).toMatchObject({ id: e.id, outcome: "pass" })
  })
})
