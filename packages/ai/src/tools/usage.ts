/**
 * What a rejected call should have looked like. A validation error that only names the failing field leaves the
 * model guessing the rest of the action; this reads the schema of the action it meant (the discriminated union's
 * variant) and states its fields, which are required and a call shape, so every action family teaches its own
 * correction without a hand-written hint per action. The same schema tells which of its parameters narrow or page a
 * result, which the bounded view of a large answer names.
 */
import { z } from "zod"

type Json = Record<string, unknown>

interface Variant {
  readonly usage: string
  readonly narrowing: ReadonlyArray<string>
}

const cache = new WeakMap<object, Variant>()

/** Parameters that restrict or page what an action returns, in the order the model should try them. */
const NARROWING = ["ids", "id", "elementId", "operationId", "offset", "limit", "cursor", "query", "filter", "fields", "include", "from", "to", "kind", "type", "layer", "component"]

const isRecord = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value)

const variantOf = (parameters: unknown, action: unknown): z.ZodObject | undefined => {
  if (typeof action !== "string") return undefined
  const def = (parameters as { def?: { type?: string; options?: unknown } } | null)?.def
  if (def?.type !== "union" || !Array.isArray(def.options)) return undefined
  return def.options.find((option): option is z.ZodObject => {
    const literal = (option as { shape?: Record<string, { def?: { values?: unknown } }> } | null)?.shape?.["action"]?.def?.values
    return Array.isArray(literal) && literal.includes(action)
  })
}

/** A property in a few words: its type with the limits that matter ("number 0.1..50", "array of object, 1..32 items"). */
const describe = (schema: unknown, depth = 0): string => {
  if (!isRecord(schema)) return "value"
  if (Array.isArray(schema["enum"])) {
    const values = schema["enum"].slice(0, 8).map((value) => JSON.stringify(value))
    return `${values.join("|")}${schema["enum"].length > 8 ? "|..." : ""}`
  }
  if ("const" in schema) return JSON.stringify(schema["const"])
  const options = (schema["anyOf"] ?? schema["oneOf"]) as unknown
  if (Array.isArray(options)) return [...new Set(options.slice(0, 4).map((option) => describe(option, depth + 1)))].join(" or ")
  const type = schema["type"]
  const range = typeof schema["minimum"] === "number" || typeof schema["maximum"] === "number"
    ? ` ${schema["minimum"] ?? ""}..${schema["maximum"] ?? ""}` : ""
  if (type === "array") {
    const count = typeof schema["minItems"] === "number" || typeof schema["maxItems"] === "number" ? `, ${schema["minItems"] ?? 0}..${schema["maxItems"] ?? "n"} items` : ""
    return `array of ${depth > 1 ? "values" : describe(schema["items"], depth + 1)}${count}`
  }
  if (type === "object") {
    const keys = isRecord(schema["properties"]) ? Object.keys(schema["properties"]) : []
    return keys.length === 0 ? "object" : `object {${keys.slice(0, 6).join(", ")}${keys.length > 6 ? ", ..." : ""}}`
  }
  if (typeof type === "string") return `${type}${range}`
  return "value"
}

/** An illustrative value of the right shape for a property; the name says the values are placeholders. */
const sample = (schema: unknown, depth = 0): unknown => {
  if (!isRecord(schema)) return null
  if (Array.isArray(schema["enum"]) && schema["enum"].length > 0) return schema["enum"][0]
  if ("const" in schema) return schema["const"]
  const options = (schema["anyOf"] ?? schema["oneOf"]) as unknown
  if (Array.isArray(options) && options.length > 0) return sample(options[0], depth + 1)
  switch (schema["type"]) {
    case "string": return "text"
    case "boolean": return true
    case "integer":
    case "number": {
      const min = typeof schema["minimum"] === "number" ? schema["minimum"] : undefined
      const max = typeof schema["maximum"] === "number" ? schema["maximum"] : undefined
      const value = min !== undefined && min > 1 ? min : max !== undefined && max < 1 ? max : 1
      return schema["type"] === "integer" ? Math.round(value) : value
    }
    case "array": return depth > 2 ? [] : [sample(schema["items"], depth + 1)]
    case "object": {
      if (depth > 2 || !isRecord(schema["properties"])) return {}
      const required = Array.isArray(schema["required"]) ? schema["required"] : []
      return Object.fromEntries(required.filter((key): key is string => typeof key === "string" && key in (schema["properties"] as Json)).map((key) => [key, sample((schema["properties"] as Json)[key], depth + 1)]))
    }
    default: return null
  }
}

const MAX_FIELDS = 14
const MAX_EXAMPLE_CHARS = 600

const build = (action: string, variant: z.ZodObject): Variant | undefined => {
  let schema: Json
  try { schema = z.toJSONSchema(variant, { io: "input", unrepresentable: "any" }) as Json } catch { return undefined }
  const properties = isRecord(schema["properties"]) ? schema["properties"] : {}
  const required = new Set(Array.isArray(schema["required"]) ? schema["required"].filter((key): key is string => typeof key === "string") : [])
  const names = Object.keys(properties).filter((name) => name !== "action")
  const ordered = [...names.filter((name) => required.has(name)), ...names.filter((name) => !required.has(name))]
  const line = (name: string) => `${name} (${describe(properties[name])})`
  const need = ordered.filter((name) => required.has(name)).slice(0, MAX_FIELDS).map(line)
  const may = ordered.filter((name) => !required.has(name)).slice(0, Math.max(0, MAX_FIELDS - need.length)).map(line)
  const hidden = ordered.length - need.length - may.length
  const example = JSON.stringify({ action, ...Object.fromEntries(ordered.filter((name) => required.has(name)).map((name) => [name, sample(properties[name])])) })
  const parts = [
    `Action "${action}" takes ${need.length > 0 ? `required ${need.join("; ")}` : "no required fields"}${may.length > 0 ? `; optional ${may.join("; ")}` : ""}${hidden > 0 ? `; ${hidden} more optional fields (see the tool schema)` : ""}.`,
    ...(example.length <= MAX_EXAMPLE_CHARS ? [`Shape (placeholder values): ${example}`] : [])
  ]
  return { usage: parts.join(" "), narrowing: NARROWING.filter((name) => name in properties) }
}

const variantInfo = (parameters: unknown, action: unknown): Variant | undefined => {
  const variant = variantOf(parameters, action)
  if (variant === undefined) return undefined
  const known = cache.get(variant)
  if (known !== undefined) return known
  const built = build(String(action), variant)
  if (built !== undefined) cache.set(variant, built)
  return built
}

/** The fields and call shape of the action a call meant, or undefined when the tool is not an action union or the action is unknown. */
export const actionUsage = (parameters: unknown, action: unknown): string | undefined => variantInfo(parameters, action)?.usage

/** The parameters of the action that narrow or page its result; undefined when the tool has no such action. */
export const narrowingParameters = (parameters: unknown, action: unknown): ReadonlyArray<string> | undefined => variantInfo(parameters, action)?.narrowing
