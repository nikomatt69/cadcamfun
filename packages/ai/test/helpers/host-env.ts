import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

/**
 * `bun test` runs every file in one process and the embedded host is a process
 * singleton, so all host-backed tests share one data directory.
 */
export const sharedDataDir: string = mkdtempSync(join(tmpdir(), "cadcam-ai-test-"))

process.on("exit", () => {
  rmSync(sharedDataDir, { recursive: true, force: true })
})
