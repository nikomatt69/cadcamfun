/**
 * Finds user-visible English literals that bypass `t()` in the desktop sources (spec 06 §1: every UI string goes
 * through the i18n table). A heuristic, not a parser: it reads lines of `.tsx`/`.ts` and reports
 *  - string attributes a reader sees (`title="…"`, `aria-label="…"`, `placeholder="…"`, `label="…"`, …),
 *  - object fields that become labels (`label: "…"`, `title: "…"`, `description: "…"`, …),
 *  - text between tags and text alone on a line inside JSX,
 *  - the first argument of `toast*(`, `confirm(`, `alert(`.
 * A line that is meant to stay as written (a brand, a code, a unit) carries `// i18n-ok`.
 *
 * `bun apps/desktop/test/helpers/i18n-literals.ts` prints the report; `--write-baseline` rewrites the baseline the
 * test `i18n-literals.test.ts` compares against (a file may only get cleaner).
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { join, relative } from "node:path"

export const SRC = join(import.meta.dir, "../../src")
export const BASELINE = join(import.meta.dir, "../i18n-literals.baseline.json")

const SKIP_DIRS = new Set(["i18n", "node_modules", "generated", "testing"])
const ATTR = /\b(title|aria-label|placeholder|alt|label|emptyText|description|tooltip)\s*=\s*"([^"{}]*[A-Za-z]{2,}[^"{}]*)"/g
const FIELD = /\b(label|title|description|placeholder|hint|message|tooltip)\s*:\s*"([A-Z][^"]*[a-z]{2}[^"]*)"/g
const CALL = /\b(?:toast(?:\.\w+)?|confirm|alert)\(\s*[`"']([^`"']*[A-Za-z]{3,}[^`"']*)/g
const TEXT = /(?<!=)>\s*([A-Z][A-Za-z][^<>{}=;]*[A-Za-z.:!?…)])\s*</g
const LINE_TEXT = /^\s*([A-Z][a-z]+(?: [A-Za-z&/()-]+){0,6}[.:!?…]?)\s*$/

const looksTranslatable = (text: string): boolean => {
  const value = text.trim()
  if (value.length < 3) return false
  if (/^(https?:|data:|#|\.{0,2}\/)/.test(value)) return false
  if (/^[\w./:-]+$/.test(value) && !/^[A-Z]/.test(value)) return false // identifiers, paths, units
  if (/^[A-Z0-9_ /×x.-]{1,6}$/.test(value)) return false // axis letters, codes
  // Only interpolations and punctuation around them (`${a}: ${b}`) carry no words of their own.
  if (!/[A-Za-z]{3,}/.test(value.replace(/\$\{[^}]*\}/g, ""))) return false
  return true
}

export interface Hit { readonly line: number; readonly text: string }

export const scanSource = (source: string): Hit[] => {
  const hits: Hit[] = []
  let inComment = false
  source.split("\n").forEach((line, index) => {
    const trimmed = line.trim()
    if (inComment || trimmed.startsWith("/*")) {
      inComment = !trimmed.includes("*/")
      return
    }
    if (trimmed.startsWith("*") || trimmed.startsWith("//") || line.includes("i18n-ok")) return
    if (/^(import|export \* |export \{|export type)\b/.test(trimmed)) return
    const found = new Set<string>()
    for (const pattern of [ATTR, FIELD, CALL, TEXT]) {
      pattern.lastIndex = 0
      for (const match of line.matchAll(pattern)) {
        const text = match[match.length - 1] ?? ""
        if (looksTranslatable(text)) found.add(text.trim())
      }
    }
    const alone = LINE_TEXT.exec(line)
    if (alone?.[1] !== undefined && !/^(import|export|return|case|const|let|type|interface|async|await|else|default)\b/.test(trimmed) && looksTranslatable(alone[1]) && !/[;=(){}]/.test(trimmed)) found.add(alone[1])
    for (const text of found) hits.push({ line: index + 1, text })
  })
  return hits
}

export const scanTree = (root: string = SRC): Map<string, Hit[]> => {
  const result = new Map<string, Hit[]>()
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name)
      if (statSync(path).isDirectory()) {
        if (!SKIP_DIRS.has(name)) walk(path)
      } else if (/\.tsx?$/.test(name) && !name.endsWith(".d.ts") && !name.endsWith(".test.ts") && !name.endsWith(".test.tsx")) {
        const hits = scanSource(readFileSync(path, "utf8"))
        if (hits.length > 0) result.set(relative(root, path), hits)
      }
    }
  }
  walk(root)
  return result
}

export const readBaseline = (): Record<string, number> => JSON.parse(readFileSync(BASELINE, "utf8")) as Record<string, number>

if (import.meta.main) {
  const found = scanTree()
  if (process.argv.includes("--write-baseline")) {
    const counts = Object.fromEntries([...found].sort(([a], [b]) => a.localeCompare(b)).map(([file, hits]) => [file, hits.length]))
    writeFileSync(BASELINE, JSON.stringify(counts, null, 2) + "\n")
    console.log(`baseline written: ${found.size} files, ${Object.values(counts).reduce((a, b) => a + b, 0)} literals`)
  } else {
    const areas = new Map<string, number>()
    for (const [file, hits] of found) {
      const parts = file.split("/")
      const area = parts[0] === "features" || parts[0] === "shared" ? parts.slice(0, 2).join("/") : parts[0]!
      areas.set(area, (areas.get(area) ?? 0) + hits.length)
    }
    for (const [area, count] of [...areas].sort((a, b) => b[1] - a[1])) console.log(`${String(count).padStart(5)}  ${area}`)
    const detail = process.argv.includes("--detail")
    for (const [file, hits] of [...found].sort((a, b) => b[1].length - a[1].length)) {
      console.log(`${String(hits.length).padStart(4)} ${file}`)
      if (detail) for (const hit of hits) console.log(`        ${hit.line}: ${hit.text.slice(0, 100)}`)
    }
    console.log(`total ${[...found.values()].reduce((sum, hits) => sum + hits.length, 0)} in ${found.size} files`)
  }
}
