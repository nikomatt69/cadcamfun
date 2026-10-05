import { OpenApi } from "effect/unstable/httpapi"
import { Api } from "../src/index.ts"

export interface InventoryRoute { readonly route: string; readonly methods: readonly string[] }
export const normalizePath = (path: string) => path.replace(/\{[^}]+\}/g, ":param").replace(/:[A-Za-z][A-Za-z0-9_]*/g, ":param").replace(/\/$/, "")
export function parseInventory(text: string): InventoryRoute[] {
  return text.split("\n").filter((line) => line.startsWith("| `/api")).map((line) => {
    const cells = line.split("|").map((cell) => cell.trim())
    const route = cells[1]
    const methods = cells[2]
    if (route === undefined || methods === undefined) throw new Error("Malformed inventory row")
    return { route: route.replace(/`/g, ""), methods: methods === "?" ? [] : methods.split(",").map((method) => method.trim()) }
  })
}
export function contractCoverage(rows: readonly InventoryRoute[]) {
  const paths = OpenApi.fromApi(Api).paths
  const operations = new Map<string, Set<string>>()
  for (const [path, value] of Object.entries(paths)) {
    const methods = operations.get(normalizePath(path)) ?? new Set<string>()
    for (const method of Object.keys(value)) {
      if (["get", "post", "put", "patch", "delete", "head", "options", "trace"].includes(method)) methods.add(method.toUpperCase())
    }
    operations.set(normalizePath(path), methods)
  }
  const missing = rows.flatMap(({ route, methods }) => {
    const have = operations.get(normalizePath(route))
    const absent = methods.filter((method) => !have?.has(method))
    return have && methods.length > 0 && absent.length === 0 ? [] : [{ route, missingMethods: absent, existingMethods: [...(have ?? [])], unresolvedMethods: methods.length === 0 }]
  })
  return { total: rows.length, covered: rows.length - missing.length, missing }
}
