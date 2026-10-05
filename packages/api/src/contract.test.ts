import { expect, test } from "bun:test"
import { OpenApi } from "effect/unstable/httpapi"
import { Api } from "./index.ts"

/** The only routes the legacy app served without a session (specs/api-inventory.md). */
const PUBLIC_PATHS = new Set(["/api/health"])

test("every endpoint except the documented public ones requires the shell launch token", () => {
  const document = OpenApi.fromApi(Api)
  let operations = 0
  for (const [path, item] of Object.entries(document.paths)) {
    for (const [method, operation] of Object.entries(item)) {
      if (!["get", "post", "put", "patch", "delete", "head", "options"].includes(method)) continue
      if (Array.isArray(operation)) continue
      operations++
      if (PUBLIC_PATHS.has(path)) {
        // The generator emits an empty security array rather than omitting the field.
        expect(operation.security?.length ?? 0).toBe(0)
        expect(operation.responses["401"]).toBeUndefined()
        continue
      }
      expect(operation.security?.length).toBeGreaterThan(0)
      expect(operation.responses["401"]).toBeDefined()
    }
  }
  expect(operations).toBeGreaterThan(30)
})

test("OpenAPI generation is deterministic and operation identifiers are unique", () => {
  const first = OpenApi.fromApi(Api)
  expect(JSON.parse(JSON.stringify(first))).toEqual(JSON.parse(JSON.stringify(OpenApi.fromApi(Api))))
  const identifiers: string[] = []
  for (const path of Object.values(first.paths)) {
    for (const [method, operation] of Object.entries(path)) {
      if (!["get", "post", "put", "patch", "delete", "head", "options"].includes(method)) continue
      if (Array.isArray(operation)) continue
      if (operation.operationId !== undefined) identifiers.push(operation.operationId)
    }
  }
  expect(new Set(identifiers).size).toBe(identifiers.length)
})
