import { Schema } from "effect"
import { z } from "zod"

/** Effect owns the contract; nikcli receives only a derived validator and JSON schema. */
export const nikcliWireSchema = <A>(schema: Schema.Codec<A>): z.ZodType => {
  const document = Schema.toJsonSchemaDocument(schema)
  return z.fromJSONSchema({ ...document.schema, $defs: document.definitions })
}
