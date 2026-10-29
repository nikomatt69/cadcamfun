/**
 * Siemens 840D sl cycles for the six templates that have a native cycle (spec 69, cycles tab).
 * Argument order follows the 840D programming manual. A value outside the template's range is refused with the parameter name.
 * The other eleven templates stay on the ISO posts: Sinumerik has no one-call equivalent for them.
 */
import type { CycleTemplate, CycleValues } from "./templates.ts"

const PITCH: Readonly<Record<string, number>> = { M3: 0.5, M4: 0.7, M5: 0.8, M6: 1, M8: 1.25, M10: 1.5, M12: 1.75 }

export const SIEMENS_CYCLE_IDS = ["simple-drilling", "peck-drilling", "tapping-cycle", "boring-cycle", "rectangular-pocket", "slot-milling"] as const

export type SiemensCycleId = typeof SIEMENS_CYCLE_IDS[number]

const isSiemensId = (id: string): id is SiemensCycleId => (SIEMENS_CYCLE_IDS as ReadonlyArray<string>).includes(id)

const text = (value: number): string => String(value)

const numberAt = (cycle: CycleTemplate, values: CycleValues, name: string): number => {
  const raw = values[name]
  const value = typeof raw === "number" ? raw : Number(raw)
  if (!Number.isFinite(value)) throw new RangeError(`${name} is not a number`)
  const param = cycle.parameters.find((entry) => entry.name === name)
  if (param?.min !== undefined && value < param.min) throw new RangeError(`${name} is below ${param.min}`)
  if (param?.max !== undefined && value > param.max) throw new RangeError(`${name} is above ${param.max}`)
  return value
}

const header = (title: string, rpm: number, retract: number): string[] => [
  `; ${title}`,
  "G17 G90 G54",
  "T1 D1",
  `S${text(rpm)} M3`,
  `G0 X0 Y0 Z${text(retract)}`
]

const finish = (retract: number): string[] => [`G0 Z${text(retract)}`, "M5"]

/** Modal drilling: `MCALL` repeats the cycle at each position, then `MCALL` alone cancels it. */
const holes = (title: string, rpm: number, retract: number, feed: number, cycle: string): string => [
  ...header(title, rpm, retract),
  `F${text(feed)}`,
  `MCALL ${cycle}`,
  "X0 Y0",
  "X10 Y10",
  "X20 Y10",
  "X30 Y10",
  "MCALL",
  ...finish(retract)
].join("\n")

const simpleDrilling = (cycle: CycleTemplate, values: CycleValues): string => {
  const depth = numberAt(cycle, values, "depth")
  const retract = numberAt(cycle, values, "retractHeight")
  const feed = numberAt(cycle, values, "feedrate")
  const rpm = numberAt(cycle, values, "spindleSpeed")
  const dwell = numberAt(cycle, values, "dwellTime")
  // CYCLE81 has no dwell. A dwell at the bottom is CYCLE82 (DTB in seconds).
  const call = dwell > 0
    ? `CYCLE82(${text(retract)}, 0, 1, , ${text(-depth)}, ${text(dwell)})`
    : `CYCLE81(${text(retract)}, 0, 1, , ${text(-depth)})`
  return holes("SIMPLE DRILLING CYCLE", rpm, retract, feed, call)
}

const peckDrilling = (cycle: CycleTemplate, values: CycleValues): string => {
  const depth = numberAt(cycle, values, "depth")
  const peck = numberAt(cycle, values, "peckDepth")
  const retract = numberAt(cycle, values, "retractHeight")
  const feed = numberAt(cycle, values, "feedrate")
  const rpm = numberAt(cycle, values, "spindleSpeed")
  const dwell = numberAt(cycle, values, "dwellTime")
  // VARI 1 removes the chip (full retract). FDPR is the first peck, relative to the reference plane.
  const call = `CYCLE83(${text(retract)}, 0, 1, , ${text(-depth)}, , ${text(-peck)}, 0, ${text(dwell)}, 0, 1, 1)`
  return holes("PECK DRILLING CYCLE", rpm, retract, feed, call)
}

const tapping = (cycle: CycleTemplate, values: CycleValues): string => {
  const size = String(values["threadSize"] ?? "")
  const pitch = PITCH[size]
  if (pitch === undefined) throw new RangeError(`threadSize is not a metric size this cycle writes (${Object.keys(PITCH).join(", ")})`)
  const depth = numberAt(cycle, values, "depth")
  const rpm = numberAt(cycle, values, "spindleSpeed")
  const rigid = values["rigidTapping"] !== false
  // CYCLE84 is rigid tapping (PIT is the pitch). CYCLE840 is the compensating-chuck cycle.
  const call = rigid
    ? `CYCLE84(5, 0, 2, , ${text(-depth)}, 0, 3, , ${text(pitch)}, , ${text(rpm)}, ${text(rpm)})`
    : `CYCLE840(5, 0, 2, , ${text(-depth)}, 0, 0, 3, 0, , ${text(pitch)})`
  return holes(`TAPPING CYCLE ${size}`, rpm, 5, rpm * pitch, call)
}

const boring = (cycle: CycleTemplate, values: CycleValues): string => {
  const depth = numberAt(cycle, values, "depth")
  const feed = numberAt(cycle, values, "feedrate")
  const retractFeed = numberAt(cycle, values, "retractFeedrate")
  const rpm = numberAt(cycle, values, "spindleSpeed")
  const dwell = numberAt(cycle, values, "dwellTime")
  const call = `CYCLE85(5, 0, 2, , ${text(-depth)}, ${text(dwell)}, ${text(feed)}, ${text(retractFeed)})`
  return holes("BORING CYCLE", rpm, 5, feed, call)
}

const pocket = (cycle: CycleTemplate, values: CycleValues): string => {
  const depth = numberAt(cycle, values, "depth")
  const width = numberAt(cycle, values, "pocketWidth")
  const length = numberAt(cycle, values, "pocketLength")
  const radius = numberAt(cycle, values, "cornerRadius")
  const step = numberAt(cycle, values, "stepdown")
  const allowance = numberAt(cycle, values, "finishAllowance")
  const feed = numberAt(cycle, values, "feedrate")
  const plunge = numberAt(cycle, values, "plungeFeedrate")
  const tool = numberAt(cycle, values, "toolDiameter")
  const rpm = numberAt(cycle, values, "spindleSpeed")
  // CDIR 2 climbs (G2). VARI 1 roughs. MIDA is the widest plane infeed, half the cutter.
  const call = `POCKET3(50, 0, 2, ${text(-depth)}, ${text(width)}, ${text(length)}, ${text(radius)}, 0, 0, ${text(step)}, ${text(allowance)}, 0, ${text(feed)}, ${text(plunge)}, 2, 1, ${text(tool / 2)}, 0, 0, 0, 0, 0)`
  return [...header("RECTANGULAR POCKET CYCLE", rpm, 50), call, ...finish(50)].join("\n")
}

const slot = (cycle: CycleTemplate, values: CycleValues): string => {
  const depth = numberAt(cycle, values, "depth")
  const length = numberAt(cycle, values, "slotLength")
  const width = numberAt(cycle, values, "slotWidth")
  const step = numberAt(cycle, values, "stepdown")
  const feed = numberAt(cycle, values, "feedrate")
  const plunge = numberAt(cycle, values, "plungeFeedrate")
  const rpm = numberAt(cycle, values, "spindleSpeed")
  const call = `SLOT1(50, 0, 2, , ${text(-depth)}, 1, ${text(length)}, ${text(width)}, 0, 0, 0, 0, 0, ${text(plunge)}, ${text(feed)}, ${text(step)}, 2, 0, 0, ${text(step)}, ${text(feed)}, ${text(rpm)})`
  return [...header("SLOT MILLING CYCLE", rpm, 50), call, ...finish(50)].join("\n")
}

const WRITERS: Readonly<Record<SiemensCycleId, (cycle: CycleTemplate, values: CycleValues) => string>> = {
  "simple-drilling": simpleDrilling,
  "peck-drilling": peckDrilling,
  "tapping-cycle": tapping,
  "boring-cycle": boring,
  "rectangular-pocket": pocket,
  "slot-milling": slot
}

/** The Sinumerik block for one of the six native templates. */
export const siemensCycle = (cycle: CycleTemplate, values: CycleValues): string => {
  if (!isSiemensId(cycle.id)) throw new RangeError(`${cycle.id} has no Siemens fixed cycle`)
  return WRITERS[cycle.id](cycle, values)
}
