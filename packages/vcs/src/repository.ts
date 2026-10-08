import {
  decodeCommit,
  decodeTree,
  encodeCommit,
  encodeTree,
  FILE_MODE,
  TREE_MODE,
  toBytes,
  toText,
  type Commit,
  type Oid,
  type Signature,
  type TreeEntry,
} from "./object.ts"
import { canonicalJson, mergeJson } from "./json.ts"
import { putObject, type Backend } from "./store.ts"

export class VcsError extends Error {
  constructor(
    readonly _tag: "NothingToCommit" | "UnknownRef" | "UnknownObject" | "BranchExists" | "InvalidName" | "DirtyMerge",
    message: string,
  ) {
    super(message)
  }
}

export type Files = Readonly<Record<string, string | Uint8Array>>
export type BlobFiles = Record<string, Uint8Array>

export interface LogEntry extends Commit {
  readonly oid: Oid
}

export interface FileChange {
  readonly path: string
  readonly status: "added" | "modified" | "deleted"
  readonly before?: Oid
  readonly after?: Oid
}

export type MergeResult =
  | { readonly kind: "up-to-date"; readonly oid: Oid }
  | { readonly kind: "fast-forward"; readonly oid: Oid }
  | { readonly kind: "merge"; readonly oid: Oid }
  | { readonly kind: "conflict"; readonly conflicts: readonly { readonly path: string; readonly pointers: readonly string[] }[] }

const BRANCH = "refs/heads/"
const TAG = "refs/tags/"
const validName = /^(?!\/)(?!.*(\/\/|\.\.|\.lock$|@\{|\/$))[A-Za-z0-9._\-/]+$/

export interface CommitOptions {
  readonly message: string
  readonly author: Signature
  readonly allowEmpty?: boolean
}

export class Repository {
  constructor(readonly backend: Backend) {}

  // ── objects ───────────────────────────────────────────────────────────────
  treeEntries(oid: Oid): TreeEntry[] {
    const obj = this.backend.getObject(oid)
    if (!obj || obj.type !== "tree") throw new VcsError("UnknownObject", `No tree ${oid}`)
    return decodeTree(obj.body)
  }

  readCommit(oid: Oid): Commit {
    const obj = this.backend.getObject(oid)
    if (!obj || obj.type !== "commit") throw new VcsError("UnknownObject", `No commit ${oid}`)
    return decodeCommit(obj.body)
  }

  readBlob(oid: Oid): Uint8Array {
    const obj = this.backend.getObject(oid)
    if (!obj || obj.type !== "blob") throw new VcsError("UnknownObject", `No blob ${oid}`)
    return obj.body
  }

  /** Builds nested tree objects from a flat `path -> content` map and returns the root tree oid. */
  writeTree(files: Files): Oid {
    interface Dir {
      files: Map<string, Oid>
      dirs: Map<string, Dir>
    }
    const root: Dir = { files: new Map(), dirs: new Map() }
    for (const [path, content] of Object.entries(files)) {
      const parts = path.split("/")
      if (parts.some((p) => p === "" || p === "." || p === ".." || p === ".git")) throw new VcsError("InvalidName", `Invalid path ${path}`)
      let dir = root
      for (const part of parts.slice(0, -1)) {
        let next = dir.dirs.get(part)
        if (!next) dir.dirs.set(part, (next = { files: new Map(), dirs: new Map() }))
        dir = next
      }
      dir.files.set(parts.at(-1)!, putObject(this.backend, "blob", toBytes(content)))
    }
    const write = (dir: Dir): Oid =>
      putObject(
        this.backend,
        "tree",
        encodeTree([
          ...[...dir.files].map(([name, oid]): TreeEntry => ({ mode: FILE_MODE, name, oid })),
          ...[...dir.dirs].map(([name, d]): TreeEntry => ({ mode: TREE_MODE, name, oid: write(d) })),
        ]),
      )
    return write(root)
  }

  /** Flattens a tree to `path -> blob oid`. */
  flatten(treeOid: Oid, prefix = ""): Map<string, Oid> {
    const out = new Map<string, Oid>()
    for (const e of this.treeEntries(treeOid)) {
      if (e.mode === TREE_MODE) for (const [p, o] of this.flatten(e.oid, `${prefix}${e.name}/`)) out.set(p, o)
      else out.set(`${prefix}${e.name}`, e.oid)
    }
    return out
  }

  readFiles(treeOid: Oid): BlobFiles {
    return Object.fromEntries([...this.flatten(treeOid)].map(([p, o]) => [p, this.readBlob(o)]))
  }

  // ── refs ──────────────────────────────────────────────────────────────────
  currentBranch(): string {
    return this.backend.getHead().slice(BRANCH.length)
  }

  /** Resolves a branch, tag, `HEAD` or full oid to a commit oid. */
  resolve(rev: string): Oid {
    if (rev === "HEAD") {
      const oid = this.backend.getRef(this.backend.getHead())
      if (!oid) throw new VcsError("UnknownRef", "HEAD has no commits yet")
      return oid
    }
    const oid = this.backend.getRef(`${BRANCH}${rev}`) ?? this.backend.getRef(`${TAG}${rev}`) ?? this.backend.getRef(rev)
    if (oid) return oid
    if (/^[0-9a-f]{40}$/.test(rev) && this.backend.hasObject(rev)) return rev
    throw new VcsError("UnknownRef", `Unknown revision ${rev}`)
  }

  head(): Oid | undefined {
    return this.backend.getRef(this.backend.getHead())
  }

  branches(): Record<string, Oid> {
    return Object.fromEntries(Object.entries(this.backend.listRefs(BRANCH)).map(([k, v]) => [k.slice(BRANCH.length), v]))
  }

  tags(): Record<string, Oid> {
    return Object.fromEntries(Object.entries(this.backend.listRefs(TAG)).map(([k, v]) => [k.slice(TAG.length), v]))
  }

  createBranch(name: string, from: string = "HEAD"): Oid {
    if (!validName.test(name)) throw new VcsError("InvalidName", `Invalid branch name ${name}`)
    if (this.backend.getRef(`${BRANCH}${name}`)) throw new VcsError("BranchExists", `Branch ${name} already exists`)
    const oid = this.resolve(from)
    this.backend.setRef(`${BRANCH}${name}`, oid)
    return oid
  }

  deleteBranch(name: string): void {
    if (name === this.currentBranch()) throw new VcsError("InvalidName", "Cannot delete the checked-out branch")
    this.backend.deleteRef(`${BRANCH}${name}`)
  }

  tag(name: string, rev: string = "HEAD"): Oid {
    if (!validName.test(name)) throw new VcsError("InvalidName", `Invalid tag name ${name}`)
    const oid = this.resolve(rev)
    this.backend.setRef(`${TAG}${name}`, oid)
    return oid
  }

  /** Points HEAD at a branch and returns the working files of its tip (empty for an unborn branch). */
  checkout(branch: string): BlobFiles {
    if (!this.backend.getRef(`${BRANCH}${branch}`)) throw new VcsError("UnknownRef", `Unknown branch ${branch}`)
    this.backend.setHead(`${BRANCH}${branch}`)
    return this.readFiles(this.readCommit(this.resolve(branch)).tree)
  }

  // ── history ───────────────────────────────────────────────────────────────
  /** Writes the snapshot as a commit on the checked-out branch (creating the branch when unborn). */
  commit(files: Files, options: CommitOptions): Oid {
    const parent = this.head()
    const tree = this.writeTree(files)
    if (parent && !options.allowEmpty && this.readCommit(parent).tree === tree) throw new VcsError("NothingToCommit", "No changes since the last commit")
    const oid = this.writeCommit({ tree, parents: parent ? [parent] : [], author: options.author, committer: options.author, message: options.message })
    this.backend.setRef(this.backend.getHead(), oid)
    return oid
  }

  private writeCommit(c: Commit): Oid {
    return putObject(this.backend, "commit", encodeCommit(c))
  }

  /** Newest-first walk of everything reachable from `rev`. */
  log(rev: string = "HEAD", limit = Number.POSITIVE_INFINITY): LogEntry[] {
    const seen = new Map<Oid, LogEntry>()
    const stack = [this.resolve(rev)]
    while (stack.length > 0) {
      const oid = stack.pop()!
      if (seen.has(oid)) continue
      const commit = this.readCommit(oid)
      seen.set(oid, { oid, ...commit })
      stack.push(...commit.parents)
    }
    return [...seen.values()].sort((a, b) => b.committer.time - a.committer.time).slice(0, limit)
  }

  isAncestor(ancestor: Oid, descendant: Oid): boolean {
    return this.log(descendant).some((c) => c.oid === ancestor)
  }

  mergeBase(a: Oid, b: Oid): Oid | undefined {
    const ofA = new Set(this.log(a).map((c) => c.oid))
    return this.log(b).find((c) => ofA.has(c.oid))?.oid
  }

  diff(from: Oid | undefined, to: Oid): FileChange[] {
    const before = from ? this.flatten(this.readCommit(from).tree) : new Map<string, Oid>()
    const after = this.flatten(this.readCommit(to).tree)
    const out: FileChange[] = []
    for (const path of [...new Set([...before.keys(), ...after.keys()])].sort()) {
      const b = before.get(path)
      const a = after.get(path)
      if (b === a) continue
      out.push(b === undefined ? { path, status: "added", after: a } : a === undefined ? { path, status: "deleted", before: b } : { path, status: "modified", before: b, after: a })
    }
    return out
  }

  /** Restores the files of `rev` as a new commit on top of HEAD (history is never rewritten). */
  revertTo(rev: string, author: Signature, message = `Restore ${rev}`): Oid {
    return this.commit(this.readFiles(this.readCommit(this.resolve(rev)).tree), { author, message })
  }

  /**
   * Merges `theirs` into the checked-out branch. Non-overlapping edits merge cleanly; `.json`
   * files merge structurally. On conflict nothing is written and the conflicting paths are returned.
   */
  merge(theirs: string, author: Signature, message?: string): MergeResult {
    return this.mergeInto(this.currentBranch(), theirs, author, message)
  }

  /** Like `merge`, for any local branch; HEAD and the working files are untouched unless `into` is checked out. */
  mergeInto(into: string, theirs: string, author: Signature, message = `Merge ${theirs} into ${into}`): MergeResult {
    const ref = `${BRANCH}${into}`
    const ours = this.resolve(into)
    const their = this.resolve(theirs)
    if (ours === their || this.isAncestor(their, ours)) return { kind: "up-to-date", oid: ours }
    if (this.isAncestor(ours, their)) {
      this.backend.setRef(ref, their)
      return { kind: "fast-forward", oid: their }
    }
    const baseOid = this.mergeBase(ours, their)
    const base = baseOid ? this.flatten(this.readCommit(baseOid).tree) : new Map<string, Oid>()
    const o = this.flatten(this.readCommit(ours).tree)
    const t = this.flatten(this.readCommit(their).tree)
    const merged: Record<string, string | Uint8Array> = {}
    const conflicts: { path: string; pointers: string[] }[] = []
    for (const path of new Set([...base.keys(), ...o.keys(), ...t.keys()])) {
      const [b, a, c] = [base.get(path), o.get(path), t.get(path)]
      // Trivial cases: same on both sides, or only one side changed (deletion included).
      if (a === c || c === b || a === b) {
        const winner = a === c ? a : a === b ? c : a
        if (winner !== undefined) merged[path] = this.readBlob(winner)
        continue
      }
      if (a !== undefined && c !== undefined && path.endsWith(".json")) {
        const result = mergeJson(b ? JSON.parse(toText(this.readBlob(b))) : undefined, JSON.parse(toText(this.readBlob(a))), JSON.parse(toText(this.readBlob(c))))
        if (result.ok) merged[path] = canonicalJson(result.value)
        else conflicts.push({ path, pointers: [...result.conflicts] })
        continue
      }
      conflicts.push({ path, pointers: ["/"] })
    }
    if (conflicts.length > 0) return { kind: "conflict", conflicts }
    const oid = this.writeCommit({ tree: this.writeTree(merged), parents: [ours, their], author, committer: author, message })
    this.backend.setRef(ref, oid)
    return { kind: "merge", oid }
  }
}
