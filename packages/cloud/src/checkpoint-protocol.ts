/** Shared wire format: immutable R2 chunks, one atomically published Durable Object manifest. */
export interface CheckpointChunk { readonly hash: string; readonly size: number }
export interface CheckpointFile {
  readonly path: string
  readonly size: number
  readonly sha256: string
  readonly chunks: readonly CheckpointChunk[]
}
export interface CheckpointManifest {
  readonly version: 1
  readonly revision: string
  readonly files: readonly CheckpointFile[]
}
export interface CheckpointCommit {
  readonly epoch: string
  readonly expectedRevision: string | null
  readonly files: readonly CheckpointFile[]
}

export const CHUNK_SIZE = 256 * 1024
export const MAX_CHECKPOINT_BYTES = 512 * 1024 * 1024
export const MAX_MANIFEST_BYTES = 1024 * 1024
export const isHash = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value)
export const safeCheckpointPath = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 1024 &&
  !value.includes("\\") && !/[\u0000-\u001f\u007f]/u.test(value) &&
  !value.startsWith("/") && !value.split("/").some((part) => !part || part === "." || part === ".." || part.includes(":"))

const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value)
export const validateFiles = (input: unknown): readonly CheckpointFile[] => {
  if (!Array.isArray(input) || input.length > 10_000) throw new Error("Invalid checkpoint file list")
  const seen = new Set<string>()
  let total = 0
  const files: CheckpointFile[] = []
  for (const file of input) {
    if (!record(file) || !safeCheckpointPath(file.path) || seen.has(file.path) || !isHash(file.sha256) ||
      !Number.isSafeInteger(file.size) || Number(file.size) < 0 || !Array.isArray(file.chunks)) throw new Error("Invalid checkpoint file")
    const chunks: CheckpointChunk[] = []
    let size = 0
    for (const chunk of file.chunks) {
      if (!record(chunk) || !isHash(chunk.hash) || !Number.isSafeInteger(chunk.size) || Number(chunk.size) <= 0 || Number(chunk.size) > CHUNK_SIZE) throw new Error("Invalid checkpoint chunk")
      size += Number(chunk.size)
      chunks.push({ hash: chunk.hash, size: Number(chunk.size) })
    }
    if (size !== file.size) throw new Error("Checkpoint size mismatch")
    total += size
    if (total > MAX_CHECKPOINT_BYTES) throw new Error("Workspace checkpoint exceeds the configured size limit")
    seen.add(file.path)
    files.push({ path: file.path, size, sha256: file.sha256, chunks })
  }
  if (!seen.has("cadcamfun.db")) throw new Error("Checkpoint is missing its database")
  return files.sort((a, b) => a.path.localeCompare(b.path, "en"))
}

export const sha256 = async (bytes: Uint8Array): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes))
  return Array.from(new Uint8Array(digest), (v) => v.toString(16).padStart(2, "0")).join("")
}
export const checkpointRevision = (files: readonly CheckpointFile[]): Promise<string> => sha256(new TextEncoder().encode(JSON.stringify(files)))

export const decodeCommit = (input: unknown): CheckpointCommit => {
  if (!record(input) || typeof input.epoch !== "string" || !input.epoch || !(input.expectedRevision === null || isHash(input.expectedRevision))) throw new Error("Invalid checkpoint commit")
  return { epoch: input.epoch, expectedRevision: input.expectedRevision, files: validateFiles(input.files) }
}
export const decodeManifest = (input: unknown): CheckpointManifest | null => {
  if (input === null) return null
  if (!record(input) || input.version !== 1 || !isHash(input.revision)) throw new Error("Invalid checkpoint manifest")
  return { version: 1, revision: input.revision, files: validateFiles(input.files) }
}

/** Reading is bounded even when Content-Length is absent or forged. */
export const boundedBody = async (request: Request, limit: number): Promise<Uint8Array> => {
  if (!request.body) return new Uint8Array()
  const reader = request.body.getReader()
  const parts: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const next = await reader.read()
      if (next.done) break
      size += next.value.byteLength
      if (size > limit) throw new Error("Request exceeds the configured size limit")
      parts.push(next.value)
    }
  } finally { await reader.cancel().catch(() => undefined) }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const part of parts) { bytes.set(part, offset); offset += part.byteLength }
  return bytes
}
