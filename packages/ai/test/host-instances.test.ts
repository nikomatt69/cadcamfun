import { afterAll, describe, expect, setDefaultTimeout, test } from "bun:test"
import { Effect, Scope } from "effect"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { z } from "zod"
import { defaultProviderSpecs } from "../src/nikcli/config.ts"
import { HUMAN_APPROVAL } from "../src/nikcli/permission-modes.ts"
import { makeNikCliRuntime, type HostToolSpec } from "../src/nikcli/runtime.ts"
import { sharedDataDir } from "./helpers/host-env.ts"

setDefaultTimeout(120000)

const probe = (id: string, approval?: boolean): HostToolSpec => ({
  id, description: `Probe ${id}.`, parameters: z.object({}), execute: async () => JSON.stringify({ ok: true, id }),
  ...(approval ? { approval } : {})
})

/** Each project has its own tools; `extra` is changed by the tests to publish a new set. */
const extra = new Map<string, ReadonlyArray<HostToolSpec>>()
const listeners = new Set<() => void>()
const toolsFor = (projectId: string): ReadonlyArray<HostToolSpec> => [
  ...(projectId === "instances-alpha" ? [probe("probe_alpha")] : [probe("probe_beta", true)]),
  ...(extra.get(projectId) ?? [])
]
const scope = Effect.runSync(Scope.make())
const runtime = await Effect.runPromise(makeNikCliRuntime({
  dataDir: sharedDataDir, providers: defaultProviderSpecs(), systemPrompt: "You are a CAD test assistant.", toolsFor,
  toolChanges: (listener) => { listeners.add(listener); return () => listeners.delete(listener) }
}).pipe(Scope.provide(scope)))
afterAll(async () => { await Effect.runPromise(Scope.close(scope, { _tag: "Success", value: undefined } as never)) })

const hostOf = (projectId: string) => Effect.runPromise(runtime.host(projectId))
type Agents = Record<string, { permission?: Record<string, unknown> }>
const effectiveAgents = async (projectId: string): Promise<Agents> => ((await (await hostOf(projectId)).client.config.get()) as { agent: Agents }).agent
const registered = async (projectId: string): Promise<ReadonlyArray<string>> => (await hostOf(projectId)).client.experimental.toolIDs()

describe("one host configuration per project", () => {
  test("two projects with different allow-lists each see only their own, whichever host loaded last", async () => {
    const alpha = await hostOf("instances-alpha")
    await hostOf("instances-beta")
    // Alpha's configuration is read after beta's files were written: it must still be alpha's.
    const a = await effectiveAgents("instances-alpha")
    const b = await effectiveAgents("instances-beta")
    expect(a["cadcam"]!.permission!["probe_alpha"]).toBe("allow")
    expect(a["cadcam"]!.permission!["probe_beta"]).toBeUndefined()
    expect(b["cadcam"]!.permission!["probe_beta"]).toEqual(HUMAN_APPROVAL)
    expect(b["cadcam"]!.permission!["probe_alpha"]).toBeUndefined()
    // The shared file carries no project's agents; each project's file sits in its own scratch folder.
    const shared = JSON.parse(readFileSync(join(runtime.paths.config, "nikcli.json"), "utf8")) as Record<string, unknown>
    expect(shared["agent"]).toBeUndefined()
    expect(shared["provider"]).toBeDefined()
    expect(Object.keys(JSON.parse(readFileSync(join(alpha.directory, "nikcli.json"), "utf8")) as object).filter((key) => key !== "$schema")).toEqual(["agent"])
  })

  test("repeated replacement and removal release the old registrations and keep the same Instance", async () => {
    const before = await hostOf("instances-alpha")
    for (let round = 0; round < 3; round++) {
      extra.set("instances-alpha", [probe(`probe_round_${round}`)])
      await Effect.runPromise(runtime.reloadTools())
      const ids = await registered("instances-alpha")
      expect(ids).toContain(`probe_round_${round}`)
      // The previous round's tool left the set: its registration is closed, not only denied.
      if (round > 0) expect(ids).not.toContain(`probe_round_${round - 1}`)
      expect(ids.filter((id) => id === "probe_alpha")).toHaveLength(1)
      expect((await effectiveAgents("instances-alpha"))["cadcam"]!.permission![`probe_round_${round}`]).toBe("allow")
    }
    extra.delete("instances-alpha")
    await Effect.runPromise(runtime.reloadTools())
    expect((await registered("instances-alpha")).some((id) => id.startsWith("probe_round_"))).toBe(false)
    expect((await hostOf("instances-alpha")).client).toBe(before.client)
  })

  test("concurrent reloads of tools, skills and providers leave every project with its own configuration", async () => {
    extra.set("instances-beta", [probe("probe_beta_extra")])
    for (const listener of listeners) listener()
    await Promise.all([
      Effect.runPromise(runtime.reloadTools()),
      Effect.runPromise(runtime.reloadSkills()),
      Effect.runPromise(runtime.updateProviders(defaultProviderSpecs())),
      Effect.runPromise(runtime.reloadTools())
    ])
    const a = await effectiveAgents("instances-alpha")
    const b = await effectiveAgents("instances-beta")
    expect(a["cadcam"]!.permission!["probe_beta_extra"]).toBeUndefined()
    expect(b["cadcam"]!.permission!["probe_beta_extra"]).toBe("allow")
    expect(b["cadcam"]!.permission!["probe_alpha"]).toBeUndefined()
    expect(await registered("instances-beta")).toContain("probe_beta_extra")
    expect(await registered("instances-alpha")).not.toContain("probe_beta_extra")
  })
})
