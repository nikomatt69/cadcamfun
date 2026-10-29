/**
 * Heidenhain fixed cycles for the drilling moves of the IR (spec 69 G4c.1). A hole is a `CYCL DEF` of the cycle that does what
 * the move says, written once and called with `M99` on the positioning block of each hole:
 *
 *   drill (G81), dwell (G82)   200 DRILLING                   plunge in one pass, dwell at the bottom
 *   peck (G83)                 205 UNIVERSAL PECKING          full retract to the set-up clearance between pecks
 *   chipBreak (G73)            205 UNIVERSAL PECKING          one pass, `Q257` chip-break every peck, `Q256` retract
 *   ream (G85)                 201 REAMING                    fed in and out
 *   bore (G86)                 202 BORING                     fed in, rapid out, no disengaging (`Q214=0`)
 *   tap (G84)                  207 RIGID TAPPING              `Q239` is the pitch
 *
 * The IR's R plane is where the feed starts, so `Q203` (surface) is the R plane and the set-up clearances are 0: the cycle feeds
 * from R, as the ISO cycles do. Parameters follow the TNC 640 cycle manual (10/2017); no output was run on a control.
 */
import type { CycleMove } from "../ir.ts"
import { CHIP_BREAK_RETRACT } from "../ir.ts"
import { KLARTEXT_PREFIX } from "./macro-syntax.ts"

export interface KlartextCycle {
  /** `CYCL DEF` blocks, finished Klartext (the writer hands them to the translator as they are). */
  readonly define: ReadonlyArray<string>
  /** Equal for two holes the same definition serves. */
  readonly signature: string
}

const sign = (n: number, decimals: number): string => `${n < 0 ? "-" : "+"}${Number(Math.abs(n).toFixed(decimals))}`

/** The definition of the cycle that makes `move`; the tool is positioned over the hole at the R plane. */
export const klartextCycle = (move: CycleMove, decimals: number): KlartextCycle => {
  const depth = move.to.z - move.retractHeight
  if (!(depth < 0)) throw new RangeError("A Klartext drilling cycle needs the hole bottom below the R plane")
  const q = (rows: ReadonlyArray<readonly [number, number, string]>): string[] => rows.map(([n, v, label], i) => `${KLARTEXT_PREFIX}  Q${n}=${sign(v, decimals)} ;${label}${i === rows.length - 1 ? "" : " ~"}`)
  const head = (n: number, name: string): string => `${KLARTEXT_PREFIX}CYCL DEF ${n} ${name} ~`
  const feed = move.feed
  const dwell = move.dwellSeconds
  const R = move.retractHeight
  let define: string[]
  switch (move.cycle) {
    case "drill":
    case "dwell":
      define = [head(200, "DRILLING"), ...q([[200, 0, "SET-UP CLEARANCE"], [201, depth, "DEPTH"], [206, feed, "FEED RATE FOR PLUNGING"], [202, -depth, "PLUNGING DEPTH"], [210, 0, "DWELL TIME AT TOP"], [203, R, "SURFACE COORDINATE"], [204, 0, "2ND SET-UP CLEARANCE"], [211, dwell, "DWELL TIME AT DEPTH"], [395, 0, "DEPTH REFERENCE"]])]
      break
    case "peck":
    case "chipBreak": {
      const chip = move.cycle === "chipBreak"
      define = [head(205, "UNIVERSAL PECKING"), ...q([
        [200, 0, "SET-UP CLEARANCE"], [201, depth, "DEPTH"], [206, feed, "FEED RATE FOR PLUNGING"], [202, chip ? -depth : move.peckDepth, "PLUNGING DEPTH"], [203, R, "SURFACE COORDINATE"], [204, 0, "2ND SET-UP CLEARANCE"],
        [212, 0, "DECREMENT"], [205, 0, "MIN. PLUNGING DEPTH"], [258, 0.2, "UPPER ADV. STOP DISTANCE"], [259, 0.2, "LOWER ADV. STOP DISTANCE"],
        [257, chip ? move.peckDepth : 0, "DEPTH FOR CHIP BREAKING"], [256, chip ? CHIP_BREAK_RETRACT : 0, "DIST. FOR CHIP BRKNG"], [211, dwell, "DWELL TIME AT DEPTH"], [379, 0, "STARTING POINT"], [253, 750, "F PRE-POSITIONING"], [208, 99999, "RETRACTION FEED RATE"], [395, 0, "DEPTH REFERENCE"]
      ])]
      break
    }
    case "ream":
      define = [head(201, "REAMING"), ...q([[200, 0, "SET-UP CLEARANCE"], [201, depth, "DEPTH"], [206, feed, "FEED RATE FOR PLUNGING"], [211, dwell, "DWELL TIME AT DEPTH"], [208, feed, "RETRACTION FEED RATE"], [203, R, "SURFACE COORDINATE"], [204, 0, "2ND SET-UP CLEARANCE"]])]
      break
    case "bore":
      define = [head(202, "BORING"), ...q([[200, 0, "SET-UP CLEARANCE"], [201, depth, "DEPTH"], [206, feed, "FEED RATE FOR PLUNGING"], [211, dwell, "DWELL TIME AT DEPTH"], [208, 99999, "RETRACTION FEED RATE"], [203, R, "SURFACE COORDINATE"], [204, 0, "2ND SET-UP CLEARANCE"], [214, 0, "DISENGAGING DIRECTION"], [336, 0, "ANGLE OF SPINDLE"]])]
      break
    case "tap":
      if (move.pitch === undefined) throw new RangeError("Rigid tapping needs the thread pitch")
      define = [head(207, "RIGID TAPPING"), ...q([[200, 0, "SET-UP CLEARANCE"], [201, depth, "DEPTH OF THREAD"], [239, move.pitch, "PITCH"], [203, R, "SURFACE COORDINATE"], [204, 0, "2ND SET-UP CLEARANCE"]])]
      break
  }
  return { define, signature: define.join("\n") }
}

// ---------------------------------------------------------------- cycles the IR marks (CycleBegin .. CycleEnd)

/** A cycle's parameter rows in the order of the cycle manual: number, label, and a default (absent = the caller must give it). */
interface CycleTable { readonly name: string; readonly rows: ReadonlyArray<readonly [number, string, number | undefined]> }

export const KLARTEXT_CYCLES: Readonly<Record<number, CycleTable>> = {
  // 208 BORE MILLING: a helix of pitch Q334 at the radius that leaves the nominal diameter Q335, Q342 the diameter to rough to first.
  // 262 THREAD MILLING / 267 OUTSIDE THREAD MILLING: Q239 is the pitch, positive for a right-hand thread; Q201 the (negative) thread depth;
  // Q355 = 0 is one helix through the whole thread; Q207 the milling feed, Q253 and Q512 the feed to pre-position and to approach.
  262: { name: "THREAD MILLING", rows: [[335, "NOMINAL DIAMETER", undefined], [239, "PITCH", undefined], [201, "DEPTH OF THREAD", undefined], [355, "THREADS PER STEP", 0], [253, "F PRE-POSITIONING", 750], [351, "CLIMB OR UP-CUT", 1], [200, "SET-UP CLEARANCE", 0], [203, "SURFACE COORDINATE", undefined], [204, "2ND SET-UP CLEARANCE", 0], [207, "FEED RATE FOR MILLING", undefined], [512, "FEED FOR APPROACHING", 0]] },
  267: { name: "OUTSIDE THREAD MILLING", rows: [[335, "NOMINAL DIAMETER", undefined], [239, "PITCH", undefined], [201, "DEPTH OF THREAD", undefined], [355, "THREADS PER STEP", 0], [253, "F PRE-POSITIONING", 750], [351, "CLIMB OR UP-CUT", 1], [200, "SET-UP CLEARANCE", 0], [203, "SURFACE COORDINATE", undefined], [204, "2ND SET-UP CLEARANCE", 0], [207, "FEED RATE FOR MILLING", undefined], [512, "FEED FOR APPROACHING", 0], [358, "DEPTH FOR COUNTERSINKING", 0], [359, "COUNTERSINKING OFFSET", 0]] },
  208: { name: "BORE MILLING", rows: [[200, "SET-UP CLEARANCE", 0], [201, "DEPTH", undefined], [206, "FEED RATE FOR PLUNGING", undefined], [334, "INFEED PER HELIX", undefined], [203, "SURFACE COORDINATE", undefined], [204, "2ND SET-UP CLEARANCE", 0], [335, "NOMINAL DIAMETER", undefined], [342, "ROUGHING DIAMETER", 0], [351, "CLIMB OR UP-CUT", 1]] }
}

/** The definition of the marked cycle `number` with `params` (`Q200` .. keys); refuses a cycle it does not know or a parameter it lacks. */
export const klartextFixedCycle = (number: number, params: Readonly<Record<string, number>>, decimals: number): KlartextCycle => {
  const table = KLARTEXT_CYCLES[number]
  if (table === undefined) throw new RangeError(`Klartext cycle ${number} is not one this post writes (known: ${Object.keys(KLARTEXT_CYCLES).join(", ")})`)
  const rows = table.rows.map(([q, label, fallback]) => {
    const v = params[`Q${q}`] ?? fallback
    if (v === undefined) throw new RangeError(`Cycle ${number} ${table.name} needs Q${q} (${label.toLowerCase()})`)
    return [q, v, label] as const
  })
  const lines = [`${KLARTEXT_PREFIX}CYCL DEF ${number} ${table.name} ~`, ...rows.map(([n, v, label], i) => `${KLARTEXT_PREFIX}  Q${n}=${sign(v, decimals)} ;${label}${i === rows.length - 1 ? "" : " ~"}`)]
  return { define: lines, signature: lines.join("\n") }
}
