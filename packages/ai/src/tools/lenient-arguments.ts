/**
 * Some models write a tool call's nested values the way XML would: a list becomes `{"item": [...]}` or `{"item": {...}}`,
 * a text node `{"$text": "x"}`, and every number a string (`"height": "5"`). The host validates the call against the tool's
 * schema before it reaches the handler, so those calls failed on their shape and the assistant lost its turn on a tool that
 * was fine. This puts such arguments back into the JSON the schema describes; arguments already in that shape pass through
 * unchanged.
 */
import { z } from "zod"

/** Keys whose value is text even when it looks like a number ("name": "7"). */
const TEXT_KEYS = new Set([
  "type", "name", "text", "layer", "layerId", "id", "color", "font", "plane", "operation", "sketch", "feature", "kind", "direction",
  "axis", "shape", "unit", "units", "description", "label", "message", "content", "query", "topic", "title", "body", "prompt", "path",
  "file", "filename", "attachment", "focus", "expectedRevision", "mode", "format", "strategy", "component", "operationId", "sessionId", "projectId", "drawingId", "machine", "expression",
  "material", "materialId", "toolId", "machineConfigId"
])

const NUMBER = /^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value)

export const sanitizeArguments = (value: unknown, key = ""): unknown => {
  if (Array.isArray(value)) return value.map((entry) => sanitizeArguments(entry, key))
  if (isRecord(value)) {
    const keys = Object.keys(value)
    if (keys.length === 1 && keys[0] === "$text") return sanitizeArguments(value["$text"], key)
    if (keys.length === 1 && keys[0] === "item") {
      const item = sanitizeArguments(value["item"], key)
      return Array.isArray(item) ? item : [item]
    }
    return Object.fromEntries(keys.map((k) => [k, sanitizeArguments(value[k], k)]))
  }
  if (typeof value === "string" && !TEXT_KEYS.has(key) && NUMBER.test(value.trim())) return Number(value)
  return value
}

/** The schema the host validates with: the same shape, preceded by `sanitizeArguments`. */
export const lenient = <S extends z.ZodType>(schema: S): z.ZodType<z.output<S>, unknown> =>
  z.preprocess((input) => sanitizeArguments(input), schema) as unknown as z.ZodType<z.output<S>, unknown>
