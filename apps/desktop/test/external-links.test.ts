import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

// `openExternal` (src/app/external.ts) hands OAuth sign-in URLs to the system browser
// through `open` from @tauri-apps/plugin-shell. Without `shell:allow-open` granted to the
// main window the call is refused by the ACL, the fallback (`window.open`) goes nowhere
// inside a Tauri webview, and every "Open sign-in page" click is silently a no-op.
describe("external links in the Tauri shell", () => {
  test("the main window capability allows the shell open command", () => {
    const caps = JSON.parse(readFileSync(join(import.meta.dir, "../src-tauri/capabilities/main.json"), "utf8")).permissions
    expect(caps).toContain("shell:allow-open")
  })
})
