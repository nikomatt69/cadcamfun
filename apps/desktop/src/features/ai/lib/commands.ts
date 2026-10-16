/**
 * Slash commands for the assistant composer (spec 06-desktop-ui.md §1, spec 08-ai.md §3).
 *
 * The same idea as nikcli's `SlashCommandHandler`: a line that starts with `/` is
 * never sent to the model — it is resolved against this registry, and only a
 * command with no implementation of its own falls through to a canned prompt.
 *
 * Three kinds of command live here and all of them belong in one list:
 *  - **local** — they change the assistant or the panel (`/new`, `/compact`, `/stats`);
 *  - **panel** — they open one of the disclosures (`/sessions`, `/tools`, `/skills`);
 *  - **prompt** — they send a well-formed brief the agent can act on immediately
 *    (`/verify`, `/gcode`, `/check`), which is what turns a CAD/CAM assistant into
 *    something a machinist can drive with one keystroke.
 *
 * The module is deliberately framework-free: it only knows the shape of the host
 * it is given, so the registry, the parser and the matcher are unit-testable
 * without mounting a component.
 */
import type { AiStoreAndContext } from "../store/context.tsx"
import type { Key } from "../../../i18n/index.ts"

export type CommandGroup = "session" | "model" | "context" | "design" | "cam" | "library" | "version"

export const COMMAND_GROUP_ORDER: ReadonlyArray<CommandGroup> = [
  "session", "model", "context", "design", "cam", "library", "version"
]

/** What a command did, so the composer knows whether to send, clear or keep the draft. */
export type CommandOutcome =
  /** The command did its work; the composer clears itself. */
  | { readonly kind: "done" }
  /** The command turned into a prompt for the agent. */
  | { readonly kind: "prompt"; readonly prompt: string }
  /** Nothing to do (unknown sub-argument): the draft stays so the user can fix it. */
  | { readonly kind: "rejected"; readonly reason: string }

/**
 * What a command is allowed to touch. Deliberately narrow: the registry never
 * reaches into the Solid tree, so it can be exercised in a plain unit test.
 */
export interface CommandHost {
  readonly ai: AiStoreAndContext
  /** Sends a prompt exactly as if the user had typed it and pressed Enter. */
  send(prompt: string): Promise<void>
  /** Replaces the composer draft (used by commands that prefill a prompt). */
  setDraft(next: string): void
  /** Opens one of the panel disclosures; passing the open one closes it. */
  togglePanel(panel: "sessions" | "tools" | "skills" | "stats" | "context" | "help"): void
  /** One-line feedback in the panel, for commands that have nothing else to show. */
  notify(message: string, tone?: "info" | "error"): void
}

export interface SlashCommand {
  /** Primary name, typed without the slash. */
  readonly name: string
  /** Other names that resolve to the same command. */
  readonly aliases?: ReadonlyArray<string>
  readonly group: CommandGroup
  /** Short label in the palette. */
  readonly title: Key
  /** One line explaining what it does, shown under the label. */
  readonly description: Key
  /** Argument hint, e.g. `<provider>/<model>`. Empty when it takes nothing. */
  readonly args?: string
  /** Extra words the palette matches on, beyond the name and the description. */
  readonly keywords?: ReadonlyArray<string>
  run(input: CommandInput): CommandOutcome | Promise<CommandOutcome>
}

export interface CommandInput {
  readonly args: string
  readonly host: CommandHost
}

const done: CommandOutcome = { kind: "done" }
const reject = (reason: string): CommandOutcome => ({ kind: "rejected", reason })

/** Renders a command with no argument as a fixed prompt. */
const prompt = (text: string) => (): CommandOutcome => ({ kind: "prompt", prompt: text })

const MODES = ["general", "cad", "cam", "gcode", "toolpath"] as const
const PERMISSIONS = ["auto", "ask", "approve"] as const

/** `mm` tolerance on the argument so `/mode CAD` and `/mode cad` both work. */
const normalise = (value: string): string => value.trim().toLowerCase()

const oneOf = <A extends string>(value: string, allowed: ReadonlyArray<A>): A | undefined =>
  allowed.find((candidate) => candidate === normalise(value))

/** Every name a command answers to, primary first. */
export const commandNames = (command: SlashCommand): ReadonlyArray<string> => [command.name, ...(command.aliases ?? [])]

/**
 * The registry, grouped the way the palette shows it. Order inside a group is the
 * order a user reaches for: the destructive or rare ones sit at the end.
 */
export const COMMANDS: ReadonlyArray<SlashCommand> = [
  // ── Conversation ──────────────────────────────────────────────────────────
  {
    name: "help",
    aliases: ["commands", "?"],
    group: "session",
    title: "ai.cmd.help",
    description: "ai.cmd.help.desc",
    keywords: ["list", "what can i do", "palette"],
    run: ({ host }) => { host.togglePanel("help"); return done }
  },
  {
    // nikcli's `/goal`: the agent works toward a condition on its own until it is met, blocked or out of budget. The line goes to the
    // host's own command (`packages/ai/src/nikcli/goal.ts`), so `status`, `pause`, `resume` and `clear` act on the session's goal.
    name: "goal",
    aliases: ["objective"],
    group: "session",
    title: "ai.cmd.goal",
    description: "ai.cmd.goal.desc",
    args: "[objective [--token-budget N] | pause | resume | clear | status]",
    keywords: ["autonomous", "objective", "until", "continue", "budget", "pause", "resume"],
    run: ({ args }) => {
      const text = args.trim()
      const budget = /(?:^|\s)--token-budget(?:\s+(\S+))?(?=\s|$)/.exec(text)
      if (budget !== null && !/^\d+$/.test(budget[1] ?? "")) return reject("ai.cmd.goal.budget")
      return { kind: "prompt", prompt: text === "" ? "/goal" : `/goal ${text}` }
    }
  },
  {
    name: "new",
    aliases: ["fresh"],
    group: "session",
    title: "ai.cmd.new",
    description: "ai.cmd.new.desc",
    keywords: ["conversation", "start", "reset"],
    run: ({ host }) => { host.ai.newSession(); return done }
  },
  {
    name: "clear",
    group: "session",
    title: "ai.cmd.clear",
    description: "ai.cmd.clear.desc",
    keywords: ["empty", "wipe", "reset"],
    run: ({ host }) => { host.ai.clear(); return done }
  },
  {
    name: "sessions",
    aliases: ["history"],
    group: "session",
    title: "ai.cmd.sessions",
    description: "ai.cmd.sessions.desc",
    keywords: ["conversations", "past", "chats"],
    run: ({ host }) => { host.togglePanel("sessions"); return done }
  },
  {
    name: "export",
    group: "session",
    title: "ai.cmd.export",
    description: "ai.cmd.export.desc",
    keywords: ["markdown", "save", "copy", "transcript"],
    run: async ({ host }) => {
      const { transcriptMarkdown } = await import("./transcript-markdown.ts")
      const markdown = transcriptMarkdown(host.ai)
      if (markdown === "") return reject("ai.cmd.export.empty")
      try {
        await navigator.clipboard.writeText(markdown)
        host.notify(markdown.length.toLocaleString())
      } catch {
        return reject("ai.cmd.export.failed")
      }
      return done
    }
  },
  {
    name: "stop",
    aliases: ["abort", "cancel"],
    group: "session",
    title: "ai.cmd.stop",
    description: "ai.cmd.stop.desc",
    keywords: ["halt", "interrupt", "esc"],
    run: ({ host }) => { host.ai.abort(); return done }
  },

  // ── Model and behaviour ───────────────────────────────────────────────────
  {
    name: "model",
    group: "model",
    title: "ai.cmd.model",
    description: "ai.cmd.model.desc",
    args: "[provider/model]",
    keywords: ["switch", "provider", "gpt", "claude", "minimax"],
    run: ({ args, host }) => {
      if (args.trim() === "") { host.togglePanel("context"); return done }
      const wanted = normalise(args).replace(/\s+/g, "")
      const models = host.ai.models()
      const match = models.find((model) => `${model.provider}/${model.id}`.toLowerCase() === wanted)
        ?? models.find((model) => model.id.toLowerCase() === wanted)
      if (match === undefined) return reject("ai.cmd.model.unknown")
      if (!match.configured) return reject("ai.cmd.model.unconfigured")
      host.ai.setModel({ provider: match.provider, model: match.id, ...(match.tier === undefined ? {} : { tier: match.tier }) })
      return done
    }
  },
  {
    name: "agent",
    group: "model",
    title: "ai.cmd.agent",
    description: "ai.cmd.agent.desc",
    args: "[id]",
    keywords: ["role", "general", "cad", "cam", "coordinator"],
    run: ({ args, host }) => {
      const wanted = normalise(args)
      if (wanted === "") { host.notify(host.ai.agents().find((agent) => agent.id === host.ai.agent())?.title ?? host.ai.agent()); return done }
      const match = host.ai.agents().find((agent) => agent.id === wanted || normalise(agent.title) === wanted)
      if (match === undefined) return reject("ai.cmd.agent.unknown")
      host.ai.setAgent(match.id)
      return done
    }
  },
  {
    name: "mode",
    group: "model",
    title: "ai.cmd.mode",
    description: "ai.cmd.mode.desc",
    args: "[general|cad|cam|gcode|toolpath]",
    keywords: ["cad", "cam", "gcode", "toolpath", "domain"],
    run: ({ args, host }) => {
      // Built-in modes by name; a contributed mode by its namespaced id (`<pluginId>:<id>`), lower-cased like the rest.
      const wanted = oneOf(args, MODES) ?? host.ai.pluginModes().find((mode) => mode.id.toLowerCase() === normalise(args))?.id
      if (wanted === undefined) return reject("ai.cmd.mode.unknown")
      host.ai.setMode(wanted)
      return done
    }
  },
  {
    name: "permissions",
    aliases: ["perms", "approval"],
    group: "model",
    title: "ai.cmd.permissions",
    description: "ai.cmd.permissions.desc",
    args: "[auto|ask|approve]",
    keywords: ["allow", "ask", "approve", "auto"],
    run: ({ args, host }) => {
      const wanted = oneOf(args, PERMISSIONS)
      if (wanted === undefined) return reject("ai.cmd.permissions.unknown")
      host.ai.setPermissionMode(wanted)
      return done
    }
  },
  {
    name: "thinking",
    aliases: ["variant", "reasoning"],
    group: "model",
    title: "ai.cmd.thinking",
    description: "ai.cmd.thinking.desc",
    args: "[variant]",
    keywords: ["effort", "reason", "variant"],
    run: ({ args, host }) => {
      const current = host.ai.model()
      if (current === undefined) return reject("ai.cmd.model.unknown")
      const wanted = normalise(args)
      if (wanted === "" || wanted === "default" || wanted === "off") {
        // Dropping the variant lets the provider pick its own default again.
        const { variant: _dropped, ...model } = current
        host.ai.setModel(model)
        return done
      }
      const provider = host.ai.providers().find((entry) => entry.id === current.provider)
      const variant = provider?.models
        .find((entry) => entry.id === current.model)
        ?.variants?.find((candidate) => normalise(candidate) === wanted)
      if (variant === undefined) return reject("ai.cmd.thinking.unknown")
      host.ai.setModel({ ...current, variant })
      return done
    }
  },
  {
    name: "context",
    aliases: ["ctx"],
    group: "context",
    title: "ai.cmd.context",
    description: "ai.cmd.context.desc",
    args: "[on|off]",
    keywords: ["drawing", "workspace", "include"],
    run: ({ args, host }) => {
      const wanted = normalise(args)
      if (wanted === "" || wanted === "on" || wanted === "off") {
        if (wanted === "") { host.togglePanel("context"); return done }
        host.ai.setIncludeContext(wanted === "on")
        return done
      }
      return reject("ai.cmd.context.unknown")
    }
  },
  {
    name: "compact",
    aliases: ["summarise", "summarize"],
    group: "context",
    title: "ai.cmd.compact",
    description: "ai.cmd.compact.desc",
    keywords: ["token", "window", "shorten", "memory"],
    run: ({ host }) => { void host.ai.compact(); return done }
  },
  {
    name: "memory",
    aliases: ["brain"],
    group: "context",
    title: "ai.cmd.memory",
    description: "ai.cmd.memory.desc",
    keywords: ["consolidate", "learn", "notes"],
    run: ({ host }) => { void host.ai.consolidateMemory(); return done }
  },
  {
    name: "stats",
    aliases: ["tokens", "usage"],
    group: "context",
    title: "ai.cmd.stats",
    description: "ai.cmd.stats.desc",
    keywords: ["tokens", "cost", "session", "counters"],
    run: ({ host }) => { host.togglePanel("stats"); return done }
  },
  {
    name: "tools",
    group: "context",
    title: "ai.cmd.tools",
    description: "ai.cmd.tools.desc",
    keywords: ["catalogue", "available", "permissions", "allow-list"],
    run: ({ host }) => { host.togglePanel("tools"); return done }
  },
  {
    name: "skills",
    group: "context",
    title: "ai.cmd.skills",
    description: "ai.cmd.skills.desc",
    keywords: ["playbook", "markdown", "load"],
    run: ({ host }) => { host.togglePanel("skills"); return done }
  },

  // ── Design ───────────────────────────────────────────────────────────────
  {
    name: "describe",
    aliases: ["drawing", "inspect"],
    group: "design",
    title: "ai.cmd.describe",
    description: "ai.cmd.describe.desc",
    keywords: ["entities", "layers", "counts", "what is this"],
    run: prompt("Describe the active drawing: entity counts by type, layer structure, overall bounds and units. Do not change anything.")
  },
  {
    name: "check",
    aliases: ["review", "validate"],
    group: "design",
    title: "ai.cmd.check",
    description: "ai.cmd.check.desc",
    keywords: ["errors", "problems", "doubles", "floating", "quality"],
    run: prompt("Check the 3D model for design errors — duplicate bodies, floating parts, wrong units or rotation, zero-thickness features — and list what you find with the element ids.")
  },
  {
    name: "selection",
    aliases: ["selected"],
    group: "design",
    title: "ai.cmd.selection",
    description: "ai.cmd.selection.desc",
    keywords: ["selected", "highlighted", "picked"],
    run: prompt("Describe what is currently selected in the drawing, then suggest one low-risk improvement to it. Ask before changing anything.")
  },

  // ── CAM ──────────────────────────────────────────────────────────────────
  {
    name: "operations",
    aliases: ["ops"],
    group: "cam",
    title: "ai.cmd.operations",
    description: "ai.cmd.operations.desc",
    keywords: ["toolpath", "list", "strategy"],
    run: prompt("List the CAM operations of the active drawing with their strategy, tool, depth and stepdown, and flag anything that looks inconsistent.")
  },
  {
    name: "params",
    aliases: ["parameters", "feeds"],
    group: "cam",
    title: "ai.cmd.params",
    description: "ai.cmd.params.desc",
    keywords: ["depth", "stepdown", "speed", "chip load", "suggest"],
    run: prompt("Suggest depth, stepdown, cutting speed and chip load for the current operations, based on the tools and materials in the library. Explain each choice before changing anything.")
  },
  {
    name: "gcode",
    aliases: ["generate", "post"],
    group: "cam",
    title: "ai.cmd.gcode",
    description: "ai.cmd.gcode.desc",
    keywords: ["nc", "output", "post processor", "run cam"],
    run: prompt("Generate the G-code for the current operations and report the cycle time, the number of blocks and any post-processor warnings.")
  },
  {
    name: "verify",
    aliases: ["simulate"],
    group: "cam",
    title: "ai.cmd.verify",
    description: "ai.cmd.verify.desc",
    keywords: ["simulation", "collision", "gouge", "stock"],
    run: prompt("Verify the current toolpath on the stock. Tell me the material removal, any rapid moves into material, shank or fixture collisions and gouges, and what the simulation does not model.")
  },
  {
    name: "analyze",
    aliases: ["analyse", "check-gcode"],
    group: "cam",
    title: "ai.cmd.analyze",
    description: "ai.cmd.analyze.desc",
    keywords: ["safety", "limits", "rapids", "spindle", "static"],
    run: prompt("Analyse the current G-code statically: travel limits, rapids below Z0, missing spindle commands, feedrates outside the machine envelope. Report every finding with its line.")
  },
  {
    name: "estimate",
    aliases: ["cost", "price"],
    group: "cam",
    title: "ai.cmd.estimate",
    description: "ai.cmd.estimate.desc",
    keywords: ["cost", "quote", "time", "price", "money"],
    run: prompt("Estimate the production cost of the current toolpath — machine time, tooling and setup — and explain the breakdown so I can sanity-check it.")
  },

  // ── Library ──────────────────────────────────────────────────────────────
  {
    name: "material",
    aliases: ["materials"],
    group: "library",
    title: "ai.cmd.material",
    description: "ai.cmd.material.desc",
    keywords: ["alloy", "aluminium", "steel", "lookup", "library"],
    run: prompt("List the materials in the library with the properties that matter for machining: hardness, cutting speeds and chip-load limits.")
  },
  {
    name: "tool",
    aliases: ["cutter"],
    group: "library",
    title: "ai.cmd.tool",
    description: "ai.cmd.tool.desc",
    keywords: ["endmill", "drill", "insert", "lookup", "library"],
    run: prompt("Recommend a tool from the library for the geometry in the active drawing. Give diameter, flute length, shank and why it fits this material and these operations.")
  },

  // ── Version control ──────────────────────────────────────────────────────
  {
    name: "status",
    aliases: ["vcs", "diff"],
    group: "version",
    title: "ai.cmd.status",
    description: "ai.cmd.status.desc",
    keywords: ["branch", "changes", "git", "review"],
    run: prompt("Show the version-control status of this project: current branch, uncommitted files and any open pull request, then summarise what is different from main.")
  },
  {
    name: "commit",
    group: "version",
    title: "ai.cmd.commit",
    description: "ai.cmd.commit.desc",
    keywords: ["save", "record", "change", "git"],
    run: prompt("Start a change on an ai/* branch for the work so far and commit it with a message that says what changed and why.")
  },
  {
    name: "pr",
    aliases: ["pull-request"],
    group: "version",
    title: "ai.cmd.pr",
    description: "ai.cmd.pr.desc",
    keywords: ["review", "merge", "pull request"],
    run: prompt("Open a pull request for the current ai/* branch with a summary of the change, what was verified and what a reviewer should look at.")
  }
]

const BY_NAME = new Map<string, SlashCommand>(
  COMMANDS.flatMap((command) => commandNames(command).map((name) => [name, command] as const))
)

/** The command a name resolves to, aliases included. */
export const findCommand = (name: string): SlashCommand | undefined => BY_NAME.get(normalise(name).replace(/^\//, ""))

export interface ParsedCommand {
  readonly name: string
  readonly args: string
}

/** `/model anthropic/claude` -> `{ name: "model", args: "anthropic/claude" }`. */
export const parseCommand = (input: string): ParsedCommand | undefined => {
  const text = input.trim()
  if (!text.startsWith("/")) return undefined
  const match = /^\/([a-zA-Z0-9?_-]+)\s*([\s\S]*)$/.exec(text)
  if (match === null) return undefined
  const [, name = "", args = ""] = match
  return { name: name.toLowerCase(), args: args.trim() }
}

/**
 * True while the composer should show the palette: a bare `/` or a command name
 * being typed. Leading whitespace is forgiven, but a trailing space means the
 * user has started typing an argument — the palette closes there, because from
 * that point on it could only echo noise back.
 */
export const isCommandDraft = (input: string): boolean => /^\/[a-zA-Z0-9?_-]*$/.test(input.replace(/^\s+/, ""))

/**
 * Subsequence match, so `mv` finds `model` and `vfy` finds `verify`. Returns a
 * score (higher is better) or -1 when the query is not a subsequence of the text.
 */
const subsequenceScore = (query: string, text: string): number => {
  if (query === "") return 0
  const haystack = text.toLowerCase()
  const needle = query.toLowerCase()
  if (haystack === needle) return 1000
  if (haystack.startsWith(needle)) return 800 - (haystack.length - needle.length)
  const index = haystack.indexOf(needle)
  if (index >= 0) return 600 - index
  let position = 0
  let gaps = 0
  for (const char of needle) {
    const found = haystack.indexOf(char, position)
    if (found < 0) return -1
    gaps += found - position
    position = found + 1
  }
  return 400 - gaps
}

/**
 * The score a command gets for a query: name beats alias beats keyword.
 * A miss stays a miss whatever weight it carries, so weights are applied to the
 * score and a negative result is normalised back to "no match" afterwards.
 */
const commandScore = (command: SlashCommand, query: string): number => {
  const names = commandNames(command)
  const primary = names[0] ?? ""
  const scored: number[] = [subsequenceScore(query, primary)]
  for (const alias of names.slice(1)) scored.push(subsequenceScore(query, alias) * 0.9)
  for (const keyword of command.keywords ?? []) scored.push(subsequenceScore(query, keyword) * 0.6)
  const best = scored.reduce((top, value) => (value > top ? value : top), Number.NEGATIVE_INFINITY)
  return best < 0 ? Number.NEGATIVE_INFINITY : best
}

/**
 * The palette list for a query. An empty query returns every command in registry
 * order (grouped by the caller); a typed query ranks by name, then alias, then
 * keyword. Grouping never reorders the user's own ranking.
 */
export const searchCommands = (query: string, limit = 40): ReadonlyArray<SlashCommand> => {
  const trimmed = query.trim()
  if (trimmed === "") return COMMANDS.slice(0, limit)
  return COMMANDS
    .map((command, index) => ({ command, index, score: commandScore(command, trimmed.replace(/^\//, "")) }))
    .filter((entry) => entry.score > Number.NEGATIVE_INFINITY)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((entry) => entry.command)
}

/**
 * Runs the command a draft names. Returns `undefined` when the draft is not a
 * command at all, so the caller sends it to the model as usual.
 */
export const runCommand = async (input: string, host: CommandHost): Promise<CommandOutcome | undefined> => {
  const parsed = parseCommand(input)
  if (parsed === undefined) return undefined
  const command = findCommand(parsed.name)
  if (command === undefined) return { kind: "rejected", reason: "ai.cmd.unknown" }
  return command.run({ args: parsed.args, host })
}