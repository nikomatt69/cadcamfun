/** A lexical summary of the current NC text; it makes no claim about machine motion or validity. */
export function gcodeSummary(code: string) {
  const lines = code.split(/\r?\n/).filter(line => line.trim().length > 0)
  const executable = lines.map(line => line.replace(/\([^)]*\)/g, "").replace(/;.*$/, "").trim()).filter(Boolean)
  const words = executable.join("\n").toUpperCase()
  const tools = [...new Set([...words.matchAll(/(?<![A-Z])T\s*(\d+)/g)].map(m => Number(m[1])))].sort((a, b) => a - b)
  const offsets = [...new Set([...words.matchAll(/(?<![A-Z])G\s*(5[4-9])(?=[^\d.]|$)/g)].map(m => `G${m[1]}`))]
  return { lines: lines.length, blocks: executable.length, tools, offsets }
}
