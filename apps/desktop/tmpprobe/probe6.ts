import { Schema } from "effect"
import { cam } from "@cadcamfun/core"

const pf: Record<string, any> = cam.ProfileParams.fields

console.log("--- decode(undefined) per field ---")
for (const [k, f] of Object.entries(pf)) {
  let out: unknown
  try { out = Schema.decodeUnknownSync(f)(undefined) } catch (e) { out = "ERR" }
  console.log(" ", k, "=>", JSON.stringify(out), "| isOptional=", f.ast.context?.isOptional === true, "| tag=", f.ast._tag)
}
