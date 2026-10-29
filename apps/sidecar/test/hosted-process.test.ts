import { expect, test } from "bun:test"
import { exportJWK, generateKeyPair, SignJWT } from "jose"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { CLOUD_INTERNAL_HEADER } from "../src/services/companion-gateway.ts"

const entry = new URL("../src/main.ts", import.meta.url).pathname
const migrations = new URL("../../../packages/db/drizzle", import.meta.url).pathname
const master = "hosted-lifecycle-private-core-token"
const internal = "hosted-lifecycle-private-coordinator-token"

const deadline = <A>(promise: Promise<A>, milliseconds: number, message: string): Promise<A> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  return Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(message)), milliseconds) })]).finally(() => clearTimeout(timer))
}

async function start(dataDir: string, issuer: string, port: number) {
  const child = Bun.spawn([process.execPath, "--no-env-file", entry], {
    env: {
      ...process.env,
      CADCAMFUN_RUNTIME: "server", CADCAMFUN_TOKEN: master, CADCAMFUN_DATA_DIR: dataDir, CADCAMFUN_MIGRATIONS_DIR: migrations,
      CADCAMFUN_GATEWAY_PORT: String(port), CADCAMFUN_PUBLIC_ORIGIN: "https://cloud.example.com", CADCAMFUN_WORKSPACE_ID: "lifecycle_workspace",
      CADCAMFUN_CLOUD_OWNER_SUBJECT: "owner", CADCAMFUN_CLOUD_INTERNAL_TOKEN: internal, CADCAMFUN_IDENTITY_ISSUER: issuer,
      CADCAMFUN_AI_OFFLINE: "1", CADCAMFUN_AI_HOST: "direct",
      CADCAMFUN_CLOUD_CHECKPOINT_URL: "", CADCAMFUN_CLOUD_CHECKPOINT_TOKEN: "", CADCAMFUN_CLOUD_EPOCH: "",
    },
    stdin: "pipe", stdout: "pipe", stderr: "pipe",
  })
  const errors = new Response(child.stderr).text()
  const reader = child.stdout.getReader()
  try {
    const base = await deadline((async () => {
      let output = ""
      const decoder = new TextDecoder()
      for (;;) {
        const chunk = await reader.read()
        if (chunk.done) throw new Error(`Hosted process exited before readiness: ${output}\n${await errors}`)
        output += decoder.decode(chunk.value, { stream: true })
        const newline = output.indexOf("\n")
        if (newline < 0) continue
        const event: unknown = JSON.parse(output.slice(0, newline))
        if (typeof event !== "object" || event === null || !("event" in event) || event.event !== "ready" || !("port" in event) || typeof event.port !== "number") throw new Error(`Hosted startup failed: ${output}`)
        return `http://127.0.0.1:${event.port}`
      }
    })(), 30_000, "Hosted startup timed out")
    const gateway = `http://127.0.0.1:${port}`
    await deadline((async () => {
      for (;;) {
        try {
          const response = await fetch(`${gateway}/internal/ready`, { headers: { [CLOUD_INTERNAL_HEADER]: internal }, signal: AbortSignal.timeout(1000) })
          if (response.ok) { await response.body?.cancel(); return }
          await response.body?.cancel()
        } catch { /* The API announces before its forwarding gateway finishes opening. */ }
        if (child.exitCode !== null) throw new Error("Hosted process exited while starting its gateway")
        await Bun.sleep(25)
      }
    })(), 10_000, "Hosted gateway did not become ready")
    const call = (path: string, init: RequestInit = {}) => fetch(`${base}${path}`, { ...init, headers: { authorization: `Bearer ${master}`, ...init.headers }, signal: AbortSignal.timeout(5000) })
    return { child, errors, reader, gateway, call }
  } catch (error) {
    child.kill("SIGKILL")
    await child.exited
    await reader.cancel()
    throw error
  }
}

test("hosted process survives stdin EOF, enrolls only its configured owner, and persists projects and grants across SIGTERM", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cadcamfun-hosted-process-"))
  const keys = await generateKeyPair("ES256")
  const jwk = { ...await exportJWK(keys.publicKey), kid: "hosted-process", alg: "ES256", use: "sig" }
  const issuerServer = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => Response.json({ keys: [jwk] }) })
  const issuer = `http://127.0.0.1:${issuerServer.port}`
  const reserve = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() })
  const port = reserve.port
  reserve.stop(true)
  if (!port) throw new Error("Could not reserve hosted gateway port")
  const identity = (subject: string) => new SignJWT({ email: "owner@example.com", client_id: "cadcamfun-mobile" }).setProtectedHeader({ alg: "ES256", kid: "hosted-process" }).setSubject(subject).setIssuer(issuer).setAudience("cadcamfun-api").setIssuedAt().setExpirationTime("15m").sign(keys.privateKey)
  let running: Awaited<ReturnType<typeof start>> | undefined
  try {
    running = await start(directory, issuer, port)
    running.child.stdin.end()
    expect((await running.call("/api/health")).status).toBe(200)
    const local = await (await running.call("/api/auth/get-session")).json() as { session: { user: { id: string } } }
    const enroll = (token: string) => fetch(`${running?.gateway}/internal/pair`, { method: "POST", headers: { [CLOUD_INTERNAL_HEADER]: internal, "x-identity-token": token, "content-type": "application/json" }, body: JSON.stringify({ name: "Travel phone" }) })
    expect((await enroll(await identity("other-account"))).status).toBe(401)
    const owner = await identity("owner")
    const enrolled = await enroll(owner)
    expect(enrolled.status).toBe(201)
    const pairing = await enrolled.json() as { id: string; link: string }
    const url = new URL(pairing.link)
    const token = url.searchParams.get("token")
    expect(token).toBeTruthy()
    expect(url.searchParams.get("mode")).toBe("cloud")
    expect(url.searchParams.get("workspace")).toBe("lifecycle_workspace")
    const account = await (await running.call("/api/auth/get-session", { headers: { "x-identity-token": owner } })).json() as { session: { user: { id: string } } }
    expect(account.session.user.id).toBe(local.session.user.id)
    const headers = { [CLOUD_INTERNAL_HEADER]: internal, "x-identity-token": owner, authorization: `Bearer ${token}`, "content-type": "application/json" }
    const created = await fetch(`${running.gateway}/api/projects`, { method: "POST", headers, body: JSON.stringify({ name: "Created with the PC off" }) })
    expect(created.status).toBe(201)
    const project = await created.json() as { id: string; name: string }
    expect((await fetch(`${running.gateway}/api/projects`, { headers: { [CLOUD_INTERNAL_HEADER]: internal, authorization: `Bearer ${token}` } })).status).toBe(401)
    running.child.kill("SIGTERM")
    expect(await deadline(running.child.exited, 10_000, "Hosted SIGTERM did not finish")).toBe(0)
    expect(await running.errors).not.toContain("checkpoint failed")
    await running.reader.cancel()
    running = await start(directory, issuer, port)
    running.child.stdin.end()
    const restored = await fetch(`${running.gateway}/api/projects/${project.id}`, { headers })
    expect(restored.status).toBe(200)
    expect(await restored.json()).toMatchObject({ id: project.id, name: "Created with the PC off" })
    expect((await fetch(`${running.gateway}/api/companion`, { headers })).status).toBe(403)
    running.child.kill("SIGTERM")
    expect(await deadline(running.child.exited, 10_000, "Restarted hosted SIGTERM did not finish")).toBe(0)
  } finally {
    if (running) {
      if (running.child.exitCode === null) running.child.kill("SIGKILL")
      await running.child.exited
      await running.reader.cancel().catch(() => undefined)
    }
    issuerServer.stop(true)
    await rm(directory, { recursive: true, force: true })
  }
}, 60_000)
