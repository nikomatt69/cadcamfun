/** Shared segment key for rendered text and the checked-in catalogs. */

/** Words and tokens that stay spelled as in English. */
export const IDENTICAL_OK = new Set([
  "API",
  "GitHub",
  "Studio",
  "CADCAMFUN",
  "HTTP",
  "JSON",
  "URL",
  "SDK",
  "macOS",
  "Windows",
  "Linux",
  "Bun",
  "SQLite",
  "curl",
  "OpenAPI",
  "iOS",
  "npm",
  "CORS",
  "SQL",
  "CSS",
  "HTML",
  "CLI",
  "GPU",
  "CPU",
  "WASM",
  "CNC",
  "STEP",
  "STL",
  "DXF",
  "SVG",
  "PDF",
  "G-code",
  "B-rep",
  "CSG",
  "SHA-256",
  "NSIS",
  "MSI",
  "RPM",
  "ARM64",
  "x64",
  "Intel",
  "Apple Silicon",
  "Homebrew",
  "App Store",
  "TestFlight",
  "Drizzle",
  "Effect",
  "Tauri",
  "SolidJS",
  "Vite",
  "TypeScript",
  "Three.js",
  "nikcli",
  "Astro",
  "Cloudflare",
  "true",
  "false",
  "null",
])

/**
 * Collapse whitespace and replace digit runs with `#`.
 * Named slots such as `{title}` stay, so a template and its translation share a key.
 */
export function segmentKey(value: string): string {
  return value.replace(/\s+/g, " ").trim().replace(/\d+/g, "#")
}

/** Code-like fragments and loanwords that are already acceptable in every language. */
export function isStableSegment(key: string): boolean {
  if (IDENTICAL_OK.has(key)) return true
  if (!/[A-Za-z]{2,}/.test(key)) return true
  const marks = (key.match(/[{}[\]();=<>]/g) ?? []).length
  if (marks >= 4) return true
  if (key.includes("=>") || key.startsWith("import ") || key.startsWith("export ") || key.startsWith("const ")) return true
  if (/^[A-Za-z0-9_./:@|+#-]+$/.test(key) && (key.includes("/") || key.includes("@"))) return true
  return false
}

/** Put the source digit runs back into a catalog value that kept `#` placeholders. */
export function restoreDigits(source: string, translated: string): string {
  const nums = source.match(/\d+/g) ?? []
  let index = 0
  return translated.replace(/#/g, () => nums[index++] ?? "#")
}

/**
 * A catalog value may repeat the English source for loanwords, routes,
 * formulas, identifiers, and single tokens. Prose phrases may not.
 */
export function identicalAllowed(key: string): boolean {
  if (isStableSegment(key)) return true
  if (/^(GET|POST|PUT|PATCH|DELETE|HEAD)\b/.test(key)) return true
  if (key.includes("/")) return true
  if (/[=<>()·→]/.test(key)) return true
  if (/\.[a-z]{1,4}\b/.test(key)) return true
  if (!key.includes(" ") && key.length <= 32) return true
  const bare = key.replace(/\{[a-zA-Z]+\}/g, " ")
  const prose = bare.split(/[^A-Za-z]+/).filter((word) => word.length >= 5 && word === word.toLowerCase() && !IDENTICAL_OK.has(word))
  return prose.length === 0
}

export function lookupSegment(dict: Readonly<Record<string, string>>, source: string): string | undefined {
  const key = segmentKey(source)
  const translated = dict[key]
  if (translated == null || translated.trim() === "") return undefined
  return restoreDigits(source, translated)
}
