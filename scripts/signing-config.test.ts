import { expect, test } from "bun:test"
import { mkdtempSync, writeFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { signingEnvironment } from "./signing-config.ts"

const credentials = { TAURI_SIGNING_PRIVATE_KEY: "test-private-key", TAURI_SIGNING_PRIVATE_KEY_PASSWORD: "test-password", TAURI_UPDATER_PUBLIC_KEY: "test-public-key" }
const fixture = () => mkdtempSync(join(tmpdir(), "cadcam-signing-test-"))

test("local signing loads a matching key/password pair without mutating the environment", () => {
  const root = fixture()
  try {
    writeFileSync(join(root, "tauri-signing.json"), JSON.stringify(credentials), { mode: 0o600 })
    const env = { CADCAM_RELEASE: "0", TAURI_SIGNING_PRIVATE_KEY_PASSWORD: "unrelated-password" }
    const loaded = signingEnvironment(root, env, "test-public-key")
    expect(loaded.TAURI_SIGNING_PRIVATE_KEY).toBe(credentials.TAURI_SIGNING_PRIVATE_KEY)
    expect(loaded.TAURI_SIGNING_PRIVATE_KEY_PASSWORD).toBe(credentials.TAURI_SIGNING_PRIVATE_KEY_PASSWORD)
    expect(env).not.toHaveProperty("TAURI_SIGNING_PRIVATE_KEY")
    expect(() => signingEnvironment(root, env, "another-public-key")).toThrow("does not match")
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test("explicit signing credentials do not read or mix in local credentials", () => {
  const root = fixture()
  try {
    writeFileSync(join(root, "tauri-signing.json"), "broken-local-file")
    const env = { TAURI_SIGNING_PRIVATE_KEY: "environment-key" }
    expect(signingEnvironment(root, env, "public-key")).toEqual(env)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test("missing credentials preserve the environment and invalid files never expose their content", () => {
  const root = fixture()
  try {
    expect(signingEnvironment(root, {}, "public-key")).toEqual({})
    writeFileSync(join(root, "tauri-signing.json"), "sensitive-malformed-content")
    expect(() => signingEnvironment(root, {}, "public-key")).toThrow("Cannot read local updater signing credentials")
    writeFileSync(join(root, "tauri-signing.json"), "{}")
    expect(() => signingEnvironment(root, {}, "public-key")).toThrow("incomplete")
  } finally { rmSync(root, { recursive: true, force: true }) }
})
