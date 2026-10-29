import { decodeCommit, decodeTree, hashObject, TREE_MODE, type ObjectType } from "./object.ts"
import { Repository, type BlobFiles } from "./repository.ts"
import { memoryBackend, type Backend, type StoredObject } from "./store.ts"

export interface TransferObject {
  readonly oid: string
  readonly type: ObjectType
  readonly body: string
}

/** Immutable, complete history of one branch. Bytes use canonical base64, not a reconstructed JSON object. */
export interface BranchTransfer {
  readonly head: string
  readonly branch: string
  readonly objects: readonly TransferObject[]
}

export const TRANSFER_LIMITS = { objects: 50_000, bytes: 40 * 1024 * 1024, depth: 128, files: 20_000 } as const
const oidPattern = /^[0-9a-f]{40}$/u
const segment = /^(?!\.{1,2}$)[^/\\\u0000-\u001f\u007f]{1,255}$/u

export class TransferError extends Error {}

const bytesOf = (body: string): Uint8Array => {
  if (body.length > Math.ceil(TRANSFER_LIMITS.bytes / 3) * 4 || /[^A-Za-z0-9+/=]/u.test(body)) throw new TransferError("Invalid object encoding")
  const bytes = Buffer.from(body, "base64")
  if (bytes.toString("base64") !== body) throw new TransferError("Non-canonical object encoding")
  return bytes
}

const assertOid = (oid: string): void => {
  if (!oidPattern.test(oid)) throw new TransferError("Invalid object identifier")
}

/** Verify everything before exposing any object to a persistent backend. Unreachable objects are rejected. */
export const verifyTransfer = (transfer: BranchTransfer): { readonly backend: Backend; readonly files: BlobFiles } => {
  assertOid(transfer.head)
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/u.test(transfer.branch) || transfer.branch.split("/").some((p) => p === "." || p === ".." || p === "")) throw new TransferError("Invalid branch")
  if (transfer.objects.length === 0 || transfer.objects.length > TRANSFER_LIMITS.objects) throw new TransferError("Object count exceeds transfer limits")
  const objects = new Map<string, StoredObject>()
  let size = 0
  for (const item of transfer.objects) {
    assertOid(item.oid)
    if (item.type !== "blob" && item.type !== "tree" && item.type !== "commit") throw new TransferError("Unsupported object type")
    if (objects.has(item.oid)) throw new TransferError("Duplicate object")
    const body = bytesOf(item.body)
    size += body.byteLength
    if (size > TRANSFER_LIMITS.bytes) throw new TransferError("Object bytes exceed transfer limits")
    if (hashObject(item.type, body) !== item.oid) throw new TransferError("Object hash mismatch")
    objects.set(item.oid, { type: item.type, body })
  }
  const visited = new Set<string>()
  const pending: Array<{ oid: string; type: ObjectType; depth: number }> = [{ oid: transfer.head, type: "commit", depth: 0 }]
  while (pending.length > 0) {
    const next = pending.pop()
    if (!next) break
    const object = objects.get(next.oid)
    if (!object || object.type !== next.type) throw new TransferError("Incomplete object graph or wrong object type")
    if (next.depth > TRANSFER_LIMITS.depth) throw new TransferError("Tree nesting exceeds transfer limits")
    if (visited.has(next.oid)) continue
    visited.add(next.oid)
    if (object.type === "commit") {
      const commit = decodeCommit(object.body)
      assertOid(commit.tree)
      pending.push({ oid: commit.tree, type: "tree", depth: 0 })
      for (const parent of commit.parents) {
        assertOid(parent)
        pending.push({ oid: parent, type: "commit", depth: 0 })
      }
    } else if (object.type === "tree") {
      const names = new Set<string>()
      for (const entry of decodeTree(object.body)) {
        if (!segment.test(entry.name) || names.has(entry.name)) throw new TransferError("Unsafe or duplicate tree entry")
        names.add(entry.name)
        pending.push({ oid: entry.oid, type: entry.mode === TREE_MODE ? "tree" : "blob", depth: next.depth + 1 })
      }
    }
  }
  if (visited.size !== objects.size) throw new TransferError("Unreachable objects in transfer")
  const backend = memoryBackend()
  for (const [oid, object] of objects) backend.putObject(oid, object)
  backend.setRef(`refs/heads/${transfer.branch}`, transfer.head)
  backend.setHead(`refs/heads/${transfer.branch}`)
  const repo = new Repository(backend)
  const files: Record<string, Uint8Array> = {}
  const paths = [{ oid: repo.readCommit(transfer.head).tree, prefix: "", depth: 0 }]
  let count = 0
  // A small object DAG can expand into exponentially many paths; bound expansion before allocating its files.
  while (paths.length > 0) {
    const next = paths.pop()
    if (!next) break
    if (next.depth > TRANSFER_LIMITS.depth) throw new TransferError("Tree nesting exceeds transfer limits")
    for (const entry of repo.treeEntries(next.oid)) {
      if (++count > TRANSFER_LIMITS.files) throw new TransferError("File count exceeds transfer limits")
      const path = `${next.prefix}${entry.name}`
      if (entry.mode === TREE_MODE) paths.push({ oid: entry.oid, prefix: `${path}/`, depth: next.depth + 1 })
      else files[path] = repo.readBlob(entry.oid)
    }
  }
  return { backend, files }
}

export const exportBranch = (repo: Repository, branch = repo.currentBranch()): BranchTransfer => {
  const head = repo.resolve(branch)
  const seen = new Set<string>()
  const objects: TransferObject[] = []
  const queue = [head]
  while (queue.length > 0) {
    const oid = queue.pop()
    if (!oid || seen.has(oid)) continue
    const object = repo.backend.getObject(oid)
    if (!object) throw new TransferError("Repository contains a missing object")
    seen.add(oid)
    if (seen.size > TRANSFER_LIMITS.objects) throw new TransferError("Object count exceeds transfer limits")
    objects.push({ oid, type: object.type, body: Buffer.from(object.body).toString("base64") })
    if (object.type === "commit") {
      const commit = decodeCommit(object.body)
      queue.push(commit.tree, ...commit.parents)
    } else if (object.type === "tree") queue.push(...decodeTree(object.body).map((entry) => entry.oid))
  }
  const transfer = { head, branch, objects }
  verifyTransfer(transfer)
  return transfer
}

/** Only copies objects; the caller owns atomic ref movement and working-copy application. */
export const importObjects = (target: Backend, transfer: BranchTransfer): void => {
  const { backend } = verifyTransfer(transfer)
  for (const item of transfer.objects) {
    const object = backend.getObject(item.oid)
    if (!object) throw new TransferError("Verified object disappeared")
    const existing = target.getObject(item.oid)
    if (existing && (existing.type !== object.type || hashObject(existing.type, existing.body) !== item.oid)) throw new TransferError("Local object integrity failure")
    if (!existing) target.putObject(item.oid, object)
  }
}
