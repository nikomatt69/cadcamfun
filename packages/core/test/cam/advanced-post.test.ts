import { describe, expect, test } from "bun:test"
import { advanced } from "../../src/cam/post/index.ts"

const NOW = new Date("2026-10-06T10:00:00Z")
const run = (controller: advanced.ControllerType, code: string, options: advanced.OptimizationOptionsInput = {}) =>
  advanced.processGCode(controller, code, { options, now: NOW })

const fanucProgram = ["%", "G21 G90", "T1 M6", "S3000 M3", "G0 X0 Y0 Z5", "G1 Z-2 F200", "G1 X10 Y0", "G1 X10 Y10", "G1 X0 Y10", "G1 X0 Y0", "G0 Z5", "M5", "M30"].join("\n")
const genericProgram = ["G21", "G90", "", "", "", "", "G0 X0 Y0", "G0 X0 Y0", "G1 X5 Y5 F100 ; cut", "G1 X6 Y6", "M30"].join("\n")

describe("advanced post-processor: parity with the legacy output", () => {
  // Expected strings below were produced by running the legacy `AdvancedPostProcessor` on the same input.
  test("Fanuc: modal G-codes are dropped, improvements and stats match", () => {
    const r = run("fanuc", fanucProgram)
    expect(r.code).toBe("%\nG21 G90\nT1 M6\nS3000 M3\nG0 X0 Y0 Z5\nG1 Z-2 F200\nX10 Y0\nX10 Y10\nX0 Y10\nX0 Y0\nG0 Z5\nM5\nM30")
    expect(r.improvements).toEqual(["Removed redundant modal G-codes"])
    expect(r.stats).toEqual({ originalLines: 13, optimizedLines: 13, reductionPercent: 0, estimatedTimeReduction: 0, minorWarnings: [], majorWarnings: [] })
  })

  test("Fanuc corner rounding adds its improvement line", () => {
    const r = run("fanuc", fanucProgram, { controllerSpecific: { fanuc: { useCornerRounding: true } } })
    expect(r.improvements).toEqual(["Removed redundant modal G-codes", "Ottimizzato raccordi e angoli per una lavorazione più fluida"])
  })

  test("Mazak (generic pipeline): banner, blank-line collapse, comment removal, rapid and modal dedupe", () => {
    const r = run("mazak", genericProgram, { removeComments: true })
    expect(r.code).toBe(
      "% \n; ==================================================\n; G-code ottimizzato generato dal Post-processor avanzato\n; Controller: Mazak\n; Data: 2026-10-06\n; ==================================================\n\nG21\nG90\nG0 X0 Y0\nG1 X5 Y5 F100\nX6 Y6\nM30"
    )
    expect(r.improvements).toEqual(["Rimosse righe vuote in eccesso", "Rimossi commenti", "Ottimizzati movimenti rapidi", "Consolidati G-code ridondanti"])
    expect(r.stats.reductionPercent).toBe(-18.18)
  })

  test("Haas runs the Fanuc pipeline and says so", () => {
    const r = run("haas", fanucProgram)
    expect(r.code).toBe(run("fanuc", fanucProgram).code)
    expect(r.improvements.at(-1)).toBe("Adattato per controller Haas")
  })

  test("Heidenhain converts to a conversational program with numbered blocks 1, 6, 11 ...", () => {
    const r = run("heidenhain", ["; Workpiece 80 x 60 x 20", "G21 G90", "T2 M6", "S4000 M3", "G0 X0 Y0 Z5", "G1 Z-1 F150", "G1 X10 Y0 F300", "G1 X10 Y10", "G0 Z5", "M5", "M30"].join("\n"))
    expect(r.code.split("\n")).toEqual([
      "BEGIN PGM WORKPIECE MM",
      "BLK FORM 0.1 Z X0 Y0 Z0",
      "BLK FORM 0.2 X+80 Y+60 Z+20",
      "TOOL CALL 2 Z S0 ; Initial tool call",
      "1 TOOL CALL 2 Z S0",
      "6 TOOL CALL 2 Z S4000",
      "11 L X+0.000 Y+0.000 Z+5.000 FMAX",
      "16 L Z-1.000 F150",
      "21 L X+10.000 Y+0.000 F300",
      "26 L X+10.000 Y+10.000",
      "31 L Z+5.000 FMAX",
      "36 M5",
      "41 L Z+100 R0 FMAX M2",
      "END PGM WORKPIECE MM"
    ])
    expect(r.improvements[0]).toBe("Convertito al formato Heidenhain")
    expect(r.validation).toEqual({ isValid: true, errors: [], warnings: [] })
  })
})

describe("advanced post-processor: fixes over the legacy behaviour", () => {
  test("G01 is a feed move, not a rapid; M30 is the program end, not M3", () => {
    const r = run("heidenhain", ["G01 X5 F100", "M30"].join("\n"))
    expect(r.code).toContain("L X+5.000 F100")
    expect(r.code).not.toContain("FMAX\n")
    expect(r.code).toContain("L Z+100 R0 FMAX M2")
  })

  test("a rapid back to an earlier rapid position survives a feed move in between", () => {
    const r = run("siemens", ["G21", "G0 X0 Y0", "G1 X10 Y10 F100", "G0 X0 Y0", "M30"].join("\n"))
    expect(r.code.match(/G0 X0 Y0/g)).toHaveLength(2)
  })

  test("G21 is not reported as an arc without parameters", () => {
    const r = run("siemens", ["G21", "G90", "G0 X1 Y1", "M30"].join("\n"))
    expect(r.validation.errors).toEqual([])
    expect(run("fanuc", ["%", "G21", "G0 X1", "M30"].join("\n")).validation).toEqual({ isValid: true, errors: [], warnings: [] })
  })

  test("a real arc without I/J/R is still an error", () => {
    expect(run("siemens", ["G2 X10 Y10", "M30"].join("\n")).validation.errors).toHaveLength(1)
  })

  test("Fanuc high-speed mode: G05.1 is not mistaken for G0, and the reset block is in order before M30", () => {
    const r = run("fanuc", fanucProgram, { useHighSpeedMode: true, controllerSpecific: { fanuc: { useAI: true, useNanoSmoothing: true } } })
    const lines = r.code.split("\n")
    expect(lines).toContain("G0 X0 Y0 Z5")
    const end = lines.indexOf("; ----- Disattivazione modalità Alta Velocità -----")
    expect(lines.slice(end, end + 5)).toEqual([
      "; ----- Disattivazione modalità Alta Velocità -----",
      "G05.1 Q0 ; Disattiva AI Contour Control",
      "G05.1 Q0 ; Disattiva Nano Smoothing",
      "G64 ; Ripristina modalità taglio normale",
      "; -----------------------------------------"
    ])
    expect(lines.at(-1)).toBe("M30")
  })

  test("an arc between two rapids keeps the motion mode (G0, G2, G0 is not collapsed)", () => {
    const r = run("fanuc", ["%", "G0 X0 Y0", "G2 X5 Y5 I5 J0 F100", "G0 X9 Y9", "M30"].join("\n"))
    expect(r.code.split("\n")).toContain("G0 X9 Y9")
  })

  test("Heidenhain arcs carry the direction and the radius sign follows the arc size", () => {
    const r = run("heidenhain", ["G0 X10 Y0", "G2 X20 Y10 I10 J0 F100", "G3 X10 Y20 R10", "M30"].join("\n"))
    expect(r.code).toContain("CR X+20.000 Y+10.000 R+10.000 DR- F100")
    expect(r.code).toContain("CR X+10.000 Y+20.000 R+10.000 DR+")
    const big = run("heidenhain", ["G0 X10 Y0", "G3 X20 Y10 I10 J0", "M30"].join("\n"))
    expect(big.code).toContain("R-10.000 DR+")
  })

  test("Heidenhain radius compensation rides on the next motion block", () => {
    const r = run("heidenhain", ["G41", "G1 X5 Y5 F100", "G40", "G0 Z5", "M30"].join("\n"))
    expect(r.code).toContain("L X+5.000 Y+5.000 RL F100")
    expect(r.code).toContain("L Z+5.000 R0 FMAX")
  })

  test("Heidenhain modal coordinate lines continue the active motion mode; a feed-only line sets the feed", () => {
    const r = run("heidenhain", ["G1 F250", "X5 Y5", "G0", "X9 Y9", "M30"].join("\n"))
    expect(r.code).toContain("L X+5.000 Y+5.000 F250")
    expect(r.code).toContain("L X+9.000 Y+9.000 FMAX")
  })

  test("drilling cycles: positioning points carry no depth, and identical cycles are defined once and called via LBL", () => {
    const code = ["G0 X0 Y0 Z5", "G81 X10 Y10 Z-5 R2 F120", "G81 X20 Y10 Z-5 R2 F120", "G81 X30 Y10 Z-5 R2 F120", "G80", "M30"].join("\n")
    const r = run("heidenhain", code)
    const lines = r.code.split("\n")
    expect(lines.filter((l) => l.includes("CYCL DEF 200"))).toHaveLength(1)
    expect(lines.filter((l) => l.includes("CALL LBL 1"))).toHaveLength(1)
    const sub = lines.filter((l) => l.includes("FMAX M99"))
    expect(sub).toHaveLength(3)
    expect(sub.every((l) => !l.includes("Z"))).toBe(true)
    expect(lines.findIndex((l) => l.includes("LBL 1 ;"))).toBeGreaterThan(lines.findIndex((l) => l.includes("FMAX M2")))
    expect(lines.at(-1)).toBe("END PGM WORKPIECE MM")
    expect(r.code).not.toContain("Unconverted")
  })

  test("without function blocks each hole keeps its own cycle call", () => {
    const code = ["G81 X10 Y10 Z-5 R2 F120", "G81 X20 Y10 Z-5 R2 F120", "M30"].join("\n")
    const r = run("heidenhain", code, { controllerSpecific: { heidenhain: { useFunctionBlocks: false } } })
    expect(r.code.split("\n").filter((l) => l.includes("CYCL DEF 200"))).toHaveLength(2)
  })

  test("TCPM wraps the machining: enabled right after the tool call, reset before the program end", () => {
    const r = run("heidenhain", ["T1 M6", "G0 X0 Y0", "M30"].join("\n"), { controllerSpecific: { heidenhain: { useTCP: true } } })
    const lines = r.code.split("\n")
    const on = lines.findIndex((l) => l.includes("Enable TCPM"))
    const reset = lines.findIndex((l) => l.includes("FUNCTION TCPM RESET"))
    expect(on).toBeGreaterThan(lines.findIndex((l) => l.includes("TOOL CALL 1 Z S0") && /^\d/.test(l)) - 1)
    expect(reset).toBe(lines.findIndex((l) => l.includes("FMAX M2")) - 1)
  })
})

describe("advanced post-processor: options and presets", () => {
  test("presets set every option, as the legacy buttons do", () => {
    const speed = advanced.applyPreset("speed")
    expect(speed.useHighSpeedMode).toBe(true)
    expect(speed.removeComments).toBe(true)
    expect(speed.controllerSpecific.fanuc.useAI).toBe(true)
    expect(speed.controllerSpecific.heidenhain.useTCP).toBe(true)
    const basic = advanced.applyPreset("basic", speed)
    expect(basic.useHighSpeedMode).toBe(false)
    expect(basic.removeComments).toBe(false)
    expect(basic.controllerSpecific.fanuc.useAI).toBe(false)
    expect(basic.controllerSpecific.heidenhain.useFunctionBlocks).toBe(false)
    expect(advanced.applyPreset("quality").controllerSpecific.fanuc.useHighPrecisionMode).toBe(true)
    expect(advanced.applyPreset("advanced").controllerSpecific.fanuc.useCompactGCode).toBe(true)
  })

  test("mergeOptions overlays one level deep per controller block", () => {
    const merged = advanced.mergeOptions({ removeComments: true, controllerSpecific: { fanuc: { useAI: true } } })
    expect(merged.removeComments).toBe(true)
    expect(merged.controllerSpecific.fanuc.useAI).toBe(true)
    expect(merged.controllerSpecific.fanuc.useModalGCodes).toBe(true)
    expect(merged.controllerSpecific.heidenhain.useFunctionBlocks).toBe(true)
  })

  test("every controller has a description and processes without throwing", () => {
    for (const c of advanced.CONTROLLER_TYPES) {
      expect(advanced.controllerDescription(c).length).toBeGreaterThan(10)
      expect(run(c, fanucProgram).code.length).toBeGreaterThan(0)
    }
  })

  test("plain moves pass the generic validation", () => {
    const r = advanced.processGCode("generic", "G0 X1", { now: NOW })
    expect(r.validation.isValid).toBe(true)
  })
})
