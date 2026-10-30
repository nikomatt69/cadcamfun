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

export interface DecodedKlartext {
  readonly text: string
  readonly unsupported: ReadonlyArray<{ readonly line: number; readonly word: string }>
  /** For each line of `text`, the 1-based Klartext line it came from (a fixed cycle that moves in a path is several lines). */
  readonly lines: ReadonlyArray<number>
}

/** `toolRadius` gives the radius of a tool number: the cycles that mill a path (208) need it to replay the tool centre's path. */
export const decodeKlartext = (text: string, toolRadius?: (tool: number) => number | undefined): DecodedKlartext => {
  const unsupported: Array<{ line: number; word: string }> = []
  let orienting = false, orientCalled = false
  let dwell = false, tolerance = false, datum = false, inch = false, name: string | undefined, ended = false
  let centre: { readonly absolute: boolean; readonly x: number; readonly y: number } | undefined
  /** The fixed cycle being defined (its rows follow while a line ends with `~`) and the one a `M99` calls. */
  let defining: { readonly number: number; readonly q: Map<number, number> } | undefined
  let cycle: { readonly number: number; readonly q: ReadonlyMap<number, number> } | undefined
  let cycleOn = false
  let spindle = 0
  let toolNumber: number | undefined
  /**
   * Cycle 208 BORE MILLING as the path of the tool centre: a helix of pitch Q334 down to the depth at the radius that leaves the
   * nominal diameter Q335 (first at the roughing diameter Q342 when it is given), a full circle at the bottom, and back to the centre.
   */
  const bore208 = (c: { readonly q: ReadonlyMap<number, number> }, x: string | undefined, y: string | undefined): string => {
    const q = (n: number, fallback = 0): number => c.q.get(n) ?? fallback
    const R = toolNumber !== undefined ? toolRadius?.(toolNumber) : undefined
    if (R === undefined || !(R > 0)) return ""
    const cx = Number(x ?? 0), cy = Number(y ?? 0)
    const surface = q(203), top = surface + q(200), end = surface + q(204), bottom = surface + q(201)
    const pitch = q(334) > 0 ? q(334) : 1, feed = q(206)
    const direction = q(351, 1) >= 0 ? "G3" : "G2"
    const radii: number[] = []
    if (q(342) > 0 && q(342) < q(335) - 1e-9) radii.push(q(342) / 2 - R)
    radii.push(q(335) / 2 - R)
    if (radii.some((r) => !(r > 1e-9))) return ""
    const f = (n: number): string => String(Number(n.toFixed(6)))
    const out = ["G90 G91.1", `G0 X${f(cx)} Y${f(cy)}`, `G0 Z${f(top)}`]
    for (const r of radii) {
      out.push(`G0 X${f(cx + r)} Y${f(cy)}`, `G1 Z${f(surface)} F${feed}`)
      const turns = Math.max(1, Math.ceil((surface - bottom) / pitch - 1e-9))
      for (let i = 1; i <= turns; i++) out.push(`${direction} X${f(cx + r)} Y${f(cy)} Z${f(i === turns ? bottom : surface - ((surface - bottom) * i) / turns)} I${f(-r)} J0 F${feed}`)
      out.push(`${direction} X${f(cx + r)} Y${f(cy)} I${f(-r)} J0 F${feed}`, `G0 Z${f(top)}`)
    }
    out.push(`G0 X${f(cx)} Y${f(cy)}`, `G0 Z${f(end)}`)
    return out.join("\n")
  }
  /**
   * Cycles 262 THREAD MILLING and 267 OUTSIDE THREAD MILLING as the path of the tool centre: one helix of pitch |Q239| through the thread
   * depth Q201 at radius (D - d) / 2 inside a hole and (D + d) / 2 round a boss. A positive Q239 is a right-hand thread, which rises with
   * counter-clockwise travel; internal climb is counter-clockwise, external climb clockwise (Q351 = +1).
   */
  const thread = (c: { readonly number: number; readonly q: ReadonlyMap<number, number> }, x: string | undefined, y: string | undefined): string => {
    const q = (n: number, fallback = 0): number => c.q.get(n) ?? fallback
    const R = toolNumber !== undefined ? toolRadius?.(toolNumber) : undefined
    if (R === undefined || !(R > 0)) return ""
    const internal = c.number === 262
    const rc = internal ? q(335) / 2 - R : q(335) / 2 + R
    const pitch = Math.abs(q(239)), length = Math.abs(q(201))
    if (!(rc > 1e-9) || !(pitch > 0) || !(length > 0)) return ""
    const climb = q(351, 1) >= 0
    const ccw = internal ? climb : !climb
    const rising = ccw === (q(239) > 0)
    const cx = Number(x ?? 0), cy = Number(y ?? 0)
    const surface = q(203), top = surface + q(200), end = surface + q(204), feed = q(207)
    const z0 = rising ? surface - length : surface
    const dir = rising ? 1 : -1
    const f = (n: number): string => String(Number(n.toFixed(6)))
    const word = ccw ? "G3" : "G2"
    const turns = length / pitch, whole = Math.floor(turns + 1e-9), frac = turns - whole
    const out = ["G90 G91.1", `G0 X${f(cx)} Y${f(cy)}`, `G0 Z${f(top)}`, `G0 X${f(cx + rc)} Y${f(cy)}`, `G1 Z${f(z0)} F${feed}`]
    for (let i = 1; i <= whole; i++) out.push(`${word} X${f(cx + rc)} Y${f(cy)} Z${f(z0 + dir * i * pitch)} I${f(-rc)} J0 F${feed}`)
    let lastX = cx + rc, lastY = cy
    if (frac > 1e-9) {
      const angle = (ccw ? 1 : -1) * frac * 2 * Math.PI
      lastX = cx + rc * Math.cos(angle)
      lastY = cy + rc * Math.sin(angle)
      out.push(`${word} X${f(lastX)} Y${f(lastY)} Z${f(z0 + dir * length)} I${f(-rc)} J0 F${feed}`)
    }
    out.push(`G0 X${f(lastX)} Y${f(lastY)} Z${f(top)}`, `G0 X${f(cx)} Y${f(cy)}`, `G0 Z${f(end)}`)
    return out.join("\n")
  }
  /** One ISO canned-cycle block for a call of cycle `c` over (x, y); `G80` first when the previous block was a call too. */
  const cycleCall = (c: { readonly number: number; readonly q: ReadonlyMap<number, number> }, x: string | undefined, y: string | undefined): string => {
    const q = (n: number, fallback = 0): number => c.q.get(n) ?? fallback
    const surface = q(203), top = surface + q(200), bottom = surface + q(201)
    const R = Number((top).toFixed(6)), Z = Number(bottom.toFixed(6))
    const at = [x !== undefined ? `X${Number(x)}` : undefined, y !== undefined ? `Y${Number(y)}` : undefined]
    let code: string
    switch (c.number) {
      case 208: return bore208(c, x, y)
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
    // Tilted plane: the datum shift (cycle 7, absolute to the preset) is read as the local shift G52, the plane word goes to the replay as
    // it is (`PLANE SPATIAL` / `PLANE RESET`; the interpreter turns the frame).
    if (/^PLANE (?:SPATIAL|RESET)\b/.test(line)) return line
    if (line === "CYCL DEF 7.0 DATUM SHIFT") return ""
    const shift = new RegExp(`^CYCL DEF 7\\.([1-3]) ([XYZ])(${NUMBER})$`).exec(line)
    if (shift) return "XYZ"[Number(shift[1]) - 1] === shift[2] ? `G52 ${shift[2]}${shift[3]}` : bad()
    const header = /^CYCL DEF (200|201|202|203|205|206|207|208|262|267)\b/.exec(line)
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
    if (tool) { if (tool[2] !== undefined) spindle = Number(tool[2]); if (tool[1] !== undefined) toolNumber = Number(tool[1]) }
    if (tool) return [tool[1] !== undefined ? `T${tool[1]} M6` : "", tool[2] !== undefined ? `S${tool[2]}` : ""].filter(Boolean).join(" ")
    if (/^M(?:0|1|2|3|4|5|7|8|9|30|128|129)$/.test(line)) { if (line === "M2" || line === "M30") ended = true; return line }
    // Cycle 13 ORIENTATION: the angle row is the orientation (`M19 R<deg>` to the replay); the call after it moves nothing.
    if (line === "CYCL DEF 13.0 ORIENTATION") { orienting = true; return "" }
    const angle = /^CYCL DEF 13\.1 ANGLE\s*([+-]?\d+(?:\.\d+)?)$/.exec(line)
    if (angle && orienting) { orienting = false; orientCalled = true; return `M19 R${Number(angle[1])}` }
    if (line === "CYCL CALL" && orientCalled) { orientCalled = false; return "" }
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
    const holeCall = /^L (?:X(\S+) )?(?:Y(\S+) )?R0 FMAX M99((?: M\d+)*)$/.exec(line)
    if (holeCall && cycle) {
      const ms = holeCall[3]!.trim()
      if (cycle.number === 208 || cycle.number === 262 || cycle.number === 267) {
        const path = cycle.number === 208 ? cycleCall(cycle, holeCall[1], holeCall[2]) : thread(cycle, holeCall[1], holeCall[2])
        return path === "" ? bad() : ms === "" ? path : `${ms}\n${path}`
      }
      return `${cycleCall(cycle, holeCall[1], holeCall[2])}${ms === "" ? "" : ` ${ms}`}`
    }
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
  const origin: number[] = []
  const lines = text.split(/\r?\n/).flatMap((raw, i) => {
    let out = decodeLine(raw, i)
    // A fixed cycle called on one block ends with the next block that does something: cancel it there (`G80`).
    if (cycleOn && out !== "" && !/^G90 G99 G8\d|^G90 G99 G73/.test(out)) { cycleOn = false; out = `G80 ${out}` }
    const parts = out.split("\n")
    for (let k = 0; k < parts.length; k++) origin.push(i + 1)
    return parts
  })
  if (dwell) unsupported.push({ line: lines.length, word: "Incomplete Klartext dwell cycle" })
  if (datum) unsupported.push({ line: lines.length, word: "Incomplete Klartext datum setting cycle" })
  return { text: lines.join("\n"), unsupported, lines: origin }
}
