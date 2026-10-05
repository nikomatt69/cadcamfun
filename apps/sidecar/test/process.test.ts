import { describe, expect, test } from "bun:test"
import { Database as SQLite } from "bun:sqlite"
import { existsSync, mkdtempSync, rmSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const entry = new URL("../src/main.ts", import.meta.url).pathname
const migrations = new URL("../../../packages/db/drizzle", import.meta.url).pathname
const token = "source-process-test-token"

async function start(dataDir: string) {
  const child = Bun.spawn([process.execPath, entry], {
    env: { ...process.env, CADCAMFUN_TOKEN: token, CADCAMFUN_DATA_DIR: dataDir, CADCAMFUN_MIGRATIONS_DIR: migrations },
    stdin: "pipe", stdout: "pipe", stderr: "pipe"
  })
  const errors = new Response(child.stderr).text()
  const reader = child.stdout.getReader()
  const decoder = new TextDecoder()
  const ready = (async () => {
    let output = ""
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) throw new Error(`Sidecar exited before ready: ${output}\n${await errors}`)
      output += decoder.decode(chunk.value, { stream: true })
      const newline = output.indexOf("\n")
      if (newline < 0) continue
      const event: unknown = JSON.parse(output.slice(0, newline))
      if (typeof event !== "object" || event === null || !("event" in event) || event.event !== "ready" || !("port" in event) || typeof event.port !== "number") {
        throw new Error(`Unexpected startup event: ${output}`)
      }
      expect(event.port).toBeGreaterThan(0)
      return `http://127.0.0.1:${event.port}`
    }
  })()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const base = await Promise.race([ready, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Sidecar ready timeout")), 10000)
    })])
    const call = (path: string, init: RequestInit = {}) => fetch(`${base}${path}`, {
      ...init, headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...init.headers },
      signal: AbortSignal.timeout(5000)
    })
    return { child, base, call, errors, reader }
  } catch (error) {
    child.kill("SIGKILL")
    await child.exited
    throw error
  } finally {
    clearTimeout(timer)
  }
}

async function exited(child: ReturnType<typeof Bun.spawn>) {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([child.exited, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Graceful shutdown timeout")), 10000)
    })])
  } finally {
    clearTimeout(timer)
  }
}

function assertDrained(dataDir: string) {
  const path = join(dataDir, "cadcamfun.db")
  // Check before opening SQLite: a new connection could hide a missing finalizer.
  expect(!existsSync(`${path}-wal`) || statSync(`${path}-wal`).size === 0).toBe(true)
  const sqlite = new SQLite(path)
  try {
    expect(sqlite.query("PRAGMA wal_checkpoint(PASSIVE)").get()).toMatchObject({ busy: 0, log: 0, checkpointed: 0 })
  } finally {
    sqlite.close()
  }
}

describe("source sidecar lifecycle", () => {
  for (const mode of ["eof", "shutdown", "sigterm"] as const) {
    test(`${mode} finalizes server and DB, persists projects across restart`, async () => {
      const dataDir = mkdtempSync(join(tmpdir(), "cadcamfun-process-"))
      let running: Awaited<ReturnType<typeof start>> | undefined
      try {
        running = await start(dataDir)
        expect((await running.call("/api/health")).status).toBe(200)
        expect((await fetch(`${running.base}/api/projects`)).status).toBe(401)
        expect((await running.call("/api/projects", { headers: { authorization: "Bearer wrong" } })).status).toBe(401)
        const created = await running.call("/api/projects", { method: "POST", body: JSON.stringify({ name: `Persist ${mode}` }) })
        expect(created.status).toBe(201)
        const project: unknown = await created.json()
        if (typeof project !== "object" || project === null || !("id" in project) || typeof project.id !== "string") throw new Error("Missing project id")
        expect(statSync(join(dataDir, "cadcamfun.db-wal")).size).toBeGreaterThan(0)

        if (mode === "eof") running.child.stdin.end()
        if (mode === "sigterm") running.child.kill("SIGTERM")
        if (mode === "shutdown") {
          running.child.stdin.write('not-json\n{"event":"ping"}\n{"event":"shut')
          running.child.stdin.flush()
          expect((await running.call("/api/health")).status).toBe(200)
          running.child.stdin.write('down"}\n')
          running.child.stdin.flush()
          // Keep stdin open: the JSON command itself must cause shutdown.
        }
        expect(await exited(running.child)).toBe(0)
        expect(await running.errors).not.toContain("checkpoint failed")
        await expect(fetch(`${running.base}/api/health`, { signal: AbortSignal.timeout(1000) })).rejects.toThrow()
        assertDrained(dataDir)
        await running.reader.cancel()

        running = await start(dataDir)
        const restored = await running.call(`/api/projects/${project.id}`)
        expect(restored.status).toBe(200)
        expect(await restored.json()).toMatchObject({ id: project.id, name: `Persist ${mode}` })
        running.child.stdin.end()
        expect(await exited(running.child)).toBe(0)
        assertDrained(dataDir)
      } finally {
        if (running) {
          if (running.child.exitCode === null) running.child.kill("SIGKILL")
          await running.child.exited
          await running.reader.cancel()
        }
        rmSync(dataDir, { recursive: true, force: true })
      }
    }, 30000)
  }
})
