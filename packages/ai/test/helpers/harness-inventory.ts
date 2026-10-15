/**
 * The harness inventory (Step 0 of `specs/ai/11-enterprise-harness-execution.md`): every action of the catalogue, every tool
 * prompt, every prompt layer, every skill and every composer command, each with the path that executes it.
 *
 * Everything model-visible is read from the modules themselves (the catalogue, the specialist roster, the primaries, the
 * prompt loaders, the skills). What a module cannot say about itself (which handler or contribution an action's `run` reaches,
 * where the sidecar implements it, which tests mention it) is found by reading the source, so a renamed handler or a removed
 * implementation shows up as a missing path instead of a stale table. A path found here is code evidence (C), never a
 * verification: the inventory does not run anything.
 *
 *   bun --no-env-file packages/ai/test/helpers/harness-inventory.ts           prints the Markdown
 *   bun --no-env-file packages/ai/test/helpers/harness-inventory.ts --write   rewrites specs/ai/11-harness-inventory.md
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { join, relative } from "node:path"
import { z } from "zod"
import { ACTION_CATALOGUE, ACTION_TOOL_IDS, nameOf, toolKind, toolOf } from "../../src/actions/catalogue.ts"
import type { ActionSpec } from "../../src/actions/action.ts"
import { SUBAGENTS, SUBAGENT_IDS } from "../../src/nikcli/agents.ts"
import { PRIMARIES, PRIMARY_IDS } from "../../src/nikcli/primaries.ts"
import { toolPrompt } from "../../src/tools/prompts/index.ts"
import { BASE_LAYERS, MODE_PROMPTS } from "../../src/prompts/system.ts"
import { CADCAM_SKILLS } from "../../src/skills/index.ts"
import * as workflows from "../../src/prompts/workflows.ts"
import type { PromptTemplate } from "../../src/prompts/workflows.ts"

export const REPO = join(import.meta.dir, "..", "..", "..", "..")
export const INVENTORY_PATH = join(REPO, "specs", "ai", "11-harness-inventory.md")

const read = (path: string): string => readFileSync(path, "utf8")
const rel = (path: string): string => relative(REPO, path)

const filesUnder = (dir: string, accept: (name: string) => boolean): ReadonlyArray<string> => {
  const out: Array<string> = []
  const walk = (current: string): void => {
    for (const name of readdirSync(current).sort()) {
      if (name === "node_modules" || name === "generated" || name.startsWith(".")) continue
      const path = join(current, name)
      if (statSync(path).isDirectory()) walk(path)
      else if (accept(name)) out.push(path)
    }
  }
  walk(dir)
  return out
}

const ACTIONS_DIR = join(REPO, "packages", "ai", "src", "actions")
const SIDECAR_SRC = join(REPO, "apps", "sidecar", "src")
const AI_SRC = join(REPO, "packages", "ai", "src")
const TEST_DIRS = ["packages/ai/test", "packages/api/test", "packages/api/src", "apps/sidecar/test", "apps/desktop/test"].map((dir) => join(REPO, dir))

// ---------------------------------------------------------------- source scanning

interface Declaration { readonly file: string; readonly body: string }

/**
 * Top-level `const`/`function` declarations of each action module, plus the names it imports from a sibling action module,
 * so a `run` that calls a helper is followed into it and nowhere else.
 */
const declarations = (): ReadonlyMap<string, ReadonlyMap<string, Declaration>> => {
  const own = new Map<string, Map<string, Declaration>>()
  const files = filesUnder(ACTIONS_DIR, (name) => name.endsWith(".ts"))
  for (const file of files) {
    const source = read(file)
    const map = new Map<string, Declaration>()
    const starts = [...source.matchAll(/^(?:export )?(?:const|async function|function) (\w+)/gm)]
    starts.forEach((match, index) => {
      const end = index + 1 < starts.length ? starts[index + 1]!.index : source.length
      map.set(match[1]!, { file, body: source.slice(match.index, end) })
    })
    own.set(file, map)
  }
  const scoped = new Map<string, ReadonlyMap<string, Declaration>>()
  for (const file of files) {
    const visible = new Map(own.get(file)!)
    for (const match of read(file).matchAll(/import \{([^}]+)\} from "\.\/([\w-]+)\.ts"/g)) {
      const sibling = own.get(join(ACTIONS_DIR, `${match[2]}.ts`))
      if (sibling === undefined) continue
      for (const name of match[1]!.split(",").map((part) => part.replace(/^\s*type\s+/, "").trim())) {
        const decl = sibling.get(name)
        if (decl !== undefined) visible.set(name, decl)
      }
    }
    scoped.set(file, visible)
  }
  return scoped
}

/** The source of one `defineAction`/`defineWireAction`/`contributedAction` entry: from its `id` to the next entry's `id`. */
const actionBlocks = (): ReadonlyMap<string, Declaration> => {
  const map = new Map<string, Declaration>()
  for (const file of filesUnder(ACTIONS_DIR, (name) => name.endsWith(".ts"))) {
    const source = read(file)
    const ids = [...source.matchAll(/\bid: "([a-z_]+\.[a-z_]+)"/g)]
    ids.forEach((match, index) => {
      const end = index + 1 < ids.length ? ids[index + 1]!.index : source.length
      map.set(match[1]!, { file, body: source.slice(match.index, end) })
    })
  }
  return map
}

export type Route =
  | { readonly kind: "handler"; readonly name: string; readonly at: ReadonlyArray<string> }
  | { readonly kind: "contribution"; readonly name: string; readonly at: ReadonlyArray<string> }
  | { readonly kind: "local"; readonly name: string; readonly at: ReadonlyArray<string> }

/** Where a name is implemented: an object member or a keyed entry (`name: (`, `name(`, `"name":`) outside the declaring package. */
const implementations = (roots: ReadonlyArray<string>, pattern: RegExp): ReadonlyArray<string> => {
  const hits: Array<string> = []
  for (const root of roots) {
    for (const file of filesUnder(root, (name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))) {
      read(file).split("\n").forEach((line, index) => { if (pattern.test(line)) hits.push(`${rel(file)}:${index + 1}`) })
    }
  }
  return hits
}

const escape = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

const routesOf = (id: string, blocks: ReadonlyMap<string, Declaration>, decls: ReadonlyMap<string, ReadonlyMap<string, Declaration>>): ReadonlyArray<Route> => {
  const block = blocks.get(id)
  if (block === undefined) return []
  const handlers = new Set<string>()
  const contributions = new Set<string>()
  const locals = new Set<string>()
  const seen = new Set<string>()
  const visit = (body: string, file: string, depth: number): void => {
    for (const match of body.matchAll(/handlers(?:\?\.|\.)(\w+)/g)) handlers.add(match[1]!)
    for (const match of body.matchAll(/contribution: "([a-z_]+\.[a-z_]+)"/g)) contributions.add(match[1]!)
    for (const match of body.matchAll(/\b(cam|cad)\.((?:\w+\.)?\w+)\(/g)) locals.add(`core ${match[1]}.${match[2]}`)
    if (depth >= 3) return
    // Only names that are called or passed as the implementation (`run: runImport`), never every word of the body.
    for (const match of body.matchAll(/\b([A-Za-z_]\w*)\s*(?:\(|<|\)?$)|run: ([A-Za-z_]\w*)/gm)) {
      const name = match[1] ?? match[2]!
      const decl = decls.get(file)?.get(name)
      if (decl === undefined || seen.has(`${decl.file}#${name}`)) continue
      seen.add(`${decl.file}#${name}`)
      visit(decl.body, decl.file, depth + 1)
    }
  }
  visit(block.body, block.file, 0)
  const routes: Array<Route> = []
  for (const name of [...handlers].sort()) {
    routes.push({ kind: "handler", name, at: implementations([SIDECAR_SRC], new RegExp(`^\\s+(?:async )?${escape(name)}(?:\\?)?(?::\\s*(?:async\\b|\\(|[a-zA-Z_]+\\b)|\\()`)) })
  }
  for (const name of [...contributions].sort()) {
    routes.push({ kind: "contribution", name, at: implementations([SIDECAR_SRC, join(AI_SRC, "nikcli")], new RegExp(`^\\s+"${escape(name)}":`)) })
  }
  if (routes.length === 0) {
    // A pure implementation inside the package (validation, recipes, the CAM kernel, attachments, the editor mirror).
      const core = [...locals].sort()
    routes.push({ kind: "local", name: core.length > 0 ? core.join(", ") : "in-package implementation", at: [`${rel(block.file)}`] })
  }
  return routes
}

// ---------------------------------------------------------------- schema summaries

const parameterSummary = (spec: ActionSpec): string => {
  try {
    const schema = z.toJSONSchema(spec.parameters as never, { io: "input", unrepresentable: "any" }) as { properties?: Record<string, unknown>; required?: ReadonlyArray<string> }
    const names = Object.keys(schema.properties ?? {})
    if (names.length === 0) return "—"
    const required = new Set(schema.required ?? [])
    return names.map((name) => (required.has(name) ? `${name}*` : name)).join(", ")
  } catch {
    return "(not representable as JSON Schema)"
  }
}

// ---------------------------------------------------------------- roles, prompts, tests

const holders = (tool: string): ReadonlyArray<string> => [
  ...PRIMARY_IDS.filter((id) => !PRIMARIES[id].without.includes(tool)).map((id) => `primary:${id}`),
  ...SUBAGENT_IDS.filter((id) => SUBAGENTS[id].tools.includes(tool)).map((id) => id)
]

/** The `Actions` section of the tool prompt names the action in a line label (`- name:` or `- a, name, b:`). */
const promptMentions = (tool: string, name: string): boolean => {
  const text = toolPrompt(tool as never)
  const start = text.search(/^Actions\b/m)
  if (start < 0) return false
  const rest = text.slice(start + "Actions".length)
  const next = rest.search(/^[A-Z][A-Za-z ]+(?:\([^)]*\))?$/m)
  const section = next < 0 ? rest : rest.slice(0, next)
  // The name stands in the label of a `- label: text` line, before its first colon.
  return new RegExp(`^- (?:[^:\\n]*[ ,(])?\`?${escape(name)}\`?(?=[:,\\s()\`])`, "m").test(section)
}

const testSources = (): ReadonlyArray<{ readonly path: string; readonly text: string }> =>
  TEST_DIRS.flatMap((dir) => {
    // The inventory's own test names actions only to record gaps; it is not evidence about them.
    try { return filesUnder(dir, (name) => (name.endsWith(".test.ts") || name.endsWith(".test.tsx")) && name !== "harness-inventory.test.ts") } catch { return [] }
  }).map((path) => ({ path: rel(path), text: read(path) }))

const testsFor = (tool: string, name: string, tests: ReadonlyArray<{ readonly path: string; readonly text: string }>): ReadonlyArray<string> => {
  const full = new RegExp(`["'\`]${escape(tool)}\\.${escape(name)}["'\`]`)
  const toolRef = new RegExp(`["'\`]${escape(tool)}["'\`]`)
  const actionRef = new RegExp(`action:\\s*["'\`]${escape(name)}["'\`]`)
  return tests.filter(({ text }) => full.test(text) || (toolRef.test(text) && actionRef.test(text))).map(({ path }) => path.split("/").pop()!)
}

// ---------------------------------------------------------------- inventory

export interface ActionEntry {
  readonly id: string
  readonly tool: string
  readonly kind: ActionSpec["kind"]
  readonly replaces: string | undefined
  readonly parameters: string
  readonly routes: ReadonlyArray<Route>
  readonly roles: ReadonlyArray<string>
  readonly prompt: boolean
  readonly result: string
  readonly effects: ReadonlyArray<string>
  readonly tests: ReadonlyArray<string>
}

export const actionInventory = (): ReadonlyArray<ActionEntry> => {
  const blocks = actionBlocks()
  const decls = declarations()
  const tests = testSources()
  return ACTION_CATALOGUE.map((spec) => ({
    id: spec.id,
    tool: toolOf(spec),
    kind: spec.kind,
    replaces: spec.replaces,
    parameters: parameterSummary(spec),
    routes: routesOf(spec.id, blocks, decls),
    roles: holders(toolOf(spec)),
    prompt: promptMentions(toolOf(spec), nameOf(spec)),
    // Step 1 migrates the families one by one; an action without a declared result still passes unvalidated.
    result: spec.contract.result !== undefined ? (spec.contract.partialWhen !== undefined ? `declared, partial on \`${spec.contract.partialWhen}\`` : "declared") : "unknown (N)",
    effects: spec.contract.effects,
    tests: testsFor(toolOf(spec), nameOf(spec), tests)
  }))
}

/** A route counts as an execution path only when its implementation was found. */
export const hasExecutionPath = (entry: ActionEntry): boolean =>
  entry.routes.length > 0 && entry.routes.every((route) => route.at.length > 0)

const PROMPT_ROOTS: ReadonlyArray<{ readonly dir: string; readonly role: string; readonly loader: string }> = [
  { dir: "packages/ai/src/prompts/base", role: "main system prompt layer", loader: "prompts/system.ts BASE_LAYERS" },
  { dir: "packages/ai/src/prompts/modes", role: "assistant mode", loader: "prompts/modes/index.ts MODE_PROMPTS" },
  { dir: "packages/ai/src/nikcli/prompts", role: "specialist / host prompt", loader: "nikcli/prompts/index.ts, nikcli/config.ts" },
  { dir: "packages/ai/src/tools/prompts", role: "tool description", loader: "tools/prompts/index.ts toolPrompt" },
  { dir: "packages/ai/src/prompts/family", role: "model-family style", loader: "prompts/system.ts modelFamilyPrompt" },
  { dir: "packages/ai/src/prompts/workflows", role: "one-shot workflow", loader: "prompts/workflows.ts" }
]

/** Walks every text the model reads (`prompts/corpus.ts`), so it covers each prompt file whether or not it names it. */
const CORPUS_TEST = "prompt-corpus.test.ts"

export interface PromptEntry { readonly file: string; readonly role: string; readonly loader: string; readonly chars: number; readonly tests: ReadonlyArray<string> }

export const promptInventory = (): ReadonlyArray<PromptEntry> => {
  const tests = testSources()
  return PROMPT_ROOTS.flatMap(({ dir, role, loader }) =>
    filesUnder(join(REPO, dir), (name) => name.endsWith(".txt")).map((path) => {
      const base = path.split("/").pop()!.replace(/\.txt$/, "")
      const pattern = new RegExp(`\\b${escape(base)}\\.txt\\b|["'\`]${escape(base)}["'\`]`)
      return { file: rel(path), role, loader, chars: read(path).trim().length, tests: [...new Set([CORPUS_TEST, ...tests.filter(({ path: p, text }) => /prompt|mode|specialist|tool-def|nikcli-host|skills/.test(p) && pattern.test(text)).map(({ path: p }) => p.split("/").pop()!)])].sort() }
    }))
}

export interface WorkflowEntry { readonly name: string; readonly chars: number }

export const workflowInventory = (): ReadonlyArray<WorkflowEntry> =>
  Object.entries(workflows).filter((entry): entry is [string, PromptTemplate] => typeof entry[1] === "object" && entry[1] !== null && "system" in entry[1] && "user" in entry[1])
    .map(([name, template]) => ({ name, chars: template.system.length + template.user.length }))

export interface CommandEntry { readonly name: string; readonly group: string; readonly kind: "prompt" | "panel" | "local" }

export const commandInventory = (): ReadonlyArray<CommandEntry> => {
  const source = read(join(REPO, "apps", "desktop", "src", "features", "ai", "lib", "commands.ts"))
  const starts = [...source.matchAll(/^\s{4}name: "([a-z-]+)",/gm)]
  return starts.map((match, index) => {
    const end = index + 1 < starts.length ? starts[index + 1]!.index : source.length
    const body = source.slice(match.index, end)
    const group = /group: "(\w+)"/.exec(body)?.[1] ?? "?"
    const kind = /kind: "prompt"|prompt\(|setDraft/.test(body) ? "prompt" : /togglePanel/.test(body) ? "panel" : "local"
    return { name: match[1]!, group, kind }
  })
}

// ---------------------------------------------------------------- markdown

const cell = (value: string): string => value.replace(/\|/g, "\\|")

const routeText = (route: Route): string =>
  route.at.length === 0
    ? `**${route.kind} \`${route.name}\`: implementation not found**`
    : route.kind === "local"
      ? `local (${route.name}) — \`${route.at[0]}\``
      : `${route.kind} \`${route.name}\` → ${route.at.slice(0, 2).map((at) => `\`${at}\``).join(", ")}${route.at.length > 2 ? ` (+${route.at.length - 2})` : ""}`

export const renderInventory = (): string => {
  const actions = actionInventory()
  const prompts = promptInventory()
  const workflows = workflowInventory()
  const commands = commandInventory()
  const lines: Array<string> = []
  const push = (...rows: ReadonlyArray<string>) => { lines.push(...rows) }
  const byKind = (kind: string) => actions.filter((entry) => entry.kind === kind).length
  push(
    "# AI-11 inventory — actions, prompts, skills and commands",
    "",
    "Generated by `packages/ai/test/helpers/harness-inventory.ts` from the catalogue, the specialist roster, the prompt loaders and",
    "the skills; `packages/ai/test/harness-inventory.test.ts` fails when this file is stale. Do not edit by hand: run",
    "`bun --no-env-file packages/ai/test/helpers/harness-inventory.ts --write`.",
    "",
    "Evidence class (legend of [AI-11](11-enterprise-harness-execution.md)): every route below is **C** — found by reading the",
    "caller → adapter → implementation path. A test file listed under *Tests* mentions the action; it is not a dedicated",
    "regression and does not make the action **V**. *Result* is `declared` when `ACTION_CONTRACTS` (`@cadcamfun/api`) gives the",
    "action a result schema its answers are validated against, `unknown (N)` while its family is not migrated (AI-11 Step 1).",
    "*Effects* is what the action changes or reaches beyond reading the open document.",
    "",
    "## Totals",
    "",
    `- Actions: **${actions.length}** in **${ACTION_TOOL_IDS.length}** tools (read ${byKind("read")}, write ${byKind("write")}, destructive ${byKind("destructive")}).`,
    `- Actions with an identified execution path: **${actions.filter(hasExecutionPath).length}/${actions.length}**.`,
    `- Actions named in their tool prompt: **${actions.filter((entry) => entry.prompt).length}/${actions.length}**.`,
    `- Actions mentioned by at least one test file: **${actions.filter((entry) => entry.tests.length > 0).length}/${actions.length}**.`,
    `- Actions with a declared result schema: **${actions.filter((entry) => entry.result !== "unknown (N)").length}/${actions.length}**.`,
    `- Prompt files: **${prompts.length}** (base layers ${BASE_LAYERS.length}, modes ${Object.keys(MODE_PROMPTS).length}); one-shot workflows: **${workflows.length}**.`,
    `- Built-in skills: **${CADCAM_SKILLS.length}** (plus user skills from the store); composer commands: **${commands.length}**.`,
    "",
    "## Tools",
    "",
    "| Tool | Effect | Actions | Holders (primaries and specialists) | Prompt chars |",
    "| --- | --- | --- | --- | --- |"
  )
  for (const tool of ACTION_TOOL_IDS) {
    const members = actions.filter((entry) => entry.tool === tool)
    push(`| \`${tool}\` | ${toolKind(tool)} | ${members.length} | ${holders(tool).join(", ")} | ${toolPrompt(tool as never).length} |`)
  }
  push("", "## Actions", "")
  for (const tool of ACTION_TOOL_IDS) {
    push(`### \`${tool}\``, "", "| Action | Kind | Effects | Parameters (* required) | Execution path | In prompt | Result | Tests (mentions) |", "| --- | --- | --- | --- | --- | --- | --- | --- |")
    for (const entry of actions.filter((candidate) => candidate.tool === tool)) {
      push(`| \`${entry.id}\`${entry.replaces !== undefined ? ` (was \`${entry.replaces}\`)` : ""} | ${entry.kind} | ${entry.effects.length === 0 ? "—" : entry.effects.join(", ")} | ${cell(entry.parameters)} | ${entry.routes.map(routeText).map(cell).join("<br>")} | ${entry.prompt ? "yes" : "**no**"} | ${entry.result} | ${entry.tests.length === 0 ? "**none**" : entry.tests.join(", ")} |`)
    }
    push("")
  }
  push("## Prompt files", "", "| File | Role | Loader | Chars | Tests (mentions) |", "| --- | --- | --- | --- | --- |")
  for (const entry of prompts) push(`| \`${entry.file}\` | ${entry.role} | ${entry.loader} | ${entry.chars} | ${entry.tests.length === 0 ? "**none**" : entry.tests.join(", ")} |`)
  push("", "## One-shot workflows (`packages/ai/src/prompts/workflows.ts`)", "", "| Template | Prompt chars (system + user) |", "| --- | --- |")
  for (const entry of workflows) push(`| \`${entry.name}\` | ${entry.chars} |`)
  push("", "## Skills (`packages/ai/src/skills/text/*.md`, loaded by `skills/index.ts`)", "", "| Skill | Category | Body chars | Tools it names |", "| --- | --- | --- | --- |")
  for (const skill of CADCAM_SKILLS) {
    const named = ACTION_TOOL_IDS.filter((tool) => new RegExp(`\\b${escape(tool)}\\b`).test(skill.body))
    push(`| \`${skill.name}\` | ${skill.category} | ${skill.body.length} | ${named.length === 0 ? "—" : named.join(", ")} |`)
  }
  push("", "## Composer commands (`apps/desktop/src/features/ai/lib/commands.ts`)", "", "| Command | Group | Kind |", "| --- | --- | --- |")
  for (const entry of commands) push(`| \`/${entry.name}\` | ${entry.group} | ${entry.kind} |`)
  push("")
  return lines.join("\n")
}

if (import.meta.main) {
  const markdown = renderInventory()
  if (process.argv.includes("--write")) writeFileSync(INVENTORY_PATH, markdown)
  else process.stdout.write(markdown)
}
