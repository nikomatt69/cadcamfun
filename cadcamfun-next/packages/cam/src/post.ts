import type { Controller } from "./machine"
import type { Move, Program, Toolpath } from "./toolpath"

export interface PostOptions {
  readonly controller: Controller
  /** Automatic tool changer; otherwise tool changes become program stops. */
  readonly toolChanger?: boolean
  /** Decimal places for coordinates. */
  readonly precision?: number
  /** Fanuc-style program number. */
  readonly programNumber?: number
}

interface Dialect {
  readonly comment: (text: string) => string
  readonly header: (p: Program, o: Required<PostOptions>) => Array<string>
  readonly toolChange: (t: Toolpath, o: Required<PostOptions>) => Array<string>
  readonly footer: (p: Program) => Array<string>
  readonly lineNumbers: boolean
}

const paren = (text: string) => `(${text.replace(/[()]/g, "")})`
const units = (p: Program) => (p.units === "mm" ? "G21" : "G20")

const dialects: Record<Controller, Dialect> = {
  grbl: {
    comment: paren,
    header: (p) => [paren(`${p.name}`), `G90 G94 G17 ${units(p)}`],
    toolChange: (t, o) => [
      ...(o.toolChanger ? [`T${t.toolNumber} M6`] : [paren(`Change to T${t.toolNumber} ${t.toolName}`), "M5", "M0"]),
      `S${Math.round(t.rpm)} M3`,
      "G4 P2",
    ],
    footer: () => ["M5", "M30"],
    lineNumbers: false,
  },
  linuxcnc: {
    comment: paren,
    header: (p) => [paren(p.name), `G17 G90 G94 G40 G49 G80 ${units(p)}`, "G64 P0.01"],
    toolChange: (t) => [`T${t.toolNumber} M6`, `G43 H${t.toolNumber}`, `S${Math.round(t.rpm)} M3`],
    footer: () => ["M5", "M9", "M2"],
    lineNumbers: false,
  },
  fanuc: {
    comment: paren,
    header: (p, o) => [
      "%",
      `O${String(o.programNumber).padStart(4, "0")} ${paren(p.name.toUpperCase())}`,
      `G17 G40 G49 G80 G90 ${units(p)}`,
    ],
    toolChange: (t) => ["G91 G28 Z0", "G90", `T${t.toolNumber} M6`, `S${Math.round(t.rpm)} M3`, `G43 H${t.toolNumber}`],
    footer: () => ["M5", "G91 G28 Z0", "G90", "M30", "%"],
    lineNumbers: true,
  },
  marlin: {
    comment: (text) => `; ${text}`,
    header: (p) => [`; ${p.name}`, "G90", units(p)],
    toolChange: (t) => [`; Tool ${t.toolNumber} ${t.toolName}`, "M0 Change tool", `M3 S${Math.round(t.rpm)}`],
    footer: () => ["M5"],
    lineNumbers: false,
  },
}

/**
 * Turn a machine-independent program into controller G-code. Modal state is tracked so
 * repeated words (G1, unchanged axes, feed) are not re-emitted.
 */
export const post = (program: Program, options: PostOptions): string => {
  const o: Required<PostOptions> = {
    controller: options.controller,
    toolChanger: options.toolChanger ?? options.controller !== "grbl",
    precision: options.precision ?? 3,
    programNumber: options.programNumber ?? 1000,
  }
  const d = dialects[o.controller]
  const fmt = (n: number) => {
    const s = n.toFixed(o.precision).replace(/\.?0+$/, "")
    return s === "-0" ? "0" : s
  }
  const lines: Array<string> = [...d.header(program, o)]
  let mode: "G0" | "G1" | undefined
  let x: number | undefined
  let y: number | undefined
  let z: number | undefined
  let f: number | undefined

  const emitMove = (m: Move) => {
    const g = m._tag === "Rapid" ? "G0" : "G1"
    const words: Array<string> = []
    if (g !== mode) words.push(g)
    if (m.x !== x) words.push(`X${fmt(m.x)}`)
    if (m.y !== y) words.push(`Y${fmt(m.y)}`)
    if (m.z !== z) words.push(`Z${fmt(m.z)}`)
    if (m._tag === "Feed" && m.f !== f) {
      words.push(`F${fmt(m.f)}`)
      f = m.f
    }
    if (words.length === 0 || (words.length === 1 && words[0] === g)) return
    mode = g
    x = m.x
    y = m.y
    z = m.z
    lines.push(words.join(" "))
  }

  let currentTool: number | undefined
  for (const t of program.toolpaths) {
    lines.push(d.comment(`${t.name} - T${t.toolNumber} ${t.toolName} D${fmt(t.toolDiameter)}`))
    if (t.toolNumber !== currentTool) {
      lines.push(...d.toolChange(t, o))
      currentTool = t.toolNumber
      mode = undefined
      x = y = z = f = undefined
    }
    lines.push(`G0 Z${fmt(program.safeZ)}`)
    mode = "G0"
    z = program.safeZ
    for (const m of t.moves) emitMove(m)
  }
  lines.push(`G0 Z${fmt(program.safeZ)}`, ...d.footer(program))

  if (!d.lineNumbers) return lines.join("\n") + "\n"
  let n = 10
  return (
    lines.map((l) => (l === "%" || l.startsWith("O") || l.startsWith("(") ? l : `N${(n += 10) - 10} ${l}`)).join("\n") +
    "\n"
  )
}
