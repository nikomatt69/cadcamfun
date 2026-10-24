import { describe, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createFetchTransport } from "../../mobile/modules/companion-net/transport.ts"
import { CompanionClient } from "../../mobile/lib/client.ts"
import { parsePairingGrant, redeemPairingLink } from "../../mobile/lib/pairing.ts"
import { fingerprintOf } from "../src/services/companion-gateway.ts"
import { sseParser } from "../../mobile/lib/sse.ts"

const entry = new URL("../src/main.ts", import.meta.url).pathname
const migrations = new URL("../../../packages/db/drizzle", import.meta.url).pathname
const token = "companion-e2e-main-token"

/** Boots the real sidecar process, as the Tauri shell does, and waits for its ready line. */
async function boot(dataDir: string) {
  const child = Bun.spawn([process.execPath, entry], {
    env: { ...process.env, CADCAMFUN_TOKEN: token, CADCAMFUN_DATA_DIR: dataDir, CADCAMFUN_MIGRATIONS_DIR: migrations, CADCAMFUN_AI_OFFLINE: "1" },
    stdin: "pipe", stdout: "pipe", stderr: "ignore",
  })
  const reader = child.stdout.getReader()
  let out = ""
  const deadline = Date.now() + 30_000
  while (!out.includes("\n")) {
    if (Date.now() > deadline) throw new Error("ready timeout")
    const { done, value } = await reader.read()
    if (done) throw new Error("sidecar exited early")
    out += new TextDecoder().decode(value)
  }
  const port = JSON.parse(out.split("\n")[0]!).port as number
  return { child, port, local: (path: string, init: RequestInit = {}) => fetch(`http://127.0.0.1:${port}${path}`, { ...init, headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...init.headers } }) }
}

describe("companion end to end", () => {
  test("phone writes reach the desktop host stream without a commit, and desktop writes refresh the phone", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "cadcamfun-companion-sync-"))
    const sidecar = await boot(dataDir)
    const controller = new AbortController()
    const tails: Promise<void>[] = []
    try {
      const gatewayPort = 20_000 + Math.floor(Math.random() * 20_000)
      await sidecar.local("/api/companion/enable", { method: "POST", body: JSON.stringify({ port: gatewayPort }) })
      const paired = await (await sidecar.local("/api/companion/pair", { method: "POST", body: JSON.stringify({ name: "Sync iPhone", host: "127.0.0.1" }) })).json()
      const pem = readFileSync(join(dataDir, "companion", "cert.pem"), "utf8")
      const pinned = ((url: string, init: RequestInit) => fetch(url, { ...init, tls: { ca: pem, checkServerIdentity: () => undefined } } as RequestInit)) as unknown as typeof fetch
      const pairing = await redeemPairingLink(paired.link, pinned)
      const phone = new CompanionClient(createFetchTransport(pairing, pinned))
      const desktopEvents: Record<string, unknown>[] = [], phoneEvents: Record<string, unknown>[] = []
      tails.push((async () => {
        const response = await sidecar.local("/api/events", { signal: controller.signal })
        expect(response.status).toBe(200)
        const parse = sseParser<Record<string, unknown>>(), decoder = new TextDecoder()
        for await (const chunk of response.body!) desktopEvents.push(...parse(decoder.decode(chunk, { stream: true })))
      })().catch((error) => { if (!controller.signal.aborted) throw error }))
      tails.push((async () => {
        for await (const event of phone.hostEvents(controller.signal)) phoneEvents.push(event as Record<string, unknown>)
      })().catch((error) => { if (!controller.signal.aborted) throw error }))
      await waitFor(() => desktopEvents.some((event) => event.type === "server.connected") && phoneEvents.some((event) => event.type === "server.connected"), 10_000)

      const project = await phone.createProject("Created on the phone")
      await waitFor(() => desktopEvents.some((event) => event.type === "resources.changed"), 10_000)
      expect((await (await sidecar.local("/api/projects")).json()).some((row: { id: string }) => row.id === project.id)).toBe(true)
      const drawing = await phone.createEntry(project.id, "drawings", "Phone drawing")
      await waitFor(() => desktopEvents.some((event) => event.type === "workspace.changed" && event.projectId === project.id), 10_000)
      const before = desktopEvents.length
      await phone.renameEntry("drawings", drawing.id, "Renamed on the phone")
      await waitFor(() => desktopEvents.slice(before).some((event) => event.type === "workspace.changed"), 10_000)
      expect((await (await sidecar.local(`/api/drawings/${drawing.id}`)).json()).name).toBe("Renamed on the phone")
      expect(desktopEvents.filter((event) => event.type === "commit")).toEqual([])

      const phoneBefore = phoneEvents.length
      await sidecar.local(`/api/drawings/${drawing.id}`, { method: "PUT", body: JSON.stringify({ name: "Renamed on desktop" }) })
      await waitFor(() => phoneEvents.slice(phoneBefore).some((event) => event.type === "workspace.changed"), 10_000)
      expect((await phone.workspaceDrawings(project.id)).some((row) => row.name === "Renamed on desktop")).toBe(true)

      const material = await phone.createMaterial("Phone aluminium", 2.7)
      expect((await (await sidecar.local("/api/materials")).json()).some((row: { id: string }) => row.id === material.id)).toBe(true)
    } finally {
      controller.abort()
      await Promise.allSettled(tails)
      sidecar.child.kill("SIGTERM")
      await sidecar.child.exited
      rmSync(dataDir, { recursive: true, force: true })
    }
  }, 60_000)
  test("a paired phone client drives history, a pull request and the Actions list over HTTPS; nothing else is reachable", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "cadcamfun-companion-"))
    const sidecar = await boot(dataDir)
    try {
      const gatewayPort = 20_000 + Math.floor(Math.random() * 20_000)
      // Off by default: the desktop UI enables it and shows a pairing QR.
      expect((await (await sidecar.local("/api/companion")).json()).enabled).toBe(false)
      const enabled = await (await sidecar.local("/api/companion/enable", { method: "POST", body: JSON.stringify({ port: gatewayPort }) })).json()
      expect(enabled).toMatchObject({ enabled: true, port: gatewayPort })
      const paired = await (await sidecar.local("/api/companion/pair", { method: "POST", body: JSON.stringify({ name: "Test iPhone", host: "127.0.0.1" }) })).json()

      const grant = parsePairingGrant(paired.link)
      expect(grant.baseUrl).toBe(`https://127.0.0.1:${gatewayPort}`)
      expect(paired.link).not.toContain("token=")
      // The phone pins the fingerprint from the QR; here we verify it matches what the gateway really serves.
      const pem = readFileSync(join(dataDir, "companion", "cert.pem"), "utf8")
      expect(fingerprintOf(pem)).toBe(grant.fingerprint)
      const pinned = ((url: string, init: RequestInit) => fetch(url, { ...init, tls: { ca: pem, checkServerIdentity: () => undefined } } as RequestInit)) as unknown as typeof fetch
      const pairing = await redeemPairingLink(paired.link, pinned)
      expect(pairing.token).not.toBe(grant.code)
      expect((await pinned(`${grant.baseUrl}/api/companion/redeem`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: grant.code }) })).status).toBe(400)
      const phone = new CompanionClient(createFetchTransport(pairing, pinned))

      const project = await (await sidecar.local("/api/projects", { method: "POST", body: JSON.stringify({ name: "Bracket" }) })).json()
      await sidecar.local(`/api/projects/${project.id}/drawings`, { method: "POST", body: JSON.stringify({ name: "Plate", data: { w: 100 } }) })

      expect((await phone.projects()).map((p) => p.name)).toEqual(["Bracket"])
      await phone.commit(project.id, "Initial import")
      expect((await phone.log(project.id)).map((c) => c.message.trim())).toEqual(["Initial import", "Initial commit"])
      expect(await phone.runs(project.id)).toEqual([])
      expect((await phone.branches(project.id)).current).toBe("main")

      // Not reachable from a phone, even with a valid companion token:
      const denied = await pinned(`${pairing.baseUrl}/api/ai/credentials`, { method: "PUT", headers: { authorization: `Bearer ${pairing.token}` } })
      expect(denied.status).toBe(403)
      expect((await pinned(`${pairing.baseUrl}/api/companion`, { headers: { authorization: `Bearer ${pairing.token}` } })).status).toBe(403)
      // The sidecar's own token is not a companion token.
      expect((await pinned(`${pairing.baseUrl}/api/projects`, { headers: { authorization: `Bearer ${token}` } })).status).toBe(401)

      // Revoking from the desktop cuts the phone off at once.
      const status = await (await sidecar.local("/api/companion")).json()
      expect(status.devices).toHaveLength(1)
      expect(status.devices[0].email).toBe("local@cadcamfun.local")
      await sidecar.local(`/api/companion/devices/${status.devices[0].id}`, { method: "DELETE" })
      expect(await phone.projects().then(() => "ok", (e) => e.status)).toBe(401)
    } finally {
      sidecar.child.kill("SIGTERM")
      await sidecar.child.exited
      rmSync(dataDir, { recursive: true, force: true })
    }
  }, 60_000)

  test("a paired phone receives live frames as the desktop writes, over the forwarded SSE stream", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "cadcamfun-companion-"))
    const sidecar = await boot(dataDir)
    try {
      const gatewayPort = 20_000 + Math.floor(Math.random() * 20_000)
      await sidecar.local("/api/companion/enable", { method: "POST", body: JSON.stringify({ port: gatewayPort }) })
      const paired = await (await sidecar.local("/api/companion/pair", { method: "POST", body: JSON.stringify({ name: "Test iPhone", host: "127.0.0.1" }) })).json()
      const pem = readFileSync(join(dataDir, "companion", "cert.pem"), "utf8")
      const pinned = ((url: string, init: RequestInit) => fetch(url, { ...init, tls: { ca: pem, checkServerIdentity: () => undefined } } as RequestInit)) as unknown as typeof fetch
      const pairing = await redeemPairingLink(paired.link, pinned)
      const phone = new CompanionClient(createFetchTransport(pairing, pinned))

      const project = await (await sidecar.local("/api/projects", { method: "POST", body: JSON.stringify({ name: "Bracket" }) })).json()
      const draw = await (await sidecar.local(`/api/projects/${project.id}/drawings`, { method: "POST", body: JSON.stringify({ name: "Plate", data: { w: 100 } }) })).json()

      // Tail the stream *before* writing, exactly like the app does when a project screen opens.
      const ac = new AbortController()
      const seen: Array<Record<string, unknown>> = []
      const tail = (async () => {
        for await (const frame of phone.events(project.id, ac.signal)) seen.push(frame as Record<string, unknown>)
      })().catch(() => {})
      await sleep(250)

      await sidecar.local(`/api/projects/${project.id}/vcs/commit`, { method: "POST", body: JSON.stringify({ message: "Initial import" }) })
      await waitFor(() => seen.some((f) => f.type === "commit"), 10_000)

      // A pull request the phone has to review arrives on the same channel.
      await sidecar.local(`/api/projects/${project.id}/vcs/branches`, { method: "POST", body: JSON.stringify({ name: "ai/widen" }) })
      await sidecar.local(`/api/projects/${project.id}/vcs/checkout`, { method: "POST", body: JSON.stringify({ branch: "ai/widen" }) })
      await sidecar.local(`/api/drawings/${draw.id}`, { method: "PUT", body: JSON.stringify({ data: { w: 140 } }) })
      await sidecar.local(`/api/projects/${project.id}/vcs/commit`, { method: "POST", body: JSON.stringify({ message: "Widen", authorKind: "ai" }) })
      await sidecar.local(`/api/projects/${project.id}/pulls`, { method: "POST", body: JSON.stringify({ title: "Widen plate", head: "ai/widen", authorKind: "ai" }) })
      await waitFor(() => seen.some((f) => f.type === "pr.opened"), 10_000)

      ac.abort()
      await tail

      expect(seen.find((f) => f.type === "commit")).toMatchObject({ projectId: project.id, branch: "main", authorKind: "user" })
      expect(seen.find((f) => f.type === "pr.opened")).toMatchObject({ number: 1, authorKind: "ai", head: "ai/widen", base: "main" })
    } finally {
      sidecar.child.kill("SIGTERM")
      await sidecar.child.exited
      rmSync(dataDir, { recursive: true, force: true })
    }
  }, 90_000)
})

/** Polls `probe` until it holds, so a test never sleeps for the worst case. */
const waitFor = async (probe: () => boolean, timeoutMs: number): Promise<void> => {
  const deadline = Date.now() + timeoutMs
  while (!probe()) {
    if (Date.now() > deadline) throw new Error("condition not met in time")
    await sleep(25)
  }
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
