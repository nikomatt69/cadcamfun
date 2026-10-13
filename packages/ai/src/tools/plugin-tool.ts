/**
 * A tool a plugin contributes (`contributes.aiTools`, spec 27 §4.2) as a host tool: the first production caller of the extension hook
 * of `buildTools`. The tool's JSON Schema becomes the zod schema the host validates the assistant's call against; the call itself runs in
 * the plugin's sandboxed worker through `run`. A `write` tool is asked about before every call, in every role and mode: its author is
 * not this application, and nothing in its arguments (`confirm: true`) is an approval.
 */
import { z } from "zod"
import type { ToolContext, ToolDefinition } from "./define.ts"

export interface PluginToolListing {
  readonly pluginId: string
  readonly pluginName: string
  readonly id: string
  readonly description: string
  readonly kind: "read" | "write"
  /** JSON Schema of the tool's arguments. */
  readonly parameters: Readonly<Record<string, unknown>>
}

/** Large enough for any real argument list, small enough that a plugin cannot turn the schema into the prompt's biggest part. */
export const MAX_PLUGIN_SCHEMA_CHARS = 20_000

const slug = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")

/** The id the assistant sees: `plugin_<plugin>_<tool>`, unique per plugin and valid for the host (`^[a-z][a-z0-9_]{0,79}$`). */
export const pluginToolId = (pluginId: string, toolId: string): string => {
  const tail = `_${toolId}`
  return `plugin_${slug(pluginId).slice(0, Math.max(1, 79 - "plugin_".length - tail.length))}${tail}`
}

const loose = z.record(z.string(), z.unknown())

/** The zod schema of the tool's arguments: the plugin's JSON Schema when zod can represent it, else any object (the plugin validates). */
export const pluginParameters = (schema: Readonly<Record<string, unknown>>): z.ZodType => {
  try {
    if (JSON.stringify(schema).length > MAX_PLUGIN_SCHEMA_CHARS) return loose
    const converted = z.fromJSONSchema(schema as never) as z.ZodType
    return schema["type"] === "object" || "properties" in schema ? converted : loose
  } catch {
    return loose
  }
}

export const definePluginTool = (
  listing: PluginToolListing,
  run: (args: unknown, context: ToolContext) => Promise<unknown>
): ToolDefinition => ({
  id: pluginToolId(listing.pluginId, listing.id),
  description: `[Plugin: ${listing.pluginName}] ${listing.description}${listing.kind === "write" ? " This tool changes something: the person is asked before it runs." : ""}`.slice(0, 2_400),
  parameters: pluginParameters(listing.parameters),
  execute: (input, context) => run(input, context),
  ...(listing.kind === "write" ? { approval: true } : {})
})
