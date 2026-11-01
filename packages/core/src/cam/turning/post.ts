/**
 * Lathe NC writers (spec 52 P1): the turning plan as program text for three dialects.
 *
 *   fanuc    0i/31i family: `G99` feed per revolution, `G96` constant surface speed with `G50 S` ceiling, `T0101` turret tool + offset,
 *            canned `G71 U R / G71 P Q U W F`, `G70`, `G75` grooving, `G76` threading (two-block form), or explicit moves
 *   siemens  Sinumerik 840D native: `G18 G95 DIAMON`, `T<n> D1`, `G96 S LIMS=`, `G33 Z K` threads, explicit moves (no cycle:
 *            `CYCLE95` needs a contour subroutine in the program memory, which this writer does not generate)
 *
 * What is not claimed: Mazak, Okuma, Mitsubishi and LinuxCNC lathe words are not written (the mill posts of those controls do not
 * cover turning); a program is verified against the interpreter's reading of the dialect, not on a controller (spec 55 §6).
 */
import type { CycleSpec, LatheMove, LatheOperation, LathePlan } from "./plan.ts"

export type LatheDialect = "fanuc" | "siemens"
export const LATHE_DIALECTS: ReadonlyArray<LatheDialect> = ["fanuc", "siemens"]

export interface LatheNcOptions {
  readonly dialect: LatheDialect
  /** Write the control's canned cycles where the plan has them (fanuc, haas). Default true. */
  readonly cycles?: boolean
  readonly programNumber?: number
  readonly name?: string
}

export interface LatheNc {
  readonly nc: string
  /** The canned cycles that were written, by G word. */
  readonly cycles: ReadonlyArray<string>
  /** Operations written as explicit moves although the plan describes a cycle, with the reason. */
  readonly explicit: ReadonlyArray<{ readonly operation: string; readonly reason: string }>
}

const num = (v: number): string => {
  const s = (Object.is(v, -0) ? 0 : v).toFixed(3)
  return s
}
const um = (mm: number): number => Math.max(1, Math.round(mm * 1000))

const samePath = (a: ReadonlyArray<{ x: number; z: number }>, b: ReadonlyArray<{ x: number; z: number }>): boolean =>
  a.length === b.length && a.every((p, i) => Math.abs(p.x - b[i]!.x) < 1e-6 && Math.abs(p.z - b[i]!.z) < 1e-6)

export const emitLathe = (plan: LathePlan, options: LatheNcOptions): LatheNc => {
  const { dialect } = options
  const useCycles = options.cycles !== false && dialect !== "siemens"
  const cycles: string[] = []
  const explicit: Array<{ operation: string; reason: string }> = []
  const siemens = dialect === "siemens"
  const comment = (t: string): string => (siemens ? `; ${t.toUpperCase()}` : `(${t.toUpperCase().replace(/[()]/g, "")})`)
  const lines: string[] = []
  const name = options.name ?? "LATHE"
  if (siemens) lines.push(`%_N_${name.toUpperCase().replace(/[^A-Z0-9_]/g, "_")}_MPF`, ";$PATH=/_N_MPF_DIR", "G18 G71 G90 G95 G40 DIAMON")
  else lines.push("%", `O${String(options.programNumber ?? 1000).padStart(4, "0")}`, comment(`${name} - DIAMETER X - TOOL REFERENCE = NOSE CENTRE`), "G21 G40 G80 G99 G18")
  // The turret starts clear of the bar: the first move is from there.
  lines.push(`G0 X${num(plan.stock.diameter + 20)} Z${num(plan.faceAllowance + 20)}`)
  let n = 10
  let previousRough: { operation: LatheOperation; first: number; last: number } | undefined
  let toolNumber = -1
  const rapid = (x: number, z: number): string => `G0 X${num(x)} Z${num(z)}`
  for (const op of plan.operations) {
    lines.push(comment(op.name))
    const t = op.tool.number
    if (t !== toolNumber) {
      lines.push(siemens ? `T${t} D${op.tool.offset ?? 1}` : `T${String(t).padStart(2, "0")}${String(op.tool.offset ?? t).padStart(2, "0")}`)
      toolNumber = t
    }
    if (op.kind === "thread") {
      // Threads run at a constant spindle speed: the lead is per revolution of a spindle that must not change speed.
      lines.push(`G97 S${op.rpm ?? 500} M3`)
    } else {
      const css = Math.round(op.css ?? 150)
      lines.push(siemens ? `G96 S${css} LIMS=${op.rpmLimit} M3` : `G50 S${op.rpmLimit}`, ...(siemens ? [] : [`G96 S${css} M3`]))
    }
    lines.push(rapid(op.start.x, op.start.z), "M8")
    const spec: CycleSpec | undefined = op.cycle
    let written = false
    if (useCycles && spec !== undefined) {
      if (spec.cycle === "g71") {
        const first = n
        const last = n + spec.profile.length - 1
        lines.push(`G71 U${num(spec.depth)} R${num(spec.retract)}`, `G71 P${first} Q${last} U${num(spec.allowance.x)} W${num(spec.allowance.z)} F${num(spec.feed)}`)
        spec.profile.forEach((p, i) => lines.push(i === 0 ? `N${first} G0 X${num(p.x)}` : `N${first + i} G1 X${num(p.x)} Z${num(p.z)} F${num(spec.feed)}`))
        previousRough = { operation: op, first, last }
        n = last + 10
        cycles.push("G71")
        written = true
      } else if (spec.cycle === "g70") {
        // G70 reads the blocks of the roughing cycle: only when the finish follows it on the same profile (same nose-centre path).
        const rough = previousRough
        const roughSpec = rough?.operation.cycle
        if (rough !== undefined && roughSpec?.cycle === "g71" && samePath(roughSpec.profile, spec.profile)) {
          lines.push(`G70 P${rough.first} Q${rough.last}`)
          cycles.push("G70")
          written = true
        } else explicit.push({ operation: op.name, reason: "its nose-centre path differs from the roughing profile the G70 blocks hold (another nose radius): written as moves" })
      } else if (spec.cycle === "g75") {
        lines.push(`G75 R${num(spec.retract)}`, `G75 X${num(spec.end.x)} Z${num(spec.end.z)} P${um(spec.peckX)} Q${um(spec.stepZ)} F${num(spec.feed)}`)
        // The cycle starts where the tool stands: the plunge column of the +z wall.
        lines.splice(lines.length - 2, 0, rapid(spec.start.x, spec.start.z))
        cycles.push("G75")
        written = true
        // The cycle ends at its start point.
        lines.push(rapid(op.start.x, op.start.z))
      } else if (spec.cycle === "g76") {
        lines.push(rapid(spec.start.x, spec.start.z))
        lines.push(`G76 P${String(spec.finishPasses).padStart(2, "0")}0060 Q${um(spec.minDepth)} R${num(spec.finishAllowance)}`, `G76 X${num(spec.root.x)} Z${num(spec.root.z)} P${um(spec.height)} Q${um(spec.firstDepth)} F${num(spec.pitch)}`)
        cycles.push("G76")
        written = true
        lines.push(rapid(op.start.x, op.start.z))
      }
    } else if (spec !== undefined && siemens) explicit.push({ operation: op.name, reason: "Sinumerik cycles need a contour subroutine in program memory: written as moves" })
    if (!written) {
      let feedWritten = Number.NaN
      for (const m of op.moves) lines.push(moveLine(m, op, siemens, () => feedWritten, (f) => { feedWritten = f }))
    }
    lines.push("M9")
  }
  lines.push(siemens ? "G97 M5" : "M5", siemens ? "M30" : "M30")
  if (!siemens) lines.push("%")
  return { nc: lines.join("\n") + "\n", cycles, explicit }
}

const moveLine = (m: LatheMove, op: LatheOperation, siemens: boolean, lastFeed: () => number, setFeed: (f: number) => void): string => {
  if (m.kind === "rapid") return `G0 X${num(m.x)} Z${num(m.z)}`
  if (m.kind === "thread") {
    setFeed(Number.NaN)
    return siemens ? `G33 X${num(m.x)} Z${num(m.z)} K${num(m.pitch ?? op.feed)}` : `G32 X${num(m.x)} Z${num(m.z)} F${num(m.pitch ?? op.feed)}`
  }
  const f = m.feed ?? op.feed
  const word = f === lastFeed() ? "" : ` F${num(f)}`
  setFeed(f)
  return `G1 X${num(m.x)} Z${num(m.z)}${word}`
}
