import { describe, expect, test } from "bun:test"
import { CheckpointStore, type CheckpointState, type ChunkBucket } from "../src/checkpoint-store.ts"
import { checkpointRevision, sha256, validateFiles, type CheckpointFile, type CheckpointManifest } from "../src/checkpoint-protocol.ts"

const fixture = () => {
  let epoch = "first-process"
  let manifest: CheckpointManifest | null = null
  const chunks = new Map<string, Uint8Array>()
  const state: CheckpointState = {
    epoch: async () => epoch,
    manifest: async () => manifest,
    publish: async (expectedEpoch, previous, next) => {
      if (expectedEpoch !== epoch) return false
      if (manifest?.revision === next.revision) return true
      if ((manifest?.revision ?? null) !== previous) return false
      manifest = next
      return true
    },
  }
  const bucket: ChunkBucket = {
    exists: async (hash) => chunks.has(hash),
    put: async (hash, bytes) => { chunks.set(hash, bytes) },
    get: async (hash) => { const bytes = chunks.get(hash); return bytes ? new Response(bytes).body : null },
  }
  const store = new CheckpointStore(state, bucket)
  const call = (path: string, init?: RequestInit, process = epoch) => store.fetch(new Request(`https://cloud.example/__cadcamfun/state/${path}`, { ...init, headers: { ...init?.headers, "x-cadcamfun-cloud-epoch": process } }))
  return { store, state, chunks, call, nextEpoch: () => { epoch = "next-process" } }
}

const fileFor = async (text: string): Promise<{ bytes: Uint8Array; file: CheckpointFile }> => {
  const bytes = new TextEncoder().encode(text)
  const hash = await sha256(bytes)
  return { bytes, file: { path: "cadcamfun.db", size: bytes.length, sha256: hash, chunks: [{ hash, size: bytes.length }] } }
}

describe("durable cloud checkpoint publication", () => {
  test("never publishes missing bytes, then publishes and idempotently recovers a lost receipt", async () => {
    const f = fixture()
    const { file, bytes } = await fileFor("real checkpoint bytes")
    const body = JSON.stringify({ epoch: "first-process", expectedRevision: null, files: [file] })
    expect((await f.call("commit", { method: "POST", body })).status).toBe(409)
    expect(await (await f.call("boot")).json()).toBeNull()
    expect((await f.call(`objects/${file.sha256}`, { method: "PUT", body: bytes })).status).toBe(204)
    const response = await f.call("commit", { method: "POST", body })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ revision: await checkpointRevision([file]) })
    expect((await f.call("commit", { method: "POST", body })).status).toBe(200)
    expect(await (await f.call(`objects/${file.sha256}`)).text()).toBe("real checkpoint bytes")
  })

  test("fences an obsolete container and rejects concurrent manifest replacement", async () => {
    const f = fixture()
    const first = await fileFor("first")
    const second = await fileFor("second")
    for (const { file, bytes } of [first, second]) await f.call(`objects/${file.sha256}`, { method: "PUT", body: bytes })
    const commit = (file: CheckpointFile, expectedRevision: string | null) => f.call("commit", { method: "POST", body: JSON.stringify({ epoch: "first-process", expectedRevision, files: [file] }) })
    expect((await commit(first.file, null)).status).toBe(200)
    expect((await commit(second.file, null)).status).toBe(409)
    expect((await f.state.manifest())?.files[0]?.sha256).toBe(first.file.sha256)
    f.nextEpoch()
    expect((await f.call("boot", undefined, "first-process")).status).toBe(409)
    expect((await f.call(`objects/${second.file.sha256}`, { method: "PUT", body: second.bytes }, "first-process")).status).toBe(409)
  })

  test("refuses tampered objects and hostile restore paths", async () => {
    const f = fixture()
    const { file } = await fileFor("expected")
    expect((await f.call(`objects/${file.sha256}`, { method: "PUT", body: "different" })).status).toBe(400)
    for (const path of ["../cadcamfun.db", "/etc/passwd", "nested/../cadcamfun.db", "a\\b", "a//b", "C:/file"]) expect(() => validateFiles([{ ...file, path }])).toThrow()
    expect(() => validateFiles([file, file])).toThrow()
    expect(() => validateFiles([{ ...file, size: file.size + 1 }])).toThrow()
  })
})
