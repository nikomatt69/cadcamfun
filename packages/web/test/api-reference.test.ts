import { describe, expect, test } from "bun:test"
import { apiGroups } from "../src/data/apiGroups"
import { apiDocument, allOperations, apiStats, operationsFor, referencedSchemas, requestExample, schemaType } from "../src/lib/apiReference"

describe("API documentation coverage", () => {
  test("every operation belongs to exactly one navigable resource", () => {
    const ids = new Set<string>()
    const anchors = new Set<string>()
    for (const entry of allOperations) {
      expect(ids.has(entry.operation.operationId)).toBe(false)
      expect(anchors.has(entry.anchor)).toBe(false)
      ids.add(entry.operation.operationId)
      anchors.add(entry.anchor)
      expect(apiGroups.filter((group) => operationsFor(group).includes(entry))).toHaveLength(1)
      expect(Object.keys(entry.operation.responses).length).toBeGreaterThan(0)
    }
    expect(apiStats.operations).toBe(ids.size)
    expect(apiStats.paths).toBe(Object.keys(apiDocument.paths).length)
  })

  test("groups are nonempty with unique stable URLs and all named schemas resolve", () => {
    expect(new Set(apiGroups.map((group) => group.slug)).size).toBe(apiGroups.length)
    for (const group of apiGroups) {
      const operations = operationsFor(group)
      expect(operations.length).toBeGreaterThan(0)
      for (const name of referencedSchemas(operations)) {
        expect(apiDocument.components.schemas[name]).toBeDefined()
      }
    }
  })

  test("templates distinguish public, protected, JSON, and path inputs", () => {
    const operation = (id: string) => allOperations.find((entry) => entry.operation.operationId === id)!
    expect(requestExample(operation("health.check"))).not.toContain("Authorization")
    expect(requestExample(operation("projects.get"))).toContain("/api/projects/<id>")
    expect(requestExample(operation("projects.get"))).toContain("Authorization: Bearer ${CADCAMFUN_TOKEN}")
    expect(requestExample(operation("projects.create"))).toContain("--data-binary @request.json")
    expect(schemaType({ anyOf: [{ type: "string" }, { type: "null" }] })).toBe("string | null")
  })
})
