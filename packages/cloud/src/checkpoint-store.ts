import { CHUNK_SIZE, MAX_MANIFEST_BYTES, boundedBody, checkpointRevision, decodeCommit, isHash, sha256, type CheckpointManifest } from "./checkpoint-protocol.ts"

export interface CheckpointState {
  epoch(): Promise<string | undefined>
  manifest(): Promise<CheckpointManifest | null>
  publish(epoch: string, expectedRevision: string | null, manifest: CheckpointManifest): Promise<boolean>
}
export interface ChunkBucket {
  exists(hash: string): Promise<boolean>
  put(hash: string, bytes: Uint8Array): Promise<void>
  get(hash: string): Promise<ReadableStream<Uint8Array> | null>
}

/** All data is uploaded before publication; rejected or interrupted commits leave the previous checkpoint intact. */
export class CheckpointStore {
  constructor(private readonly state: CheckpointState, private readonly bucket: ChunkBucket) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const epoch = request.headers.get("x-cadcamfun-cloud-epoch")
    if (!epoch || epoch !== await this.state.epoch()) return Response.json({ message: "Stale workspace process" }, { status: 409 })
    const name = url.pathname.split("/").at(-1)
    if (request.method === "GET" && name === "boot") return Response.json(await this.state.manifest())
    if (request.method === "POST" && name === "commit") {
      let commit
      try { commit = decodeCommit(JSON.parse(new TextDecoder().decode(await boundedBody(request, MAX_MANIFEST_BYTES)))) }
      catch { return Response.json({ message: "Invalid checkpoint manifest" }, { status: 400 }) }
      if (commit.epoch !== epoch) return Response.json({ message: "Stale workspace process" }, { status: 409 })
      const checked = new Set<string>()
      for (const file of commit.files) for (const chunk of file.chunks) {
        if (checked.has(chunk.hash)) continue
        if (!await this.bucket.exists(chunk.hash)) return Response.json({ message: "Checkpoint data is incomplete" }, { status: 409 })
        checked.add(chunk.hash)
      }
      const revision = await checkpointRevision(commit.files)
      const manifest: CheckpointManifest = { version: 1, revision, files: commit.files }
      if (!await this.state.publish(epoch, commit.expectedRevision, manifest)) return Response.json({ message: "Checkpoint revision changed" }, { status: 409 })
      return Response.json({ revision })
    }
    if (!isHash(name) || !url.pathname.includes("/objects/")) return new Response(null, { status: 404 })
    if (request.method === "HEAD") return new Response(null, { status: await this.bucket.exists(name) ? 200 : 404 })
    if (request.method === "GET") {
      const stream = await this.bucket.get(name)
      return new Response(stream, { status: stream ? 200 : 404, headers: { "content-type": "application/octet-stream", "cache-control": "no-store" } })
    }
    if (request.method === "PUT") {
      let bytes
      try { bytes = await boundedBody(request, CHUNK_SIZE) }
      catch { return new Response(null, { status: 413 }) }
      if (bytes.length === 0 || await sha256(bytes) !== name) return Response.json({ message: "Checkpoint content hash mismatch" }, { status: 400 })
      await this.bucket.put(name, bytes)
      return new Response(null, { status: 204 })
    }
    return new Response(null, { status: 405 })
  }
}
