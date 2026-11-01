/**
 * Which core operations the assistant can actually run, measured from the source.
 *
 * The pure core (`packages/core/src`) owns every CAD/CAM/post-processor operation. The assistant reaches them through
 * one seam: the action catalogue (`packages/ai/src/actions`) and the host that serves it (`apps/sidecar/src`). An
 * operation no path reaches is an operation the model cannot run, however complete the core is.
 *
 * The measurement is a call graph, not a name list: the assistant names a symbol, that symbol's file calls others, and
 * the walk continues through the core's own calls. So `cam.manufacture` reaches `planJob` because the kernel's
 * `runJob` calls it, not because the assistant spells the name.
 *
 *   bun --no-env-file packages/ai/test/helpers/kernel-coverage.ts            # print the table
 *   bun --no-env-file packages/ai/test/helpers/kernel-coverage.ts --write     # rewrite the committed ledger
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { join, relative } from "node:path"

const REPO = join(import.meta.dir, "..", "..", "..", "..")
const CORE = join(REPO, "packages/core/src")
const AI = join(REPO, "packages/ai/src")
const SIDECAR = join(REPO, "apps/sidecar/src")
export const LEDGER = join(REPO, "specs/ai/13-kernel-coverage.md")

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
const rel = (path: string): string => relative(REPO, path)

interface CoreFile {
  readonly path: string
  readonly id: string
  readonly source: string
  /** The operations this file exports. */
  readonly exports: ReadonlyArray<string>
  /** The core files it imports, by path. */
  readonly imports: ReadonlyArray<string>
}

const coreFiles = (): ReadonlyArray<CoreFile> => {
  const scope = KERNEL_SCOPE.flatMap((dir) => filesUnder(join(CORE, dir), (n) => n.endsWith(".ts") && !n.endsWith(".test.ts")))
  const all = filesUnder(CORE, (n) => n.endsWith(".ts") && !n.endsWith(".test.ts"))
  const byPath = new Map(all.map((p) => [p, p]))
  return scope.map((path) => {
    const source = read(path)
    const imports: Array<string> = []
    for (const match of source.matchAll(/from "(\.[^"]+)"/g)) {
      const resolved = join(path, "..", match[1]!)
      const target = byPath.get(resolved) ?? (statSync(resolved + ".ts") ? resolved + ".ts" : undefined)
      if (target !== undefined) imports.push(target)
    }
    return {
      path,
      id: relative(CORE, path),
      source,
      exports: [...source.matchAll(/^export (?:const|function|class|async function) ([A-Za-z0-9_]+)/gm)].map((m) => m[1]!),
      imports
    }
  })
}

/** The assistant's own sources: the action catalogue and the sidecar that serves it. */
const assistantFiles = (): ReadonlyArray<CoreFile> => {
  const paths = [
    ...filesUnder(AI, (n) => n.endsWith(".ts") && !n.endsWith(".test.ts")),
    ...filesUnder(SIDECAR, (n) => n.endsWith(".ts") && !n.endsWith(".test.ts"))
  ]
  return paths.map((path) => ({
    path,
    id: rel(path),
    source: read(path),
    exports: [],
    imports: []
  }))
}

/** The identifiers a source calls: `name(` and `name.` are calls; a bare word in a comment is not. */
const calledNames = (source: string): ReadonlySet<string> => {
  const out = new Set<string>()
  const withoutComments = source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1 ")
  for (const match of withoutComments.matchAll(/([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g)) out.add(match[1]!)
  for (const match of withoutComments.matchAll(/([A-Za-z_$][A-Za-z0-9_$]*)\s*\./g)) out.add(match[1]!)
  return out
}

export interface CoverageRow {
  /** The core module, relative to `packages/core/src`. */
  readonly module: string
  readonly reached: number
  readonly total: number
  /** The core operations no path reaches. */
  readonly missing: ReadonlyArray<string>
}

export interface Coverage {
  readonly rows: ReadonlyArray<CoverageRow>
  readonly reached: number
  readonly total: number
}

/**
 * The walk. A symbol is reachable when the assistant names it, or when a reachable symbol's file calls it. The core's
 * own call graph is followed, so the measure is "the assistant can run this", not "the assistant spells this".
 */
export const coverage = (): Coverage => {
  const core = coreFiles()
  const coreByPath = new Map(core.map((f) => [f.path, f]))
  // A symbol's declaring file, per core file: the exports of that file and of the files it imports.
  const declarations = new Map<string, { file: CoreFile; name: string }>()
  for (const file of core) for (const name of file.exports) declarations.set(name, { file, name })

  const assistant = assistantFiles()
  const reached = new Set<string>()

  // Seeds: every core symbol the assistant names. `cam.kernel.planJob` and `planJob` both count.
  const assistantCalls = new Set<string>()
  for (const file of assistant) for (const name of calledNames(file.source)) assistantCalls.add(name)
  for (const [name, declaration] of declarations) if (assistantCalls.has(name)) reached.add(name)

  // The walk: from every reached symbol, follow the calls of its file.
  const queue = [...reached]
  const seenFiles = new Set<string>()
  while (queue.length > 0) {
    const name = queue.pop()!
    const declaration = declarations.get(name)
    if (declaration === undefined) continue
    const file = declaration.file
    if (seenFiles.has(file.path)) continue
    seenFiles.add(file.path)
    const calls = calledNames(file.source)
    for (const [other, otherDeclaration] of declarations) {
      if (reached.has(other)) continue
      if (!calls.has(other)) continue
      // Only a call inside the declaring file (or a file it imports) counts.
      if (otherDeclaration.file.path !== file.path && !file.imports.includes(otherDeclaration.file.path)) continue
      reached.add(other)
      queue.push(other)
    }
  }

  const rows = core.map((file) => {
    const missing = file.exports.filter((name) => !reached.has(name))
    return { module: file.id, reached: file.exports.length - missing.length, total: file.exports.length, missing }
  })
  return {
    rows,
    reached: rows.reduce((sum, row) => sum + row.reached, 0),
    total: rows.reduce((sum, row) => sum + row.total, 0)
  }
}

const render = (result: Coverage): string => {
  const lines: Array<string> = []
  lines.push("# AI-13 — Kernel operation coverage (what the assistant can run)")
  lines.push("")
  lines.push("Generated by `bun --no-env-file packages/ai/test/helpers/kernel-coverage.ts --write`. Do not edit by hand.")
  lines.push("")
  lines.push("The pure core owns the CAD/CAM/post-processor operations; the assistant reaches them through the action")
  lines.push("catalogue (`packages/ai/src/actions`) and the host that serves it (`apps/sidecar/src`). The walk follows")
  lines.push("the core's own call graph, so a symbol counts as reachable when the assistant can make it run, not when it")
  lines.push("spells its name.")
  lines.push("")
  lines.push(`**${result.reached} of ${result.total} core operations are reachable** (${result.rows.filter((r) => r.missing.length > 0).length} of ${result.rows.length} modules have a gap).`)
  lines.push("")
  lines.push("| Core module | Reachable | Missing operations |")
  lines.push("| --- | --- | --- |")
  for (const row of result.rows) {
    lines.push(`| \`${row.module}\` | ${row.reached}/${row.total} | ${row.missing.length === 0 ? "—" : row.missing.map((m) => `\`${m}\``).join(", ")} |`)
  }
  lines.push("")
  return lines.join("\n")
}

if (import.meta.main) {
  const result = coverage()
  if (process.argv.includes("--write")) {
    writeFileSync(LEDGER, render(result))
    console.log(`Wrote ${rel(LEDGER)}`)
  } else {
    console.log(render(result))
  }
}
