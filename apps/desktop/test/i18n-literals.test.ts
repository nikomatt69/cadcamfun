/**
 * No new untranslated text (spec 06 §1). `helpers/i18n-literals.ts` finds the English literals that bypass `t()`;
 * `i18n-literals.baseline.json` records the debt per file. A file may get cleaner, never dirtier, and a new file
 * starts at zero. A string that must stay as written (brand, code, unit) carries `// i18n-ok` on its line.
 *
 * To see the debt: `bun apps/desktop/test/helpers/i18n-literals.ts --detail`. After cleaning files, run it with
 * `--write-baseline` to record the lower numbers.
 */
import { describe, expect, test } from "bun:test"
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { readBaseline, scanTree } from "./helpers/i18n-literals.ts"

const LOCALES = join(import.meta.dir, "../src/i18n/locales")
const pack = (language: string): Record<string, string> =>
  Object.assign({}, ...["cad.json", "cam.json"].map((name) => JSON.parse(readFileSync(join(LOCALES, language, name), "utf8")) as Record<string, string>))
/** Keys of the sidebar tabs (Explorer, Layers, Tools, snap) written for the CAD and CAM workspaces. */
const SIDEBAR_KEY = /^(browser\.|cad\.explorer\.|cam\.explorer\.|cam\.gen\.|cad\.toolpanel\.|cad\.layers\.|cam\.multi\.(manage|elementGenerated|elementMissing|allGenerated|failed|sent|toggleElements|view|downloadGcode|stat\w+|removeSelected|none|color|editSettings|remove)$)/

describe("untranslated literals", () => {
  const baseline = readBaseline()
  const found = scanTree()

  test("no file gets more English text outside t() than its baseline", () => {
    const worse = [...found]
      .filter(([file, hits]) => hits.length > (baseline[file] ?? 0))
      .map(([file, hits]) => `${file}: ${hits.length} > ${baseline[file] ?? 0}\n    ${hits.slice(0, 4).map((hit) => `${hit.line}: ${hit.text.slice(0, 60)}`).join("\n    ")}`)
    expect(worse, "route new strings through t() and add the key to every language pack").toEqual([])
  })

  test("the Explorer tabs of both sidebars are fully translated", () => {
    const explorer = [
      "features/cad/components/CADElementExplorer.tsx",
      "features/cad/components/browser/BrowserParts.tsx",
      "features/cad/components/browser/browserState.ts",
      "features/cad/lib/browser.ts",
      "features/cam/components/explorer/CamElementExplorer.tsx",
      "features/cam/components/explorer/ElementSelector.tsx",
      "features/cam/components/explorer/MultiToolpathGenerator.tsx",
      "features/cam/components/explorer/ToolAssignmentPanel.tsx",
      "features/cam/lib/explorer.ts",
      "features/cam/lib/elementJob.ts"
    ]
    for (const file of explorer) expect(found.get(file)?.map((hit) => hit.text) ?? [], file).toEqual([])
  })

  test("the CAM generator panel (right sidebar) is fully translated", () => {
    const left = [...found].filter(([file]) => file.startsWith("features/cam/components/generator/")).map(([file, hits]) => `${file}: ${hits.map((hit) => hit.text).join(" | ")}`)
    expect(left).toEqual([])
  })

  test("every language writes the sidebar keys in its own words, not a copy of English", () => {
    const english = pack("en")
    const keys = Object.keys(english).filter((key) => SIDEBAR_KEY.test(key))
    expect(keys.length).toBeGreaterThan(200)
    for (const language of readdirSync(LOCALES).filter((name) => name !== "en")) {
      const table = pack(language)
      // Cognates (Cube, Rectangle, Mesh) legitimately match English; a pack that copied English would match almost everywhere.
      const copied = keys.filter((key) => table[key] === english[key])
      expect(copied.length / keys.length, `${language}: ${copied.slice(0, 5).join(", ")}`).toBeLessThan(0.1)
    }
  })
})

