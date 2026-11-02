import type { CutterCompCodes } from "./types.ts"

/** ISO cutter radius compensation shared by both compensated IR forms. */
export const isoCutterComp: CutterCompCodes = {
  on: (side, register) => `${side === "left" ? "G41" : "G42"} D${register}`,
  off: "G40"
}
