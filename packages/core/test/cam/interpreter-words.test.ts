/**
 * Spec 32 P2: the words the replay used to skip (spec 32 §2.2, V2-V6) are drawn as the machine runs them — tapping and
 * boring cycles, cutter radius compensation, local / work offsets and tilted planes, the lathe's repetitive cycles, polar
 * interpolation — and Siemens statements are never misread as words.
 */
import { describe, expect, test } from "bun:test"
import { interpretGcode, type GSegment } from "../../src/cam/testing/gcode-interpreter.ts"
import { threadDepths } from "../../src/cam/testing/lathe-cycles.ts"
import { cam } from "../../src/index.ts"

const run = (text: string, options: Parameters<typeof interpretGcode>[1] = {}) => interpretGcode(text, { track: true, ...options })
const moves = (r: ReturnType<typeof interpretGcode>) => r.segments.filter((s): s is Exclude<GSegment, { kind: "dwell" }> => s.kind !== "dwell")
/** Level passes of G71 / G72: the feeds followed by the 45° retract (the last pass along the profile has none). */
const levelPasses = (r: ReturnType<typeof interpretGcode>, line: number) => {
  const m = moves(r)
  return m.filter((s, i) => {
    const next = m[i + 1]
    // The retract backs off towards +Z and away from the part; a taper of the profile runs on towards -Z.
    return s.kind === "linear" && s.line === line && next !== undefined && next.kind === "linear" && Math.abs(next.to.x - next.from.x) > 1e-9 && next.to.z > next.from.z + 1e-9
  })
}
const close = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }, digits = 9) => {
  expect(a.x).toBeCloseTo(b.x, digits); expect(a.y).toBeCloseTo(b.y, digits); expect(a.z).toBeCloseTo(b.z, digits)
}

describe("tapping and boring cycles", () => {
  test("G84 feeds in, reverses the spindle at the bottom and feeds out at the same rate; G98 then rises to the start", () => {
    const r = run("G21 G90 G17 G98\nS500 M3\nG0 X10 Y10 Z5\nG84 X10 Y10 Z-12 R2 F750\nX20\nG80\nM30")
    expect(r.errors).toEqual([])
    const m = moves(r)
    const feeds = m.filter((s) => s.kind === "linear")
    expect(feeds.map((s) => [s.from.z, s.to.z])).toEqual([[2, -12], [-12, 2], [2, -12], [-12, 2]])
    for (const s of feeds) expect(s.feed).toBe(750)
    // In with M3, out with M4, back to M3.
    const states = r.states!
    const index = (s: GSegment) => r.segments.indexOf(s)
    expect(states[index(feeds[0]!)]!.spindle).toBe("cw")
    expect(states[index(feeds[1]!)]!.spindle).toBe("ccw")
    expect(states[index(feeds[2]!)]!.spindle).toBe("cw")
    // G98: from R up to the initial Z between holes.
    expect(m.some((s) => s.kind === "rapid" && s.from.z === 2 && s.to.z === 5)).toBe(true)
  })

  test("G84 under G95: F is the pitch, the feed is pitch x rpm", () => {
    const r = run("G21 G90 G95\nS400 M3\nG0 X0 Y0 Z5\nG84 X0 Y0 Z-10 R2 F1.5\nG80\nM30")
    expect(moves(r).filter((s) => s.kind === "linear").every((s) => Math.abs(s.feed - 600) < 1e-9)).toBe(true)
  })

  test("G74 is the left-hand tap: M4 in, M3 out", () => {
    const r = run("G21 G90\nS500 M4\nG0 X0 Y0 Z5\nG74 X0 Y0 Z-10 R2 F500\nG80\nM30")
    const feeds = moves(r).filter((s) => s.kind === "linear")
    expect(feeds.map((s) => r.states![r.segments.indexOf(s)]!.spindle)).toEqual(["ccw", "cw"])
  })

  test("G85 / G89 feed out, G86 rapids out with the spindle stopped, G76 shifts off the wall before rising", () => {
    const one = (word: string) => run(`G21 G90 G99\nS800 M3\nG0 X0 Y0 Z5\n${word} X0 Y0 Z-10 R2 Q0.2 P500 F100\nG80\nM30`, { dwell: "milliseconds" })
    const g85 = moves(one("G85"))
    expect(g85.filter((s) => s.kind === "linear").map((s) => s.to.z)).toEqual([-10, 2])
    const g89 = one("G89")
    expect(g89.segments.some((s) => s.kind === "dwell" && Math.abs(s.seconds - 0.5) < 1e-12)).toBe(true)
    const g86 = one("G86")
    const out = moves(g86).find((s) => s.kind === "rapid" && s.from.z === -10)!
    expect(out.to.z).toBe(2)
    expect(g86.states![g86.segments.indexOf(out)]!.spindle).toBe("off")
    const g76 = moves(one("G76"))
    const shiftOut = g76.find((s) => s.from.z === -10 && s.kind === "rapid")!
    expect(shiftOut.to).toEqual({ x: 0.2, y: 0, z: -10 })
    expect(g76.some((s) => s.from.x === 0.2 && s.to.x === 0.2 && s.to.z === 2)).toBe(true)
    for (const word of ["G85", "G86", "G89", "G76", "G87", "G88"]) expect(one(word).unsupported, word).toEqual([])
  })

  test("G87 back boring cuts upwards from R (below the part) to Z", () => {
    const r = run("G21 G90\nS800 M3\nG0 X0 Y0 Z5\nG87 X0 Y0 Z-5 R-20 Q1 F80\nG80\nM30")
    const cut = moves(r).filter((s) => s.kind === "linear")
    expect(cut.map((s) => [s.from.z, s.to.z])).toEqual([[-20, -5]])
    expect(r.states![r.segments.indexOf(cut[0]!)]!.spindle).toBe("cw")
  })
})

describe("cutter radius compensation", () => {
  // A 40 x 20 rectangle traced counter-clockwise; G41 puts a 3 mm tool inside it, G42 outside.
  const square = (word: "G41" | "G42", radius = "") => `G21 G90 G17\n${radius}T1 M6\nS8000 M3\nG0 X-10 Y0 Z5\nG1 Z-2 F300\n${word} D1 G1 X0 Y0 F600\nX40\nY20\nX0\nY0\nG40 G1 X-10 Y0\nM30`

  test("G42 outside: the sides move out by the radius and the corners roll round on arcs of the radius", () => {
    const r = run(square("G42", "G10 L12 P1 R3\n"))
    expect(r.errors).toEqual([])
    const at = moves(r).filter((s) => s.from.z === -2 && s.to.z === -2)
    const lines = at.filter((s) => s.kind === "linear")
    expect(lines.some((s) => s.from.y === -3 && s.to.y === -3 && s.to.x === 40)).toBe(true)
    expect(lines.some((s) => s.from.x === 43 && s.to.x === 43)).toBe(true)
    const arcs = at.filter((s): s is Extract<GSegment, { kind: "arc" }> => s.kind === "arc")
    expect(arcs.map((a) => [a.center.x, a.center.y])).toEqual([[40, 0], [40, 20], [0, 20]])
    for (const a of arcs) { expect(a.radiusStart).toBeCloseTo(3, 9); expect(a.clockwise).toBe(false) }
    // Nowhere does the tool centre come closer than its radius to the rectangle (no gouge).
    const distance = (p: { x: number; y: number }) => {
      const dx = Math.max(0 - p.x, 0, p.x - 40), dy = Math.max(0 - p.y, 0, p.y - 20)
      return p.x > 0 && p.x < 40 && p.y > 0 && p.y < 20 ? -Math.min(p.x, 40 - p.x, p.y, 20 - p.y) : Math.hypot(dx, dy)
    }
    for (const s of at) expect(distance(s.to)).toBeGreaterThan(3 - 1e-6)
  })

  test("G41 inside: the sides move in and meet at the inside corners; the cancel move leaves the offset", () => {
    const r = run(square("G41"), { toolRadius: () => 3 })
    const at = moves(r).filter((s) => s.from.z === -2 && s.to.z === -2)
    const corners = at.map((s) => s.to)
    for (const c of [{ x: 37, y: 3 }, { x: 37, y: 17 }, { x: 3, y: 17 }]) expect(corners.some((p) => Math.abs(p.x - c.x) < 1e-9 && Math.abs(p.y - c.y) < 1e-9)).toBe(true)
    expect(at.every((s) => s.kind === "linear")).toBe(true)
    expect(r.end).toEqual({ x: -10, y: 0, z: -2 })
  })

  test("the radius comes from G10 L12, the host, or the header (T1 D=6.)", () => {
    const fusion = `(T1  D=6. CR=0. - ZMIN=-2. - flat end mill)\n${square("G42")}`
    const a = run(fusion), b = run(square("G42", "G10 L12 P1 R3\n")), c = run(square("G42"), { toolRadius: (d) => (d === 1 ? 3 : undefined) })
    // The same path whichever way the radius came (line numbers differ by the header / G10 line).
    const path = (r: ReturnType<typeof run>) => JSON.stringify(moves(r).map((s) => [s.kind, s.from, s.to]))
    expect(path(a)).toBe(path(b))
    expect(path(c)).toBe(path(b))
    const unknown = run(square("G42"))
    expect(unknown.unsupported).toEqual([{ line: 6, word: "G42" }])
  })

  test("an arc the tool does not fit is reported", () => {
    const r = run("G21 G90 G17\nG10 L12 P1 R5\nG0 X0 Y-10 Z1\nG1 Z-1 F100\nG41 D1 G1 X0 Y0\nG3 X4 Y4 I0 J4\nG1 X20\nG40 X30\nM30")
    expect(r.errors.some((e) => e.includes("does not fit the arc"))).toBe(true)
  })

  test("the generator's compensated contour: the program follows the part, the replay the tool centre", () => {
    const g = cam.generator
    const settings = { ...g.DEFAULT_SETTINGS, useToolCompensation: true }
    const text = g.generateToolpath({ settings, geometry: g.DEFAULT_GEOMETRY, printer: g.DEFAULT_PRINTER_EXTRAS }).response.gcode
    expect(text).toContain("G42 D1")
    expect(text).toMatch(/G1 X50\.000 Y-25\.000/)
    const r = interpretGcode(text)
    expect(r.errors).toEqual([])
    const cut = moves(r).filter((s) => s.kind !== "rapid" && s.to.z === -1 && s.from.z === -1)
    const xs = cut.map((s) => s.to.x), ys = cut.map((s) => s.to.y)
    expect(Math.max(...xs)).toBeCloseTo(53, 9)
    expect(Math.min(...ys)).toBeCloseTo(-28, 9)
    // The same outside contour without compensation: the program offsets the path itself, to the same sides.
    const plain = interpretGcode(g.generateToolpath({ settings: g.DEFAULT_SETTINGS, geometry: g.DEFAULT_GEOMETRY, printer: g.DEFAULT_PRINTER_EXTRAS }).response.gcode)
    expect(Math.max(...moves(plain).filter((s) => s.kind === "linear" && s.to.z === -1).map((s) => s.to.x))).toBeCloseTo(53, 9)
  })
})

describe("frames: local and work offsets, rotation, tilted planes", () => {
  test("G52 shifts until cancelled; G10 L2 + G55 shifts by the difference to G54", () => {
    const r = run("G21 G90\nG52 X10 Y5\nG0 X0 Y0 Z5\nG52 X0 Y0\nG0 X0 Y0\nG10 L2 P1 X100 Y0 Z0\nG10 L2 P2 X300 Y50 Z-10\nG55\nG0 X0 Y0 Z5\nG54\nG0 X1 Y1\nM30")
    expect(r.errors).toEqual([])
    expect(moves(r).map((s) => s.to)).toEqual([{ x: 10, y: 5, z: 5 }, { x: 0, y: 0, z: 5 }, { x: 200, y: 50, z: -5 }, { x: 1, y: 1, z: -5 }])
  })

  test("G68 rotates about its centre; arcs stay arcs with their centre turned", () => {
    const r = run("G21 G90 G17\nG0 X0 Y0 Z1\nG68 X10 Y0 R90\nG1 X20 Y0 F100\nG3 X10 Y10 I-10 J0\nG69\nG1 X5 Y5\nM30")
    const m = moves(r)
    close(m[1]!.to, { x: 10, y: 10, z: 1 })
    const arc = m[2]! as Extract<GSegment, { kind: "arc" }>
    expect(arc.kind).toBe("arc")
    expect(arc.center.x).toBeCloseTo(10, 9); expect(arc.center.y).toBeCloseTo(0, 9)
    close(arc.to, { x: 0, y: 0, z: 1 })
    close(m[3]!.to, { x: 5, y: 5, z: 1 })
  })

  test("G68.2 J45 tilts the plane about X: a move along the tilted Z leans towards -Y", () => {
    const r = run("G21 G90\nG0 X0 Y0 Z50\nG68.2 X0 Y0 Z0 I0 J45 K0\nG53.1\nG0 X0 Y0 Z10\nG1 X10 F100\nG69\nM30")
    expect(r.unsupported).toEqual([])
    const m = moves(r)
    close(m[1]!.to, { x: 0, y: -10 * Math.SQRT1_2, z: 10 * Math.SQRT1_2 })
    close(m[2]!.to, { x: 10, y: -10 * Math.SQRT1_2, z: 10 * Math.SQRT1_2 })
  })

  test("CYCLE800 axis by axis (mode 57, B45) turns about Y and is not read as E800", () => {
    const r = run('G21 G90\nCYCLE800(0,"TC1",200000,57,0,0,0,0,45,0,0,0,0,-1,100,1)\nG0 X0 Y0 Z10\nCYCLE800()\nG0 X0 Y0 Z20\nM30')
    expect(r.unsupported).toEqual([])
    expect(r.states!.every((s) => s.extrude === 0)).toBe(true)
    const m = moves(r)
    close(m[0]!.to, { x: 10 * Math.SQRT1_2, y: 0, z: 10 * Math.SQRT1_2 })
    close(m[1]!.to, { x: 0, y: 0, z: 20 })
  })

  test("tilted-plane arcs are drawn as chords on the tilted circle", () => {
    const r = run("G21 G90 G17\nG68.2 X0 Y0 Z0 I0 J90 K0\nG0 X10 Y0 Z0\nG3 X-10 Y0 I-10 J0 F100\nG69\nM30")
    const chords = moves(r).slice(1)
    expect(chords.length).toBeGreaterThan(10)
    for (const s of chords) { expect(Math.hypot(s.to.x, s.to.z)).toBeCloseTo(10, 6); expect(s.to.y).toBeCloseTo(0, 9) }
  })

  test("Siemens / macro statements are skipped; the ones with axis words are listed", () => {
    const r = run("G21 G90\nMSG(\"roughing\")\nTRAORI\nG0 X0 Y0 Z5\nTRANS X10\nIF [#1 GT 0] GOTO 10\nG0 X1\nM30")
    expect(moves(r).map((s) => s.to)).toEqual([{ x: 0, y: 0, z: 5 }, { x: 1, y: 0, z: 5 }])
    expect(r.unsupported).toEqual([{ line: 5, word: "TRANS" }])
  })

  test("G53 and G28 draw no motion; G61 / G64 / G90.1 are understood", () => {
    const r = run("G21 G90 G61\nG64 P0.02\nG0 X0 Y0 Z5\nG53 G0 Z0\nG90.1\nG1 X20 Y0 F100\nG3 X0 Y0 I10 J0\nM30")
    expect(r.unsupported).toEqual([])
    const arc = moves(r).find((s) => s.kind === "arc") as Extract<GSegment, { kind: "arc" }>
    expect(arc.center).toEqual({ x: 10, y: 0 })
  })

  test("Siemens G71 in a milling program is metric, not a lathe cycle", () => {
    const r = run("G70\nG0 X1 Y1 Z1\nG71\nG0 X1 Y1 Z1\nM30")
    expect(moves(r).map((s) => s.to)).toEqual([{ x: 25.4, y: 25.4, z: 25.4 }, { x: 1, y: 1, z: 1 }])
  })
})

describe("lathe repetitive cycles", () => {
  // Fanuc 0i two-block G71: 2 mm per side, 0.5 retract, 0.4 / 0.1 allowance; the profile Ø20 face to Ø40 at Z-30.
  const g71 = "G21 G18 G90 G95\nT0101\nG97 S1000 M3\nG0 X52 Z2\nG71 U2 R0.5\nG71 P10 Q20 U0.4 W0.1 F0.25\nN10 G0 X20\nG1 Z-20\nX40 Z-30\nN20 X52\nG70 P10 Q20\nG0 X100 Z100\nM30"

  test("G71 passes at 2 mm per side down to the profile with its allowance, a final pass along it, back to A", () => {
    const r = run(g71)
    expect(r.errors).toEqual([])
    expect(r.unsupported).toEqual([])
    const cuts = moves(r).filter((s) => s.kind === "linear" && s.line === 6)
    // Roughing passes along -Z: X levels 48, 44, 40, 36, 32, 28, 24 (diameter) until the profile + 0.4 is reached.
    const levels = levelPasses(r, 6).map((s) => s.to.x)
    expect(levels).toEqual([48, 44, 40, 36, 32, 28, 24])
    // Each pass stops where its level meets the profile shifted by U0.4 W0.1 (+Z): Ø24 on the taper from Ø20.4 Z-19.9 to Ø40.4 Z-29.9.
    const pass24 = cuts.find((s) => s.to.x === 24 && s.from.x === 24)!
    expect(pass24.to.z).toBeCloseTo(-19.9 - ((24 - 20.4) / (40.4 - 20.4)) * 10, 9)
    // The last pass follows the profile with the allowance: Ø20.4 from Z1.9... to Z-19.9.
    expect(cuts.some((s) => Math.abs(s.to.x - 20.4) < 1e-9 && Math.abs(s.to.z - (-19.9)) < 1e-9)).toBe(true)
    // The profile blocks are not cut on their own after the roughing: N10..N20 belong to the cycle; G70 then finishes on it.
    const finish = moves(r).filter((s) => s.line === 11)
    expect(finish.some((s) => s.kind === "linear" && Math.abs(s.to.x - 20) < 1e-9 && Math.abs(s.to.z + 20) < 1e-9)).toBe(true)
    expect(moves(r).some((s) => s.line === 8 || s.line === 9)).toBe(false)
    // Feeds per revolution: F0.25 at 1000 rpm.
    for (const s of cuts) expect(s.feed).toBeCloseTo(250, 9)
  })

  test("G72 faces in Z levels; G73 repeats the profile from the relief to the allowance", () => {
    const g72 = run("G21 G18 G90\nT0101\nS800 M3\nG0 X52 Z2\nG72 W2 R0.5\nG72 P10 Q20 U0 W0 F100\nN10 G0 Z-6\nG1 X20\nZ0\nN20 X0\nM30")
    // The roughing faces start at A's X (52); the last pass along the profile is not one of them.
    const faces = levelPasses(g72, 6)
    expect(faces.map((s) => s.to.z)).toEqual([0, -2, -4])
    const g73 = run("G21 G18 G90\nT0101\nS800 M3\nG0 X60 Z5\nG73 U4 W0 R3\nG73 P10 Q20 U0 W0 F100\nN10 G0 X20 Z2\nG1 Z-10\nN20 X50\nM30")
    const starts = moves(g73).filter((s) => s.kind === "linear" && s.line === 6 && Math.abs(s.from.x - s.to.x) < 1e-9).map((s) => s.to.x)
    expect(starts).toEqual([28, 24, 20])
  })

  test("G76: Δd·√n depths (never less than Δdmin apart) down to the height, then the finishing passes; every pass at the lead", () => {
    // From 0.9 on, Δd·√n grows by less than Δdmin = 0.05: each pass then goes 0.05 deeper.
    expect(threadDepths({ height: 1.3, firstDepth: 0.3, minDepth: 0.05, finishAllowance: 0.02, finishPasses: 2 }).map((d) => Math.round(d * 1e6) / 1e6))
      .toEqual([0.3, 0.424264, 0.519615, 0.6, 0.67082, 0.734847, 0.793725, 0.848528, 0.9, 0.95, 1, 1.05, 1.1, 1.15, 1.2, 1.25, 1.28, 1.3, 1.3])
    const r = run("G21 G18 G90\nT0303\nG97 S600 M3\nG0 X22 Z5\nG76 P020060 Q50 R0.02\nG76 X17.4 Z-20 P1300 Q300 F2\nM30")
    expect(r.unsupported).toEqual([])
    const passes = moves(r).filter((s) => s.kind === "linear")
    expect(passes.length).toBe(19)
    for (const s of passes) expect(s.feed).toBeCloseTo(1200, 9)
    // The last pass is at the root: X17.4.
    expect(passes[passes.length - 1]!.to.x).toBeCloseTo(17.4, 9)
    expect(passes[0]!.to.x).toBeCloseTo(17.4 + 2 * (1.3 - 0.3), 9)
  })

  test("G74 pecks along Z; U / W are incremental X / Z", () => {
    const r = run("G21 G18 G90\nT0505\nS1200 M3\nG0 X0 Z5\nG74 R1\nG74 Z-12 Q5000 F80\nM30")
    const feeds = moves(r).filter((s) => s.kind === "linear")
    // 5 mm pecks from the start (Z5), 1 mm back after each, then on to the next.
    expect(feeds.map((s) => s.to.z)).toEqual([0, 0, -5, -5, -10, -10, -12])
    expect(moves(r).filter((s) => s.kind === "rapid" && s.from.z < s.to.z && s.to.z - s.from.z === 1).length).toBe(3)
    const u = run("G21 G18 G90\nT0101\nG0 X50 Z2\nG1 U-10 W-5 F100\nM30")
    expect(moves(u)[1]!.to).toEqual({ x: 40, y: 0, z: -3 })
  })

  test("the machine kind of a G71 program is a lathe", () => {
    expect(cam.inferMachineKind(g71)).toMatchObject({ kind: "lathe" })
  })
})

describe("polar interpolation (G112)", () => {
  test("C is the face's second coordinate, not a rotary angle, and the preview puts it on the face", () => {
    const r = run("G21 G18 G90\nT0101\nG0 X40 Z0\nG112\nG1 X20 C10 F100\nX-20\nG113\nG0 X50\nM30")
    expect(r.unsupported).toEqual([])
    const m = moves(r)
    expect(m[1]!.to).toEqual({ x: 20, y: 10, z: 0 })
    expect((m[1] as { readonly rotary?: unknown }).rotary).toBeUndefined()
    const setup = cam.viewer.latheSetupOf({ ...cam.generator.DEFAULT_SETTINGS, machineType: "lathe" })
    expect(cam.viewer.displayPoint(setup, m[1]!.to)).toEqual({ x: 0, y: 10, z: 10 })
    expect(cam.viewer.programPoint(setup, cam.viewer.displayPoint(setup, m[1]!.to))).toEqual(m[1]!.to)
    expect(r.end.y).toBe(0)
  })
})
