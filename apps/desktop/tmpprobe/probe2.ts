import { Schema } from "effect"
import { cam } from "@cadcamfun/core"

const dump = (label: string, s: unknown) => {
  console.log("=== " + label + " ===")
  const a: any = (s as any).ast
  console.log("top keys:", Object.keys(a).join(","))
  console.log(JSON.stringify(a, (k, v) => (typeof v === "function" ? "[fn]" : v), 1).slice(0, 900))
  console.log()
}

dump("ProfileParams (class)", cam.ProfileParams)
dump("Schema.optional(String)", Schema.optional(Schema.String))
dump("Schema.Array(Number)", Schema.Array(Schema.Number))
dump("Schema.Boolean", Schema.Boolean)
dump("withDefault(String,'x')", Schema.withConstructorDefault(Schema.String, undefined as never))
dump("Positive", Schema.Finite.check(Schema.isGreaterThan(0)))
dump("isBetween", Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 })))
dump("TabSchema", (cam as any).TabSchema)
