import { cam } from "@cadcamfun/core"

const g = cam.generator

/** Cycle parameters the integration panel lists (legacy `FixedCycleParams` read off a G81 line). */
export interface PanelCycle { readonly x?: number; readonly y?: number; readonly z?: number; readonly r?: number; readonly f?: number; readonly q?: number }

const NUMBER = (line: string, letter: string): number | undefined => {
  const match = line.match(new RegExp(`${letter}([+-]?\\d*\\.?\\d+)`))
  return match ? parseFloat(match[1]!) : undefined
}

/** The G81 lines of a program, as the legacy `ToolpathGeneratorIntegration` extracted them for its info panel. */
export const panelCycles = (gcode: string): PanelCycle[] =>
  gcode.split("\n").map((line) => line.trim())
    .filter((line) => g.parseFixedCycle(line)?.isValid === true && line.includes("G81"))
    .map((line) => ({ x: NUMBER(line, "X"), y: NUMBER(line, "Y"), z: NUMBER(line, "Z"), r: NUMBER(line, "R"), f: NUMBER(line, "F") }))
