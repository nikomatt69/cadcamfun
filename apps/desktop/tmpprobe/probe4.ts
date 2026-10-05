import { Effect, Schema } from "effect"
import { cam } from "@cadcamfun/core"

const pf = (cam.ProfileParams as any).fields
const decodeDefault = (f: any) => {
  const cd = f?.ast?.context?.constructorDefault?.to
  if (!cd) return undefined
  return cd
}
for (const k of ["id", "name", "feed", "side", "climb", "tabs", "tolerance", "totalDepth", "coolant"]) {
  const d = decodeDefault(pf[k])
  const v = d === undefined ? "<none>" : JSON.stringify(Schema.decodeUnknownSync(d as any))
  console.log(k, "=>", v)
}
console.log("\noptional detection (Schema.optional vs withDefault):")
console.log("Schema.optional(String).isOptional =", (Schema.optional(Schema.String) as any).isOptional)
console.log("Schema.optional(String).ast.context =", JSON.stringify((Schema.optional(Schema.String) as any).ast.context))
console.log("Schema.String.isOptional =", (Schema.String as any).isOptional)
console.log("withDefault(String).ast.context =", JSON.stringify((Schema.withConstructorDefault(Schema.String, Effect.succeed("x") as never) as any).ast.context))
