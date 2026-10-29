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
