import { encodeCommit, encodeTree, FILE_MODE, hashObject, TREE_MODE } from "./object.ts"
import type { GitHubTransport, RemoteTreeEntry } from "./github.ts"
import type { Repository } from "./repository.ts"

/**
 * A `GitHubTransport` backed by another `Repository`: the stand-in for GitHub in tests, and the way to mirror a project to a
 * local or shared repository. Like GitHub it only accepts fast-forward ref updates.
 */
export const repositoryTransport = (remote: Repository): GitHubTransport => ({
  getRef: async (b) => remote.backend.getRef(`refs/heads/${b}`),
  updateRef: async (b, oid) => {
    const cur = remote.backend.getRef(`refs/heads/${b}`)
    if (cur && !remote.isAncestor(cur, oid)) throw new Error("non fast-forward")
    remote.backend.setRef(`refs/heads/${b}`, oid)
  },
  createBlob: async (c) => {
    const oid = hashObject("blob", c)
    remote.backend.putObject(oid, { type: "blob", body: c })
    return oid
  },
  createTree: async (entries) => {
    const body = encodeTree(entries.map((e) => ({ mode: e.type === "tree" ? TREE_MODE : FILE_MODE, name: e.path, oid: e.sha })))
    const oid = hashObject("tree", body)
    remote.backend.putObject(oid, { type: "tree", body })
    return oid
  },
  createCommit: async (c) => {
    const body = encodeCommit(c)
    const oid = hashObject("commit", body)
    remote.backend.putObject(oid, { type: "commit", body })
    return oid
  },
  getCommit: async (oid) => remote.readCommit(oid),
  getTree: async (oid): Promise<RemoteTreeEntry[]> => remote.treeEntries(oid).map((e) => ({ path: e.name, mode: e.mode, type: e.mode === TREE_MODE ? "tree" : "blob", sha: e.oid })),
  getBlob: async (oid) => remote.readBlob(oid),
})
