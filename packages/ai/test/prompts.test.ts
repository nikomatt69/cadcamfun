/**
 * The system prompt is part of the contract: it tells the model which operations
 * exist, which machines exist and which checks it owes the user. A stale list
 * there silently misinforms every session, and the previous list of operation
 * types was already stale (it omitted `probing` and every lathe and printer
 * operation). These tests derive the truth from `@cadcamfun/core` instead of
 * repeating it, so the prompt cannot drift from the generator again.
 */
import { describe, expect, test } from "bun:test"
import { cam } from "@cadcamfun/core"
import { CADCAM_SYSTEM_PROMPT, MODE_PROMPTS, systemPrompt } from "../src/prompts/system.ts"

const literals = (schema: unknown): ReadonlyArray<string> =>
  ((schema as { members?: ReadonlyArray<{ literal: unknown }> }).members ?? []).map((m) => String(m.literal))

const MILL_OPS = literals(cam.generator.MillOperationSchema)
const LATHE_OPS = literals(cam.generator.LatheOperationSchema)
const PRINTER_OPS = literals(cam.generator.PrinterOperationSchema)
const ALL_OPS = [...MILL_OPS, ...LATHE_OPS, ...PRINTER_OPS]

describe("operation coverage in the system prompt", () => {
  test("every operation the generator accepts is named in the prompt", () => {
    // Shared words repeat across machines ("threading"); a missing machine
    // operation is the failure this guards, so test the whole set.
    const prompt = systemPrompt(undefined, "cam")
    for (const op of ALL_OPS) expect(prompt).toContain(op)
  })

  test("each machine's own operations are grouped with the machine", () => {
    const prompt = systemPrompt(undefined, "cam")
    // "…a machine accepts: mill contour, … probing; lathe facing, … knurling;
    // printer standard, … brim." Anchor on the sentence, not on the first
    // occurrence of the word "mill" (the machinability block also says "endmill").
    const listed = /machine accepts: mill ([^;]*); lathe ([^;]*); printer ([^.]*)\./.exec(prompt)
    expect(listed).not.toBeNull()
    const [, millBlock, latheBlock, printerBlock] = listed!
    expect(MILL_OPS.every((op) => millBlock!.includes(op))).toBe(true)
    expect(LATHE_OPS.every((op) => latheBlock!.includes(op))).toBe(true)
    expect(PRINTER_OPS.every((op) => printerBlock!.includes(op))).toBe(true)
    // A machine's block must not advertise another machine's operations.
    expect(millBlock).not.toContain("knurling")
    expect(latheBlock).not.toContain("probing")
    expect(printerBlock).not.toContain("grooving")
  })

  test("the prompt no longer claims the operation list is shorter than it is", () => {
    const prompt = systemPrompt(undefined, "cam")
    expect(prompt).not.toContain("only those the generator knows")
  })
})

describe("manufacturing judgement in the system prompt", () => {
  test("the rules a machinist applies before programming are stated", () => {
    const prompt = CADCAM_SYSTEM_PROMPT
    // Corner radius vs the cutter, entry method, depth of cut, wall allowance,
    // wall deflection, breakout/stock support, climb vs conventional, tap drill.
    for (const phrase of [
      "inside corner",
      "plunge an endmill",
      "stepdown",
      "finishing pass",
      "thin walls",
      "below the bottom face",
      "Climb milling",
      "tap drill"
    ]) expect(prompt).toContain(phrase)
  })

  test("the tool check is explicit about what it does not model", () => {
    // The old wording listed the limits twice and half-repeated them; the new one
    // names the model and the fact that a missing tool field is unchecked.
    expect(CADCAM_SYSTEM_PROMPT).toContain("three-axis height-field model")
    expect(CADCAM_SYSTEM_PROMPT).toContain("flute length, shank, stickout, holder")
    expect(CADCAM_SYSTEM_PROMPT).toContain("no static findings")
  })

  test("design checking has concrete causes to fix, not just a command name", () => {
    const prompt = CADCAM_SYSTEM_PROMPT
    for (const phrase of ["rotation left in radians", "floating", "too coarse"]) expect(prompt).toContain(phrase)
    expect(prompt).toContain("cad_check_design")
  })

  test("the parametric element is offered when a part is dimension-driven", () => {
    expect(CADCAM_SYSTEM_PROMPT).toContain("parametric")
    expect(CADCAM_SYSTEM_PROMPT).toContain("changing one dimension rebuilds the part")
  })

  test("the machinist states the finishing pass, not just the roughing rules", () => {
    expect(CADCAM_SYSTEM_PROMPT).toContain("second, finishing pass")
  })
})

describe("prompt size", () => {
  test("the prompt itself stays inside the per-turn token budget", () => {
    // nikcli prepends the system prompt on every turn, so it is a recurring
    // cost, not a one-off: ~10 000 characters is roughly 2 500 tokens charged
    // to every request. The prompt was 8.3k before the machining knowledge was
    // added; this ceiling keeps the next edit accountable for what it adds.
    expect(CADCAM_SYSTEM_PROMPT.length).toBeLessThan(10_400)
  })

  test("the mode block is a whole second prompt and stays short", () => {
    for (const text of Object.values(MODE_PROMPTS)) expect(text.length).toBeLessThan(1_200)
    expect(systemPrompt(undefined, "cam").length).toBeGreaterThan(CADCAM_SYSTEM_PROMPT.length)
  })
})

describe("mode prompts", () => {
  test("every mode block is English, substantial and names its domain", () => {
    for (const [mode, text] of Object.entries(MODE_PROMPTS)) {
      expect(text.length).toBeGreaterThan(80)
      expect(text.toLowerCase()).toContain(mode === "gcode" ? "g-code" : mode === "cad" ? "modelling" : mode)
    }
  })

  test("no mode block is longer than the budget it is charged for", () => {
    // The mode text is appended to the global prompt and travels with it.
    for (const text of Object.values(MODE_PROMPTS)) expect(text.length).toBeLessThan(1_200)
  })

  test("the cam mode ends on the loop it must follow", () => {
    const prompt = MODE_PROMPTS.cam
    // Read the machine, get the numbers, create, generate, analyse, verify, fix.
    for (const step of ["cam_describe_machine", "cam_suggest_parameters", "cam_create_operation", "cam_generate_gcode", "cam_analyze_gcode", "cam_verify_toolpath", "cam_update_operation"]) {
      expect(prompt).toContain(step)
    }
  })

  test("unknown modes still fall back to general", () => {
    expect(systemPrompt(undefined, "nope")).toContain("general CAD/CAM")
    expect(systemPrompt()).not.toContain("{{")
  })
})
