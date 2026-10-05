import { Schema } from "effect"
import { cam } from "@cadcamfun/core"

const fields = (cam.ProfileParams as any).fields
const S = Schema.Struct(fields)
try {
  Schema.decodeUnknownSync(S)({})
} catch (e: any) {
  const seen = new Set<string>()
  const walk = (node: any): void => {
    if (!node || typeof node !== "object") return
    if (Array.isArray(node)) { node.forEach(walk); return }
    if (node._tag === "Encoding" && node.issue && typeof node.issue.key === "string") seen.add(node.issue.key)
    if (node._tag === "Missing" || node._tag === "Encoding") {
      const k = node.issue?.key ?? node.key
      if (typeof k === "string") seen.add(k)
    }
    for (const v of Object.values(node)) if (v && typeof v === "object") walk(v)
  }
  walk(e)
  console.log("missing keys:", [...seen])
  console.log("error ctor:", e?.constructor?.name, "keys:", Object.keys(e ?? {}))
  console.log("message:", String(e?.message).slice(0, 200))
}

console.log("\n--- replace missing with Unknown then decode ---")
const missing = new Set(["totalDepth", "stepdown"])
const patched: Record<string, unknown> = {}
for (const [k, v] of Object.entries(fields)) patched[k] = missing.has(k) ? Schema.Unknown : v
const patchedS = Schema.Struct(patched as never)
console.log(JSON.stringify(Schema.decodeUnknownSync(patchedS)({}), null, 1))
