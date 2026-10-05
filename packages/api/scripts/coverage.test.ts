import { expect, test } from "bun:test"
import { contractCoverage, normalizePath, parseInventory } from "./coverage.ts"

test("unresolved inventory methods never count as verified coverage", () => {
  const result = contractCoverage([{ route: "/api/health", methods: [] }])
  expect(result.covered).toBe(0)
  expect(result.missing[0]?.unresolvedMethods).toBe(true)
})

test("coverage requires all legacy methods and normalizes parameter names", () => {
  expect(normalizePath("/api/projects/{projectId}/")).toBe("/api/projects/:param")
  expect(contractCoverage([{ route: "/api/health", methods: ["GET"] }]).covered).toBe(1)
  expect(contractCoverage([{ route: "/api/health", methods: ["GET", "DELETE"] }]).missing[0]?.missingMethods).toEqual(["DELETE"])
})

test("inventory parser retains unresolved methods without inferring implementation", () => {
  expect(parseInventory("| `/api/health` | ? | |\n| `/api/projects` | GET, POST | |" )).toEqual([
    { route: "/api/health", methods: [] },
    { route: "/api/projects", methods: ["GET", "POST"] }
  ])
})
