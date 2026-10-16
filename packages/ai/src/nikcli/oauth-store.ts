import { chmodSync, existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { Schema } from "effect"

export const SUBSCRIPTION_PROVIDERS = ["openai", "xai"] as const
export const OAuthGrant = Schema.Struct({
  type: Schema.Literal("oauth"), access: Schema.String, refresh: Schema.String,
  expires: Schema.Number, accountId: Schema.optional(Schema.String)
})
const Grants = Schema.Record(Schema.String, Schema.Unknown)

/** Read only the app's isolated file, never another nikcli installation. */
export const readOAuthGrants = (file: string): Record<string, typeof OAuthGrant.Type> => {
  if (!existsSync(file)) return {}
  try {
    const raw = Schema.decodeUnknownSync(Grants)(JSON.parse(readFileSync(file, "utf8")))
    const grants: Record<string, typeof OAuthGrant.Type> = {}
    for (const provider of SUBSCRIPTION_PROVIDERS) {
      const decoded = Schema.decodeUnknownOption(OAuthGrant)(raw[provider])
      if (decoded._tag === "Some" && decoded.value.access && decoded.value.refresh) grants[provider] = decoded.value
    }
    return grants
  } catch { return {} }
}

export const hostAuthFile = (dataDir: string): string => join(dataDir, "ai", "nikcli", "data", "auth.json")

/** Keep renewable subscriptions across restarts; discard transient API keys left by a crash. */
export const retainOAuthGrants = (file: string): void => {
  const grants = readOAuthGrants(file)
  if (Object.keys(grants).length === 0) { rmSync(file, { force: true }); return }
  const temporary = `${file}.${crypto.randomUUID()}.tmp`
  try {
    writeFileSync(temporary, JSON.stringify(grants), { mode: 0o600 })
    chmodSync(temporary, 0o600)
    renameSync(temporary, file)
  } finally { rmSync(temporary, { force: true }) }
}
