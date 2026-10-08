import { describe, expect, test } from "bun:test"
import { execFileSync } from "node:child_process"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  filesToSnapshot,
  fetchBranch,
  hashObject,
  memoryBackend,
  mergeJson,
  pull,
  push,
  Repository,
  snapshotToFiles,
  toBytes,
  toText,
  encodeCommit,
  decodeCommit,
  encodeTree,
  TREE_MODE,
  FILE_MODE,
  type Commit,
  type GitHubTransport,
  type Oid,
  type RemoteTreeEntry,
  type Signature,
} from "../src/index.ts"

let clock = 1_700_000_000
const sig = (name = "Ada"): Signature => ({ name, email: `${name.toLowerCase()}@x.io`, time: clock++, tz: "+0000" })
const repo = () => new Repository(memoryBackend())

describe("object model", () => {
  test("matches git for known objects", () => {
    expect(hashObject("blob", toBytes("hello\n"))).toBe("ce013625030ba8dba906f756967f9e9ca394464a")
    expect(hashObject("tree", new Uint8Array())).toBe("4b825dc642cb6eb9a060e54bf8d69288fbee4904")
  })

  test("a repository written here is readable by real git with identical oids", () => {
    const r = repo()
    const oid = r.commit({ "project.json": '{"a":1}\n', "drawings/d1.json": "{}\n", "drawings-x.json": "{}\n" }, { message: "init", author: { name: "Ada", email: "a@x.io", time: 1_700_000_000, tz: "+0000" } })
    const dir = mkdtempSync(join(tmpdir(), "vcs-"))
    const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim()
    git("init", "-q")
    const walk = (treeOid: Oid) => {
      for (const e of r.treeEntries(treeOid)) {
        if (e.mode === TREE_MODE) walk(e.oid)
        else {
          writeFileSync(join(dir, "blob"), r.readBlob(e.oid))
          expect(git("hash-object", "-w", "blob")).toBe(e.oid)
        }
      }
      const raw = encodeTree(r.treeEntries(treeOid))
      writeFileSync(join(dir, "tree"), raw)
      expect(git("hash-object", "-t", "tree", "-w", "--literally", "tree")).toBe(treeOid)
    }
    const commit = r.readCommit(oid)
    walk(commit.tree)
    writeFileSync(join(dir, "commit"), encodeCommit(commit))
    expect(git("hash-object", "-t", "commit", "-w", "commit")).toBe(oid)
    expect(git("fsck", "--no-dangling")).not.toContain("error")
    expect(git("ls-tree", "-r", "--name-only", commit.tree).split("\n")).toEqual(["drawings-x.json", "drawings/d1.json", "project.json"])
  })

  test("commit encode/decode round trip", () => {
    const c: Commit = { tree: "a".repeat(40), parents: ["b".repeat(40)], author: sig(), committer: sig(), message: "msg\n\nbody\n" }
    expect(decodeCommit(encodeCommit(c))).toEqual(c)
  })
})

describe("history", () => {
  test("commit, log, diff, empty commit rejected", () => {
    const r = repo()
    const a = r.commit({ "a.json": "1\n" }, { message: "one", author: sig() })
    const b = r.commit({ "a.json": "2\n", "b.json": "x\n" }, { message: "two", author: sig() })
    expect(r.log().map((c) => c.oid)).toEqual([b, a])
    expect(r.diff(a, b).map((d) => [d.path, d.status])).toEqual([["a.json", "modified"], ["b.json", "added"]])
    expect(() => r.commit({ "a.json": "2\n", "b.json": "x\n" }, { message: "noop", author: sig() })).toThrow("No changes")
  })

  test("branches, checkout and revertTo keep history", () => {
    const r = repo()
    const a = r.commit({ "a.json": "1\n" }, { message: "one", author: sig() })
    r.createBranch("ai/tweak")
    r.checkout("ai/tweak")
    r.commit({ "a.json": "9\n" }, { message: "ai", author: sig("Bot") })
    expect(toText(r.checkout("main")["a.json"]!)).toBe("1\n")
    const restored = r.revertTo("ai/tweak", sig())
    expect(r.log().length).toBe(2)
    expect(toText(r.readFiles(r.readCommit(restored).tree)["a.json"]!)).toBe("9\n")
    expect(r.resolve("main")).toBe(restored)
    expect(a).not.toBe(restored)
    expect(() => r.createBranch("../x")).toThrow("Invalid branch name")
  })

  test("fast-forward, clean merge, json merge and conflict", () => {
    const r = repo()
    r.commit({ "d.json": JSON.stringify({ name: "p", w: 1, h: 1 }), "t.json": "{}\n" }, { message: "base", author: sig() })
    r.createBranch("mobile")
    r.checkout("mobile")
    const m = r.commit({ "d.json": JSON.stringify({ name: "p", w: 1, h: 5 }), "t.json": "{}\n" }, { message: "mobile h", author: sig("Bot") })
    r.checkout("main")
    expect(r.merge("mobile", sig())).toEqual({ kind: "fast-forward", oid: m })

    r.createBranch("a")
    r.checkout("a")
    r.commit({ "d.json": JSON.stringify({ name: "p", w: 7, h: 5 }), "t.json": "{}\n" }, { message: "a w", author: sig() })
    r.checkout("main")
    r.commit({ "d.json": JSON.stringify({ name: "p", w: 1, h: 9 }), "t.json": "{}\n" }, { message: "main h", author: sig() })
    const merged = r.merge("a", sig())
    expect(merged.kind).toBe("merge")
    if (merged.kind === "merge") {
      expect(JSON.parse(toText(r.readFiles(r.readCommit(merged.oid).tree)["d.json"]!))).toEqual({ name: "p", w: 7, h: 9 })
      expect(r.readCommit(merged.oid).parents.length).toBe(2)
    }

    r.createBranch("c")
    r.checkout("c")
    r.commit({ "d.json": JSON.stringify({ name: "p", w: 7, h: 1 }), "t.json": "{}\n" }, { message: "c h", author: sig() })
    r.checkout("main")
    r.commit({ "d.json": JSON.stringify({ name: "p", w: 7, h: 2 }), "t.json": "{}\n" }, { message: "main h2", author: sig() })
    const tip = r.resolve("main")
    expect(r.merge("c", sig())).toEqual({ kind: "conflict", conflicts: [{ path: "d.json", pointers: ["/h"] }] })
    expect(r.resolve("main")).toBe(tip)
  })

  test("mergeJson treats arrays atomically and handles deletions", () => {
    expect(mergeJson({ a: 1, b: 2 }, { a: 1 }, { a: 1, b: 2, c: 3 })).toEqual({ ok: true, value: { a: 1, c: 3 } })
    expect(mergeJson({ l: [1] }, { l: [1, 2] }, { l: [1, 3] })).toEqual({ ok: false, conflicts: ["/l"] })
  })
})

describe("snapshot", () => {
  test("round trips and rejects unsafe ids", () => {
    const snap = { project: { id: "p1", name: "Part" }, drawings: [{ id: "d1", data: { e: [1] } }], components: [], toolpaths: [{ id: "t1", op: "pocket" }], extra: { ".cadcamfun/workflows/ci.yml": "name: ci\n" } }
    const files = snapshotToFiles(snap)
    expect(Object.keys(files).sort()).toEqual([".cadcamfun/workflows/ci.yml", "drawings/d1.json", "project.json", "toolpaths/t1.json"])
    expect(filesToSnapshot(files)).toEqual(snap)
    expect(() => snapshotToFiles({ ...snap, drawings: [{ id: "../x" }] })).toThrow("Unsafe")
  })
})

/** Fake GitHub: a second repository behind the transport interface. */
const fakeRemote = (remote: Repository): GitHubTransport => ({
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

describe("github sync", () => {
  test("push to an empty remote, pull from a second device, then diverge", async () => {
    const remote = repo()
    const t = fakeRemote(remote)
    const desktop = repo()
    desktop.commit({ "project.json": "{}\n", "drawings/d1.json": "{\"w\":1}\n" }, { message: "init", author: sig() })
    const tip = desktop.commit({ "project.json": "{}\n", "drawings/d1.json": "{\"w\":2}\n" }, { message: "edit", author: sig() })
    const pushed = await push(desktop, t, "main")
    expect(pushed.oid).toBe(tip)
    expect(remote.resolve("main")).toBe(tip)
    expect((await push(desktop, t, "main")).objects).toBe(0)

    const phone = repo()
    const res = await pull(phone, t, "main", sig("Phone"))
    expect(res).toEqual({ kind: "fast-forward", oid: tip })
    expect(phone.log().map((c) => c.message.trim())).toEqual(["edit", "init"])

    phone.commit({ "project.json": "{}\n", "drawings/d1.json": "{\"w\":3}\n" }, { message: "ai edit", author: sig("Bot") })
    await push(phone, t, "main")
    desktop.commit({ "project.json": "{\"x\":1}\n", "drawings/d1.json": "{\"w\":2}\n" }, { message: "desktop", author: sig() })
    await expect(push(desktop, t, "main")).rejects.toThrow("pull")
    const merged = await pull(desktop, t, "main", sig())
    expect(merged.kind).toBe("merge")
    await push(desktop, t, "main")
    expect(remote.resolve("main")).toBe(desktop.resolve("main"))
  })

  test("fetch rejects tampered objects", async () => {
    const remote = repo()
    remote.commit({ "a.json": "1\n" }, { message: "x", author: sig() })
    const t = { ...fakeRemote(remote), getBlob: async () => toBytes("evil\n") }
    await expect(fetchBranch(repo(), t, "main")).rejects.toThrow("hash mismatch")
  })
})

import { describeDiff, jsonChanges } from "../src/index.ts"

describe("semantic diff", () => {
  test("reports property-level changes per entity", () => {
    const r = repo()
    const a = r.commit({ "project.json": '{"name":"P"}\n', "drawings/d1.json": JSON.stringify({ id: "d1", name: "Plate", data: { pts: [[0, 0], [10, 0]] } }) }, { message: "1", author: sig() })
    const b = r.commit({ "project.json": '{"name":"P"}\n', "drawings/d1.json": JSON.stringify({ id: "d1", name: "Plate", data: { pts: [[0, 0], [12, 0]] } }), "toolpaths/t1.json": JSON.stringify({ id: "t1", name: "Pocket" }) }, { message: "2", author: sig() })
    expect(describeDiff(r, a, b)).toEqual([
      { path: "drawings/d1.json", kind: "drawings", id: "d1", name: "Plate", status: "modified", changes: [{ pointer: "/data/pts/1/0", before: 10, after: 12 }] },
      { path: "toolpaths/t1.json", kind: "toolpaths", id: "t1", name: "Pocket", status: "added", changes: [{ pointer: "/id", after: "t1" }, { pointer: "/name", after: "Pocket" }] },
    ])
    expect(jsonChanges({ l: [1] }, { l: [1, 2] })).toEqual([{ pointer: "/l", before: [1], after: [1, 2] }])
  })

  test("mergeInto leaves HEAD alone", () => {
    const r = repo()
    r.commit({ "a.json": "{}\n" }, { message: "base", author: sig() })
    r.createBranch("feature")
    r.checkout("feature")
    const f = r.commit({ "a.json": '{"x":1}\n' }, { message: "f", author: sig() })
    r.checkout("main")
    r.createBranch("release")
    expect(r.mergeInto("release", "feature", sig())).toEqual({ kind: "fast-forward", oid: f })
    expect(r.currentBranch()).toBe("main")
    expect(r.resolve("release")).toBe(f)
  })
})
