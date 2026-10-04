import { describe, expect, test } from "bun:test"
import { Effect, Exit } from "effect"
import { Commands, Doc, type CadDocument, type ElementInput } from "@cadcamfun/core"
import {
  Analyze,
  CamLibrary,
  Feeds,
  Gcode,
  Machines,
  Materials,
  Post,
  Tools,
  generateProgram,
  type Setup,
} from "../src"

const docWith = (...inputs: Array<ElementInput>): CadDocument => {
  const doc = Doc.empty("Test part")
  return Effect.runSync(Commands.apply(doc, Commands.addElements(inputs.map((i) => Doc.instantiate(doc, i)))))
}

const run = <A, E>(e: Effect.Effect<A, E, CamLibrary>) => Effect.runSync(Effect.provide(e, CamLibrary.layer))
const runExit = <A, E>(e: Effect.Effect<A, E, CamLibrary>) => Effect.runSyncExit(Effect.provide(e, CamLibrary.layer))

const em6 = Tools.presets.find((t) => t.id === "em-6")!
const grbl = Machines.presets.find((m) => m.id === "hobby-grbl")!

const setup = (doc: CadDocument, operations: Setup["operations"]): Setup => ({
  machineId: "hobby-grbl",
  materialId: "mdf",
  safeZ: 5,
  operations,
})

describe("feeds", () => {
  test("rpm and feed follow Vc and chip load, clamped to machine", () => {
    const f = Feeds.compute(em6, Materials.presets.find((m) => m.id === "al-6061")!, grbl)
    expect(f.rpm).toBe(13263) // 250·1000/(π·6)
    expect(f.feed).toBe(1194) // 13263 · 3 · 0.03
    expect(f.stepDown).toBe(1.5)
  })
})

describe("toolpaths", () => {
  test("outside profile is offset by the tool radius and cut in passes", () => {
    const doc = docWith({ _tag: "Rectangle", origin: { x: 10, y: 10 }, width: 40, height: 20 })
    const ids = doc.elements.map((e) => e.id)
    const program = run(
      generateProgram(
        doc,
        setup(doc, [
          {
            _tag: "Profile",
            id: "p1",
            toolId: "em-6",
            elementIds: ids,
            depth: 6,
            stepDown: 2,
            side: "outside",
            direction: "climb",
          },
        ]),
      ),
    )
    const feeds = program.toolpaths[0]!.moves.filter((m) => m._tag === "Feed")
    expect(new Set(feeds.map((m) => m.z))).toEqual(new Set([-2, -4, -6]))
    const xs = feeds.map((m) => m.x)
    expect(Math.min(...xs)).toBeCloseTo(7, 1)
    expect(Math.max(...xs)).toBeCloseTo(53, 1)
  })

  test("pocket stays inside the wall by the tool radius", () => {
    const doc = docWith({ _tag: "Circle", center: { x: 50, y: 50 }, radius: 20 })
    const program = run(
      generateProgram(
        doc,
        setup(doc, [
          {
            _tag: "Pocket",
            id: "k1",
            toolId: "em-6",
            elementIds: doc.elements.map((e) => e.id),
            depth: 3,
            stepOver: 0.4,
            direction: "climb",
          },
        ]),
      ),
    )
    const cuts = program.toolpaths[0]!.moves.filter((m) => m._tag === "Feed")
    const maxR = Math.max(...cuts.map((m) => Math.hypot(m.x - 50, m.y - 50)))
    expect(maxR).toBeLessThanOrEqual(17 + 0.01)
    expect(maxR).toBeGreaterThan(16.5)
  })

  test("drilling orders holes and pecks", () => {
    const doc = docWith(
      { _tag: "Point", position: { x: 30, y: 0 } },
      { _tag: "Point", position: { x: 10, y: 0 } },
      { _tag: "Circle", center: { x: 20, y: 0 }, radius: 2.5 },
    )
    const program = run(
      generateProgram(
        doc,
        setup(doc, [
          { _tag: "Drill", id: "d1", toolId: "dr-5", elementIds: doc.elements.map((e) => e.id), depth: 9, peck: 3 },
        ]),
      ),
    )
    const bottoms = program.toolpaths[0]!.moves.filter((m) => m._tag === "Feed" && m.z === -9).map((m) => m.x)
    expect(bottoms).toEqual([10, 20, 30])
  })

  test("typed failures: tool too large, depth beyond flutes, unknown tool", () => {
    const doc = docWith({ _tag: "Circle", center: { x: 0, y: 0 }, radius: 2 })
    const ids = doc.elements.map((e) => e.id)
    const tooLarge = runExit(
      generateProgram(
        doc,
        setup(doc, [
          { _tag: "Pocket", id: "k", toolId: "em-6", elementIds: ids, depth: 1, stepOver: 0.5, direction: "climb" },
        ]),
      ),
    )
    expect(Exit.isFailure(tooLarge) && String(tooLarge.cause)).toContain("too large")
    const tooDeep = runExit(
      generateProgram(doc, setup(doc, [{ _tag: "Engrave", id: "e", toolId: "em-3", elementIds: ids, depth: 50 }])),
    )
    expect(Exit.isFailure(tooDeep) && String(tooDeep.cause)).toContain("flute length")
    const unknown = runExit(
      generateProgram(doc, setup(doc, [{ _tag: "Engrave", id: "e", toolId: "nope", elementIds: ids, depth: 1 }])),
    )
    expect(Exit.isFailure(unknown) && String(unknown.cause)).toContain("NotInLibrary")
  })
})

describe("post-processing and parsing", () => {
  const doc = docWith({ _tag: "Rectangle", origin: { x: 0, y: 0 }, width: 30, height: 30 })
  const program = run(
    generateProgram(
      doc,
      setup(doc, [
        {
          _tag: "Profile",
          id: "p",
          toolId: "em-6",
          elementIds: doc.elements.map((e) => e.id),
          depth: 2,
          side: "on",
          direction: "climb",
        },
      ]),
    ),
  )

  test("dialects", () => {
    const grblCode = Post.post(program, { controller: "grbl" })
    expect(grblCode).toContain("G90 G94 G17 G21")
    expect(grblCode).toContain("M0")
    expect(grblCode.trim().endsWith("M30")).toBe(true)
    const fanuc = Post.post(program, { controller: "fanuc" })
    expect(fanuc.startsWith("%\nO1000")).toBe(true)
    expect(fanuc).toMatch(/N\d+ T2 M6/)
    expect(fanuc).toContain("G43 H2")
  })

  test("post → parse round trip preserves the path", () => {
    const parsed = Gcode.parse(Post.post(program, { controller: "linuxcnc" }))
    const original = Analyze.analyzeProgram(program, grbl)
    const reparsed = Analyze.analyzeMoves(parsed.moves, grbl.rapidFeed)
    expect(reparsed.cutDistance).toBeCloseTo(original.cutDistance, 2)
    expect(reparsed.bounds).toEqual(original.bounds)
  })

  test("arcs are linearised", () => {
    const { moves } = Gcode.parse("G21 G90\nG0 X10 Y0 Z0\nG3 X-10 Y0 I-10 J0 F100\nG2 X10 Y0 R10")
    const stats = Analyze.analyzeMoves(moves, 1000, { x: 10, y: 0, z: 0 })
    expect(stats.cutDistance).toBeCloseTo(2 * Math.PI * 10, 0)
  })

  test("each move maps to its source line", () => {
    const { moves, lines } = Gcode.parse("G21\n(comment)\nG0 X1 Y0 Z0\nG2 X-1 Y0 R1 F100\nM30")
    expect(lines).toHaveLength(moves.length)
    expect(lines[0]).toBe(2)
    expect(new Set(lines.slice(1))).toEqual(new Set([3]))
  })
})

describe("canned cycles and Heidenhain", () => {
  const doc = docWith({ _tag: "Point", position: { x: 10, y: 10 } }, { _tag: "Point", position: { x: 30, y: 10 } })
  const program = run(
    generateProgram(doc, {
      ...setup(doc, [
        {
          _tag: "Drill",
          id: "d",
          toolId: "dr-5",
          elementIds: doc.elements.map((e) => e.id),
          depth: 8,
          peck: 2,
          cycle: true,
        },
      ]),
      machineId: "vmc-fanuc",
    }),
  )

  test("ISO controllers get G83 and the parser expands it identically", () => {
    const fanuc = Post.post(program, { controller: "fanuc" })
    expect(fanuc).toMatch(/G98 G83 X10 Y10 Z-8 R1 Q2 F\d+/)
    expect(fanuc).toMatch(/N\d+ X30 Y10\n/)
    expect(fanuc).toContain("G80")
    const parsed = Gcode.parse(Post.post(program, { controller: "linuxcnc" }))
    const a = Analyze.analyzeProgram(program, grbl)
    const b = Analyze.analyzeMoves(parsed.moves, grbl.rapidFeed)
    expect(b.cutDistance).toBeCloseTo(a.cutDistance, 3)
  })

  test("controllers without cycles get explicit pecks", () => {
    const code = Post.post(program, { controller: "grbl" })
    expect(code).not.toContain("G83")
    expect(code.match(/Z-8/g)?.length).toBe(2)
  })

  test("Heidenhain conversational output", () => {
    const tnc = Post.post(program, { controller: "heidenhain" })
    expect(tnc).toMatch(/^0 BEGIN PGM TEST_PART MM/)
    expect(tnc).toContain("CYCL DEF 200 DRILLING")
    expect(tnc).toMatch(/TOOL CALL 5 Z S\d+/)
    expect(tnc).toContain("L X+30 Y+10 FMAX M99")
    expect(tnc.trim()).toMatch(/END PGM TEST_PART MM$/)
  })
})
