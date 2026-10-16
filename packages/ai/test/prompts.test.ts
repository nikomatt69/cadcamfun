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
import { modeTable } from "../src/prompts/contributed-modes.ts"
import { BASE_LAYERS, CADCAM_SYSTEM_PROMPT, MODE_PROMPTS, modeBlock, systemPrompt, turnSystemPrompt } from "../src/prompts/system.ts"
import { CADCAM_SKILLS } from "../src/skills/index.ts"

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
    // The catalogue names the check as an action of the `cad` tool, not the per-verb id it replaced.
    expect(prompt).toContain("cad action check")
  })

  test("the parametric element is offered when a part is dimension-driven", () => {
    expect(CADCAM_SYSTEM_PROMPT).toContain("parametric")
    expect(CADCAM_SYSTEM_PROMPT).toContain("changing one dimension rebuilds the part")
  })

  test("the machinist states the finishing pass, not just the roughing rules", () => {
    expect(CADCAM_SYSTEM_PROMPT).toContain("second, finishing pass")
  })
})

describe("layered base prompt (the way nikcli builds its system prompt)", () => {
  test("the base is its layers in order, one file each, with the engineering standards among them", () => {
    expect(BASE_LAYERS.map((layer) => layer.id)).toEqual(["identity", "recovery", "modelling", "engineering", "machinability", "machining", "workflow", "evidence"])
    for (const layer of BASE_LAYERS) {
      expect(layer.text.length).toBeGreaterThan(300)
      expect(CADCAM_SYSTEM_PROMPT).toContain(layer.text)
    }
  })

  test("the engineering layer carries the mechanical and industrial rules", () => {
    const text = BASE_LAYERS.find((layer) => layer.id === "engineering")!.text
    for (const phrase of ["ISO 2768", "ISO 286", "H7/h6", "ISO 273", "ISO 4762", "ISO 13715", "ISO 513", "DIN 76", "ISO 21920", "dimensioned by rule, not proven"]) expect(text).toContain(phrase)
  })

  test("the industrial-standards skill holds the tables the engineering layer points to", () => {
    const skill = CADCAM_SKILLS.find((candidate) => candidate.name === "industrial-standards")!
    expect(BASE_LAYERS.find((layer) => layer.id === "engineering")!.text).toContain("industrial-standards")
    for (const phrase of ["ISO 2768-1", "H7/g6", "6.6", "ISO 4762", "DIN 6885", "ISO 54", "Sheet metal", "dimensioned by rule, not analysed"]) expect(skill.body).toContain(phrase)
  })

  test("every turn states the environment: date, units, default standards, axes", () => {
    const now = new Date("2026-10-14T10:00:00Z")
    for (const prompt of [systemPrompt(undefined, "cad", undefined, undefined, now), turnSystemPrompt(undefined, "cad", undefined, undefined, now)]) {
      expect(prompt).toContain("<env>")
      expect(prompt).toContain("Today's date: Wed Oct 14 2026")
      expect(prompt).toContain("ISO 2768-mK")
      expect(prompt).toContain("Z up")
    }
  })
})

describe("prompt size", () => {
  test("the prompt itself stays inside the per-turn token budget", () => {
    // nikcli prepends the system prompt on every turn, so it is a recurring
    // cost, not a one-off: ~10 000 characters is roughly 2 500 tokens charged
    // to every request. The prompt was 8.3k before the machining knowledge was
    // added; the engineering-standards layer (ISO / DIN rules a professional part follows) took it to 12.6k on purpose, so
    // this ceiling keeps the next edit accountable for what it adds. Reference material belongs in a skill.
    expect(CADCAM_SYSTEM_PROMPT.length).toBeLessThan(12_900)
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
    // Read the machine, get the numbers, create, generate, analyse, verify, fix: the consolidated action ids.
    for (const step of ["cam` action `machine", "cam` action `suggest", "cam_edit` action `create", "cam_edit` action `generate", "cam` action `analyze", "cam_edit` action `verify", "cam_edit` action `update"]) {
      expect(prompt).toContain(step)
    }
  })

  test("unknown modes still fall back to general", () => {
    expect(systemPrompt(undefined, "nope")).toContain("general CAD/CAM")
    expect(systemPrompt()).not.toContain("{{")
  })
})

describe("contributed modes (spec 09-plugins.md assistant extensions)", () => {
  const modes = { "com.example.shipping:feeds": "You are focused on feeds and speeds. Quote the material and tool data behind every number, in metric." }

  test("a contributed id replaces the mode block in both prompts; built-ins and unknowns are untouched", () => {
    const now = new Date("2026-10-14T10:00:00Z")
    expect(systemPrompt(undefined, "com.example.shipping:feeds", undefined, undefined, now, modes)).toContain("focused on feeds and speeds")
    expect(turnSystemPrompt(undefined, "com.example.shipping:feeds", undefined, undefined, now, modes)).toContain("focused on feeds and speeds")
    expect(systemPrompt(undefined, "cad", undefined, undefined, now, modes)).toContain(MODE_PROMPTS.cad)
    expect(systemPrompt(undefined, "nope", undefined, undefined, now, modes)).toContain("general CAD/CAM")
    // Without the table (the direct path, a build without plugins) the id is just an unknown mode.
    expect(systemPrompt(undefined, "com.example.shipping:feeds", undefined, undefined, now)).toContain("general CAD/CAM")
  })

  test("modeTable turns contributed modes into the lookup modeBlock reads", () => {
    const table = modeTable([{ id: "com.example.shipping:feeds", title: "Feeds and speeds", description: "d", instructions: "FOCUS", pluginId: "com.example.shipping", pluginName: "Extras" }])
    expect(modeBlock("com.example.shipping:feeds", table)).toBe("FOCUS")
    expect(modeBlock("cad", table)).toBe(MODE_PROMPTS.cad)
    expect(modeBlock(undefined, table)).toBe(MODE_PROMPTS.general)
    expect(modeTable([])).toBeUndefined()
  })
})

describe("reply language wiring (nikcli locale resolver)", () => {
  test("the default English fallback does not add a language line", () => {
    // No `reply` arg → no language line. English users get no extra prompt.
    const prompt = systemPrompt(undefined, "general")
    expect(prompt.toLowerCase()).not.toContain("reply in ")
  })

  test("a non-English replyLanguage appends a deterministic instruction", () => {
    const prompt = systemPrompt(undefined, "general", undefined, { tag: "it", name: "Italian" })
    expect(prompt).toContain("Reply in Italian (it).")
  })

  test("a replyLanguage without an English name still works (raw tag)", () => {
    const prompt = systemPrompt(undefined, "general", undefined, { tag: "it", name: "" })
    expect(prompt).toContain("Reply in it.")
  })

  test("turnSystemPrompt honours the same language line", () => {
    const prompt = turnSystemPrompt(undefined, "general", undefined, { tag: "fr", name: "French" })
    expect(prompt).toContain("Reply in French (fr).")
  })

  test("null tag means silent: no language line is added", () => {
    const prompt = systemPrompt(undefined, "general", undefined, { tag: null, name: "" })
    expect(prompt.toLowerCase()).not.toContain("reply in ")
  })

  test("the language line does not bloat the prompt beyond the per-turn budget", () => {
    // Even the longest plausible name must leave the prompt (base, mode, environment, language) well under 13.6k characters.
    const prompt = systemPrompt(undefined, "general", undefined, { tag: "zh", name: "Chinese" })
    expect(prompt.length).toBeLessThan(13_600)
  })
})
