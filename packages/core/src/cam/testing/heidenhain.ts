/**
 * Independent decoder of the emitted Klartext subset into ISO text the interpreter replays. One output line per physical NC
 * line preserves finding locations.
 *
 * `L` (absolute or incremental `IX IY IZ`, `R0`, `FMAX` or `F`, up to four M functions), `CC` + `C` (centre absolute or
 * incremental from the last position, `DR+` counter-clockwise), `TOOL CALL [n] Z [S…]`, cycle 9 (dwell), cycle 32 (tolerance,
 * no motion), labels (`LBL n` … `LBL 0`, `CALL LBL n` as `O<n>` / `M99` / `M98 P<n>`), standalone M functions, cycle 247
 * (`Q339` = n selects preset row n, read as `G5x` for rows 1-6) and inch programs (`INCH`: F is 1/10 inch/min).
 */
const NUMBER = "[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)"
const AXIS = new RegExp(`^(I?)([XYZABC])(${NUMBER})$`)

export const decodeKlartext = (text: string): { readonly text: string; readonly unsupported: ReadonlyArray<{ readonly line: number; readonly word: string }> } => {
  const unsupported: Array<{ line: number; word: string }> = []
  let dwell = false, tolerance = false, datum = false, inch = false, name: string | undefined, ended = false
  let centre: { readonly absolute: boolean; readonly x: number; readonly y: number } | undefined
  const lines = text.split(/\r?\n/).map((raw, i) => {
    const line = raw.replace(/^\s*\d+\s+/, "").replace(/;.*$/, "").trim().toUpperCase()
    if (!line) return ""
    const bad = () => { unsupported.push({ line: i + 1, word: line }); return "" }
    const begin = /^BEGIN PGM ([A-Z0-9_]+) (MM|INCH)$/.exec(line)
    if (begin) { if (name !== undefined) return bad(); name = begin[1]; inch = begin[2] === "INCH"; return `${inch ? "G20" : "G21"} G90 G17 G94 G40` }
    const end = /^END PGM ([A-Z0-9_]+) (MM|INCH)$/.exec(line)
    if (end) return end[1] !== name || (end[2] === "INCH") !== inch ? bad() : ended ? "" : "M30"
    if (/^CYCL DEF 247 (?:PRESETTING|DATUM SETTING)(?: ~)?$/.test(line)) { datum = true; return "" }
    const row = /^Q339=\+?(\d+)$/.exec(line)
    if (row && datum) { datum = false; const n = Number(row[1]); return n >= 1 && n <= 6 ? `G${53 + n}` : bad() }
    const tool = new RegExp(`^TOOL CALL(?: (\\d+))? Z(?: S(\\d+(?:\\.\\d+)?))?$`).exec(line)
    if (tool) return [tool[1] !== undefined ? `T${tool[1]} M6` : "", tool[2] !== undefined ? `S${tool[2]}` : ""].filter(Boolean).join(" ")
    if (/^M(?:0|1|2|3|4|5|7|8|9|30|128|129)$/.test(line)) { if (line === "M2" || line === "M30") ended = true; return line }
    if (line === "CYCL DEF 9.0 DWELL TIME") { dwell = true; return "" }
    const time = /^CYCL DEF 9.1 DWELL (\d+(?:\.\d+)?)$/.exec(line)
    if (time && dwell) { dwell = false; return `G4 P${time[1]}` }
    if (line === "CYCL DEF 32.0 TOLERANCE") { tolerance = true; return "" }
    if (/^CYCL DEF 32\.1(?: T\d+(?:\.\d+)?)?$/.test(line) && tolerance) { tolerance = false; return "" }
    const call = /^CALL LBL (\d+)$/.exec(line)
    if (call) return Number(call[1]) > 0 ? `M98 P${call[1]}` : bad()
    const label = /^LBL (\d+)$/.exec(line)
    if (label) return label[1] === "0" ? "M99" : `O${label[1]}`
    const cc = new RegExp(`^CC (I?)X(${NUMBER}) (I?)Y(${NUMBER})$`).exec(line)
    if (cc) {
      if (cc[1] !== cc[3]) return bad()
      centre = { absolute: cc[1] === "", x: Number(cc[2]), y: Number(cc[4]) }
      return ""
    }
    const circle = line.startsWith("C ")
    if (!circle && !line.startsWith("L ")) return bad()
    let rapid = false, feed: string | undefined, direction: string | undefined, mode: "" | "I" | undefined
    const axes: string[] = [], ms: string[] = []
    for (const token of line.slice(2).trim().split(/\s+/)) {
      const axis = AXIS.exec(token)
      if (axis) {
        // One block is all absolute or all incremental: the replay states G90 or G91 for it.
        if (mode !== undefined && mode !== axis[1]) return bad()
        mode = axis[1] as "" | "I"
        axes.push(`${axis[2]}${axis[3]}`)
      } else if (token === "R0") continue
      else if (token === "FMAX" && !circle) { if (rapid || feed !== undefined) return bad(); rapid = true }
      // An inch program's F is in 1/10 inch/min.
      else if (/^F\d+(?:\.\d*)?$/.test(token)) { if (rapid || feed !== undefined) return bad(); feed = inch ? `F${Number(token.slice(1)) / 10}` : token }
      else if (circle && /^DR[+-]$/.test(token)) direction = token
      else if (/^M(?:0|1|2|3|4|5|7|8|9|30|128|129)$/.test(token)) { if (token === "M2" || token === "M30") ended = true; ms.push(token) }
      else return bad()
    }
    if (ms.length > 4) return bad()
    const distance = mode === "I" ? "G91" : "G90"
    if (circle) {
      if (centre === undefined || direction === undefined || axes.some((a) => !"XY".includes(a[0]!))) return bad()
      // The interpreter's centre words: absolute under G90.1, relative to the start (the last position) under G91.1.
      const arc = [distance, centre.absolute ? "G90.1" : "G91.1", direction === "DR+" ? "G3" : "G2", ...axes, `I${centre.x}`, `J${centre.y}`, feed, ...ms]
      return arc.filter((w): w is string => w !== undefined).join(" ")
    }
    if (axes.length === 0 && ms.length === 0) return bad()
    if (axes.length === 0) return ms.join(" ")
    return [distance, rapid ? "G0" : "G1", ...axes, feed, ...ms].filter((w): w is string => w !== undefined).join(" ")
  })
  if (dwell) unsupported.push({ line: lines.length, word: "Incomplete Klartext dwell cycle" })
  if (datum) unsupported.push({ line: lines.length, word: "Incomplete Klartext datum setting cycle" })
  return { text: lines.join("\n"), unsupported }
}
