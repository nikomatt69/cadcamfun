import { describe, expect, test } from "bun:test"
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { isolatedPaths } from "../src/nikcli/isolation.ts"
import { modelsCacheFile, seedModelsCache } from "../src/nikcli/models-cache.ts"

const paths = () => isolatedPaths(mkdtempSync(join(tmpdir(), "cadcam-cache-")))

describe("model catalogue cache", () => {
  test("does not touch the network unless the caller allows it", async () => {
    const seed = await seedModelsCache(paths())
    expect(seed).toBe("skipped")
    expect(seed).toBe("skipped")
  })

  test("keeps an existing cache file untouched", async () => {
    const p = paths()
    const file = modelsCacheFile(p)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify({ anthropic: { id: "anthropic", name: "Anthropic", models: {} } }))
    expect(await seedModelsCache(p, { network: true })).toBe("present")
    expect(await seedModelsCache(p)).toBe("present")
  })
})
