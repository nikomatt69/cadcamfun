import { Schema } from "effect"
import { cam } from "@cadcamfun/core"

const defaultsOf = (s: any): Record<string, unknown> =>
  Schema.decodeUnknownSync(s)({}) as Record<string, unknown>

console.log("--- decode {} through ProfileParams ---")
const d = defaultsOf(cam.ProfileParams)
console.log(JSON.stringify(d, null, 1))

console.log("\n--- literal union options extraction ---")
const optionsOf = (field: any): ReadonlyArray<unknown> | undefined => {
  const ast = field.ast
  if (ast?._tag === "Union" && ast.types?.every((t: any) => t?._tag === "Literal")) {
    return ast.types.map((t: any) => t.literal)
  }
  const inner = ast?.encoding?.[0]?.to
  if (inner?._tag === "Union" && inner.types?.every((t: any) => t?._tag === "Literal")) {
    return inner.types.map((t: any) => t.literal)
  }
  return undefined
}
const pf: any = cam.ProfileParams.fields
for (const k of ["side", "leadIn", "coolant", "climb", "tabs", "rampAngle"]) {
  console.log(" ", k, "=>", JSON.stringify(optionsOf(pf[k])), "tag=", pf[k].ast._tag)
}

console.log("\n--- required vs optional vs default ---")
for (const k of Object.keys(pf)) {
  const f = pf[k]
  console.log(" ", k, "isOptional=", f.ast.context?.isOptional === true,
    "hasDefault=", f.ast.context?.constructorDefault !== undefined,
    "tag=", f.ast._tag)
}
