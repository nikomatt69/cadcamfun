import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { isRecord } from "./release-helpers.ts"

/** Keep key/password ownership together; CI or explicitly supplied keys take precedence. */
export function signingEnvironment(
  root: string,
  env: Readonly<Record<string, string | undefined>>,
  configuredPublicKey: unknown,
): Record<string, string | undefined> {
  if (env.TAURI_SIGNING_PRIVATE_KEY?.trim()) return { ...env }
  const file = join(root, "tauri-signing.json")
  if (!existsSync(file)) return { ...env }
  let local: unknown
  try { local = JSON.parse(readFileSync(file, "utf8")) }
  catch { throw new Error("Cannot read local updater signing credentials") }
  if (!isRecord(local) || typeof local.TAURI_SIGNING_PRIVATE_KEY !== "string" || !local.TAURI_SIGNING_PRIVATE_KEY.trim()
    || typeof local.TAURI_SIGNING_PRIVATE_KEY_PASSWORD !== "string" || typeof local.TAURI_UPDATER_PUBLIC_KEY !== "string"
    || !local.TAURI_UPDATER_PUBLIC_KEY.trim()) throw new Error("Local updater signing credentials are incomplete")
  if (local.TAURI_UPDATER_PUBLIC_KEY !== configuredPublicKey) throw new Error("Local updater signing key does not match the configured public key")
  return {
    ...env,
    TAURI_SIGNING_PRIVATE_KEY: local.TAURI_SIGNING_PRIVATE_KEY,
    TAURI_SIGNING_PRIVATE_KEY_PASSWORD: local.TAURI_SIGNING_PRIVATE_KEY_PASSWORD,
  }
}
