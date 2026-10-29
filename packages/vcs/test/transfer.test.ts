import { describe, expect, test } from "bun:test"
import { canonicalJson, encodeTree, exportBranch, FILE_MODE, hashObject, importObjects, memoryBackend, Repository, snapshotToFiles, toBytes, verifyTransfer } from "../src/index.ts"

const author = { name: "Ada", email: "ada@example.test", time: 1_700_000_000, tz: "+0000" }
const make = () => {
  const repo = new Repository(memoryBackend())
  repo.commit({ "project.json": canonicalJson({ id: "p", name: "Part" }), "drawings/d.json": canonicalJson({ id: "d", data: { width: 10 } }) }, { message: "First", author })
  repo.commit({ "project.json": canonicalJson({ id: "p", name: "Part" }), "drawings/d.json": canonicalJson({ id: "d", data: { width: 20 } }) }, { message: "Second", author })
  return repo
}

describe("verified cloud branch transfer", () => {
  test("preserves complete byte-compatible history without moving the receiving ref", () => {
    const source = make()
    const transfer = exportBranch(source)
    const target = memoryBackend()
    importObjects(target, transfer)
    expect(target.listRefs("")).toEqual({})
    target.setRef("refs/heads/main", transfer.head)
    expect(new Repository(target).log().map((c) => c.oid)).toEqual(source.log().map((c) => c.oid))
    importObjects(target, transfer)
    expect(new Repository(target).head()).toBe(source.head())
  })

  test("rejects tampered, duplicate, incomplete and unreachable object graphs before storing anything", () => {
    const transfer = exportBranch(make())
    const first = transfer.objects[0]
    if (!first) throw new Error("fixture")
    expect(() => verifyTransfer({ ...transfer, objects: [{ ...first, body: Buffer.from("tampered").toString("base64") }, ...transfer.objects.slice(1)] })).toThrow("hash mismatch")
    expect(() => verifyTransfer({ ...transfer, objects: [...transfer.objects, first] })).toThrow("Duplicate")
    expect(() => verifyTransfer({ ...transfer, objects: transfer.objects.slice(0, -1) })).toThrow("Incomplete")
    const body = toBytes("unreachable")
    expect(() => verifyTransfer({ ...transfer, objects: [...transfer.objects, { oid: hashObject("blob", body), type: "blob", body: Buffer.from(body).toString("base64") }] })).toThrow("Unreachable")
    const target = memoryBackend()
    expect(() => importObjects(target, { ...transfer, head: "0".repeat(40) })).toThrow()
    expect(target.hasObject(transfer.head)).toBe(false)
  })

  test("rejects unsafe tree paths even when their hashes are valid", () => {
    const repo = new Repository(memoryBackend())
    repo.commit({ "project.json": "{}" }, { author, message: "test" })
    const original = exportBranch(repo)
    const blob = original.objects.find((o) => o.type === "blob")
    if (!blob) throw new Error("fixture")
    const tree = encodeTree([{ mode: FILE_MODE, name: "..", oid: blob.oid }])
    const treeOid = hashObject("tree", tree)
    const head = repo.head()
    if (!head) throw new Error("fixture")
    const commit = original.objects.find((o) => o.oid === head)
    if (!commit) throw new Error("fixture")
    const changed = Buffer.from(commit.body, "base64").toString().replace(/^tree [^\n]+/u, `tree ${treeOid}`)
    const changedBytes = toBytes(changed)
    expect(() => verifyTransfer({ head: hashObject("commit", changedBytes), branch: "main", objects: [blob, { oid: treeOid, type: "tree", body: Buffer.from(tree).toString("base64") }, { oid: hashObject("commit", changedBytes), type: "commit", body: Buffer.from(changedBytes).toString("base64") }] })).toThrow("Unsafe")
  })

  test("snapshot content ignores database clocks and installation-local ownership", () => {
    const a = snapshotToFiles({ project: { id: "p", name: "P" }, drawings: [], components: [], toolpaths: [{ id: "t", name: "T", createdBy: "one", createdAt: "yesterday", updatedAt: "today", data: { depth: 4 } }] })
    const b = snapshotToFiles({ project: { id: "p", name: "P" }, drawings: [], components: [], toolpaths: [{ id: "t", name: "T", createdBy: "two", createdAt: "tomorrow", updatedAt: "later", data: { depth: 4 } }] })
    expect(a).toEqual(b)
    expect(a["toolpaths/t.json"]).not.toContain("createdBy")
  })
})
