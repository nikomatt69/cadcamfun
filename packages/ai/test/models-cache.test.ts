import { describe, expect, test } from "bun:test"
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { isolatedPaths } from "../src/nikcli/isolation.ts"
import { modelsCacheFile, seedModelsCache, readCatalogueBody, MAX_CATALOGUE_BYTES } from "../src/nikcli/models-cache.ts"

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

test("model metadata buffering is bounded even without Content-Length", async () => {
  let cancelled = false
  const response = new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(MAX_CATALOGUE_BYTES))
      controller.enqueue(new Uint8Array(1))
    },
    cancel() { cancelled = true }
  }))
  expect(await readCatalogueBody(response)).toBeUndefined()
  expect(cancelled).toBe(true)
  expect(await readCatalogueBody(new Response('{"ok":true}'))).toBe('{"ok":true}')
})
