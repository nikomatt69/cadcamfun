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
