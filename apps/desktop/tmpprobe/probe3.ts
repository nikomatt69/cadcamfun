import { Schema } from "effect"
import { cam } from "@cadcamfun/core"

const S = Schema.Struct({ a: Schema.String, b: Schema.optional(Schema.Finite), c: Schema.Array(Schema.Number) })
console.log("Struct .fields keys:", Object.keys((S as any).fields))
for (const [k, v] of Object.entries((S as any).fields as Record<string, any>)) {
  console.log(" ", k, "isOptional=", v.isOptional, "ast._tag=", v.ast?._tag, "hasDefault=", "defaultValue" in v, typeof v.defaultValue)
}

console.log("\nClass .fields keys:", Object.keys((cam.ProfileParams as any).fields))
const pf = (cam.ProfileParams as any).fields
for (const k of ["id","name","side","climb","feed","tabs","tolerance"]) {
  const v = pf[k]
  console.log(" ", k, "isOptional=", v?.isOptional, "ast._tag=", v?.ast?._tag, "defaultValue?", v && "defaultValue" in v, typeof v?.defaultValue, "ast.context=", JSON.stringify(v?.ast?.context))
}
console.log("\nliteral union from side:", JSON.stringify(pf.side.ast, (k,v)=> typeof v==='function'?'[fn]':v).slice(0,400))
console.log("\ndecode err check")
const dec = Schema.decodeUnknownEffect(S)
console.log(typeof dec)
