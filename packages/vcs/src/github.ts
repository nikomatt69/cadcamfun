/**
 * Sync with the user's own GitHub repository through the Git Data API (blobs, trees, commits,
 * refs). Because the object model is byte-compatible with git, every oid stays identical on both
 * sides: no mapping tables, and `git clone` of the repo yields the same history the app shows.
 * Works from any client with `fetch` — the sidecar, or the iOS app talking to GitHub directly.
 */
import { encodeCommit, encodeTree, FILE_MODE, hashObject, TREE_MODE, type Commit, type Oid, type TreeEntry } from "./object.ts"
import { putObject } from "./store.ts"
import { VcsError, type Repository } from "./repository.ts"

export interface RemoteTreeEntry {
  readonly path: string
  readonly mode: string
  readonly type: "blob" | "tree"
  readonly sha: Oid
}

export interface GitHubTransport {
  getRef(branch: string): Promise<Oid | undefined>
  /** Creates the ref when missing; otherwise moves it, rejecting non-fast-forward updates. */
  updateRef(branch: string, oid: Oid): Promise<void>
  createBlob(content: Uint8Array): Promise<Oid>
  createTree(entries: readonly RemoteTreeEntry[]): Promise<Oid>
  createCommit(commit: Commit): Promise<Oid>
  getCommit(oid: Oid): Promise<Commit>
  getTree(oid: Oid): Promise<readonly RemoteTreeEntry[]>
  getBlob(oid: Oid): Promise<Uint8Array>
}

export interface SyncResult {
  readonly oid: Oid
  readonly objects: number
}

const toRemote = (e: TreeEntry): RemoteTreeEntry => ({ path: e.name, mode: e.mode === TREE_MODE ? "040000" : e.mode, type: e.mode === TREE_MODE ? "tree" : "blob", sha: e.oid })

const verified = (expected: Oid, got: Oid): void => {
  if (expected !== got) throw new VcsError("UnknownObject", `Remote object hash mismatch: expected ${expected}, got ${got}`)
}

/** Uploads every commit/tree/blob reachable from the local branch tip that the remote lacks, then fast-forwards the remote ref. */
export const push = async (repo: Repository, transport: GitHubTransport, branch: string): Promise<SyncResult> => {
  const tip = repo.resolve(branch)
  const remoteTip = await transport.getRef(branch)
  if (remoteTip === tip) return { oid: tip, objects: 0 }
  if (remoteTip && !repo.backend.hasObject(remoteTip)) throw new VcsError("DirtyMerge", "Remote has commits you have not pulled; pull and merge first")
  if (remoteTip && !repo.isAncestor(remoteTip, tip)) throw new VcsError("DirtyMerge", "Remote has diverged; pull and merge first")

  const known = remoteTip ? new Set(repo.log(remoteTip).map((c) => c.oid)) : new Set<Oid>()
  const pending = repo.log(tip).filter((c) => !known.has(c.oid)).reverse() // oldest first
  let objects = 0
  const uploaded = new Set<Oid>()
  const sendTree = async (oid: Oid): Promise<void> => {
    if (uploaded.has(oid)) return
    uploaded.add(oid)
    const entries = repo.treeEntries(oid)
    for (const e of entries) {
      if (e.mode === TREE_MODE) await sendTree(e.oid)
      else if (!uploaded.has(e.oid)) {
        uploaded.add(e.oid)
        verified(e.oid, await transport.createBlob(repo.readBlob(e.oid)))
        objects++
      }
    }
    verified(oid, await transport.createTree(entries.map(toRemote)))
    objects++
  }
  for (const c of pending) {
    await sendTree(c.tree)
    verified(c.oid, await transport.createCommit({ tree: c.tree, parents: c.parents, author: c.author, committer: c.committer, message: c.message }))
    objects++
  }
  await transport.updateRef(branch, tip)
  return { oid: tip, objects }
}

/** Downloads the remote branch history into the local object store (does not move any local ref). */
export const fetchBranch = async (repo: Repository, transport: GitHubTransport, branch: string): Promise<SyncResult | undefined> => {
  const tip = await transport.getRef(branch)
  if (!tip) return undefined
  let objects = 0
  const pullTree = async (oid: Oid): Promise<void> => {
    if (repo.backend.hasObject(oid)) return
    const remote = await transport.getTree(oid)
    const entries: TreeEntry[] = []
    for (const r of remote) {
      if (r.type === "tree") {
        await pullTree(r.sha)
        entries.push({ mode: TREE_MODE, name: r.path, oid: r.sha })
      } else {
        if (!repo.backend.hasObject(r.sha)) {
          const body = await transport.getBlob(r.sha)
          verified(r.sha, hashObject("blob", body))
          putObject(repo.backend, "blob", body)
          objects++
        }
        entries.push({ mode: FILE_MODE, name: r.path, oid: r.sha })
      }
    }
    verified(oid, putObject(repo.backend, "tree", encodeTree(entries)))
    objects++
  }
  const queue = [tip]
  while (queue.length > 0) {
    const oid = queue.pop()!
    if (repo.backend.hasObject(oid)) continue
    const commit = await transport.getCommit(oid)
    await pullTree(commit.tree)
    verified(oid, putObject(repo.backend, "commit", encodeCommit(commit)))
    objects++
    queue.push(...commit.parents)
  }
  return { oid: tip, objects }
}

/** Fetches then merges the remote branch into the checked-out branch (fast-forward when possible). */
export const pull = async (repo: Repository, transport: GitHubTransport, branch: string, author: Commit["author"]) => {
  const fetched = await fetchBranch(repo, transport, branch)
  if (!fetched) throw new VcsError("UnknownRef", `Remote has no branch ${branch}`)
  if (!repo.head()) {
    repo.backend.setRef(repo.backend.getHead(), fetched.oid)
    return { kind: "fast-forward" as const, oid: fetched.oid }
  }
  return repo.merge(fetched.oid, author, `Merge remote ${branch}`)
}

export interface RestOptions {
  readonly owner: string
  readonly repo: string
  readonly token: string
  readonly fetch?: typeof fetch
  readonly apiUrl?: string
}

const b64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString("base64")

/** `GitHubTransport` over the REST API. The token is a fine-grained PAT (Contents: read/write) or a GitHub App user token. */
export const restTransport = (o: RestOptions): GitHubTransport => {
  const f = o.fetch ?? fetch
  const base = `${o.apiUrl ?? "https://api.github.com"}/repos/${o.owner}/${o.repo}`
  const call = async (method: string, path: string, body?: unknown): Promise<{ status: number; json: any }> => {
    const res = await f(`${base}${path}`, {
      method,
      headers: { authorization: `Bearer ${o.token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const json = res.status === 204 ? undefined : await res.json().catch(() => undefined)
    return { status: res.status, json }
  }
  const ok = async (method: string, path: string, body?: unknown) => {
    const r = await call(method, path, body)
    if (r.status >= 300) throw new Error(`GitHub ${method} ${path} failed with ${r.status}: ${r.json?.message ?? "no message"}`)
    return r.json
  }
  const sig = (s: Commit["author"]) => ({ name: s.name, email: s.email, date: new Date(s.time * 1000).toISOString() })
  const fromApiSig = (s: { name: string; email: string; date: string }, tz: string): Commit["author"] => ({ name: s.name, email: s.email, time: Math.floor(Date.parse(s.date) / 1000), tz })
  return {
    getRef: async (branch) => {
      const r = await call("GET", `/git/ref/heads/${branch}`)
      return r.status === 404 ? undefined : r.status < 300 ? (r.json.object.sha as Oid) : Promise.reject(new Error(`GitHub getRef failed with ${r.status}`))
    },
    updateRef: async (branch, oid) => {
      const exists = (await call("GET", `/git/ref/heads/${branch}`)).status === 200
      if (exists) await ok("PATCH", `/git/refs/heads/${branch}`, { sha: oid, force: false })
      else await ok("POST", "/git/refs", { ref: `refs/heads/${branch}`, sha: oid })
    },
    createBlob: async (content) => (await ok("POST", "/git/blobs", { content: b64(content), encoding: "base64" })).sha,
    createTree: async (entries) => (await ok("POST", "/git/trees", { tree: entries })).sha,
    createCommit: async (c) =>
      (await ok("POST", "/git/commits", { message: c.message, tree: c.tree, parents: c.parents, author: sig(c.author), committer: sig(c.committer) })).sha,
    getCommit: async (oid) => {
      const j = await ok("GET", `/git/commits/${oid}`)
      return {
        tree: j.tree.sha,
        parents: j.parents.map((p: { sha: Oid }) => p.sha),
        author: fromApiSig(j.author, "+0000"),
        committer: fromApiSig(j.committer, "+0000"),
        message: j.message,
      }
    },
    getTree: async (oid) => (await ok("GET", `/git/trees/${oid}`)).tree.map((e: RemoteTreeEntry) => ({ path: e.path, mode: e.mode, type: e.type, sha: e.sha })),
    getBlob: async (oid) => new Uint8Array(Buffer.from((await ok("GET", `/git/blobs/${oid}`)).content, "base64")),
  }
}
