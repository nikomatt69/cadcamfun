/**
 * Reports catalog coverage for one or more locales.
 * Reads merged `catalog/<locale>.json` plus `catalog/partial/<locale>/*.json`.
 *
 *   bun packages/web/script/check-i18n-catalog.ts it de
 */
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const root = new URL("../src/i18n/catalog/", import.meta.url)
const segments = JSON.parse(readFileSync(new URL("segments.json", root), "utf8")) as string[]
const locales = process.argv.slice(2)
if (locales.length === 0) {
  console.error("usage: bun packages/web/script/check-i18n-catalog.ts <locale>...")
  process.exit(1)
}

function readObject(path: string): Record<string, string> {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`${path} is not an object`)
  return parsed as Record<string, string>
}

let failed = false
for (const locale of locales) {
  const merged: Record<string, string> = {}
  const whole = new URL(`${locale}.json`, root)
  if (existsSync(whole)) Object.assign(merged, readObject(fileURLToPath(whole)))
  const partial = new URL(`partial/${locale}/`, root)
  if (existsSync(partial)) {
    for (const name of readdirSync(partial).filter((file) => file.endsWith(".json")).sort()) {
      Object.assign(merged, readObject(join(partial.pathname, name)))
    }
  }
  const missing = segments.filter((key) => merged[key] == null || merged[key] === "")
  console.log(`${locale}: ${segments.length - missing.length}/${segments.length} missing ${missing.length}`)
  if (missing.length > 0) {
    failed = true
    console.log(missing.slice(0, 8).map((key) => `  ${JSON.stringify(key)}`).join("\n"))
  }
}
process.exit(failed ? 1 : 0)
