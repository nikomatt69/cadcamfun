import document from "../data/api-reference.json"
import { apiGroups, type ApiGroupCopy } from "../data/apiGroups"

export type ApiSchema = boolean | {
  readonly $ref?: string
  readonly type?: string | string[]
  readonly description?: string
  readonly properties?: Record<string, ApiSchema>
  readonly required?: string[]
  readonly items?: ApiSchema
  readonly enum?: unknown[]
  readonly anyOf?: ApiSchema[]
  readonly oneOf?: ApiSchema[]
  readonly allOf?: ApiSchema[]
  readonly [key: string]: unknown
}
export type ApiParameter = {
  readonly name: string
  readonly in: string
  readonly required?: boolean
  readonly description?: string
  readonly schema?: ApiSchema
}
export type ApiContent = Record<string, { readonly schema?: ApiSchema }>
export type ApiResponse = {
  readonly description?: string
  readonly content?: ApiContent
  readonly headers?: Record<string, { readonly schema?: ApiSchema; readonly description?: string }>
}
export type ApiOperation = {
  readonly operationId: string
  readonly tags?: string[]
  readonly summary?: string
  readonly description?: string
  readonly deprecated?: boolean
  readonly parameters?: ApiParameter[]
  readonly security?: Record<string, string[]>[]
  readonly requestBody?: { readonly required?: boolean; readonly content: ApiContent }
  readonly responses: Record<string, ApiResponse>
}
export type ApiEntry = { readonly method: string; readonly path: string; readonly operation: ApiOperation; readonly anchor: string }
export type ApiDocument = {
  readonly openapi: string
  readonly info: { readonly title: string; readonly version: string }
  readonly paths: Record<string, Record<string, ApiOperation>>
  readonly components: { readonly schemas: Record<string, ApiSchema> }
}
export const apiDocument = document as unknown as ApiDocument
const methods = new Set(["get", "post", "put", "patch", "delete", "head", "options"])
export const allOperations: readonly ApiEntry[] = Object.entries(apiDocument.paths).flatMap(([path, item]) =>
  Object.entries(item).filter(([method]) => methods.has(method)).map(([method, operation]) => ({
    method: method.toUpperCase(), path, operation,
    anchor: `operation-${operation.operationId.replace(/[^a-zA-Z0-9_-]/g, "-")}`,
  })))
export const operationsFor = (group: ApiGroupCopy): readonly ApiEntry[] => allOperations.filter((entry) => entry.operation.tags?.includes(group.tag))
export const apiStats = {
  operations: allOperations.length,
  paths: Object.keys(apiDocument.paths).length,
  schemas: Object.keys(apiDocument.components.schemas).length,
  groups: apiGroups.length,
}
export const schemaName = (schema: ApiSchema | undefined): string | undefined =>
  schema && typeof schema === "object" && schema.$ref?.startsWith("#/components/schemas/")
    ? decodeURIComponent(schema.$ref.slice("#/components/schemas/".length)) : undefined
export const schemaAnchor = (name: string) => `schema-${encodeURIComponent(name)}`
export function resolveSchema(schema: ApiSchema): ApiSchema {
  const visited = new Set<string>()
  let current = schema
  for (;;) {
    const name = schemaName(current)
    if (!name || visited.has(name)) return current
    visited.add(name)
    const next = apiDocument.components.schemas[name]
    if (next === undefined) return current
    current = next
  }
}
export function schemaType(schema?: ApiSchema): string {
  if (schema === undefined || schema === true) return "any JSON value"
  if (schema === false) return "no valid value"
  const name = schemaName(schema)
  if (name) return name
  if (schema.enum) return schema.enum.map((value) => JSON.stringify(value)).join(" | ")
  if (schema.anyOf || schema.oneOf) return (schema.anyOf ?? schema.oneOf)!.map(schemaType).join(" | ")
  if (schema.allOf) return schema.allOf.map(schemaType).join(" & ")
  if (schema.type === "array") return `Array<${schemaType(schema.items)}>`
  if (Array.isArray(schema.type)) return schema.type.join(" | ")
  return schema.type ?? (schema.properties ? "object" : "any JSON value")
}
export function schemaRules(schema?: ApiSchema): string {
  if (schema === undefined || typeof schema === "boolean") return ""
  return ["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "minLength", "maxLength", "minItems", "maxItems", "pattern", "format", "default"]
    .filter((key) => schema[key] !== undefined)
    .map((key) => `${key}: ${JSON.stringify(schema[key])}`).join("; ")
}
export function referencedSchemas(entries: readonly ApiEntry[]): readonly string[] {
  const names = new Set<string>()
  const visit = (value: unknown) => {
    if (!value || typeof value !== "object") return
    if (Array.isArray(value)) { value.forEach(visit); return }
    const object = value as Record<string, unknown>
    const ref = typeof object.$ref === "string" ? object.$ref : ""
    if (ref.startsWith("#/components/schemas/")) {
      const name = decodeURIComponent(ref.slice("#/components/schemas/".length))
      if (!names.has(name)) { names.add(name); visit(apiDocument.components.schemas[name]) }
    }
    Object.values(object).forEach(visit)
  }
  entries.forEach((entry) => visit(entry.operation))
  return [...names].sort()
}
export function requestExample(entry: ApiEntry): string {
  const { operation } = entry
  const query = operation.parameters?.filter((parameter) => parameter.in === "query" && parameter.required) ?? []
  const suffix = query.length ? "?" + query.map((parameter) => `${encodeURIComponent(parameter.name)}=<${parameter.name}>`).join("&") : ""
  const path = entry.path.replace(/\{([^}]+)\}/g, "<$1>") + suffix
  const lines = [`curl --request ${entry.method} "\${CADCAMFUN_URL}${path}"`]
  if (operation.security?.length) lines.push('  --header "Authorization: Bearer ${CADCAMFUN_TOKEN}"')
  const content = Object.keys(operation.requestBody?.content ?? {})
  if (content.includes("application/json")) lines.push('  --header "Content-Type: application/json"', "  --data-binary @request.json")
  else if (content.length) lines.push(`  --header "Content-Type: ${content[0]}"`, "  --data-binary @request-body")
  return lines.join(" \\\n")
}

// ---------------------------------------------------------------- operation cards

import examples from "../data/api-examples.json"

/** Responses captured from a sidecar started with a fresh data directory (see /docs/documentation). */
export const capturedExamples = examples as Record<string, { readonly status: number; readonly body: string }>

export { apiCategories } from "./apiCategories"

/** `op-get-api-projects-id`: method plus the path, braces and slashes folded to dashes. */
export const opAnchor = (entry: Pick<ApiEntry, "method" | "path">): string =>
  `op-${entry.method.toLowerCase()}-${entry.path.replace(/[{}]/g, "").replace(/[^a-zA-Z0-9_]+/g, "-").replace(/^-|-$/g, "")}`

const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
const t = (cls: string, s: string): string => `<span class="api-t-${cls}">${esc(s)}</span>`

/** A schema as TypeScript-like HTML (keys, optional marks, unions, links to named schemas), for `pre.api-schema`. */
export function schemaHtml(schema: ApiSchema | undefined, indent = 0, seen: ReadonlySet<string> = new Set(), link = true): string {
  const pad = "  ".repeat(indent)
  if (schema === undefined || schema === true) return t("type", "unknown")
  if (schema === false) return t("type", "never")
  const name = schemaName(schema)
  if (name) {
    if (link || seen.has(name)) return `<a class="api-type-link" href="#${schemaAnchor(name)}">${t("type", name)}</a>`
    const target = apiDocument.components.schemas[name]
    return target === undefined ? t("type", name) : schemaHtml(target, indent, new Set([...seen, name]), true)
  }
  if (schema.enum) return schema.enum.map((v) => t("literal", JSON.stringify(v))).join(t("punct", " | "))
  if (schema.const !== undefined) return t("literal", JSON.stringify(schema.const))
  const union = schema.anyOf ?? schema.oneOf
  if (union) return [...new Set(union.flatMap((s) => schemaHtml(s, indent, seen).split(t("punct", " | "))))].join(t("punct", " | "))
  if (schema.allOf) return schema.allOf.map((s) => schemaHtml(s, indent, seen)).join(t("punct", " & "))
  const type = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : schema.properties ? ["object"] : []
  if (type.includes("array")) {
    const inner = schemaHtml(schema.items, indent, seen)
    return /api-t-punct">( \||\{)/.test(inner) && !inner.startsWith("<a") ? `${t("punct", "Array<")}${inner}${t("punct", ">")}` : `${inner}${t("punct", "[]")}`
  }
  if (type.includes("object") && (schema.properties || schema.additionalProperties)) {
    const required = new Set(schema.required ?? [])
    const lines = Object.entries(schema.properties ?? {}).map(([key, value]) =>
      `${pad}  ${t("key", key)}${t("punct", required.has(key) ? ": " : "?: ")}${schemaHtml(value, indent + 1, seen)}`)
    const extra = schema.additionalProperties
    if (extra && typeof extra === "object") lines.push(`${pad}  ${t("key", "[key: string]")}${t("punct", ": ")}${schemaHtml(extra as ApiSchema, indent + 1, seen)}`)
    return lines.length ? `${t("punct", "{")}\n${lines.join("\n")}\n${pad}${t("punct", "}")}` : t("type", "object")
  }
  if (type.length) return type.map((x) => t("type", x === "integer" ? "number" : x)).join(t("punct", " | "))
  return t("type", "unknown")
}

/** A skeleton value for a schema: empty strings, zeros, first enum member; named schemas expanded once. */
export function exampleOf(schema: ApiSchema | undefined, depth = 0, seen: ReadonlySet<string> = new Set()): unknown {
  if (schema === undefined || typeof schema === "boolean" || depth > 6) return null
  const name = schemaName(schema)
  if (name) {
    if (seen.has(name)) return null
    const target = apiDocument.components.schemas[name]
    return target === undefined ? null : exampleOf(target, depth, new Set([...seen, name]))
  }
  if (schema.default !== undefined) return schema.default
  if (schema.enum) return schema.enum[0]
  if (schema.const !== undefined) return schema.const
  const union = schema.anyOf ?? schema.oneOf
  if (union) return exampleOf(union.find((s) => !(typeof s === "object" && s.type === "null")) ?? union[0], depth, seen)
  if (schema.allOf) return Object.assign({}, ...schema.allOf.map((s) => exampleOf(s, depth, seen) as object))
  const type = Array.isArray(schema.type) ? schema.type.find((x) => x !== "null") : schema.type ?? (schema.properties ? "object" : undefined)
  switch (type) {
    case "string": return ""
    case "number": case "integer": return typeof schema.minimum === "number" ? schema.minimum : 0
    case "boolean": return false
    case "array": return schema.items === undefined ? [] : [exampleOf(schema.items, depth + 1, seen)].filter((v) => v !== null)
    case "object": return Object.fromEntries(Object.entries(schema.properties ?? {}).filter(([key]) => (schema.required ?? []).includes(key) || depth === 0).map(([key, value]) => [key, exampleOf(value, depth + 1, seen)]))
    default: return null
  }
}

/** Path with its `{parameters}` wrapped for highlighting. */
export const pathHtml = (path: string): string =>
  path.split(/(\{[^}]+\})/).filter(Boolean).map((part) => part.startsWith("{") ? `<span class="api-param">${esc(part)}</span>` : `<span>${esc(part)}</span>`).join("")

/** Name of a response schema for the response head: a named schema, or its type. */
export const responseLabel = (schema: ApiSchema | undefined): string => schemaName(schema) ?? schemaType(schema)

import sdkMap from "../data/api-sdk.json"

/** Accessor and input type of each operation in the generated Promise SDK, read from `packages/api/src/sdk/generated/client.ts`. */
export const sdkCalls = sdkMap as Record<string, { readonly call: string; readonly input: string | null }>
export const sdkCallFor = (entry: Pick<ApiEntry, "method" | "path">) => sdkCalls[`${entry.method} ${entry.path}`]

/** The Promise SDK call for an operation, or a `fetch` call for the few operations the SDK does not generate. */
export function sdkExample(entry: ApiEntry): { readonly language: "ts"; readonly code: string; readonly generated: boolean } {
  const call = sdkCallFor(entry)
  const pathParams = entry.operation.parameters?.filter((p) => p.in === "path").map((p) => p.name) ?? []
  const head = [
    'import { CadCam } from "@cadcamfun/api/sdk"',
    "",
    "const client = CadCam.make({",
    "  baseUrl: process.env.CADCAMFUN_URL!,",
    "  headers: { authorization: `Bearer ${process.env.CADCAMFUN_TOKEN}` },",
    "})",
    "",
  ]
  if (call) {
    const body = entry.operation.requestBody?.content["application/json"]?.schema
    const fields = body ? exampleOf(body) : undefined
    const input: Record<string, unknown> = Object.fromEntries(pathParams.map((p) => [p, `<${p}>`]))
    if (fields && typeof fields === "object" && !Array.isArray(fields)) Object.assign(input, fields)
    const arg = call.input ? JSON.stringify(input, null, 2).replace(/"([A-Za-z_$][\w$]*)":/g, "$1:") : ""
    return { language: "ts", generated: true, code: [...head, `// ${call.input ?? "no input"}`, `const result = await client${call.call.startsWith("[") ? "" : "."}${call.call}(${arg})`].join("\n") }
  }
  const url = entry.path.replace(/\{([^}]+)\}/g, "${$1}")
  return { language: "ts", generated: false, code: [
    "// Not generated in the Promise SDK (multipart, binary or raw body): call it with fetch.",
    `const response = await fetch(\`\${process.env.CADCAMFUN_URL}${url}\`, {`,
    `  method: "${entry.method}",`,
    "  headers: { authorization: `Bearer ${process.env.CADCAMFUN_TOKEN}` },",
    "})",
  ].join("\n") }
}
