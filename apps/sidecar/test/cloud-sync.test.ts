import { describe, expect, test } from "bun:test"
import { CloudTransfer, type CloudProjectStatus } from "@cadcamfun/api"
import { Database, DatabaseError, schema } from "@cadcamfun/db"
import { canonicalJson, Repository, snapshotToFiles } from "@cadcamfun/vcs"
import { eq, sql } from "drizzle-orm"
import { Context, Effect, Exit, Layer, Redacted, Scope, Schema } from "effect"
import { mkdtemp, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { AppConfigService } from "../src/config.ts"
import { CloudProjectRepo } from "../src/repos/cloud-project-repo.ts"
import { readProjectSnapshot, sqliteBackend } from "../src/repos/project-vcs-repo.ts"
import { CloudConnections, CloudHttp, cloudOrigin } from "../src/services/cloud-connection.ts"
import { CloudSync } from "../src/services/cloud-sync.ts"
import { CloudSyncError, sha256 } from "../src/services/cloud-transfer.ts"
import { StorageService } from "../src/services/storage.ts"
import type { Actor } from "../src/services/project-vcs.ts"

const migrationsFolder = new URL("../../../packages/db/drizzle", import.meta.url).pathname
const WORKSPACE = "workspace-personal"
const TOKEN = "a-test-device-grant-that-is-not-a-real-secret"
const IDENTITY = "a-test-identity-access-token"
const actor = (label: string): Actor => ({ userId: `user-${label}`, name: "Ada", email: `${label}@example.test` })

const makeInstall = async (label: string, http: CloudHttp["Service"], existingDirectory?: string) => {
  const directory = existingDirectory ?? await mkdtemp(join(tmpdir(), `cadcamfun-cloud-${label}-`))
  const scope = Effect.runSync(Scope.make())
  const config = Layer.succeed(AppConfigService, AppConfigService.of({ token: Redacted.make("private-test-master-token"), dataDir: directory, migrationsDir: migrationsFolder, version: "test", localeEnv: {}, aiOffline: true }))
  const live = CloudSync.layer.pipe(
    Layer.provideMerge(CloudProjectRepo.layer),
    Layer.provideMerge(CloudConnections.layer),
    Layer.provideMerge(Layer.succeed(CloudHttp, http)),
    Layer.provideMerge(StorageService.layer),
    Layer.provideMerge(config),
    Layer.provideMerge(Database.layer({ path: join(directory, "cadcamfun.db"), migrationsFolder })),
  )
  const context = await Effect.runPromise(Layer.buildWithMemoMap(live, Layer.makeMemoMapUnsafe(), scope))
  const database = Context.get(context, Database)
  const user = actor(label)
  await Effect.runPromise(database.query("test.user", (db) => db.insert(schema.userTable).values({ id: user.userId, name: user.name, email: user.email }).onConflictDoNothing().run()))
  return {
    directory, actor: user, database, cloud: Context.get(context, CloudSync), repo: Context.get(context, CloudProjectRepo), storage: Context.get(context, StorageService),
    async close(remove = true) { await Effect.runPromise(Scope.close(scope, Exit.void)); if (remove) await rm(directory, { recursive: true, force: true }) },
  }
}
type Install = Awaited<ReturnType<typeof makeInstall>>
const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(effect)
const fail = <A, E>(effect: Effect.Effect<A, E>) => run(Effect.flip(effect))
const unreachable: CloudHttp["Service"] = { request: async () => { throw new Error("Unexpected network request") } }

const seed = async (install: Install, withAssets = false) => {
  await run(install.database.query("test.seed", (db) => {
    db.insert(schema.projectTable).values({ id: "project", name: "Bracket", ownerId: install.actor.userId }).run()
    db.insert(schema.drawingTable).values({ id: "drawing", name: "Plate", projectId: "project", data: { width: 10, height: 8 } }).run()
    db.insert(schema.materialTable).values({ id: "material", name: "Aluminium", ownerId: install.actor.userId, properties: { density: 2.7 } }).run()
    db.insert(schema.toolpathTable).values({ id: "toolpath", name: "Pocket", projectId: "project", createdBy: install.actor.userId, materialId: "material", drawingId: "drawing", data: { depth: 2 }, gcode: "G1 X10 Z-2" }).run()
    if (withAssets) db.insert(schema.fileUploadTable).values({ id: "upload", fileName: "reference.step", s3Key: "drawings/drawing/reference.step", s3Bucket: "local", s3ContentType: "application/step", s3Size: 21, objectId: "drawing", objectType: "DRAWING", ownerId: install.actor.userId }).run()
  }))
  if (withAssets) await run(install.storage.upload("drawings/drawing/reference.step", "ISO-10303-21;ENDSEC;"))
}

const makePair = async (withAssets = false) => {
  const remote = await makeInstall("cloud", unreachable)
  const controls: { tamper: boolean; workspace: string; before?: (path: string) => Promise<void>; offline: boolean } = { tamper: false, workspace: WORKSPACE, offline: false }
  const http: CloudHttp["Service"] = {
    async request(origin, path, init) {
      if (controls.offline) throw new Error("offline")
      expect(origin).toBe("https://personal.example.workers.dev")
      const headers = new Headers(init.headers)
      expect(headers.get("authorization")).toBe(`Bearer ${TOKEN}`)
      expect(headers.get("x-identity-token")).toBe(IDENTITY)
      await controls.before?.(path)
      const match = /^\/api\/cloud\/remote\/projects\/([^/]+)(\/receipt)?$/u.exec(path)
      try {
        let result: unknown
        if (path === "/api/cloud/remote/projects") result = await run(remote.cloud.remoteProjects(remote.actor.userId))
        else if (match) {
          const id = decodeURIComponent(match[1] ?? "")
          const payload: unknown = init.body ? JSON.parse(String(init.body)) : undefined
          if (match[2]) {
            const value = Schema.decodeUnknownSync(Schema.Struct({ head: Schema.String, deviceId: Schema.String, state: Schema.Literals(["downloaded", "applied"]) }))(payload)
            result = await run(remote.cloud.receipt(id, remote.actor.userId, value.deviceId, value.head, value.state))
          } else if (init.method === "PUT") {
            const value = Schema.decodeUnknownSync(Schema.Struct({ transfer: CloudTransfer, expectedHead: Schema.NullOr(Schema.String) }))(payload)
            result = await run(remote.cloud.remoteImport(id, remote.actor.userId, value.transfer, value.expectedHead))
          } else {
            const transfer = await run(remote.cloud.remoteExport(id, remote.actor.userId))
            result = controls.tamper ? { ...transfer, objects: transfer.objects.map((object, index) => index === 0 ? { ...object, body: "dGFtcGVyZWQ=" } : object) } : transfer
          }
        } else throw new Error("Unknown cloud path")
        return Response.json(result, { headers: { "x-cadcamfun-workspace-id": controls.workspace } })
      } catch (error) {
        const domain = error instanceof CloudSyncError ? error : undefined
        return Response.json({ message: domain?.message ?? "Storage failed" }, { status: domain?.code === "not-found" ? 404 : domain?.code === "conflict" || domain?.code === "dirty" ? 409 : 500 })
      }
    },
  }
  const local = await makeInstall("desktop", http)
  await seed(local, withAssets)
  await run(local.cloud.setConnection(local.actor.userId, { origin: "https://personal.example.workers.dev", workspaceId: WORKSPACE, token: TOKEN }))
  return { local, remote, controls, http, async close() { await local.close(); await remote.close() } }
}

const change = (install: Install, width: number) => run(install.database.query("test.change", (db) => db.update(schema.drawingTable).set({ data: { width, height: 8 }, updatedAt: new Date() }).where(eq(schema.drawingTable.id, "drawing")).run()))
const width = (install: Install) => (install.database.db.select().from(schema.drawingTable).where(eq(schema.drawingTable.id, "drawing")).get()?.data as { width?: number } | undefined)?.width

describe("cloud synchronization between independent installations", () => {
  test("publish, mobile work with PC off, download and atomic apply preserve IDs/history/assets across different users", async () => {
    const pair = await makePair(true)
    try {
      const { local, remote } = pair
      const published = await run(local.cloud.publish("project", local.actor, IDENTITY))
      expect(published).toMatchObject({ state: "applied", dirty: false })
      expect(remote.database.db.select().from(schema.projectTable).get()).toMatchObject({ id: "project", ownerId: remote.actor.userId })
      expect(remote.database.db.select().from(schema.toolpathTable).get()?.createdBy).toBe(remote.actor.userId)
      expect(await run(remote.storage.downloadBytes("drawings/drawing/reference.step"))).toEqual(await run(local.storage.downloadBytes("drawings/drawing/reference.step")))
      await change(remote, 25)
      const pending = await run(remote.cloud.send("project", remote.actor))
      expect(pending).toMatchObject({ state: "pending", dirty: false })
      expect(width(local)).toBe(10)
      const downloaded = await run(local.cloud.fetch("project", local.actor.userId, IDENTITY))
      expect(downloaded).toMatchObject({ state: "downloaded", localHead: published.localHead, remoteHead: pending.localHead })
      expect(width(local)).toBe(10)
      expect(await run(remote.cloud.status("project", remote.actor.userId))).toMatchObject({ state: "downloaded" })
      const applied = await run(local.cloud.apply("project", local.actor.userId, IDENTITY, published.localHead ?? undefined))
      expect(applied).toMatchObject({ state: "applied", localHead: pending.localHead, dirty: false })
      expect(width(local)).toBe(25)
      expect(await run(remote.cloud.status("project", remote.actor.userId))).toMatchObject({ state: "applied" })
      expect(local.database.db.select().from(schema.toolpathTable).get()?.createdBy).toBe(local.actor.userId)
      const localSnapshot = readProjectSnapshot(local.database.db, "project")
      const remoteSnapshot = readProjectSnapshot(remote.database.db, "project")
      if (!localSnapshot || !remoteSnapshot) throw new Error("Missing snapshot")
      expect(snapshotToFiles(localSnapshot)).toEqual(snapshotToFiles(remoteSnapshot))
      expect(new Repository(sqliteBackend(local.database.db, "project")).log().map((c) => c.oid)).toEqual(new Repository(sqliteBackend(remote.database.db, "project")).log().map((c) => c.oid))
      expect((await run(local.cloud.apply("project", local.actor.userId, IDENTITY))).localHead).toBe(applied.localHead)
    } finally { await pair.close() }
  })

  test("fetch never overwrites dirty work, and apply rechecks edits made during network I/O", async () => {
    const pair = await makePair()
    try {
      const { local, remote, controls } = pair
      const first = await run(local.cloud.publish("project", local.actor, IDENTITY))
      await change(remote, 30)
      await run(remote.cloud.send("project", remote.actor))
      controls.before = async (path) => { if (path === "/api/cloud/remote/projects/project") await change(local, 99) }
      expect(await run(local.cloud.fetch("project", local.actor.userId, IDENTITY))).toMatchObject({ state: "downloaded", dirty: true })
      expect(width(local)).toBe(99)
      expect(await fail(local.cloud.apply("project", local.actor.userId, IDENTITY))).toBeInstanceOf(CloudSyncError)
      expect((await run(local.cloud.status("project", local.actor.userId))).localHead).toBe(first.localHead)
      expect(width(local)).toBe(99)
    } finally { await pair.close() }
  })

  test("diverged histories remain preserved and cannot be silently replaced", async () => {
    const pair = await makePair()
    try {
      const { local, remote } = pair
      await run(local.cloud.publish("project", local.actor, IDENTITY))
      await change(local, 11)
      const localChange = await run(local.cloud.send("project", local.actor))
      await change(remote, 22)
      const remoteChange = await run(remote.cloud.send("project", remote.actor))
      await run(local.cloud.fetch("project", local.actor.userId, IDENTITY))
      const rejected = await fail(local.cloud.apply("project", local.actor.userId, IDENTITY))
      expect(rejected).toMatchObject({ code: "conflict" })
      expect(width(local)).toBe(11)
      expect((await run(local.cloud.status("project", local.actor.userId))).localHead).toBe(localChange.localHead)
      expect(local.database.db.select().from(schema.gitObjectTable).where(eq(schema.gitObjectTable.oid, remoteChange.localHead ?? "")).get()).toBeDefined()
    } finally { await pair.close() }
  })

  test("a database failure rolls back model application, HEAD and delivery state together", async () => {
    const pair = await makePair()
    try {
      const { local, remote } = pair
      const before = await run(local.cloud.publish("project", local.actor, IDENTITY))
      await change(remote, 33)
      await run(remote.cloud.send("project", remote.actor))
      await run(local.cloud.fetch("project", local.actor.userId, IDENTITY))
      local.database.db.run(sql.raw("CREATE TRIGGER cloud_test_failure BEFORE UPDATE ON Toolpath BEGIN SELECT RAISE(ABORT, 'test apply failure'); END"))
      const result = await fail(local.cloud.apply("project", local.actor.userId, IDENTITY))
      expect(result).toBeInstanceOf(DatabaseError)
      expect(width(local)).toBe(10)
      expect(await run(local.cloud.status("project", local.actor.userId))).toMatchObject({ localHead: before.localHead, state: "downloaded", dirty: false })
      local.database.db.run(sql.raw("DROP TRIGGER cloud_test_failure"))
      expect(await run(local.cloud.apply("project", local.actor.userId, IDENTITY))).toMatchObject({ state: "applied", dirty: false })
    } finally { await pair.close() }
  })

  test("shared library changes are explicit conflicts and do not change another local project", async () => {
    const pair = await makePair()
    try {
      const { local, remote } = pair
      const before = await run(local.cloud.publish("project", local.actor, IDENTITY))
      local.database.db.insert(schema.projectTable).values({ id: "other", name: "Other", ownerId: local.actor.userId }).run()
      local.database.db.insert(schema.toolpathTable).values({ id: "other-toolpath", name: "Other cut", projectId: "other", materialId: "material", createdBy: local.actor.userId }).run()
      remote.database.db.update(schema.materialTable).set({ properties: { density: 7.8 } }).where(eq(schema.materialTable.id, "material")).run()
      await run(remote.cloud.send("project", remote.actor))
      await run(local.cloud.fetch("project", local.actor.userId, IDENTITY))
      expect(await fail(local.cloud.apply("project", local.actor.userId, IDENTITY))).toMatchObject({ code: "conflict" })
      expect(local.database.db.select().from(schema.materialTable).get()?.properties).toEqual({ density: 2.7 })
      expect((await run(local.cloud.status("project", local.actor.userId))).localHead).toBe(before.localHead)
    } finally { await pair.close() }
  })

  test("invalid hashes and wrong workspace responses are refused before staging", async () => {
    const pair = await makePair()
    try {
      const { local, controls } = pair
      const first = await run(local.cloud.publish("project", local.actor, IDENTITY))
      controls.tamper = true
      expect(await fail(local.cloud.fetch("project", local.actor.userId, IDENTITY))).toMatchObject({ code: "invalid" })
      controls.tamper = false
      controls.workspace = "another-workspace"
      expect(await fail(local.cloud.fetch("project", local.actor.userId, IDENTITY))).toMatchObject({ code: "unauthorized" })
      expect(await run(local.cloud.status("project", local.actor.userId))).toMatchObject({ localHead: first.localHead, state: "applied" })
    } finally { await pair.close() }
  })

  test("missing assets prevent delivery; damaged cached assets prevent application", async () => {
    const pair = await makePair(true)
    try {
      const { local, remote } = pair
      await run(local.cloud.publish("project", local.actor, IDENTITY))
      await change(remote, 15)
      await run(remote.cloud.send("project", remote.actor))
      const downloaded = await run(local.cloud.fetch("project", local.actor.userId, IDENTITY))
      const transfer = await run(remote.cloud.remoteExport("project", remote.actor.userId))
      const asset = transfer.assets[0]
      if (!asset) throw new Error("fixture")
      await run(local.storage.upload(`cloud/assets/${asset.sha256}`, "damaged"))
      expect(await fail(local.cloud.apply("project", local.actor.userId, IDENTITY))).toMatchObject({ code: "missing-asset" })
      expect(width(local)).toBe(10)
      expect((await run(local.cloud.status("project", local.actor.userId))).localHead).toBe(downloaded.localHead)
      await run(remote.storage.delete(asset.key))
      expect(await fail(remote.cloud.send("project", remote.actor))).toMatchObject({ code: "missing-asset" })
    } finally { await pair.close() }
  })

  test("clone preserves identifiers and history instead of manufacturing a new Initial commit", async () => {
    const pair = await makePair()
    try {
      const { local, remote } = pair
      await run(local.cloud.publish("project", local.actor, IDENTITY))
      await change(remote, 18)
      const sent = await run(remote.cloud.send("project", remote.actor))
      local.database.db.delete(schema.projectTable).where(eq(schema.projectTable.id, "project")).run()
      const cloned = await run(local.cloud.clone("project", local.actor.userId, IDENTITY))
      expect(cloned).toMatchObject({ localHead: sent.localHead, state: "applied", dirty: false })
      expect(width(local)).toBe(18)
      expect(new Repository(sqliteBackend(local.database.db, "project")).log()).toHaveLength(2)
      expect(local.database.db.select().from(schema.toolpathTable).get()?.createdBy).toBe(local.actor.userId)
    } finally { await pair.close() }
  })

  test("delivery survives process restart and repeated receipts cannot downgrade applied", async () => {
    const pair = await makePair()
    let reopened: Install | undefined
    try {
      const { local, remote } = pair
      await run(local.cloud.publish("project", local.actor, IDENTITY))
      await change(remote, 14)
      const pending = await run(remote.cloud.send("project", remote.actor))
      await run(local.cloud.fetch("project", local.actor.userId, IDENTITY))
      await local.close(false)
      reopened = await makeInstall("desktop", pair.http, local.directory)
      expect(await run(reopened.cloud.status("project", reopened.actor.userId))).toMatchObject({ state: "downloaded" })
      await run(reopened.cloud.apply("project", reopened.actor.userId, IDENTITY))
      const device = await run(reopened.cloud.connection(reopened.actor.userId))
      await run(remote.cloud.receipt("project", remote.actor.userId, device.deviceId, pending.localHead ?? "", "downloaded"))
      expect(await run(remote.cloud.status("project", remote.actor.userId))).toMatchObject({ state: "applied" })
    } finally { if (reopened) await reopened.close(); await pair.remote.close() }
  })

  test("missing sign-in, inaccessible projects and remote outages preserve local data", async () => {
    const pair = await makePair()
    try {
      const { local, controls } = pair
      expect(await fail(local.cloud.projects(local.actor.userId, undefined))).toMatchObject({ code: "unauthorized" })
      expect(await fail(local.cloud.send("project", actor("other")))).toMatchObject({ code: "not-found" })
      await run(local.cloud.publish("project", local.actor, IDENTITY))
      controls.offline = true
      expect(await fail(local.cloud.fetch("project", local.actor.userId, IDENTITY))).toMatchObject({ code: "remote" })
      expect(width(local)).toBe(10)
      expect(await run(local.cloud.status("project", local.actor.userId))).toMatchObject({ state: "applied", dirty: false })
    } finally { await pair.close() }
  })
})

describe("cloud connection boundary", () => {
  test("accepts only public HTTPS origins without URL credentials or alternate ports", () => {
    expect(cloudOrigin("https://personal.example.workers.dev/")).toBe("https://personal.example.workers.dev")
    for (const invalid of ["http://example.com", "https://localhost", "https://127.0.0.1", "https://[::1]", "https://user:pass@example.com", "https://example.com/path", "https://example.com:8443", "https://example.com?token=value"]) expect(() => cloudOrigin(invalid)).toThrow()
  })

  test("connection tokens are write-only and owner-only on disk", async () => {
    const install = await makeInstall("connection", unreachable)
    try {
      const input = { origin: "https://personal.example.workers.dev", workspaceId: WORKSPACE, token: TOKEN }
      const result = await run(install.cloud.setConnection(install.actor.userId, input))
      expect(JSON.stringify(result)).not.toContain(TOKEN)
      expect((await stat(join(install.directory, "cloud-connections", `${sha256(install.actor.userId)}.json`))).mode & 0o777).toBe(0o600)
      expect(await run(install.cloud.connection(install.actor.userId))).toMatchObject({ configured: true })
      expect(await run(install.cloud.disconnect(install.actor.userId))).toMatchObject({ configured: false, deviceId: result.deviceId })
    } finally { await install.close() }
  })
})
