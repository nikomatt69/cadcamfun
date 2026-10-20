import { describe, expect, test } from "bun:test"
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { isolatedPaths } from "../src/nikcli/isolation.ts"
import { modelsCacheFile, seedModelsCache, readCatalogueBody, MAX_CATALOGUE_BYTES } from "../src/nikcli/models-cache.ts"

const paths = () => isolatedPaths(mkdtempSync(join(tmpdir(), "cadcam-cache-")))

const stubFetch = (respond: () => Response): typeof fetch =>
  Object.assign(async () => respond(), { preconnect: () => undefined })

describe("model catalogue cache", () => {
  test("does not touch the network unless the caller allows it", async () => {
    const seed = await seedModelsCache(paths())
    expect(seed).toBe("bundled")
    expect(seed).toBe("bundled")
  })

  test("a failed refresh keeps the bundled catalogue and a later refresh can replace it", async () => {
    const p = paths()
    const originalFetch = globalThis.fetch
    const catalogue = Object.fromEntries(Array.from({ length: 25 }, (_, i) => [`provider-${i}`, { id: `provider-${i}`, models: {} }]))
    try {
      globalThis.fetch = stubFetch(() => new Response("nope", { status: 500 }))
      expect(await seedModelsCache(p, { network: true, refresh: true })).toBe("unavailable")
      expect(existsSync(modelsCacheFile(p))).toBe(true)
      globalThis.fetch = stubFetch(() => new Response(JSON.stringify(catalogue)))
      expect(await seedModelsCache(p, { network: true, refresh: true })).toBe("seeded")
      expect(JSON.parse(readFileSync(modelsCacheFile(p), "utf8"))).toEqual(catalogue)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test("a corrupt cache is restored from the bundled SDK without a network request", async () => {
    const p = paths(), file = modelsCacheFile(p)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, "{partial")
    expect(await seedModelsCache(p)).toBe("bundled")
    const catalogue = JSON.parse(readFileSync(file, "utf8"))
    expect(Object.keys(catalogue).length).toBeGreaterThanOrEqual(200)
    expect(catalogue.openrouter.models).toBeDefined()
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
