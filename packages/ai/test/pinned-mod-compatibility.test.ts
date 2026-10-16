import { afterAll, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

/**
 * The compatibility gate of spec 27 §4.3: `NIKCLI_DISABLE_MODS` may only be cleared for the pinned host bundle once this
 * test proves, against the real bundle, that the host then loads exactly the mod the app declares in its isolated
 * configuration — and nothing from a user's install. The probe is a child process: the host freezes paths and flags at
 * module load, once per process.
 */

const root = mkdtempSync(join(tmpdir(), "cadcam-mod-gate-"))
afterAll(() => rmSync(root, { recursive: true, force: true }))

const runProbe = async (modsEnabled: "1" | "0") => {
  const home = mkdtempSync(join(root, "home-"))
  const dataDir = mkdtempSync(join(root, "data-"))
  const child = Bun.spawn(["bun", join(import.meta.dir, "fixtures", "mod-probe.ts"), home, dataDir, modsEnabled], {
    env: { ...process.env, HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: "", XDG_DATA_HOME: "" },
    stdout: "pipe",
    stderr: "pipe"
  })
  const [out, err] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()])
  await child.exited
  const line = out.split("\n").find((l) => l.startsWith("PROBE_RESULT "))
  if (!line) throw new Error(`probe produced no result.\nstdout: ${out.slice(-800)}\nstderr: ${err.slice(-800)}`)
  return JSON.parse(line.slice("PROBE_RESULT ".length)) as {
    modsFlag: string | undefined
    liveLifecycleEvidence: unknown
    liveLifecycle: boolean
    appSpec: string
    loaded: ReadonlyArray<{ id: string; name: string; events: ReadonlyArray<string>; tools: ReadonlyArray<string> }>
    appLoaded: boolean
    appEvents: ReadonlyArray<string>
    sentinelLoaded: boolean
    sentinelConfigLoaded: boolean
    sentinelReads: ReadonlyArray<string>
  }
}

describe("the pinned bundle loads the app's mods and only those (spec 27 §4.3)", () => {
  test("with the flag cleared, the app's own mod loads with its hooks; the user's install stays unread", async () => {
    const result = await runProbe("1")
    expect(result.modsFlag).toBeUndefined()
    expect(result.appLoaded).toBe(true)
    expect(result.liveLifecycle, JSON.stringify(result.liveLifecycleEvidence)).toBe(true)
    // The host reports the events the module registered: proof the hook table, not just the import, went through.
    expect([...result.appEvents].sort()).toEqual(["prompt.submit", "tool.call"])
    // A user's global config declares a mod and both plugin folders hold one; none of it is loaded or even read.
    expect(result.sentinelLoaded).toBe(false)
    expect(result.sentinelConfigLoaded).toBe(false)
    expect(result.sentinelReads).toEqual([])
  }, 180_000)

  test("while the flag stands, even the app's own mod is refused", async () => {
    const result = await runProbe("0")
    expect(result.modsFlag).toBe("1")
    expect(result.appLoaded).toBe(false)
    expect(result.loaded).toEqual([])
  }, 180_000)
})
