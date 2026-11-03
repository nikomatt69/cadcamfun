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

test("an accepted gap is counted apart from the open ones, and never when the route is covered", () => {
  const rows = [{ route: "/api/health", methods: ["GET"] }, { route: "/api/nope", methods: ["GET"] }, { route: "/api/other", methods: ["POST"] }]
  const result = contractCoverage(rows, [{ route: "/api/nope", reason: "decided" }, { route: "/api/health", reason: "stale entry" }])
  expect(result.covered).toBe(1)
  expect(result.accepted).toEqual([expect.objectContaining({ route: "/api/nope", reason: "decided" })])
  expect(result.open.map((row) => row.route)).toEqual(["/api/other"])
})

test("every accepted gap names a legacy route of the inventory, so none can rot", async () => {
  const { readFileSync } = await import("node:fs")
  const { ACCEPTED_GAPS } = await import("./accepted-gaps.ts")
  const inventory = new Set(parseInventory(readFileSync(new URL("../../../specs/api-inventory.md", import.meta.url), "utf8")).map((row) => row.route))
  expect(ACCEPTED_GAPS.filter((gap) => !inventory.has(gap.route)).map((gap) => gap.route)).toEqual([])
  expect(new Set(ACCEPTED_GAPS.map((gap) => gap.route)).size).toBe(ACCEPTED_GAPS.length)
})
