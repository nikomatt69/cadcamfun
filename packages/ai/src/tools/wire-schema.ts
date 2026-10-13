import { Schema } from "effect"
import { z } from "zod"

/**
 * Effect owns the contract; nikcli receives only a derived validator and JSON schema. The result is an object schema,
 * so a catalogue entry can extend it with the tool's `action` discriminator exactly like a hand-written one.
 */
export const nikcliWireSchema = <A>(schema: Schema.Codec<A>): z.ZodObject<Record<string, z.ZodType>> => {
  const document = Schema.toJsonSchemaDocument(schema)
  return z.fromJSONSchema({ ...document.schema, $defs: document.definitions }) as z.ZodObject<Record<string, z.ZodType>>
}
