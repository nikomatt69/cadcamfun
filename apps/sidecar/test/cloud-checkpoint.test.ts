import { afterEach, describe, expect, test } from "bun:test"
import { Database as Sqlite } from "bun:sqlite"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { CloudCheckpoint } from "../src/services/cloud-checkpoint.ts"
import { CheckpointStore } from "../../../packages/cloud/src/checkpoint-store.ts"
import type { CheckpointManifest } from "../../../packages/cloud/src/checkpoint-protocol.ts"

/** DOM `BodyInit` accepts `ArrayBuffer`, not `Uint8Array<ArrayBufferLike>`. */
const bytesBody = (bytes: Uint8Array): ArrayBuffer => {
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return buffer
}

const directories: string[] = []
afterEach(async () => { for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }) })
const directory = async () => { const dir = await mkdtemp(join(tmpdir(), "cadcam-cloud-state-")); directories.push(dir); return dir }

const storage = () => {
  let manifest: CheckpointManifest | null = null
  let fail = false
  const objects = new Map<string, Uint8Array>()
  const store = new CheckpointStore({
    epoch: async () => "epoch",
    manifest: async () => manifest,
    publish: async (_epoch, expected, next) => { if ((manifest?.revision ?? null) !== expected && manifest?.revision !== next.revision) return false; manifest = next; return true },
  }, {
    exists: async (hash) => objects.has(hash),
    put: async (hash, bytes) => { objects.set(hash, bytes) },
    get: async (hash) => { const bytes = objects.get(hash); return bytes ? new Response(bytesBody(bytes)).body : null },
  })
  const transport = Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => fail ? new Response(null, { status: 503 }) : store.fetch(new Request(input, init)), { preconnect: () => {} })
  return { transport, fail: () => { fail = true }, manifest: () => manifest, objects }
}

describe("ephemeral container recovery", () => {
  test("restores a live WAL database and independent assets into an empty container", async () => {
    const remote = storage()
    const original = await directory()
    const next = await directory()
    const controller = new CloudCheckpoint({ dataDir: original, url: "https://cloud.example/__cadcamfun/state", token: "test", epoch: "epoch", fetch: remote.transport })
    await controller.restore()
    const db = new Sqlite(join(original, "cadcamfun.db"))
    try {
      db.run("PRAGMA journal_mode=WAL")
      db.run("CREATE TABLE test (name TEXT)")
      db.run("INSERT INTO test VALUES ('created while the PC was off')")
      await writeFile(join(original, "attachment.step"), "verified STEP attachment")
      await controller.saveDatabase(() => new Uint8Array(db.serialize()))
      expect(remote.manifest()?.files.map((file) => file.path)).toContain("attachment.step")
      const restored = new CloudCheckpoint({ dataDir: next, url: "https://cloud.example/__cadcamfun/state", token: "test", epoch: "epoch", fetch: remote.transport })
      await restored.restore()
      const recovered = new Sqlite(join(next, "cadcamfun.db"))
      try { expect(recovered.query("SELECT name FROM test").get()).toEqual({ name: "created while the PC was off" }) } finally { recovered.close() }
      expect(await readFile(join(next, "attachment.step"), "utf8")).toBe("verified STEP attachment")
    } finally { db.close() }
  })

  test("failed persistence blocks later acknowledgements and retains the last durable state", async () => {
    const remote = storage()
    const source = await directory()
    const controller = new CloudCheckpoint({ dataDir: source, url: "https://cloud.example/__cadcamfun/state", token: "test", epoch: "epoch", fetch: remote.transport })
    await controller.restore()
    await controller.saveDatabase(() => new TextEncoder().encode("acknowledged"))
    const previous = remote.manifest()?.revision
    remote.fail()
    await expect(controller.saveDatabase(() => new TextEncoder().encode("never acknowledged"))).rejects.toThrow()
    await expect(controller.flush()).rejects.toThrow("must restart")
    expect(remote.manifest()?.revision).toBe(previous)
  })

  test("a corrupted stored object cannot become a ready workspace", async () => {
    const remote = storage()
    const source = await directory()
    const controller = new CloudCheckpoint({ dataDir: source, url: "https://cloud.example/__cadcamfun/state", token: "test", epoch: "epoch", fetch: remote.transport })
    await controller.restore()
    await controller.saveDatabase(() => new TextEncoder().encode("saved"))
    for (const hash of remote.objects.keys()) remote.objects.set(hash, new TextEncoder().encode("wrong"))
    const restarted = new CloudCheckpoint({ dataDir: await directory(), url: "https://cloud.example/__cadcamfun/state", token: "test", epoch: "epoch", fetch: remote.transport })
    await expect(restarted.restore()).rejects.toThrow("hash mismatch")
  })
})
