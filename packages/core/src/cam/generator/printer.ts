/**
 * 3D printer G-code. The program is written by the slicer (`../print`): the selected solids are meshed, set on the plate, cut
 * into layers and printed with walls, skin, bridges, infill, supports and adhesion. This module is the generator's door to
 * it: it turns the selected CAD elements into a program and says what could not be printed.
 */
import type { CadElement } from "./schema.ts"
import { printBodies } from "../print/bodies.ts"
import { slicePrint, type PrintOptions } from "../print/index.ts"
import type { PrintStats } from "../print/types.ts"
import type { PrintCheck } from "../print/verify.ts"
import type { PrinterSettings } from "./printer-base.ts"

export { calculateExtrusion } from "./printer-base.ts"
export type { PrinterSettings }

export interface PrinterProgram {
  readonly gcode: string
  /** Set when nothing could be printed. */
  readonly error?: string
  readonly warnings: ReadonlyArray<string>
  readonly stats?: PrintStats
  /** Checks of the program against the material it was cut from. */
  readonly checks?: ReadonlyArray<PrintCheck>
}

/** The program for the selected elements, printed together as one job. */
export const generate3DPrinterProgram = (elements: ReadonlyArray<CadElement>, s: PrinterSettings, options: PrintOptions = {}): PrinterProgram => {
  const bodies = printBodies(elements)
  const skipped = bodies.skipped.map((name) => `${name} is not a solid and was not printed`)
  if (bodies.errors.length > 0) {
    const message = bodies.errors.join("; ")
    return { gcode: `; Error: ${message}\n`, error: message, warnings: [...bodies.warnings, ...skipped] }
  }
  if (bodies.meshes.length === 0) {
    const message = bodies.skipped.length > 0
      ? `Nothing to print: ${bodies.skipped.join(", ")} ${bodies.skipped.length === 1 ? "has" : "have"} no volume. Select a solid.`
      : "Nothing to print: select a solid."
    return { gcode: `; Error: ${message}\n`, error: message, warnings: [...bodies.warnings, ...skipped] }
  }
  try {
    const result = slicePrint(bodies.meshes, s, options)
    const notes = [...bodies.warnings, ...skipped]
    const gcode = notes.length === 0 ? result.gcode : `${notes.map((n) => `; Warning: ${n}`).join("\n")}\n${result.gcode}`
    return { gcode, warnings: [...notes, ...result.warnings], stats: result.stats, checks: result.checks }
  } catch (cause) {
    if (cause instanceof Error && cause.name === "AbortError") throw cause
    const message = cause instanceof Error ? cause.message : String(cause)
    return { gcode: `; Error: ${message}\n`, error: message, warnings: [...bodies.warnings, ...skipped] }
  }
}

/** The program for one element (the generator's original entry point). */
export const generate3DPrinterGCodeForElement = (element: CadElement, s: PrinterSettings): string => generate3DPrinterProgram([element], s).gcode
