import { describe, expect, test } from "bun:test"
import { pmiFingerprint, type PmiSet } from "../../pmi/pmi.ts"
import { pmiStaleReason } from "./pmi-associativity.ts"

const ref = { body: "part", kind: "face" as const, key: "plate.top" }
const set: PmiSet = {
  version: 1,
  captures: [{ id: "c1", name: "Front", annotationIds: ["s1"] }],
  annotations: [{ id: "s1", captureId: "c1", refs: [ref], kind: "dimensional-size", nominal: 10, upper: 0.1, lower: -0.1 }]
}

describe("pmiStaleReason", () => {
  test("unchanged PMI is not stale; a tolerance change is stale with reason pmi; legacy has no PMI stale", () => {
    expect(pmiStaleReason(pmiFingerprint(set), set)).toBeUndefined()
    const changed: PmiSet = { ...set, annotations: [{ ...set.annotations[0]!, upper: 0.2 } as never] }
    expect(pmiStaleReason(pmiFingerprint(set), changed)).toBe("pmi")
    expect(pmiStaleReason(undefined, set)).toBeUndefined()
  })
})
