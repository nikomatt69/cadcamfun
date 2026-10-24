/** Independent decoder of the emitted Klartext subset. One output line per physical NC line preserves finding locations. */
export const decodeKlartext = (text: string): { readonly text: string; readonly unsupported: ReadonlyArray<{ readonly line: number; readonly word: string }> } => {
  const unsupported: Array<{ line: number; word: string }> = []
  let dwell = false, name: string | undefined
  const lines = text.split(/\r?\n/).map((raw, i) => {
    const line = raw.replace(/^\s*\d+\s+/, "").replace(/;.*$/, "").trim().toUpperCase()
    if (!line) return ""
    const bad = () => { unsupported.push({ line: i + 1, word: line }); return "" }
    const begin = /^BEGIN PGM ([A-Z0-9_]+) MM$/.exec(line)
    if (begin) { if (name !== undefined) return bad(); name = begin[1]; return "G21 G90 G17 G94 G40" }
    const end = /^END PGM ([A-Z0-9_]+) MM$/.exec(line)
    if (end) return end[1] === name ? "M30" : bad()
    const tool = /^TOOL CALL (\d+) Z S(\d+(?:\.\d+)?)$/.exec(line)
    if (tool) return `T${tool[1]} M6 S${tool[2]}`
    if (/^M(?:0|1|2|3|4|5|7|8|9|30|128|129)$/.test(line)) return line
    if (line === "CYCL DEF 9.0 DWELL TIME") { dwell = true; return "" }
    const time = /^CYCL DEF 9.1 DWELL (\d+(?:\.\d+)?)$/.exec(line)
    if (time && dwell) { dwell = false; return `G4 P${time[1]}` }
    if (!line.startsWith("L ")) return bad()
    const body = line.slice(2).replace(/\bR0\b/g, "").trim()
    const words: ReadonlyArray<string> = body.match(/FMAX|[XYZABCF][+-]?(?:\d+(?:\.\d*)?|\.\d+)/g) ?? []
    if (!words.length || body.replace(/FMAX|[XYZABCF][+-]?(?:\d+(?:\.\d*)?|\.\d+)/g, "").trim() !== "") return bad()
    const rapid = words.includes("FMAX")
    if (words.filter((w) => w === "FMAX" || w.startsWith("F")).length > 1) return bad()
    return `${rapid ? "G0" : "G1"} ${words.filter((w) => w !== "FMAX").join(" ")}`
  })
  if (dwell) unsupported.push({ line: lines.length, word: "Incomplete Klartext dwell cycle" })
  return { text: lines.join("\n"), unsupported }
}
