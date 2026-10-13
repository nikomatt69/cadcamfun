/**
 * The slash-command registry (spec 06-desktop-ui.md §1, spec 08-ai.md §3).
 *
 * The parser, the matcher and every command run against a stub host, so the
 * behaviour a user gets from typing `/` is pinned without mounting the panel.
 * The important invariants: a draft that is not a command still reaches the
 * model, a refused argument keeps the draft, and every command acts through the
 * store's typed client rather than poking at the DOM.
 */
import { describe, expect, test } from "bun:test"
import {
  COMMANDS,
  COMMAND_GROUP_ORDER,
  commandNames,
  findCommand,
  isCommandDraft,
  parseCommand,
  runCommand,
  searchCommands,
  type CommandHost,
  type CommandOutcome
} from "../src/features/ai/lib/commands.ts"
import { transcriptMarkdown } from "../src/features/ai/lib/transcript-markdown.ts"

/** Records what a command did, so a test can assert on the store, not on the UI. */
interface Recorder {
  readonly host: CommandHost
  readonly sent: ReadonlyArray<string>
  readonly drafts: ReadonlyArray<string>
  readonly panels: ReadonlyArray<string>
  readonly notices: ReadonlyArray<{ message: string; tone: string | undefined }>
}

const stubAi = (overrides: Record<string, unknown> = {}): CommandHost["ai"] => {
  const accessors = {
    model: () => ({ provider: "anthropic", model: "claude-sonnet-4" }),
    agents: () => [
      { id: "general", title: "General", description: "", tools: [], edits: true },
      { id: "cad", title: "CAD", description: "", tools: [], edits: true },
      { id: "cam", title: "CAM", description: "", tools: [], edits: true }
    ],
    agent: () => "general",
    mode: () => "general",
    providers: () => [
      {
        id: "anthropic",
        name: "Anthropic",
        source: "config",
        auth: ["api"],
        configured: true,
        models: [{ id: "claude-sonnet-4", name: "Sonnet 4", provider: "anthropic", contextWindow: 200_000, maxOutput: 8192, variants: ["thinking", "fast"], tools: true, vision: true, cost: { input: 3, output: 15 } }]
      }
    ],
    models: () => [
      { id: "claude-sonnet-4", provider: "anthropic", contextWindow: 200_000, tools: true, vision: true, configured: true },
      { id: "gpt-x", provider: "openai", contextWindow: 128_000, tools: true, vision: false, configured: false }
    ],
    sessions: () => [{ id: "s1", title: "Bracket", startedAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", exchanges: 2 }],
    sessionId: () => "s1",
    messages: () => []
  }
  return { ...accessors, ...overrides } as unknown as CommandHost["ai"]
}

const recorder = (ai: CommandHost["ai"] = stubAi()): Recorder => {
  const sent: string[] = [], drafts: string[] = [], panels: string[] = [], notices: Array<{ message: string; tone: string | undefined }> = []
  const host: CommandHost = {
    ai,
    send: async (prompt) => { sent.push(prompt) },
    setDraft: (next) => { drafts.push(next) },
    togglePanel: (panel) => { panels.push(panel) },
    notify: (message, tone) => { notices.push({ message, tone }) }
  }
  return { host, sent, drafts, panels, notices }
}

const run = async (input: string, rec = recorder()): Promise<CommandOutcome | undefined> =>
  runCommand(input, rec.host)

describe("command registry", () => {
  test("every command has a unique primary name and a known group", () => {
    const names = COMMANDS.map((command) => command.name)
    expect(new Set(names).size).toBe(names.length)
    for (const command of COMMANDS) {
      expect(COMMAND_GROUP_ORDER).toContain(command.group)
      expect(command.title.startsWith("ai.cmd.")).toBe(true)
      expect(command.description.startsWith("ai.cmd.")).toBe(true)
    }
  })

  test("no alias collides with another command's name", () => {
    const primaries = new Set(COMMANDS.map((command) => command.name))
    for (const command of COMMANDS) {
      for (const alias of command.aliases ?? []) {
        expect(primaries.has(alias) && alias !== command.name).toBe(false)
      }
    }
  })

  test("resolves by primary name and by alias, case-insensitively", () => {
    expect(findCommand("verify")?.name).toBe("verify")
    expect(findCommand("/Verify")?.name).toBe("verify")
    expect(findCommand("simulate")?.name).toBe("verify")
    expect(findCommand("nope")).toBeUndefined()
  })

  test("every name of every command finds its own command", () => {
    for (const command of COMMANDS) {
      for (const name of commandNames(command)) {
        expect(findCommand(name)?.name).toBe(command.name)
      }
    }
  })
})

describe("command parsing", () => {
  test("splits name and arguments", () => {
    expect(parseCommand("/model anthropic/claude-sonnet-4")).toEqual({ name: "model", args: "anthropic/claude-sonnet-4" })
    expect(parseCommand("  /mode   cad  ")).toEqual({ name: "mode", args: "cad" })
    expect(parseCommand("/stop")).toEqual({ name: "stop", args: "" })
  })

  test("a plain message is not a command", () => {
    expect(parseCommand("model a part")).toBeUndefined()
    expect(parseCommand("")).toBeUndefined()
    expect(parseCommand("50% / 2")).toBeUndefined()
  })

  test("recognises the drafts the palette opens for", () => {
    expect(isCommandDraft("/")).toBe(true)
    expect(isCommandDraft("/ver")).toBe(true)
    expect(isCommandDraft("/verify ")).toBe(false)
    expect(isCommandDraft(" /verify")).toBe(true)
    expect(isCommandDraft("verify")).toBe(false)
  })
})

describe("command search", () => {
  test("an empty query lists everything in registry order", () => {
    expect(searchCommands("").map((command) => command.name)).toEqual(COMMANDS.map((command) => command.name))
  })

  test("a prefix ranks the tightest match first", () => {
    // One candidate: unambiguous.
    expect(searchCommands("ver")[0]?.name).toBe("verify")
    // Two candidates share the prefix; the shorter name is the tighter match.
    const names = searchCommands("mo").map((command) => command.name)
    expect(names.slice(0, 2).sort()).toEqual(["mode", "model"])
    expect(names[0]).toBe("mode")
  })

  test("matches a subsequence so short queries still find the command", () => {
    expect(searchCommands("vfy")[0]?.name).toBe("verify")
    expect(searchCommands("gc")[0]?.name).toBe("gcode")
  })

  test("finds by alias and by keyword", () => {
    expect(searchCommands("simulate")[0]?.name).toBe("verify")
    expect(searchCommands("cost")[0]?.name).toBe("estimate")
    expect(searchCommands("chip load")[0]?.name).toBe("params")
  })

  test("a query nothing matches returns nothing", () => {
    expect(searchCommands("zzzzqqq")).toEqual([])
  })
})

describe("running commands", () => {
  test("a message that is not a command is left to the caller", async () => {
    expect(await run("model a bracket")).toBeUndefined()
  })

  test("an unknown slash command is refused without touching the store", async () => {
    const rec = recorder()
    const outcome = await run("/nonsense", rec)
    expect(outcome).toEqual({ kind: "rejected", reason: "ai.cmd.unknown" })
    expect(rec.sent).toEqual([])
  })

  test("/new, /clear and /stop act on the store", async () => {
    const calls: string[] = []
    const rec = recorder(stubAi({
      newSession: () => { calls.push("new") },
      clear: () => { calls.push("clear") },
      abort: () => { calls.push("abort") }
    }))
    expect(await run("/new", rec)).toEqual({ kind: "done" })
    expect(await run("/clear", rec)).toEqual({ kind: "done" })
    expect(await run("/stop", rec)).toEqual({ kind: "done" })
    expect(calls).toEqual(["new", "clear", "abort"])
  })

  test("/model sets the model the store persists", async () => {
    let next: unknown
    const rec = recorder(stubAi({ setModel: (value: unknown) => { next = value } }))
    expect(await run("/model anthropic/claude-sonnet-4", rec)).toEqual({ kind: "done" })
    expect(next).toEqual({ provider: "anthropic", model: "claude-sonnet-4" })
  })

  test("/model accepts a bare model id and refuses an unknown or unconfigured one", async () => {
    const rec = recorder(stubAi({ setModel: () => undefined }))
    expect(await run("/model claude-sonnet-4", rec)).toEqual({ kind: "done" })
    expect(await run("/model nobody/nothing", rec)).toEqual({ kind: "rejected", reason: "ai.cmd.model.unknown" })
    expect(await run("/model openai/gpt-x", rec)).toEqual({ kind: "rejected", reason: "ai.cmd.model.unconfigured" })
  })

  test("/mode, /permissions and /agent validate their argument", async () => {
    const setMode = (value: string) => { calls.push(`mode:${value}`) }
    const setPermissionMode = (value: string) => { calls.push(`perm:${value}`) }
    const setAgent = (value: string) => { calls.push(`agent:${value}`) }
    const calls: string[] = []
    const rec = recorder(stubAi({ setMode, setPermissionMode, setAgent }))
    expect(await run("/mode cad", rec)).toEqual({ kind: "done" })
    expect(await run("/permissions auto", rec)).toEqual({ kind: "done" })
    expect(await run("/agent cad", rec)).toEqual({ kind: "done" })
    expect(calls).toEqual(["mode:cad", "perm:auto", "agent:cad"])
    expect(await run("/mode sculpting", rec)).toEqual({ kind: "rejected", reason: "ai.cmd.mode.unknown" })
    expect(await run("/permissions maybe", rec)).toEqual({ kind: "rejected", reason: "ai.cmd.permissions.unknown" })
    expect(await run("/agent architect", rec)).toEqual({ kind: "rejected", reason: "ai.cmd.agent.unknown" })
  })

  test("/thinking sets and clears the model variant", async () => {
    let current: Record<string, unknown> = { provider: "anthropic", model: "claude-sonnet-4", variant: "fast" }
    const rec = recorder(stubAi({ setModel: (value: unknown) => { current = value as Record<string, unknown> } }))
    expect(await run("/thinking thinking", rec)).toEqual({ kind: "done" })
    expect(current.variant).toBe("thinking")
    expect(await run("/thinking default", rec)).toEqual({ kind: "done" })
    expect(current.variant).toBeUndefined()
    expect(await run("/thinking turbo", rec)).toEqual({ kind: "rejected", reason: "ai.cmd.thinking.unknown" })
  })

  test("/context toggles the project context and opens the panel with no argument", async () => {
    let included: boolean | undefined
    const rec = recorder(stubAi({ setIncludeContext: (value: boolean) => { included = value } }))
    expect(await run("/context off", rec)).toEqual({ kind: "done" })
    expect(included).toBe(false)
    expect(await run("/context on", rec)).toEqual({ kind: "done" })
    expect(included).toBe(true)
    expect(await run("/context", rec)).toEqual({ kind: "done" })
    expect(rec.panels).toEqual(["context"])
  })

  test("/compact and /memory drive the host through the store's control call", async () => {
    const calls: string[] = []
    const rec = recorder(stubAi({
      compact: async () => { calls.push("compact") },
      consolidateMemory: async () => { calls.push("memory") }
    }))
    await run("/compact", rec)
    await run("/memory", rec)
    expect(calls).toEqual(["compact", "memory"])
  })

  test("panel commands open exactly one disclosure", async () => {
    const rec = recorder()
    for (const [command, panel] of [["sessions", "sessions"], ["tools", "tools"], ["skills", "skills"], ["stats", "stats"], ["help", "help"]] as const) {
      await run(`/${command}`, rec)
      expect(rec.panels.at(-1)).toBe(panel)
    }
  })

  test("prompt commands hand a brief back for the composer to send", async () => {
    const rec = recorder()
    for (const command of ["describe", "check", "operations", "params", "gcode", "verify", "analyze", "estimate", "material", "tool", "status", "commit", "pr", "selection"]) {
      const outcome = await run(`/${command}`, rec)
      expect(outcome?.kind).toBe("prompt")
      if (outcome?.kind === "prompt") expect(outcome.prompt.length).toBeGreaterThan(20)
    }
    // The registry never sends on its own — it returns the prompt and the composer delivers it.
    expect(rec.sent).toEqual([])
  })

  test("/export refuses when there is nothing to export", async () => {
    const rec = recorder()
    expect(await run("/export", rec)).toEqual({ kind: "rejected", reason: "ai.cmd.export.empty" })
  })

  test("a prompt outcome is what the composer sends, so the registry stays side-effect free", async () => {
    const rec = recorder()
    const outcome = await run("/verify", rec)
    expect(outcome?.kind).toBe("prompt")
    if (outcome?.kind !== "prompt") return
    // The composer is the one that calls send; the registry only produces the brief.
    await rec.host.send(outcome.prompt)
    expect(rec.sent).toHaveLength(1)
    expect(rec.sent[0]).toContain("Verify")
  })
})

describe("transcript markdown", () => {
  test("is empty when nothing was said", () => {
    expect(transcriptMarkdown(stubAi())).toBe("")
  })

  test("renders one section per message, skipping empty ones", () => {
    const markdown = transcriptMarkdown(stubAi({
      messages: () => [
        { id: "m1", role: "user", text: "Draw a plate", createdAt: "2026-01-01T10:00:00.000Z", events: [], status: "done" },
        { id: "m2", role: "assistant", text: "", createdAt: "2026-01-01T10:00:01.000Z", events: [], status: "streaming" },
        { id: "m3", role: "assistant", text: "Here it is.", createdAt: "2026-01-01T10:00:05.000Z", events: [], status: "done", model: "claude-sonnet-4" }
      ]
    }))
    expect(markdown.startsWith("# Bracket")).toBe(true)
    expect(markdown).toContain("## You")
    expect(markdown).toContain("## Assistant — claude-sonnet-4")
    expect(markdown).toContain("Draw a plate")
    expect(markdown).toContain("Here it is.")
    expect(markdown).not.toContain("m2")
  })

  test("lists the files a message carried", () => {
    const markdown = transcriptMarkdown(stubAi({
      messages: () => [
        { id: "m1", role: "user", text: "Import this", createdAt: "2026-01-01T10:00:00.000Z", events: [], status: "done", attachments: ["bracket.dxf"] }
      ]
    }))
    expect(markdown).toContain("Attachments: bracket.dxf")
  })
})

describe("/goal (nikcli's goal command)", () => {
  test("is a session command in the palette, found by name, alias and what it does", () => {
    expect(findCommand("goal")?.group).toBe("session")
    expect(findCommand("/Objective")?.name).toBe("goal")
    expect(searchCommands("goal")[0]?.name).toBe("goal")
    expect(searchCommands("autonomous").map((command) => command.name)).toContain("goal")
  })

  test("turns the line into the prompt the host's goal command takes, unchanged", async () => {
    expect(await run("/goal")).toEqual({ kind: "prompt", prompt: "/goal" })
    expect(await run("/goal   Machine the bracket and verify it ")).toEqual({ kind: "prompt", prompt: "/goal Machine the bracket and verify it" })
    expect(await run("/goal Rough the pocket --token-budget 80000")).toEqual({ kind: "prompt", prompt: "/goal Rough the pocket --token-budget 80000" })
    for (const sub of ["pause", "resume", "clear", "status"]) expect(await run(`/goal ${sub}`)).toEqual({ kind: "prompt", prompt: `/goal ${sub}` })
  })

  test("a malformed token budget is refused before anything is sent", async () => {
    for (const bad of ["/goal x --token-budget", "/goal x --token-budget abc", "/goal x --token-budget -1", "/goal x --token-budget 2.5"]) {
      expect(await run(bad), bad).toEqual({ kind: "rejected", reason: "ai.cmd.goal.budget" })
    }
  })
})
