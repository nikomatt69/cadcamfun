import { Schema } from "effect"
import { cam } from "@cadcamfun/core"

const fields = (cam.ProfileParams as any).fields as Record<string, any>
const hasDefault = (f: any) => f.ast?.context?.constructorDefault !== undefined
const isOptional = (f: any) => f.ast?.context?.isOptional === true
const withDefaults = Object.fromEntries(Object.entries(fields).filter(([, f]) => hasDefault(f) || isOptional(f)))
console.log("subset fields:", Object.keys(withDefaults))
console.log(JSON.stringify(Schema.decodeUnknownSync(Schema.Struct(withDefaults))({}), null, 1))
