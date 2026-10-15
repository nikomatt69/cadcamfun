import { describe, expect, test } from "bun:test"
import { HUMAN_APPROVAL } from "../src/nikcli/permission-modes.ts"
import { MockLanguageModelV4 } from "ai/test"
import { Effect, Layer, Redacted, Stream } from "effect"
import { AiConfig } from "../src/ai-config.ts"
import { AiCredentials } from "../src/credentials.ts"
import { DirectModel } from "../src/direct-model.ts"
import { AiService } from "../src/service.ts"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { AiConfigError } from "../src/errors.ts"
import { resolveModel } from "../src/models.ts"
import { buildHostConfig } from "../src/nikcli/config.ts"
import { filterProviders, permittedTools, policyAllows, providerAllowed, readPolicyFile, toolAllowed, type PolicyStatement } from "../src/nikcli/policy.ts"
import { TOOL_IDS } from "../src/tools/registry.ts"

const deny = (action: string, resource: string): PolicyStatement => ({ effect: "deny", action, resource })
const allow = (action: string, resource: string): PolicyStatement => ({ effect: "allow", action, resource })

describe("policy statements (nikcli policy.ts semantics)", () => {
  test("with no statement everything is allowed", () => {
    expect(policyAllows([], { action: "tool.use", resource: "cam" })).toBe(true)
  })

  test("the last matching statement wins, in order", () => {
    const statements = [deny("provider.use", "*"), allow("provider.use", "anthropic")]
    expect(providerAllowed(statements, "anthropic")).toBe(true)
    expect(providerAllowed(statements, "openai")).toBe(false)
    // Reversed, the blanket deny comes last and takes the allow away.
    expect(providerAllowed([...statements].reverse(), "anthropic")).toBe(false)
  })

  test("a trailing * is a prefix match and anything else is exact", () => {
    const statements = [deny("tool.use", "cam_*")]
    expect(toolAllowed(statements, "cam_generate")).toBe(false)
    expect(toolAllowed(statements, "cam")).toBe(true)
    expect(toolAllowed([deny("tool.use", "cam")], "cam_generate")).toBe(true)
  })

  test("actions do not leak into each other", () => {
    const statements = [deny("tool.use", "*")]
    expect(providerAllowed(statements, "anthropic")).toBe(true)
    expect(toolAllowed(statements, "cad")).toBe(false)
  })

  test("filterProviders and permittedTools keep what the policy lets through", () => {
    const statements = [deny("provider.use", "open*"), deny("tool.use", "vcs_edit")]
    expect(Object.keys(filterProviders(statements, { anthropic: 1, openai: 2, openrouter: 3 }))).toEqual(["anthropic"])
    expect(permittedTools(statements, ["cad", "vcs_edit", "cam"])).toEqual(["cad", "cam"])
    expect(permittedTools([], ["cad"])).toEqual(["cad"])
  })
})

type Config = { experimental: { policies?: ReadonlyArray<PolicyStatement> }; agent: Record<string, { permission: Record<string, string> }> }
const REGISTERED = [...TOOL_IDS]

describe("the host configuration", () => {
  test("hands the statements to the host and denies a forbidden tool for the agent and every specialist", () => {
    const victim = REGISTERED.find((id) => id.startsWith("cam"))!
    const policies = [deny("tool.use", victim), deny("tool.use", "code_mode"), deny("provider.use", "minimax")]
    const config = buildHostConfig({ providers: [], toolIds: REGISTERED, systemPrompt: "x", policies }) as unknown as Config
    expect(config.experimental.policies).toEqual(policies)
    for (const [name, agent] of Object.entries(config.agent)) {
      if (name === "compaction" || agent.permission === undefined) continue
      expect(agent.permission[victim], `${name} must not hold ${victim}`).not.toBe("allow")
      expect(agent.permission[victim], `${name} must not ask for ${victim}`).not.toEqual(HUMAN_APPROVAL)
      expect(agent.permission[victim], `${name} must not ask for ${victim}`).not.toBe("ask")
      expect(agent.permission["code_mode"], `${name} must not run programs`).not.toBe("allow")
    }
    // The tools the policy did not name are untouched.
    const other = REGISTERED.find((id) => id !== victim && !id.startsWith("cam"))!
    expect(config.agent["cadcam"]!.permission[other]).toMatch(/^(allow|ask)$/)
  })

  test("without a policy the configuration carries no policies at all", () => {
    const config = buildHostConfig({ providers: [], toolIds: REGISTERED, systemPrompt: "x" }) as unknown as Config
    expect(config.experimental.policies).toBeUndefined()
  })
})

describe("the direct route", () => {
  const configured = new Set(["anthropic", "openai", "gateway"])

  test("never resolves a provider the policy denies, by choice or by default", () => {
    const policies = [deny("provider.use", "anthropic")]
    const chosen = resolveModel({ provider: "anthropic" }, { configured, policies })
    expect(chosen).toBeInstanceOf(AiConfigError)
    expect((chosen as AiConfigError).provider).toBe("anthropic")
    // No preference: the first builtin vendor is anthropic, so the next allowed one is picked.
    expect(resolveModel(undefined, { configured, policies })).toMatchObject({ provider: "openai", viaGateway: false })
  })

  test("the gateway does not launder a denied vendor", () => {
    const policies = [deny("provider.use", "anthropic")]
    const viaGateway = resolveModel({ provider: "anthropic", model: "claude-sonnet-4-5" }, { configured: new Set(["gateway"]), policies })
    expect(viaGateway).toBeInstanceOf(AiConfigError)
    const fine = resolveModel({ provider: "openai", model: "gpt-5" }, { configured: new Set(["gateway"]), policies })
    expect(fine).toMatchObject({ provider: "gateway", viaGateway: true })
  })

  test("an empty policy resolves exactly like no policy", () => {
    expect(resolveModel(undefined, { configured, policies: [] })).toEqual(resolveModel(undefined, { configured }))
  })
})

describe("readPolicyFile", () => {
  const withFile = async (content: string | undefined, run: (path: string) => Promise<void>) => {
    const dir = await mkdtemp(join(tmpdir(), "policy-"))
    try {
      const path = join(dir, "policy.json")
      if (content !== undefined) await writeFile(path, content)
      await run(path)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }

  test("a missing file means no policy", async () => {
    await withFile(undefined, async (path) => expect(await Effect.runPromise(readPolicyFile(path))).toEqual([]))
  })

  test("a valid file decodes to statements", async () => {
    await withFile(JSON.stringify([deny("provider.use", "*"), allow("provider.use", "anthropic")]), async (path) => {
      expect(await Effect.runPromise(readPolicyFile(path))).toEqual([deny("provider.use", "*"), allow("provider.use", "anthropic")])
    })
  })

  test("a present file that does not decode is an error, never an empty policy", async () => {
    for (const content of ["not json", JSON.stringify({ effect: "deny" }), JSON.stringify([{ effect: "maybe", action: "a", resource: "b" }]), JSON.stringify([{ effect: "deny", action: "", resource: "b" }])]) {
      await withFile(content, async (path) => {
        const failure = await Effect.runPromise(Effect.flip(readPolicyFile(path)))
        expect(failure).toBeInstanceOf(AiConfigError)
        expect(failure.message).toContain(path)
      })
    }
  })
})

describe("the assistant service under a policy", () => {
  const withPolicy = (policies: ReadonlyArray<PolicyStatement>) => {
    const base = Layer.mergeAll(AiCredentials.layer, AiConfig.layer({ dataDir: "/unused", forceGateway: false, policies }))
    return AiService.layer.pipe(Layer.provideMerge(DirectModel.layerWith(() => new MockLanguageModelV4()).pipe(Layer.provideMerge(base))))
  }

  test("the picker lists only the providers the policy lets through", async () => {
    const program = Effect.gen(function* () {
      const ai = yield* AiService
      return { models: yield* ai.models, providers: yield* ai.providers }
    })
    const open = await Effect.runPromise(program.pipe(Effect.provide(withPolicy([]))))
    expect(new Set(open.models.map((m) => m.provider)).has("openai")).toBe(true)
    const restricted = await Effect.runPromise(program.pipe(Effect.provide(withPolicy([deny("provider.use", "*"), allow("provider.use", "anthropic")]))))
    expect([...new Set(restricted.models.map((m) => m.provider))]).toEqual(["anthropic"])
    expect(restricted.providers.map((p) => p.id)).toEqual(["anthropic"])
  })

  test("a chat on a denied provider fails before any model call", async () => {
    const program = Effect.gen(function* () {
      const credentials = yield* AiCredentials
      const ai = yield* AiService
      yield* credentials.set("openai", Redacted.make("sk-test-1234"))
      return yield* Stream.runCollect(ai.chat({ message: "hi", model: { provider: "openai" } })).pipe(Effect.flip)
    })
    const failure = await Effect.runPromise(program.pipe(Effect.provide(withPolicy([deny("provider.use", "openai")]))))
    expect(failure).toBeInstanceOf(AiConfigError)
  })
})
