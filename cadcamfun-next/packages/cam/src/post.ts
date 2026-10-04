import type { Controller } from "./machine"
import type { DrillCycle, Move, Program, Toolpath } from "./toolpath"
import { expandCycle } from "./toolpath"

export interface PostOptions {
  readonly controller: Controller
  /** Automatic tool changer; otherwise tool changes become program stops. */
  readonly toolChanger?: boolean
  /** Decimal places for coordinates. */
  readonly precision?: number
  /** Fanuc-style program number. */
  readonly programNumber?: number
}

type Axes = { x?: number; y?: number; z?: number }

/** Emits one controller dialect. Modal state (position, feed) is tracked by the shared driver. */
interface Dialect {
  readonly header: (p: Program, o: Required<PostOptions>) => Array<string>
  readonly comment: (text: string) => string
  readonly toolChange: (t: Toolpath, o: Required<PostOptions>) => Array<string>
  readonly coolant: (t: Toolpath) => Array<string>
  readonly rapid: (a: Axes, fmt: Fmt) => string
  readonly feed: (a: Axes, f: number | undefined, fmt: Fmt) => string
  /** Canned cycle lines, or undefined to expand into explicit moves. */
  readonly cycle?: (c: DrillCycle, fmt: Fmt, first: boolean) => Array<string>
  readonly cycleEnd?: Array<string>
  readonly footer: (p: Program, o: Required<PostOptions>) => Array<string>
  readonly lineNumbers?: (lines: Array<string>) => Array<string>
}

type Fmt = (n: number) => string

const paren = (text: string) => `(${text.replace(/[()]/g, "")})`
const units = (p: Program) => (p.units === "mm" ? "G21" : "G20")
const words = (a: Axes, fmt: Fmt) =>
  [a.x !== undefined ? `X${fmt(a.x)}` : "", a.y !== undefined ? `Y${fmt(a.y)}` : "", a.z !== undefined ? `Z${fmt(a.z)}` : ""]
    .filter(Boolean)
    .join(" ")
const coolantM = (t: Toolpath) => (t.coolant === "flood" ? ["M8"] : t.coolant === "mist" ? ["M7"] : [])

const isoMotion = {
  rapid: (a: Axes, fmt: Fmt) => `G0 ${words(a, fmt)}`,
  feed: (a: Axes, f: number | undefined, fmt: Fmt) => `G1 ${words(a, fmt)}${f !== undefined ? ` F${fmt(f)}` : ""}`,
}

const isoCycle = (c: DrillCycle, fmt: Fmt, first: boolean) =>
  first
    ? [
        c.peck > 0
          ? `G98 G83 X${fmt(c.x)} Y${fmt(c.y)} Z${fmt(c.z)} R${fmt(c.r)} Q${fmt(c.peck)} F${fmt(c.f)}`
          : `G98 G81 X${fmt(c.x)} Y${fmt(c.y)} Z${fmt(c.z)} R${fmt(c.r)} F${fmt(c.f)}`,
      ]
    : [`X${fmt(c.x)} Y${fmt(c.y)}`]

const dialects: Record<Controller, Dialect> = {
  grbl: {
    header: (p) => [paren(p.name), `G90 G94 G17 ${units(p)}`],
    comment: paren,
    toolChange: (t, o) => [
      ...(o.toolChanger ? [`T${t.toolNumber} M6`] : [paren(`Change to T${t.toolNumber} ${t.toolName}`), "M5", "M0"]),
      `S${Math.round(t.rpm)} M3`,
      "G4 P2",
    ],
    coolant: coolantM,
    ...isoMotion,
    footer: () => ["M5", "M9", "M30"],
  },
  linuxcnc: {
    header: (p) => [paren(p.name), `G17 G90 G94 G40 G49 G80 ${units(p)}`, "G64 P0.01"],
    comment: paren,
    toolChange: (t) => [`T${t.toolNumber} M6`, `G43 H${t.toolNumber}`, `S${Math.round(t.rpm)} M3`],
    coolant: coolantM,
    ...isoMotion,
    cycle: isoCycle,
    cycleEnd: ["G80"],
    footer: () => ["M5", "M9", "M2"],
  },
  fanuc: {
    header: (p, o) => [
      "%",
      `O${String(o.programNumber).padStart(4, "0")} ${paren(p.name.toUpperCase())}`,
      `G17 G40 G49 G80 G90 ${units(p)}`,
    ],
    comment: paren,
    toolChange: (t) => ["G91 G28 Z0", "G90", `T${t.toolNumber} M6`, `S${Math.round(t.rpm)} M3`, `G43 H${t.toolNumber}`],
    coolant: coolantM,
    ...isoMotion,
    cycle: isoCycle,
    cycleEnd: ["G80"],
    footer: () => ["M5", "M9", "G91 G28 Z0", "G90", "M30", "%"],
    lineNumbers: (lines) => {
      let n = 0
      return lines.map((l) => (l === "%" || l.startsWith("O") || l.startsWith("(") ? l : `N${(n += 10)} ${l}`))
    },
  },
  heidenhain: {
    header: (p) => [`BEGIN PGM ${p.name.replace(/\W+/g, "_").toUpperCase() || "PART"} ${p.units === "mm" ? "MM" : "INCH"}`],
    comment: (text) => `; ${text}`,
    toolChange: (t) => [`TOOL CALL ${t.toolNumber} Z S${Math.round(t.rpm)}`, "M3"],
    coolant: (t) => (t.coolant && t.coolant !== "none" ? ["M8"] : []),
    rapid: (a, fmt) => `L ${words(a, fmt)} FMAX`,
    feed: (a, f, fmt) => `L ${words(a, fmt)}${f !== undefined ? ` F${Math.round(f)}` : ""}`,
    cycle: (c, fmt, first) => [
      ...(first
        ? [
            "CYCL DEF 200 DRILLING",
            `  Q200=${fmt(c.r)} ;SET-UP CLEARANCE`,
            `  Q201=${fmt(c.z)} ;DEPTH`,
            `  Q206=${Math.round(c.f)} ;FEED RATE FOR PLNGNG`,
            `  Q202=${fmt(c.peck > 0 ? c.peck : -c.z)} ;PLUNGING DEPTH`,
            "  Q210=0 ;DWELL TIME AT TOP",
            "  Q203=0 ;SURFACE COORDINATE",
            `  Q204=${fmt(c.r)} ;2ND SET-UP CLEARANCE`,
          ]
        : []),
      `L X${fmt(c.x)} Y${fmt(c.y)} FMAX M99`,
    ],
    footer: (p) => ["M5", "M9", "L Z+100 R0 FMAX M2", `END PGM ${p.name.replace(/\W+/g, "_").toUpperCase() || "PART"} ${p.units === "mm" ? "MM" : "INCH"}`],
    lineNumbers: (lines) => lines.map((l, i) => `${i} ${l}`),
  },
  marlin: {
    header: (p) => [`; ${p.name}`, "G90", units(p)],
    comment: (text) => `; ${text}`,
    toolChange: (t) => [`; Tool ${t.toolNumber} ${t.toolName}`, "M0 Change tool", `M3 S${Math.round(t.rpm)}`],
    coolant: () => [],
    ...isoMotion,
    footer: () => ["M5"],
  },
}

/**
 * Turn a machine-independent program into controller code. Only changed axes and feeds are
 * emitted; canned drilling cycles are used where the controller supports them.
 */
export const post = (program: Program, options: PostOptions): string => {
  const o: Required<PostOptions> = {
    controller: options.controller,
    toolChanger: options.toolChanger ?? options.controller !== "grbl",
    precision: options.precision ?? 3,
    programNumber: options.programNumber ?? 1000,
  }
  const d = dialects[o.controller]
  const fmt: Fmt = (n) => {
    const s = n.toFixed(o.precision).replace(/\.?0+$/, "")
    const v = s === "-0" ? "0" : s
    return o.controller === "heidenhain" && !v.startsWith("-") ? `+${v}` : v
  }
  const lines: Array<string> = [...d.header(program, o)]
  let pos: Axes = {}
  let feed: number | undefined
  let inCycle = false

  const diff = (m: { x: number; y: number; z: number }): Axes => ({
    ...(m.x !== pos.x ? { x: m.x } : {}),
    ...(m.y !== pos.y ? { y: m.y } : {}),
    ...(m.z !== pos.z ? { z: m.z } : {}),
  })
  const endCycle = () => {
    if (inCycle && d.cycleEnd) lines.push(...d.cycleEnd)
    inCycle = false
  }
  const motion = (m: Exclude<Move, DrillCycle>) => {
    const a = diff(m)
    if (Object.keys(a).length === 0) return
    if (m._tag === "Rapid") lines.push(d.rapid(a, fmt))
    else {
      lines.push(d.feed(a, m.f !== feed ? m.f : undefined, fmt))
      feed = m.f
    }
    pos = { x: m.x, y: m.y, z: m.z }
  }

  let currentTool: number | undefined
  for (const t of program.toolpaths) {
    endCycle()
    lines.push(d.comment(`${t.name} - T${t.toolNumber} ${t.toolName} D${fmt(t.toolDiameter)}`))
    if (t.toolNumber !== currentTool) {
      lines.push(...d.toolChange(t, o), ...d.coolant(t))
      currentTool = t.toolNumber
      pos = {}
      feed = undefined
    }
    lines.push(d.rapid({ z: program.safeZ }, fmt))
    pos = { z: program.safeZ }
    for (const m of t.moves) {
      if (m._tag !== "DrillCycle") {
        endCycle()
        motion(m)
        continue
      }
      if (!d.cycle) {
        for (const e of expandCycle(m, pos.z ?? program.safeZ)) motion(e)
        continue
      }
      // Canned cycles start from the clearance plane above the first hole.
      if (!inCycle) motion({ _tag: "Rapid", x: m.x, y: m.y, z: pos.z ?? program.safeZ })
      lines.push(...d.cycle(m, fmt, !inCycle))
      inCycle = true
      pos = { ...pos, x: m.x, y: m.y }
      feed = undefined
    }
  }
  endCycle()
  lines.push(d.rapid({ z: program.safeZ }, fmt), ...d.footer(program, o))
  return (d.lineNumbers ? d.lineNumbers(lines) : lines).join("\n") + "\n"
}
