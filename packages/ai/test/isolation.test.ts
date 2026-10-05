import { afterAll, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const root = mkdtempSync(join(tmpdir(), "cadcam-isolation-"))
afterAll(() => rmSync(root, { recursive: true, force: true }))

/** Plants what a real user's nikcli install would look like inside a FAKE home. */
const plantSentinels = (home: string) => {
  const config = {
    username: "SENTINEL_USER",
    agent: { sentinel_agent: { mode: "primary", prompt: "SENTINEL", description: "SENTINEL" } },
    provider: { sentinel_provider: { name: "SENTINEL", options: { baseURL: "http://127.0.0.1:1/v1" }, models: {} } }
  }
  for (const dir of [join(home, ".config", "nikcli"), join(home, ".nikcli")]) {
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, "nikcli.json"), JSON.stringify(config))
  }
  mkdirSync(join(home, ".local", "share", "nikcli"), { recursive: true })
  writeFileSync(
    join(home, ".local", "share", "nikcli", "auth.json"),
    JSON.stringify({ anthropic: { type: "api", key: "SENTINEL_KEY" } })
  )
  mkdirSync(join(home, ".claude"), { recursive: true })
  writeFileSync(join(home, ".claude", "CLAUDE.md"), "SENTINEL")
}

const runProbe = async (override: "1" | "0") => {
  const home = mkdtempSync(join(root, "home-"))
  const dataDir = mkdtempSync(join(root, "data-"))
  plantSentinels(home)
  const child = Bun.spawn(["bun", join(import.meta.dir, "fixtures", "isolation-probe.ts"), home, dataDir, override], {
    env: { ...process.env, HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: "", XDG_DATA_HOME: "" },
    stdout: "pipe",
    stderr: "pipe"
  })
  const [out, err] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()])
  await child.exited
  const line = out.split("\n").find((l) => l.startsWith("PROBE_RESULT "))
  if (!line) throw new Error(`probe produced no result.\nstdout: ${out.slice(-800)}\nstderr: ${err.slice(-800)}`)
  return { result: JSON.parse(line.slice("PROBE_RESULT ".length)) as Record<string, unknown>, home }
}

describe("embedded host never reads the user's nikcli state (spec 08 section 1.1)", () => {
  test("documented isolation variables alone are enough (HOME not overridden)", async () => {
    const { result, home } = await runProbe("0")
    expect(result["home"]).toBe(home)
    expect(result["configHasSentinel"]).toBe(false)
    expect(result["agentsHaveSentinel"]).toBe(false)
    expect(result["providersHaveSentinel"]).toBe(false)
    expect(result["sentinelPaths"]).toEqual([])
    expect(result["readsOwnConfig"]).toBe(true)
  }, 120_000)

  test("default setup also redirects HOME", async () => {
    const { result, home } = await runProbe("1")
    expect(result["home"]).not.toBe(home)
    expect(result["configHasSentinel"]).toBe(false)
    expect(result["agentsHaveSentinel"]).toBe(false)
    expect(result["sentinelPaths"]).toEqual([])
  }, 120_000)
})
