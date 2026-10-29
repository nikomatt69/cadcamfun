/**
 * Independent decoder of the emitted Klartext subset into ISO text the interpreter replays. One output line per physical NC
 * line preserves finding locations.
 *
 * `L` (absolute or incremental `IX IY IZ`, `R0`, `FMAX` or `F`, up to four M functions), `CC` + `C` (centre absolute or
 * incremental from the last position, `DR+` counter-clockwise), `TOOL CALL [n] Z [S…]`, cycle 9 (dwell), cycle 32 (tolerance,
 * no motion), labels (`LBL n` … `LBL 0`, `CALL LBL n` as `O<n>` / `M99` / `M98 P<n>`), standalone M functions, cycle 247
 * (`Q339` = n selects preset row n, read as `G5x` for rows 1-6), inch programs (`INCH`: F is 1/10 inch/min) and the drilling cycles
 * 200 / 201 / 202 / 203 / 205 / 206 / 207 with their `Qnnn=` rows, called by `M99` on a positioning block: each call is read as the
 * ISO canned cycle that does the same (`G81` `G82` `G83` `G73` `G85` `G86` `G84`) on that one line, cancelled by `G80` before the
 * next block that is not a call.
 */
const NUMBER = "[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)"
const AXIS = new RegExp(`^(I?)([XYZABC])(${NUMBER})$`)

export const decodeKlartext = (text: string): { readonly text: string; readonly unsupported: ReadonlyArray<{ readonly line: number; readonly word: string }> } => {
  const unsupported: Array<{ line: number; word: string }> = []
  let dwell = false, tolerance = false, datum = false, inch = false, name: string | undefined, ended = false
  let centre: { readonly absolute: boolean; readonly x: number; readonly y: number } | undefined
  /** The fixed cycle being defined (its rows follow while a line ends with `~`) and the one a `M99` calls. */
  let defining: { readonly number: number; readonly q: Map<number, number> } | undefined
  let cycle: { readonly number: number; readonly q: ReadonlyMap<number, number> } | undefined
  let cycleOn = false
  let spindle = 0
  /** One ISO canned-cycle block for a call of cycle `c` over (x, y); `G80` first when the previous block was a call too. */
  const cycleCall = (c: { readonly number: number; readonly q: ReadonlyMap<number, number> }, x: string | undefined, y: string | undefined): string => {
    const q = (n: number, fallback = 0): number => c.q.get(n) ?? fallback
    const surface = q(203), top = surface + q(200), bottom = surface + q(201)
    const R = Number((top).toFixed(6)), Z = Number(bottom.toFixed(6))
    const at = [x !== undefined ? `X${Number(x)}` : undefined, y !== undefined ? `Y${Number(y)}` : undefined]
    let code: string
    switch (c.number) {
      case 200: code = q(202) > 0 && q(202) < Math.abs(q(201)) - 1e-9 ? `G83 Q${q(202)} F${q(206)}` : q(211) > 0 ? `G82 P${q(211)} F${q(206)}` : `G81 F${q(206)}`; break
      case 203: case 205: code = q(257) > 0 ? `G73 Q${q(257)} F${q(206)}` : `G83 Q${q(202)} F${q(206)}`; break
      case 201: code = `G85 F${q(206)}`; break
      case 202: code = `G86 F${q(206)}`; break
      default: code = `G84 F${Number((q(239) * (spindle > 0 ? spindle : 1)).toFixed(6))}`
    }
    cycleOn = true
    return ["G90 G99", code, ...at, `Z${Z}`, `R${R}`].filter((w): w is string => w !== undefined && w !== "").join(" ")
  }
  const decodeLine = (raw: string, i: number): string => {
    // A trailing `~` (after the comment, if any) says the cycle definition goes on in the next row.
    const continued = /~\s*$/.test(raw)
    const line = raw.replace(/^\s*\d+\s+/, "").replace(/;.*$/, "").replace(/~\s*$/, "").trim().toUpperCase()
    if (!line) return ""
    const bad = () => { unsupported.push({ line: i + 1, word: line }); return "" }
    const begin = /^BEGIN PGM ([A-Z0-9_]+) (MM|INCH)$/.exec(line)
    if (begin) { if (name !== undefined) return bad(); name = begin[1]; inch = begin[2] === "INCH"; return `${inch ? "G20" : "G21"} G90 G17 G94 G40` }
    const end = /^END PGM ([A-Z0-9_]+) (MM|INCH)$/.exec(line)
    if (end) return end[1] !== name || (end[2] === "INCH") !== inch ? bad() : ended ? "" : "M30"
    if (/^CYCL DEF 247 (?:PRESETTING|DATUM SETTING)$/.test(line)) { datum = true; return "" }
    const header = /^CYCL DEF (200|201|202|203|205|206|207)\b/.exec(line)
    if (header) { defining = { number: Number(header[1]), q: new Map() }; if (!continued) { cycle = defining; defining = undefined } return "" }
    const param = /^Q(\d+)=([+-]?(?:\d+(?:\.\d*)?|\.\d+))$/.exec(line)
    if (param && defining) {
      defining.q.set(Number(param[1]), Number(param[2]))
      if (!continued) { cycle = defining; defining = undefined }
      return ""
    }
    const row = /^Q339=\+?(\d+)$/.exec(line)
    if (row && datum) { datum = false; const n = Number(row[1]); return n >= 1 && n <= 6 ? `G${53 + n}` : bad() }
    const tool = new RegExp(`^TOOL CALL(?: (\\d+))? Z(?: S(\\d+(?:\\.\\d+)?))?$`).exec(line)
    if (tool) { if (tool[2] !== undefined) spindle = Number(tool[2]) }
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
    const holeCall = /^L (?:X(\S+) )?(?:Y(\S+) )?R0 FMAX M99$/.exec(line)
    if (holeCall && cycle) return cycleCall(cycle, holeCall[1], holeCall[2])
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
  }
  const lines = text.split(/\r?\n/).map((raw, i) => {
    const out = decodeLine(raw, i)
    // A fixed cycle called on one block ends with the next block that does something: cancel it there (`G80`).
    if (cycleOn && out !== "" && !/^G90 G99 G8\d|^G90 G99 G73/.test(out)) { cycleOn = false; return `G80 ${out}` }
    return out
  })
  if (dwell) unsupported.push({ line: lines.length, word: "Incomplete Klartext dwell cycle" })
  if (datum) unsupported.push({ line: lines.length, word: "Incomplete Klartext datum setting cycle" })
  return { text: lines.join("\n"), unsupported }
}
