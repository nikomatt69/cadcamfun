/**
 * Git-compatible object model. Hashing and serialisation follow git's loose-object
 * format byte for byte, so a repository written here can be pushed to GitHub (or read
 * by `git`) without conversion: the oid of a blob/tree/commit is the same everywhere.
 */
import { createHash } from "node:crypto"

export type ObjectType = "blob" | "tree" | "commit"
export type Oid = string

export const FILE_MODE = "100644"
export const TREE_MODE = "40000"

export interface TreeEntry {
  readonly mode: typeof FILE_MODE | typeof TREE_MODE
  readonly name: string
  readonly oid: Oid
}

export interface Signature {
  readonly name: string
  readonly email: string
  /** Unix seconds. */
  readonly time: number
  /** `+hhmm` / `-hhmm`, as written by git. */
  readonly tz: string
}

export interface Commit {
  readonly tree: Oid
  readonly parents: readonly Oid[]
  readonly author: Signature
  readonly committer: Signature
  readonly message: string
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export const toBytes = (data: string | Uint8Array): Uint8Array => (typeof data === "string" ? encoder.encode(data) : data)
export const toText = (data: Uint8Array): string => decoder.decode(data)

const concat = (parts: readonly Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

export const hashObject = (type: ObjectType, body: Uint8Array): Oid =>
  createHash("sha1").update(encoder.encode(`${type} ${body.length}\0`)).update(body).digest("hex")

const hexToBytes = (hex: string): Uint8Array => {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

const bytesToHex = (bytes: Uint8Array): string => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")

/** git orders tree entries by name, comparing a directory as if it ended in `/`. */
const sortKey = (e: TreeEntry): string => (e.mode === TREE_MODE ? `${e.name}/` : e.name)

export const encodeTree = (entries: readonly TreeEntry[]): Uint8Array => {
  const sorted = [...entries].sort((a, b) => {
    const ka = encoder.encode(sortKey(a))
    const kb = encoder.encode(sortKey(b))
    const n = Math.min(ka.length, kb.length)
    for (let i = 0; i < n; i++) if (ka[i] !== kb[i]) return ka[i]! - kb[i]!
    return ka.length - kb.length
  })
  return concat(sorted.flatMap((e) => [encoder.encode(`${e.mode} ${e.name}\0`), hexToBytes(e.oid)]))
}

export const decodeTree = (body: Uint8Array): TreeEntry[] => {
  const entries: TreeEntry[] = []
  let at = 0
  while (at < body.length) {
    const space = body.indexOf(0x20, at)
    const nul = body.indexOf(0x00, space)
    if (space < 0 || nul < 0 || nul + 21 > body.length) throw new Error("Malformed tree object")
    const mode = toText(body.subarray(at, space))
    if (mode !== FILE_MODE && mode !== TREE_MODE) throw new Error(`Unsupported tree entry mode ${mode}`)
    entries.push({ mode, name: toText(body.subarray(space + 1, nul)), oid: bytesToHex(body.subarray(nul + 1, nul + 21)) })
    at = nul + 21
  }
  return entries
}

const formatSignature = (s: Signature): string => `${s.name} <${s.email}> ${s.time} ${s.tz}`

const parseSignature = (line: string): Signature => {
  const m = /^(.*) <(.*)> (\d+) ([+-]\d{4})$/.exec(line)
  if (!m) throw new Error("Malformed signature")
  return { name: m[1]!, email: m[2]!, time: Number(m[3]), tz: m[4]! }
}

export const encodeCommit = (c: Commit): Uint8Array =>
  toBytes(
    [
      `tree ${c.tree}`,
      ...c.parents.map((p) => `parent ${p}`),
      `author ${formatSignature(c.author)}`,
      `committer ${formatSignature(c.committer)}`,
      "",
      c.message.endsWith("\n") ? c.message : `${c.message}\n`,
    ].join("\n"),
  )

export const decodeCommit = (body: Uint8Array): Commit => {
  const text = toText(body)
  const split = text.indexOf("\n\n")
  if (split < 0) throw new Error("Malformed commit object")
  const parents: Oid[] = []
  let tree: Oid | undefined
  let author: Signature | undefined
  let committer: Signature | undefined
  for (const line of text.slice(0, split).split("\n")) {
    if (line.startsWith("tree ")) tree = line.slice(5)
    else if (line.startsWith("parent ")) parents.push(line.slice(7))
    else if (line.startsWith("author ")) author = parseSignature(line.slice(7))
    else if (line.startsWith("committer ")) committer = parseSignature(line.slice(10))
  }
  if (!tree || !author || !committer) throw new Error("Incomplete commit object")
  return { tree, parents, author, committer, message: text.slice(split + 2) }
}
