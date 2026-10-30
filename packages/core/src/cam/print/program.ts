/**
 * An independent reading of a printer program, for any of the four dialects the printers in the field speak (Marlin, Klipper,
 * RepRapFirmware, Bambu). The program text is parsed with no knowledge of the slicer that wrote it, and from the motions alone the
 * module reports what the machine will do: where it goes, how much filament it pushes, how long it takes with a look-ahead
 * planner (acceleration and junction jerk, not length over feed), whether the nozzle ever travels through material it has already
 * laid, and whether the volume it deposits agrees with the volume of the part it was cut from within a stated bound.
 *
 * What the parser cannot know is said, not guessed: a macro (`START_PRINT`, `M620`) is listed as opaque with its line, firmware
 * retraction (`G10`/`G11`) is counted but its length belongs to the firmware, and an unknown G or M word is a finding.
 */

export type GcodeDialect = "marlin" | "klipper" | "reprap" | "bambu"

export interface ProgramOptions {
  /** The build volume, mm. Without it no bounds are judged. */
  readonly bed?: { readonly width: number; readonly depth: number; readonly height: number; readonly origin?: "corner" | "center" }
  readonly filamentDiameter?: number
  /** Nozzle diameter, mm: the width of the bead the collision map stamps. Default 0.4. */
  readonly nozzle?: number
  /** Acceleration of the planner, mm/s2. Default 1500. */
  readonly acceleration?: number
  /** Junction jerk of the planner, mm/s. Default 10. */
  readonly jerk?: number
  /** Declares the dialect instead of detecting it. */
  readonly dialect?: GcodeDialect
  /** Look for travel collisions (a height map of the deposits). Default true; the time estimate alone does not need it. */
  readonly collisions?: boolean
}

export interface ProgramIssue { readonly severity: "error" | "warning" | "info"; readonly code: string; readonly line: number; readonly message: string }

export interface ProgramLayer { readonly z: number; readonly volume: number; readonly printLength: number }

export interface ToolUse { readonly tool: number; readonly filamentMm: number; readonly volume: number }

export interface ProgramAnalysis {
  readonly dialect: GcodeDialect
  readonly dialectEvidence: ReadonlyArray<string>
  readonly lines: number
  readonly moves: number
  readonly extrudingMoves: number
  /** Box of the extruding moves, mm; undefined when the program extrudes nothing. */
  readonly printBounds: { readonly min: readonly [number, number, number]; readonly max: readonly [number, number, number] } | undefined
  /** Box of every motion (travel included). */
  readonly motionBounds: { readonly min: readonly [number, number, number]; readonly max: readonly [number, number, number] } | undefined
  readonly filamentMm: number
  /** Deposited volume, mm^3, from the filament pushed. */
  readonly volume: number
  readonly volumeByType: Readonly<Record<string, number>>
  readonly tools: ReadonlyArray<ToolUse>
  readonly toolChanges: number
  readonly printLength: number
  readonly travelLength: number
  readonly retractions: number
  readonly firmwareRetractions: number
  readonly layers: ReadonlyArray<ProgramLayer>
  /** Time with the look-ahead planner, seconds. */
  readonly timeSeconds: number
  readonly maxNozzleTemperature: number
  readonly maxBedTemperature: number
  readonly opaque: ReadonlyArray<{ readonly line: number; readonly word: string }>
  readonly collisions: ReadonlyArray<{ readonly line: number; readonly x: number; readonly y: number; readonly z: number; readonly materialTop: number }>
  readonly issues: ReadonlyArray<ProgramIssue>
}

const KNOWN_G = new Set([0, 1, 2, 3, 4, 10, 11, 17, 18, 19, 20, 21, 28, 29, 90, 91, 92])
const KNOWN_M = new Set([0, 1, 17, 18, 73, 82, 83, 84, 104, 105, 106, 107, 109, 116, 140, 141, 190, 191, 200, 201, 203, 204, 205, 220, 221, 400, 410, 412, 420, 500, 501, 503, 572, 600, 620, 621, 900, 907, 955, 991, 1002, 1004, 1005, 2000])

/** Words of a line without its comment: [letter, value] pairs, plus the first bare word (a macro name). */
const parseLine = (raw: string): { words: Array<[string, number]>; macro: string | undefined; comment: string } => {
  let end = raw.length
  const semi = raw.indexOf(";")
  let comment = ""
  if (semi >= 0) { end = semi; comment = raw.slice(semi + 1) }
  const words: Array<[string, number]> = []
  let macro: string | undefined
  let i = 0
  while (i < end) {
    const c = raw.charCodeAt(i)
    if (c === 32 || c === 9 || c === 13) { i++; continue }
    if (c === 40) { const close = raw.indexOf(")", i); i = close < 0 ? end : close + 1; continue }
    const upper = c >= 97 && c <= 122 ? c - 32 : c
    if (upper >= 65 && upper <= 90) {
      let j = i + 1
      const start = j
      while (j < end && (raw.charCodeAt(j) === 45 || raw.charCodeAt(j) === 43 || raw.charCodeAt(j) === 46 || (raw.charCodeAt(j) >= 48 && raw.charCodeAt(j) <= 57))) j++
      if (j > start) { words.push([String.fromCharCode(upper), Number(raw.slice(start, j))]); i = j; continue }
      // A bare word: the macro or extended command (SET_PRESSURE_ADVANCE, START_PRINT, M-less commands).
      if (words.length === 0 && macro === undefined) {
        j = i
        while (j < end && raw.charCodeAt(j) !== 32 && raw.charCodeAt(j) !== 9) j++
        macro = raw.slice(i, j).toUpperCase()
        i = j
        // The macro's parameters (X=1 Y=2) are not G-code words.
        i = end
        continue
      }
    }
    i++
  }
  return { words, macro, comment }
}

const detect = (text: string, opaque: ReadonlyArray<{ word: string }>, seen: ReadonlySet<string>): { dialect: GcodeDialect; evidence: string[] } => {
  const evidence: string[] = []
  const head = text.slice(0, 4000).toLowerCase()
  if (/bambu/.test(head) || seen.has("M620") || seen.has("M621") || seen.has("M1002") || seen.has("M991")) {
    evidence.push(/bambu/.test(head) ? "Bambu Studio header" : `Bambu words (${["M620", "M621", "M1002", "M991"].filter((m) => seen.has(m)).join(", ")})`)
    return { dialect: "bambu", evidence }
  }
  const klipperMacros = opaque.filter((o) => /^(START_PRINT|END_PRINT|SET_|EXCLUDE_OBJECT|TIMELAPSE|BED_MESH|QUAD_GANTRY|Z_TILT|CLEAN_NOZZLE|PRINT_START|PRINT_END|M\d+_)/.test(o.word))
  if (/klipper|flavor:klipper/.test(head) || klipperMacros.length > 0) {
    evidence.push(klipperMacros.length > 0 ? `Klipper macros (${klipperMacros.slice(0, 3).map((o) => o.word).join(", ")})` : "Klipper header")
    return { dialect: "klipper", evidence }
  }
  if (/reprap|flavor:reprap/.test(head) || seen.has("M116") || seen.has("M572")) {
    evidence.push(/reprap/.test(head) ? "RepRap header" : `RepRapFirmware words (${["M116", "M572"].filter((m) => seen.has(m)).join(", ")})`)
    return { dialect: "reprap", evidence }
  }
  evidence.push(seen.has("M900") || seen.has("M82") || seen.has("M83") ? "Marlin words (M82/M83/M900)" : "no firmware-specific words: Marlin assumed")
  return { dialect: "marlin", evidence }
}

export const analyseProgram = (gcode: string, options: ProgramOptions = {}): ProgramAnalysis => {
  const filamentArea = Math.PI * ((options.filamentDiameter ?? 1.75) / 2) ** 2
  const nozzle = options.nozzle ?? 0.4
  const accel = options.acceleration ?? 1500
  const jerk = options.jerk ?? 10
  const issues: ProgramIssue[] = []
  const opaque: Array<{ line: number; word: string }> = []
  const seen = new Set<string>()
  const unknown = new Set<string>()

  // Moves in columns (grown on demand): the planner and the collision map read them after the parse.
  let cap = 1 << 16
  let mx = new Float64Array(cap), my = new Float64Array(cap), mz = new Float64Array(cap), me = new Float64Array(cap), mf = new Float64Array(cap)
  let mline = new Int32Array(cap), mtool = new Uint8Array(cap), mtype = new Uint16Array(cap)
  let fromX = new Float64Array(cap), fromY = new Float64Array(cap), fromZ = new Float64Array(cap)
  let moves = 0
  const types: string[] = ["unlabelled"]
  const typeIds = new Map<string, number>([["unlabelled", 0]])
  const push = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, e: number, feed: number, line: number, tool: number, type: number): void => {
    if (moves === cap) {
      cap *= 2
      const grow = <T extends Float64Array | Int32Array | Uint8Array | Uint16Array>(a: T): T => { const b = new (a.constructor as new (n: number) => T)(cap); b.set(a); return b }
      mx = grow(mx); my = grow(my); mz = grow(mz); me = grow(me); mf = grow(mf); mline = grow(mline); mtool = grow(mtool); mtype = grow(mtype)
      fromX = grow(fromX); fromY = grow(fromY); fromZ = grow(fromZ)
    }
    fromX[moves] = x0; fromY[moves] = y0; fromZ[moves] = z0
    mx[moves] = x1; my[moves] = y1; mz[moves] = z1; me[moves] = e; mf[moves] = feed; mline[moves] = line; mtool[moves] = tool; mtype[moves] = type
    moves++
  }

  const head = gcode.slice(0, 4000).toLowerCase()
  const marlinLike = (options.dialect === undefined || options.dialect === "marlin") && !/bambu|klipper|reprap/.test(head) && !/^\s*(START_PRINT|PRINT_START|SET_[A-Z_]+|M620|M1002)\b/im.test(gcode.slice(0, 20_000))
  let x = 0, y = 0, z = 0, e = 0, feed = 50
  let relativeXYZ = false, relativeE = false
  let tool = 0, toolChanges = 0
  let type = 0
  let nozzleMax = 0, bedMax = 0
  let retractions = 0, firmwareRetractions = 0
  let dwell = 0
  let lineNo = 0
  let lines = 0
  let pos = 0
  while (pos <= gcode.length) {
    let end = gcode.indexOf("\n", pos)
    if (end < 0) end = gcode.length
    lineNo++
    const raw = gcode.slice(pos, end)
    pos = end + 1
    lines++
    const { words, macro, comment } = parseLine(raw)
    if (words.length === 0 && macro === undefined) {
      const t = /^\s*(?:TYPE|type):\s*(.+?)\s*$/.exec(comment)
      if (t) { let id = typeIds.get(t[1]!); if (id === undefined) { id = types.length; types.push(t[1]!); typeIds.set(t[1]!, id) } type = id }
      continue
    }
    if (macro !== undefined) {
      if (!/^(M\d+|G\d+)$/.test(macro)) opaque.push({ line: lineNo, word: macro })
      continue
    }
    const g = words.find((w) => w[0] === "G")?.[1]
    const m = words.find((w) => w[0] === "M")?.[1]
    const t = words.find((w) => w[0] === "T")?.[1]
    const get = (letter: string): number | undefined => { for (const w of words) if (w[0] === letter) return w[1]; return undefined }
    if (m !== undefined) {
      seen.add(`M${m}`)
      if (!KNOWN_M.has(m)) unknown.add(`M${m}`)
      if (m === 82) relativeE = false
      else if (m === 83) relativeE = true
      else if (m === 104 || m === 109) nozzleMax = Math.max(nozzleMax, get("S") ?? get("R") ?? 0)
      else if (m === 140 || m === 190) bedMax = Math.max(bedMax, get("S") ?? get("R") ?? 0)
      else if (m === 620 || m === 621 || m === 600) opaque.push({ line: lineNo, word: `M${m}` })
    }
    if (t !== undefined && g === undefined && m === undefined) {
      if (t !== tool) toolChanges++
      tool = Math.max(0, Math.min(255, t))
      seen.add(`T${t}`)
      continue
    }
    if (g === undefined) continue
    seen.add(`G${g}`)
    if (!KNOWN_G.has(g)) { unknown.add(`G${g}`); continue }
    // Marlin's G90/G91 also select the extruder mode; Klipper, RepRapFirmware and Bambu leave it to M82/M83.
    if (g === 90) { relativeXYZ = false; if (marlinLike) relativeE = false; continue }
    if (g === 91) { relativeXYZ = true; if (marlinLike) relativeE = true; continue }
    if (g === 92) { const ev = get("E"); if (ev !== undefined) e = ev; const xv = get("X"), yv = get("Y"), zv = get("Z"); if (xv !== undefined) x = xv; if (yv !== undefined) y = yv; if (zv !== undefined) z = zv; continue }
    if (g === 28) { const hasAxis = ["X", "Y", "Z"].some((a) => get(a) !== undefined); if (!hasAxis || get("X") !== undefined) x = 0; if (!hasAxis || get("Y") !== undefined) y = 0; if (!hasAxis || get("Z") !== undefined) z = 0; continue }
    if (g === 4) { dwell += (get("S") ?? 0) + (get("P") ?? 0) / 1000; continue }
    if (g === 10) { firmwareRetractions++; retractions++; continue }
    if (g === 11) continue
    if (g !== 0 && g !== 1 && g !== 2 && g !== 3) continue
    const f = get("F")
    if (f !== undefined && f > 0) feed = f / 60
    const nx = get("X"), ny = get("Y"), nz = get("Z"), ne = get("E")
    const tx = nx === undefined ? x : relativeXYZ ? x + nx : nx
    const ty = ny === undefined ? y : relativeXYZ ? y + ny : ny
    const tz = nz === undefined ? z : relativeXYZ ? z + nz : nz
    let de = 0
    if (ne !== undefined) { de = relativeE ? ne : ne - e; e = relativeE ? e + ne : ne }
    if (g === 2 || g === 3) {
      // An arc is replayed as chords that stay within 5 microns of it; the filament is spread by length.
      const i = get("I") ?? 0, j = get("J") ?? 0
      const cx = x + i, cy = y + j
      const r = Math.hypot(x - cx, y - cy)
      if (r > 1e-9) {
        const a0 = Math.atan2(y - cy, x - cx)
        const a1 = Math.atan2(ty - cy, tx - cx)
        const cw = g === 2
        let sweep = cw ? a0 - a1 : a1 - a0
        if (sweep <= 1e-12) sweep += 2 * Math.PI
        const steps = Math.max(1, Math.ceil(sweep / (2 * Math.acos(Math.max(-1, 1 - 0.005 / r)))))
        let px = x, py = y, pz = z
        for (let s = 1; s <= steps; s++) {
          const a = cw ? a0 - (sweep * s) / steps : a0 + (sweep * s) / steps
          const qx = s === steps ? tx : cx + r * Math.cos(a), qy = s === steps ? ty : cy + r * Math.sin(a), qz = z + ((tz - z) * s) / steps
          push(px, py, pz, qx, qy, qz, de / steps, feed, lineNo, tool, type)
          px = qx; py = qy; pz = qz
        }
        x = tx; y = ty; z = tz
        continue
      }
    }
    if (de < -1e-9 && tx === x && ty === y && tz === z) retractions++
    push(x, y, z, tx, ty, tz, de, feed, lineNo, tool, type)
    x = tx; y = ty; z = tz
  }
  for (const word of unknown) issues.push({ severity: "warning", code: "UnknownWord", line: 0, message: `${word} is outside the vocabulary of the four dialects: its effect is not modelled` })
  const opaqueSeen = new Map<string, number>()
  for (const o of opaque) if (!opaqueSeen.has(o.word)) opaqueSeen.set(o.word, o.line)
  for (const [word, line] of opaqueSeen) issues.push({ severity: "info", code: "OpaqueCommand", line, message: `${word} is a macro or extended command: what it does to heaters, motion or the extruder is not modelled` })
  if (firmwareRetractions > 0) issues.push({ severity: "info", code: "FirmwareRetraction", line: 0, message: `${firmwareRetractions} G10 retraction(s): the length is set in the firmware, so the filament total excludes it` })

  // ---- per-move facts
  let printLength = 0, travelLength = 0, filament = 0, extrudingMoves = 0
  const pb = { min: [Infinity, Infinity, Infinity] as [number, number, number], max: [-Infinity, -Infinity, -Infinity] as [number, number, number] }
  const mb = { min: [Infinity, Infinity, Infinity] as [number, number, number], max: [-Infinity, -Infinity, -Infinity] as [number, number, number] }
  const byTool = new Map<number, number>()
  const byType = new Map<number, number>()
  const layerMap = new Map<number, { volume: number; length: number }>()
  const length = new Float64Array(moves)
  for (let k = 0; k < moves; k++) {
    const dx = mx[k]! - fromX[k]!, dy = my[k]! - fromY[k]!, dz = mz[k]! - fromZ[k]!
    const l = Math.hypot(dx, dy, dz)
    length[k] = l > 0 ? l : Math.abs(me[k]!)
    for (let a = 0; a < 3; a++) {
      const v = a === 0 ? mx[k]! : a === 1 ? my[k]! : mz[k]!
      const w = a === 0 ? fromX[k]! : a === 1 ? fromY[k]! : fromZ[k]!
      if (v < mb.min[a]!) mb.min[a] = v
      if (v > mb.max[a]!) mb.max[a] = v
      if (w < mb.min[a]!) mb.min[a] = w
      if (w > mb.max[a]!) mb.max[a] = w
    }
    const extrudes = me[k]! > 1e-9 && (dx !== 0 || dy !== 0)
    if (extrudes) {
      extrudingMoves++
      printLength += l
      filament += me[k]!
      byTool.set(mtool[k]!, (byTool.get(mtool[k]!) ?? 0) + me[k]!)
      byType.set(mtype[k]!, (byType.get(mtype[k]!) ?? 0) + me[k]! * filamentArea)
      const zk = Math.round(((mz[k]! + fromZ[k]!) / 2) * 1000) / 1000
      const layer = layerMap.get(zk)
      if (layer) { layer.volume += me[k]! * filamentArea; layer.length += l } else layerMap.set(zk, { volume: me[k]! * filamentArea, length: l })
      for (let a = 0; a < 3; a++) {
        const v = a === 0 ? mx[k]! : a === 1 ? my[k]! : mz[k]!
        const w = a === 0 ? fromX[k]! : a === 1 ? fromY[k]! : fromZ[k]!
        if (Math.min(v, w) < pb.min[a]!) pb.min[a] = Math.min(v, w)
        if (Math.max(v, w) > pb.max[a]!) pb.max[a] = Math.max(v, w)
      }
    } else if (l > 0) travelLength += l
  }

  // ---- look-ahead planner (classic jerk): junction speeds, a backward then a forward pass, a trapezoid per move
  const vEntry = new Float64Array(moves), vExit = new Float64Array(moves), junction = new Float64Array(moves)
  const vmax = new Float64Array(moves)
  for (let k = 0; k < moves; k++) vmax[k] = Math.max(0.1, mf[k]!)
  for (let k = 1; k < moves; k++) {
    const l0 = length[k - 1]!, l1 = length[k]!
    const xyz0 = Math.hypot(mx[k - 1]! - fromX[k - 1]!, my[k - 1]! - fromY[k - 1]!, mz[k - 1]! - fromZ[k - 1]!)
    const xyz1 = Math.hypot(mx[k]! - fromX[k]!, my[k]! - fromY[k]!, mz[k]! - fromZ[k]!)
    if (xyz0 < 1e-9 || xyz1 < 1e-9 || l0 === 0 || l1 === 0) { junction[k] = 0; continue }
    const ux = (mx[k - 1]! - fromX[k - 1]!) / xyz0 - (mx[k]! - fromX[k]!) / xyz1
    const uy = (my[k - 1]! - fromY[k - 1]!) / xyz0 - (my[k]! - fromY[k]!) / xyz1
    const uz = (mz[k - 1]! - fromZ[k - 1]!) / xyz0 - (mz[k]! - fromZ[k]!) / xyz1
    const turn = Math.hypot(ux, uy, uz)
    const v = Math.min(vmax[k - 1]!, vmax[k]!)
    junction[k] = turn * v > jerk ? jerk / turn : v
  }
  for (let k = moves - 1; k >= 0; k--) {
    const exit = k === moves - 1 ? 0 : vEntry[k + 1]!
    vExit[k] = exit
    vEntry[k] = Math.min(junction[k]!, vmax[k]!, Math.sqrt(exit * exit + 2 * accel * length[k]!))
  }
  let time = dwell
  let previousExit = 0
  for (let k = 0; k < moves; k++) {
    const entry = Math.min(vEntry[k]!, k === 0 ? 0 : previousExit)
    const l = length[k]!
    if (l <= 0) continue
    const exitCap = Math.min(vExit[k]!, Math.sqrt(entry * entry + 2 * accel * l))
    const cruise = Math.min(vmax[k]!, Math.sqrt((2 * accel * l + entry * entry + exitCap * exitCap) / 2))
    const dAcc = (cruise * cruise - entry * entry) / (2 * accel)
    const dDec = (cruise * cruise - exitCap * exitCap) / (2 * accel)
    time += (cruise - entry) / accel + (cruise - exitCap) / accel + Math.max(0, l - dAcc - dDec) / cruise
    previousExit = exitCap
  }

  // ---- deposits and travel collisions on a height map (cell = a bead width)
  const collisions: Array<{ line: number; x: number; y: number; z: number; materialTop: number }> = []
  if (options.collisions !== false && pb.min[0]! <= pb.max[0]!) {
    const cell = Math.max(nozzle, 0.3)
    const pad = 2
    const minX = mb.min[0]! - pad, minY = mb.min[1]! - pad
    let nx = Math.ceil((mb.max[0]! + pad - minX) / cell) + 1, ny = Math.ceil((mb.max[1]! + pad - minY) / cell) + 1
    let scale = cell
    while (nx * ny > 16_000_000) { scale *= 1.5; nx = Math.ceil((mb.max[0]! + pad - minX) / scale) + 1; ny = Math.ceil((mb.max[1]! + pad - minY) / scale) + 1 }
    const top = new Float32Array(nx * ny)
    const stampAt = (px: number, py: number, h: number): void => {
      const ix = Math.floor((px - minX) / scale), iy = Math.floor((py - minY) / scale)
      if (ix >= 0 && iy >= 0 && ix < nx && iy < ny && top[iy * nx + ix]! < h) top[iy * nx + ix] = h
    }
    const tolerance = 0.05
    let reported = 0
    for (let k = 0; k < moves; k++) {
      const l = Math.hypot(mx[k]! - fromX[k]!, my[k]! - fromY[k]!)
      if (l < 1e-9) continue
      const steps = Math.max(1, Math.ceil(l / (scale / 2)))
      const extrudes = me[k]! > 1e-9
      for (let s = 0; s <= steps; s++) {
        const px = fromX[k]! + ((mx[k]! - fromX[k]!) * s) / steps, py = fromY[k]! + ((my[k]! - fromY[k]!) * s) / steps
        const pz = fromZ[k]! + ((mz[k]! - fromZ[k]!) * s) / steps
        if (extrudes) { stampAt(px, py, pz); continue }
        const ix = Math.floor((px - minX) / scale), iy = Math.floor((py - minY) / scale)
        if (ix < 0 || iy < 0 || ix >= nx || iy >= ny) continue
        const h = top[iy * nx + ix]!
        if (h > pz + tolerance && reported < 24) {
          collisions.push({ line: mline[k]!, x: px, y: py, z: pz, materialTop: h })
          reported++
          break
        }
      }
    }
    if (collisions.length > 0) issues.push({ severity: "error", code: "TravelCollision", line: collisions[0]!.line, message: `the nozzle travels at Z${collisions[0]!.z.toFixed(2)} through material already laid up to Z${collisions[0]!.materialTop.toFixed(2)} (first of ${collisions.length}${collisions.length === 24 ? "+" : ""})` })
  }

  const detected = detect(gcode, opaque, seen)
  const dialect = options.dialect ?? detected.dialect
  if (options.dialect !== undefined && options.dialect !== detected.dialect) issues.push({ severity: "warning", code: "DialectMismatch", line: 0, message: `declared ${options.dialect} but the words read as ${detected.dialect} (${detected.evidence.join("; ")})` })

  const layers = [...layerMap.entries()].sort((a, b) => a[0] - b[0]).slice(0, 50_000).map(([zv, v]) => ({ z: zv, volume: v.volume, printLength: v.length }))
  const volumeByType: Record<string, number> = {}
  for (const [id, v] of byType) volumeByType[types[id]!] = v
  return {
    dialect, dialectEvidence: options.dialect !== undefined ? [`declared ${options.dialect}`] : detected.evidence, lines, moves, extrudingMoves,
    printBounds: pb.min[0]! <= pb.max[0]! ? pb : undefined, motionBounds: mb.min[0]! <= mb.max[0]! ? mb : undefined,
    filamentMm: filament, volume: filament * filamentArea, volumeByType,
    tools: [...byTool.entries()].sort((a, b) => a[0] - b[0]).map(([tl, mm]) => ({ tool: tl, filamentMm: mm, volume: mm * filamentArea })),
    toolChanges, printLength, travelLength, retractions, firmwareRetractions, layers, timeSeconds: time,
    maxNozzleTemperature: nozzleMax, maxBedTemperature: bedMax, opaque, collisions, issues
  }
}

// ---------------------------------------------------------------- judging a program against what it was cut from

export interface ProgramExpectation {
  /** Volume of the solid the program prints, mm^3. */
  readonly partVolume: number
  /** Extrusion multiplier of the profile, 1 = nominal. */
  readonly flow?: number
  /** Lower bound of the model deposit (walls and skin), mm^3; unlabelled programs skip the lower bound. */
  readonly shellVolume?: number
  /** Volume allowed beyond the part for supports, adhesion and priming, mm^3. */
  readonly extraVolume?: number
  /** Relative slack on the upper bound: beads overlap, bridges are round. Default 0.08. */
  readonly tolerance?: number
  /** The time the slicer claims, seconds, to be compared with the planner. */
  readonly claimedTimeSeconds?: number
  /** Agreement required between the claim and the planner. Default 0.25. */
  readonly timeTolerance?: number
}

export interface ProgramCheck {
  readonly id: "volume-bound" | "build-volume" | "travel-collision" | "time-model" | "dialect"
  readonly status: "passed" | "failed" | "unresolved"
  readonly detail: string
  readonly line?: number
}

const MODEL_TYPES = /^(WALL|SKIN|FILL|BRIDGE|INNER|OUTER|PERIMETER|INFILL|TOP|BOTTOM|SOLID|SPARSE|OVERHANG|EXTERNAL|INTERNAL|GAP|IRONING)/i

export const checkProgram = (analysis: ProgramAnalysis, options: ProgramOptions, expect: ProgramExpectation): ProgramCheck[] => {
  const checks: ProgramCheck[] = []
  const flow = expect.flow ?? 1
  const tol = expect.tolerance ?? 0.08
  // Volume: the model's own deposit may not exceed the solid (with the slack), nor fall below the shell it must at least lay.
  const labelled = Object.entries(analysis.volumeByType).filter(([k]) => MODEL_TYPES.test(k.replace(/[- ]/g, "_").toUpperCase()))
  const model = labelled.length > 0 ? labelled.reduce((s, [, v]) => s + v, 0) : analysis.volume
  const upper = expect.partVolume * flow * (1 + tol) + (labelled.length > 0 ? 0 : expect.extraVolume ?? 0)
  if (analysis.extrudingMoves === 0) checks.push({ id: "volume-bound", status: "failed", detail: "The program extrudes nothing" })
  else if (model > upper) checks.push({ id: "volume-bound", status: "failed", detail: `The program deposits ${model.toFixed(0)} mm3 for a ${expect.partVolume.toFixed(0)} mm3 part (flow ${flow}, bound ${upper.toFixed(0)} mm3): over-extrusion or a wrong volume` })
  else if (expect.shellVolume !== undefined && labelled.length > 0 && model < expect.shellVolume * flow * (1 - tol)) checks.push({ id: "volume-bound", status: "failed", detail: `The program deposits ${model.toFixed(0)} mm3, less than the ${expect.shellVolume.toFixed(0)} mm3 of the walls and skin alone` })
  else checks.push({ id: "volume-bound", status: "passed", detail: `Deposit ${model.toFixed(0)} mm3 against a part of ${expect.partVolume.toFixed(0)} mm3: within [${expect.shellVolume !== undefined ? (expect.shellVolume * flow * (1 - tol)).toFixed(0) : "0"}, ${upper.toFixed(0)}] mm3` })

  const bed = options.bed
  if (bed === undefined || analysis.motionBounds === undefined) checks.push({ id: "build-volume", status: "unresolved", detail: "No build volume was given" })
  else {
    const hx = bed.origin === "center" ? bed.width / 2 : 0, hy = bed.origin === "center" ? bed.depth / 2 : 0
    const b = analysis.motionBounds
    const out = b.min[0] < -hx - 1e-6 || b.max[0] > bed.width - hx + 1e-6 || b.min[1] < -hy - 1e-6 || b.max[1] > bed.depth - hy + 1e-6 || b.min[2] < -1e-6 || b.max[2] > bed.height + 1e-6
    checks.push(out
      ? { id: "build-volume", status: "failed", detail: `Motion reaches X${b.min[0].toFixed(1)}..${b.max[0].toFixed(1)} Y${b.min[1].toFixed(1)}..${b.max[1].toFixed(1)} Z${b.min[2].toFixed(1)}..${b.max[2].toFixed(1)} outside the ${bed.width} x ${bed.depth} x ${bed.height} mm volume` }
      : { id: "build-volume", status: "passed", detail: `Every motion stays inside the ${bed.width} x ${bed.depth} x ${bed.height} mm volume` })
  }

  checks.push(analysis.collisions.length > 0
    ? { id: "travel-collision", status: "failed", detail: analysis.issues.find((i) => i.code === "TravelCollision")!.message, line: analysis.collisions[0]!.line }
    : { id: "travel-collision", status: "passed", detail: "No travel moves through material already laid" })

  if (expect.claimedTimeSeconds === undefined) checks.push({ id: "time-model", status: "unresolved", detail: `The planner estimates ${analysis.timeSeconds.toFixed(0)} s; no claim to compare` })
  else {
    const ratio = Math.abs(expect.claimedTimeSeconds - analysis.timeSeconds) / Math.max(1, analysis.timeSeconds)
    const bound = expect.timeTolerance ?? 0.25
    checks.push(ratio <= bound
      ? { id: "time-model", status: "passed", detail: `The claimed ${expect.claimedTimeSeconds.toFixed(0)} s agrees with the planner's ${analysis.timeSeconds.toFixed(0)} s within ${(ratio * 100).toFixed(1)} % (bound ${(bound * 100).toFixed(0)} %)` }
      : { id: "time-model", status: "failed", detail: `The claimed ${expect.claimedTimeSeconds.toFixed(0)} s differs from the planner's ${analysis.timeSeconds.toFixed(0)} s by ${(ratio * 100).toFixed(1)} % (bound ${(bound * 100).toFixed(0)} %)` })
  }
  checks.push({ id: "dialect", status: analysis.issues.some((i) => i.code === "DialectMismatch") ? "failed" : "passed", detail: `${analysis.dialect}: ${analysis.dialectEvidence.join("; ")}${analysis.opaque.length > 0 ? `; ${analysis.opaque.length} opaque command(s) not modelled` : ""}` })
  return checks
}

// ---------------------------------------------------------------- cost

export interface CostInputs {
  readonly grams: number
  readonly hours: number
  /** Currency per kilogram of filament. */
  readonly filamentPerKg: number
  /** Machine time, currency per hour (depreciation, maintenance). */
  readonly machinePerHour?: number
  /** Electricity, kW and currency per kWh. */
  readonly powerKw?: number
  readonly energyPerKwh?: number
  /** Share of printed material that fails or is purged, 0..1. Default 0.05. */
  readonly waste?: number
  /** Labour per part (removal, support cleanup), currency. */
  readonly labour?: number
}

export interface CostBreakdown { readonly material: number; readonly machine: number; readonly energy: number; readonly labour: number; readonly total: number }

export const estimateCost = (c: CostInputs): CostBreakdown => {
  const material = (c.grams / 1000) * c.filamentPerKg * (1 + (c.waste ?? 0.05))
  const machine = c.hours * (c.machinePerHour ?? 0)
  const energy = c.hours * (c.powerKw ?? 0) * (c.energyPerKwh ?? 0)
  const labour = c.labour ?? 0
  return { material, machine, energy, labour, total: material + machine + energy + labour }
}
