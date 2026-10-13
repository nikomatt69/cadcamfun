/**
 * JSON Schema -> zod, for the subset the catalogue's tool schemas use (`z.toJSONSchema` output: objects, arrays, enums, consts,
 * unions, primitives, local `$ref`s). The zod namespace is injected: nikcli validates tool arguments with its own copy of zod, and
 * a schema built with another copy is not one it can read.
 *
 * A tool's arguments are a union over its actions, discriminated by `action`. nikcli wants an object shape, so `toolShape`
 * flattens the union: `action` is the enum of the actions and every other field of any action is optional. That is a hint for
 * the model, not the validation: CADCAMFUN validates each call against the action's own schema and answers a refusal as a result.
 */
export type Json = { readonly [key: string]: unknown }
/** The part of zod's API used here; `any` because the namespace is the caller's copy. */
export type Zod = any

const isRecord = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value)

export const toZod = (schema: unknown, z: Zod, defs: Json = {}, depth = 0): any => {
  if (!isRecord(schema) || depth > 12) return z.any()
  const root = isRecord(schema["$defs"]) ? { ...defs, ...schema["$defs"] } : defs
  const describe = (type: any) => typeof schema["description"] === "string" ? type.describe(schema["description"]) : type
  const ref = schema["$ref"]
  if (typeof ref === "string") {
    const target = root[ref.replace(/^#\/\$defs\//, "")]
    return target === undefined ? z.any() : toZod(target, z, root, depth + 1)
  }
  if ("const" in schema) return describe(z.literal(schema["const"] as never))
  if (Array.isArray(schema["enum"])) {
    const values = schema["enum"] as unknown[]
    if (values.length > 0 && values.every((value) => typeof value === "string")) return describe(z.enum(values as [string, ...string[]]))
    return describe(z.union(values.map((value) => z.literal(value as never)) as never))
  }
  const variants = (schema["anyOf"] ?? schema["oneOf"]) as unknown
  if (Array.isArray(variants)) {
    const members = variants.map((member) => toZod(member, z, root, depth + 1))
    return describe(members.length === 1 ? members[0] : members.length === 0 ? z.any() : z.union(members))
  }
  const type = schema["type"]
  if (Array.isArray(type)) return describe(z.union(type.map((t) => toZod({ ...schema, type: t }, z, root, depth + 1))))
  switch (type) {
    case "string": return describe(z.string())
    case "number": return describe(z.number())
    case "integer": return describe(z.number().int())
    case "boolean": return describe(z.boolean())
    case "null": return describe(z.null())
    case "array": return describe(z.array(toZod(schema["items"], z, root, depth + 1)))
    case "object": {
      const properties = isRecord(schema["properties"]) ? schema["properties"] : {}
      const required = new Set(Array.isArray(schema["required"]) ? (schema["required"] as string[]) : [])
      if (Object.keys(properties).length === 0 && isRecord(schema["additionalProperties"])) return describe(z.record(z.string(), toZod(schema["additionalProperties"], z, root, depth + 1)))
      const shape = Object.fromEntries(Object.entries(properties).map(([key, value]) => {
        const member = toZod(value, z, root, depth + 1)
        return [key, required.has(key) ? member : member.optional()]
      }))
      return describe(z.object(shape).passthrough ? z.object(shape).passthrough() : z.object(shape))
    }
    default: return z.any()
  }
}

export interface ToolShape {
  /** The args object nikcli's `tool()` takes. */
  readonly shape: Record<string, any>
  readonly actions: ReadonlyArray<string>
  /** `action: field, field` for each action, to append to the tool's description. */
  readonly summary: string
}

/** Flattens a tool's per-action union into one object shape (see the module note). */
export const toolShape = (parameters: unknown, z: Zod): ToolShape => {
  const root = isRecord(parameters) ? parameters : {}
  const defs = isRecord(root["$defs"]) ? root["$defs"] : {}
  const variants = (Array.isArray(root["anyOf"]) ? root["anyOf"] : Array.isArray(root["oneOf"]) ? root["oneOf"] : [root]).filter(isRecord)
  const actions: string[] = []
  const fields = new Map<string, Array<{ readonly schema: unknown; readonly required: boolean }>>()
  const summary: string[] = []
  for (const variant of variants) {
    const properties = isRecord(variant["properties"]) ? variant["properties"] : {}
    const required = new Set(Array.isArray(variant["required"]) ? (variant["required"] as string[]) : [])
    const action = isRecord(properties["action"]) ? properties["action"] : undefined
    const names = action === undefined ? [] : "const" in action ? [String(action["const"])] : Array.isArray(action["enum"]) ? (action["enum"] as unknown[]).map(String) : []
    actions.push(...names)
    const needs = [...required].filter((key) => key !== "action")
    for (const name of names) summary.push(`${name}${needs.length > 0 ? ` (${needs.join(", ")})` : ""}`)
    for (const [key, schema] of Object.entries(properties)) {
      if (key === "action") continue
      fields.set(key, [...(fields.get(key) ?? []), { schema, required: required.has(key) }])
    }
  }
  const shape: Record<string, any> = {}
  if (actions.length > 0) shape["action"] = z.enum([...new Set(actions)] as [string, ...string[]]).describe("Which action of the tool to run")
  for (const [key, uses] of fields) {
    const distinct = new Set(uses.map((use) => JSON.stringify(use.schema)))
    shape[key] = (distinct.size === 1 ? toZod(uses[0]!.schema, z, defs) : z.any()).optional()
  }
  return { shape, actions: [...new Set(actions)], summary: summary.join("; ") }
}
