import { Schema } from "effect"
import { cam } from "@cadcamfun/core"

console.log("---- struct ast ----")
const ast: unknown = (Schema.Struct({ a: Schema.String, b: Schema.Finite }) as any).ast
console.log(JSON.stringify(ast, null, 1).slice(0, 2000))
console.log("---- literals ast ----")
console.log(JSON.stringify((cam.ProfileSideSchema as any).ast, null, 1).slice(0, 1200))
console.log("---- class ast ----")
const c: any = (cam.ProfileParams as any).ast
console.log(Object.keys(c), c.type, c.identifier)
