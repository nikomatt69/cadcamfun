/**
 * Which kernel operation families the assistant can actually reach, and through which action.
 *
 * The pure core (`packages/core`) is the one place the CAD/CAM/post-processor operations live. The assistant reaches them
 * through one seam: the action catalogue (`packages/ai/src/actions`). An operation family that no action reaches is an
 * operation the model cannot run, however good the core is.
 *
 * This script computes that coverage from the source, the same way `packages/ai/test/helpers/harness-inventory.ts` does for
 * the harness: it reads the core's exported operations per module, reads the assistant's actions, and follows the call
 * edges from every action into the core. What it prints is the gap list; `--write` commits it as the ledger the CI gate
 * compares against.
 *
 *   bun --no-env-file scripts/kernel-coverage.ts            # print the coverage table
 *   bun --no-env-file scripts/kernel-coverage.ts --write     # rewrite specs/ai/13-kernel-coverage.md
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { join, relative } from "node:path"

const REPO = join(import.meta.dir, "..")
const CORE = join(REPO, "packages/core/src")
const AI = join(REPO, "packages/ai/src")
const SIDECAR = join(REPO, "apps/sidecar/src")
const LEDGER = join(REPO, "specs/ai/13-kernel-coverage.md")

/** The core directories whose operations the assistant is expected to be able to run. */
export const KERNEL_SCOPE = [
  "cad/brep",
  "cad/sheet",
  "cad/assembly",
  "cad/exchange",
  "cam/kernel",
  "cam/operations",
  "cam/post",
  "cam/verify",
  "cam/sim",
  "cam/turning",
  "cam/cycles",
  "cam/model",
  "cam/print",
  "cam/program"
] as const

const filesUnder = (dir: string, accept: (name: string) => boolean): ReadonlyArray<string> => {
  const out: Array<string> = []
  const walk = (current: string): void => {
    for (const name of readdirSync(current).sort()) {
      const path = join(current, name)
      if (statSync(path).isDirectory()) walk(path)
      else if (accept(name)) out.push(path)
    }
  }
  walk(dir)
  return out
}

const read = (path: string): string => readFileSync(path, "utf8")

/** The operations a core module exports: the named values a caller may run. */
const exportsOf = (source: string): ReadonlyArray<string> =>
  [...source.matchAll(/^export (?:const|function|class|async function) ([A-Za-z0-9_]+)/gm)].map((m) => m[1]!)

interface CoreModule {
  /** Path relative to `packages/core/src`. */
  readonly id: string
  readonly exports: ReadonlyArray<string>
}

const coreModules = (): ReadonlyArray<CoreModule> =>
  KERNEL_SCOPE.flatMap((dir) =>
    filesUnder(join(CORE, dir), (name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
      .map((path) => ({ id: relative(CORE, path), exports: exportsOf(read(path)) }))
  )

interface ActionModule {
  readonly id: string
  /** The core symbols the action's own source names. */
  readonly coreSymbols: ReadonlySet<string>
  /** The core symbols its own helpers (in the same package) name. */
  readonly helperSymbols: ReadonlySet<string>
}

/** The assistant's action sources: `packages/ai/src/actions/*.ts` and the sidecar's AI service. */
const assistantSources = (): ReadonlyArray<{ path: string; source: string }> => [
  ...filesUnder(join(AI, "actions"), (name) => name.endsWith(".ts") && !name.endsWith(".test.ts")).map((path) => ({ path, source: read(path) })),
  ...filesUnder(SIDECAR, (name) => name.endsWith(".ts") && !name.endsWith(".test.ts")).map((path) => ({ path, source: read(path) }))
]

/** The action id declared in a source, and the core symbols that source names. */
const actionIdsOf = (source: string): ReadonlyArray<string> => [...source.matchAll(/\bid: "([a-z_]+\.[a-z_]+)"/g)].map((m) => m[1]!)

/** Every core symbol name an assistant source mentions (`cam.kernel.planJob`, `cad.brep.makeBox`, ...). */
const coreSymbolsIn = (source: string): ReadonlySet<string> => {
  const out = new Set<string>()
  for (const match of source.matchAll(/\b(?:cam|cad|brep|drawing)\.((?:\w+\.)+\w+)\b/g)) out.add(match[1]!)
  return out
}

export interface CoverageRow {
  /** The core module (relative to `packages/core/src`). */
  readonly module: string
  /** How many of the module's operations the assistant reaches. */
  readonly reached: number
  readonly total: number
  /** The actions whose source names one of the module's operations. */
  readonly actions: ReadonlyArray<string>
  /** The operations of this module no action reaches. */
  readonly missing: ReadonlyArray<string>
}

export const coverage = (): ReadonlyArray<CoverageRow> => {
  const modules = coreModules()
  const sources = assistantSources()
  // The action id that owns each source block: the nearest `id:` above the block, per file.
  const owners = new Map<string, string>()
  for (const { path, source } of sources) {
    const ids = actionIdsOf(source)
    if (ids.length === 0) continue
    for (const match of source.matchAll(/\bid: "([a-z_]+\.[a-z_]+)"/g)) {
      const before = source.slice(0, match.index)
      const previous = [...before.matchAll(/\bid: "([a-z_]+\.[a-z_]+)"/g)].pop()
      // The action that owns the code after this declaration is the next one, so this id owns its own block.
      owners.set(`${path}#${match[1]}`, match[1]!)
      void previous
    }
    void ids
  }
  return modules.map((module) => {
    const actions = new Set<string>()
    const reached = new Set<string>()
    for (const { path, source } of sources) {
      const symbols = coreSymbolsIn(source)
      const hit = module.exports.filter((name) => symbols.has(name) || [...symbols].some((s) => s.endsWith(`.${name}`)))
      if (hit.length === 0) continue
      const block = source
      const ids = actionIdsOf(block)
      // The action whose block names the symbol: the closest declaration before the mention.
      for (const name of hit) {
        const index = block.search(new RegExp(`\\b(?:cam|cad|brep|drawing)\\.\\S*${name}\\b`))
        if (index < 0) continue
        const before = block.slice(0, index)
        const owner = [...before.matchAll(/\bid: "([a-z_]+\.[a-z_]+)"/g)].pop()
        const action = owner?.[1] ?? ids[0]
        if (action !== undefined) actions.add(action)
        reached.add(name)
      }
    }
    void owners
    return {
      module: module.id,
      reached: reached.size,
      total: module.exports.length,
      actions: [...actions].sort(),
      missing: module.exports.filter((name) => !reached.has(name))
    }
  })
}

const render = (rows: ReadonlyArray<CoverageRow>): string => {
  const covered = rows.reduce((sum, row) => sum + row.reached, 0)
  const total = rows.reduce((sum, row) => sum + row.total, 0)
  const lines: Array<string> = []
  lines.push("# AI-13 — Kernel operation coverage (the assistant's reach into the pure core)")
  lines.push("")
  lines.push("Generated by `bun --no-env-file scripts/kernel-coverage.ts --write`. Do not edit by hand.")
  lines.push("")
  lines.push("The pure core owns the CAD/CAM/post-processor operations; the assistant reaches them through the action")
  lines.push("catalogue (`packages/ai/src/actions`). A family no action reaches is an operation the model cannot run.")
  lines.push("")
  lines.push(`**${covered} of ${total} exported operations are reachable** (${rows.filter((r) => r.missing.length > 0).length} of ${rows.length} modules have a gap).`)
  lines.push("")
  lines.push("| Core module | Reached | Actions | Missing operations |")
  lines.push("| --- | --- | --- | --- |")
  for (const row of rows) {
    lines.push(`| \`${row.module}\` | ${row.reached}/${row.total} | ${row.actions.map((a) => `\`${a}\``).join(", ") || "—"} | ${row.missing.length === 0 ? "—" : row.missing.map((m) => `\`${m}\``).join(", ")} |`)
  }
  lines.push("")
  return lines.join("\n")
}

if (import.meta.main) {
  const rows = coverage()
  if (process.argv.includes("--write")) {
    writeFileSync(LEDGER, render(rows))
    console.log(`Wrote ${relative(REPO, LEDGER)}`)
  } else {
    console.log(render(rows))
  }
}
