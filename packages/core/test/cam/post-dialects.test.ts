/**
 * The posts as the controls read them: the Klartext post's native circles and M-function placement replayed through the
 * independent decoder, the LinuxCNC post, the contour-smoothing option of every control that has it, and the dwell words.
 */
import { describe, expect, test } from "bun:test"
import { makeProgram, type Program, type Toolpath } from "../../src/cam/ir.ts"
import { convertNc, fanucPost, genericPost, haasPost, heidenhainPost, linuxcncPost, mazakPost, okumaPost, siemensPost, grblPost, posts, getPost, samplePostProgram, type Post } from "../../src/cam/post/index.ts"
import { interpretGcode, type GSegment } from "../../src/cam/testing/gcode-interpreter.ts"
import { postOfController } from "../../src/cam/kernel/machine-profile.ts"

const blocks = (text: string) => text.trimEnd().split("\n").map((l) => l.replace(/^\d+ /, ""))

/** Profile with a quarter arc, a full circle, a helix, a dwell; a second operation on the same tool at another speed; a second tool. */
const contour = (): Program => {
  const profile: Toolpath = { id: "p", name: "Profile", toolId: "1", spindleRpm: 9000, coolant: "flood", moves: [
    { _tag: "Rapid", to: { x: 0, y: 0, z: 5 } },
    { _tag: "Linear", to: { x: 0, y: 0, z: -2 }, feed: 200 },
    { _tag: "Linear", to: { x: 20, y: 0, z: -2 }, feed: 400 },
    { _tag: "Arc", to: { x: 30, y: 10, z: -2 }, center: { x: 20, y: 10 }, clockwise: false, feed: 350 },
    { _tag: "Arc", to: { x: 30, y: 10, z: -2 }, center: { x: 25, y: 10 }, clockwise: true, feed: 350 },
    { _tag: "Arc", to: { x: 20, y: 10, z: -3 }, center: { x: 25, y: 10 }, clockwise: true, feed: 300 },
    { _tag: "Dwell", seconds: 0.5 },
    { _tag: "Rapid", to: { x: 20, y: 10, z: 5 } }
  ] }
  const faster: Toolpath = { id: "f", name: "Faster", toolId: "1", spindleRpm: 12000, coolant: "flood", moves: [
    { _tag: "Rapid", to: { x: 40, y: 0, z: 5 } }, { _tag: "Linear", to: { x: 40, y: 0, z: -1 }, feed: 250 }, { _tag: "Linear", to: { x: 50, y: 0, z: -1 }, feed: 500 }, { _tag: "Rapid", to: { x: 50, y: 0, z: 5 } }
  ] }
  const second: Toolpath = { id: "s", name: "Second", toolId: "2", spindleRpm: 6000, coolant: "off", moves: [
    { _tag: "Rapid", to: { x: 60, y: 10, z: 5 } }, { _tag: "Linear", to: { x: 60, y: 10, z: -4 }, feed: 150 }, { _tag: "Rapid", to: { x: 60, y: 10, z: 5 } }
  ] }
  return makeProgram("contour", [profile, faster, second])
}

/** The feed path as points every `step` mm along it (arcs followed exactly), for a geometric comparison of two replays. */
const resample = (segments: ReadonlyArray<GSegment>, step = 0.25): Array<{ x: number; y: number; z: number }> => {
  const out: Array<{ x: number; y: number; z: number }> = []
  for (const s of segments) {
    if (s.kind === "rapid" || s.kind === "dwell") continue
    if (s.kind !== "arc") {
      const n = Math.max(1, Math.ceil(Math.hypot(s.to.x - s.from.x, s.to.y - s.from.y, s.to.z - s.from.z) / step))
      for (let i = 1; i <= n; i++) out.push({ x: s.from.x + ((s.to.x - s.from.x) * i) / n, y: s.from.y + ((s.to.y - s.from.y) * i) / n, z: s.from.z + ((s.to.z - s.from.z) * i) / n })
      continue
    }
    const a0 = Math.atan2(s.from.y - s.center.y, s.from.x - s.center.x)
    let a1 = Math.atan2(s.to.y - s.center.y, s.to.x - s.center.x)
    let sweep = s.clockwise ? a0 - a1 : a1 - a0
    while (sweep <= 1e-9) sweep += 2 * Math.PI
    a1 = a0 + (s.clockwise ? -sweep : sweep)
    const n = Math.max(1, Math.ceil((sweep * s.radiusStart) / step))
    for (let i = 1; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n
      out.push({ x: s.center.x + s.radiusStart * Math.cos(a), y: s.center.y + s.radiusStart * Math.sin(a), z: s.from.z + ((s.to.z - s.from.z) * i) / n })
    }
  }
  return out
}
type P = { readonly x: number; readonly y: number; readonly z: number }
const toSegment = (p: P, a: P, b: P): number => {
  const d = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z }, len = d.x * d.x + d.y * d.y + d.z * d.z
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * d.x + (p.y - a.y) * d.y + (p.z - a.z) * d.z) / len))
  return Math.hypot(p.x - a.x - t * d.x, p.y - a.y - t * d.y, p.z - a.z - t * d.z)
}
/** Largest distance from a point of `a` to the polyline through the points of `b`. */
const deviation = (a: ReadonlyArray<P>, b: ReadonlyArray<P>): number => {
  let worst = 0
  for (const p of a) {
    let best = Infinity
    for (let i = 1; i < b.length; i++) best = Math.min(best, toSegment(p, b[i - 1]!, b[i]!))
    worst = Math.max(worst, best)
  }
  return worst
}

describe("Klartext: circles, M functions and tool calls as the control reads them", () => {
  const text = heidenhainPost.emit(contour())
  const l = blocks(text)

  test("planar arcs are CC + C blocks; a full circle is two half circles; a helix is written as lines", () => {
    const circles = l.filter((b) => b.startsWith("C "))
    // Quarter arc + two halves of the full circle; the helix (Z changes) is not a C block.
    expect(circles).toHaveLength(3)
    for (const c of circles) expect(c).toMatch(/^C X[+-][\d.]+ Y[+-][\d.]+ DR[+-](?: F\d+)?$/)
    expect(l.filter((b) => b.startsWith("CC "))).toHaveLength(3)
    expect(l[l.indexOf(circles[0]!) - 1]).toBe("CC IX+0.000 IY+10.000")
    expect(circles[0]).toContain("DR+")
    expect(circles[1]).toContain("DR-")
    expect(l.filter((b) => /^L .*Z-2\.[0-9]{3}/.test(b) || /^L .*Z-3\.000/.test(b)).length).toBeGreaterThan(3)
  })

  test("no M function stands alone: start functions open the next positioning block, end functions close the previous one", () => {
    expect(l.some((b) => /^M\d+$/.test(b))).toBe(false)
    expect(l.find((b) => /\bM3\b/.test(b))).toMatch(/^L .* M3 M8$/)
    expect(l.find((b) => /\bM30\b/.test(b))).toMatch(/^L .*\bM5\b.*\bM30$/)
    const change = l.findIndex((b) => b.startsWith("TOOL CALL 2"))
    expect(l.slice(0, change).reverse().find((b) => b.startsWith("L "))).toMatch(/\bM5 M9$/)
  })

  test("a speed change on the same tool is TOOL CALL Z S…, a tool change TOOL CALL n Z S…", () => {
    expect(l.filter((b) => b.startsWith("TOOL CALL"))).toEqual(["TOOL CALL 1 Z S9000", "TOOL CALL Z S12000", "TOOL CALL 2 Z S6000"])
  })

  test("the decoder replays the same path as the ISO post, without error, dwell included", () => {
    const klartext = interpretGcode(text), iso = interpretGcode(genericPost.emit(contour()))
    expect(klartext.errors).toEqual([])
    // The helix is chords within the 0.01 mm tolerance: a little shorter than the true arc.
    expect(Math.abs(klartext.cutLength - iso.cutLength)).toBeLessThan(0.05)
    expect(klartext.minZ).toBeCloseTo(iso.minZ, 6)
    expect(klartext.tools).toEqual([1, 2])
    expect(klartext.segments.filter((s) => s.kind === "dwell").map((s) => (s as { seconds: number }).seconds)).toEqual([0.5])
    const a = resample(klartext.segments), b = resample(iso.segments)
    expect(deviation(a, b)).toBeLessThan(0.011)
    expect(deviation(b, a)).toBeLessThan(0.011)
  })

  test("smoothing is cycle 32 with the tolerance, defined for each tool", () => {
    const smooth = blocks(heidenhainPost.emit(contour(), { smoothing: 0.02 }))
    expect(smooth.filter((b) => b === "CYCL DEF 32.1 T0.02")).toHaveLength(2)
    expect(smooth[smooth.indexOf("CYCL DEF 32.1 T0.02") - 1]).toBe("CYCL DEF 32.0 TOLERANCE")
    expect(interpretGcode(smooth.join("\n")).errors).toEqual([])
  })
})

describe("LinuxCNC post", () => {
  test("is a real post: every PostId has one, and the controller name picks it", () => {
    expect(getPost("linuxcnc")).toBe(linuxcncPost)
    for (const id of ["generic", "fanuc", "grbl", "linuxcnc", "haas", "siemens", "heidenhain", "okuma", "mazak"] as const) expect(posts[id].id).toBe(id)
    expect(postOfController("LinuxCNC 2.9")).toBe("linuxcnc")
  })

  test("% delimiters, safe start, G43 H after the change, seconds on G4 and G82, M2", () => {
    const l = blocks(linuxcncPost.emit(samplePostProgram()))
    expect(l[0]).toBe("%")
    expect(l[l.length - 1]).toBe("%")
    expect(l).toContain("G21 G90 G17 G94 G40 G49 G80")
    expect(l[l.indexOf("T1 M6") + 1]).toBe("G43 H1")
    expect(l).toContain("G4 P0.500")
    expect(l.some((b) => b.startsWith("G83 G99"))).toBe(true)
    expect(l[l.length - 2]).toBe("M2")
  })

  test("refuses rigid tapping (LinuxCNC taps with G33.1, not G84) and writes no subprograms", () => {
    const tap = makeProgram("tap", [{ id: "t", name: "Tap", toolId: "1", spindleRpm: 500, coolant: "off", moves: [
      { _tag: "Rapid", to: { x: 0, y: 0, z: 5 } }, { _tag: "Cycle", cycle: "tap", to: { x: 0, y: 0, z: -10 }, feed: 625, pitch: 1.25, peckDepth: 0, dwellSeconds: 0, retractHeight: 2 }
    ] }])
    expect(() => linuxcncPost.emit(tap)).toThrow(/rigid tapping/)
    expect(linuxcncPost.emit(contour(), { subprograms: true })).toBe(linuxcncPost.emit(contour()))
  })

  test("replays to the same path as the reference post", () => {
    const a = interpretGcode(linuxcncPost.emit(samplePostProgram())), b = interpretGcode(genericPost.emit(samplePostProgram()))
    expect(a.errors).toEqual([])
    expect(a.cutLength).toBeCloseTo(b.cutLength, 6)
    expect(a.ended).toBe(true)
  })
})

describe("contour smoothing", () => {
  const cases: ReadonlyArray<readonly [Post, string, string]> = [
    [fanucPost, "G5.1 Q1", "G5.1 Q0"],
    [haasPost, "G187 P2 E0.02", "G187"],
    [siemensPost, "CYCLE832(0.02,_FINISH,1)", "CYCLE832(0,_OFF,1)"],
    [linuxcncPost, "G64 P0.02", "G61"]
  ]
  for (const [post, on, off] of cases) {
    test(`${post.id}: on for each operation, off before each tool change and before the end`, () => {
      const l = blocks(post.emit(contour(), { smoothing: 0.02 }))
      const ons = l.flatMap((b, i) => (b === on ? [i] : [])), offs = l.flatMap((b, i) => (b === off ? [i] : []))
      // Profile and Faster share tool 1: the mode stays on across them; it goes off before T2 and at the end.
      expect(ons).toHaveLength(2)
      expect(offs).toHaveLength(2)
      const change = l.findIndex((b) => /^T2\b/.test(b))
      expect(ons[0]!).toBeLessThan(l.findIndex((b) => /^G1\b/.test(b)))
      expect(offs[0]!).toBeLessThan(change)
      expect(ons[1]!).toBeGreaterThan(change)
      expect(offs[1]!).toBeLessThan(l.findIndex((b) => /^M(?:2|30)$/.test(b)))
      expect(interpretGcode(l.join("\n"), { dwell: post === fanucPost || post === haasPost ? "milliseconds" : "seconds" }).errors).toEqual([])
    })
  }

  test("absent by default, ignored on a control without it, refused when not a positive length", () => {
    expect(fanucPost.emit(contour())).not.toContain("G5.1")
    expect(grblPost.emit(contour(), { smoothing: 0.02 })).toBe(grblPost.emit(contour()))
    expect(() => fanucPost.emit(contour(), { smoothing: -1 })).toThrow(/positive/)
  })

  test("the Haas accuracy level follows the tolerance", () => {
    expect(haasPost.emit(contour(), { smoothing: 0.005 })).toContain("G187 P3 E0.005")
    expect(haasPost.emit(contour(), { smoothing: 0.1 })).toContain("G187 P1 E0.1")
  })
})

describe("dwell words as the replay reads them", () => {
  test("Siemens G4 F is a time and leaves the modal feed alone", () => {
    const run = interpretGcode(siemensPost.emit(contour()))
    const dwell = run.segments.find((s) => s.kind === "dwell") as { seconds: number }
    expect(dwell.seconds).toBeCloseTo(0.5, 9)
    const after = run.segments.slice(run.segments.indexOf(dwell as GSegment) + 1).find((s) => s.kind === "linear") as { feed: number }
    expect(after.feed).toBeGreaterThan(100)
  })
})

const tapProgram = (): Program => makeProgram("tap", [{ id: "t", name: "Tap", toolId: "4", spindleRpm: 500, coolant: "flood", moves: [
  { _tag: "Rapid", to: { x: 0, y: 0, z: 5 } }, { _tag: "Cycle", cycle: "tap", to: { x: 0, y: 0, z: -10 }, feed: 625, pitch: 1.25, peckDepth: 0, dwellSeconds: 0, retractHeight: 2 },
  { _tag: "Rapid", to: { x: 0, y: 0, z: 20 } }
] }])

describe("Okuma OSP post", () => {
  const p = { ...contour(), workOffset: "G56" as const }
  const l = blocks(okumaPost.emit(p))

  test("G15 H selects the work offset, G56 H is the tool length, G4 F the dwell, M2 ends; no ISO-only words", () => {
    expect(l).toContain("G15 H3")
    expect(l[l.indexOf("T1 M6") + 1]).toBe("G56 H1")
    expect(l).toContain("G4 F0.500")
    expect(l[l.length - 1]).toBe("M2")
    expect(l.join("\n")).not.toMatch(/\bG43\b|\bG49\b|\bG98\b|\bG99\b|\bG8[1-9]\b|^%/m)
  })

  test("the controller name picks it, rigid tapping is refused, the Okuma-aware replay reads it", () => {
    expect(postOfController("Okuma OSP-P300MA")).toBe("okuma")
    expect(() => okumaPost.emit(tapProgram())).toThrow(/rigid tapping/)
    const run = interpretGcode(l.join("\n"), { okuma: true })
    expect(run.errors).toEqual([])
    expect(run.cutLength).toBeCloseTo(interpretGcode(genericPost.emit(contour())).cutLength, 6)
    expect(run.segments.filter((s) => s.kind === "dwell").map((s) => (s as { seconds: number }).seconds)).toEqual([0.5])
  })

  test("converts to and from the other controls with the motion proved", () => {
    const toOkuma = convertNc(fanucPost.emit(p), { source: "fanuc", target: "okuma" })
    expect(toOkuma.errors).toEqual([])
    expect(toOkuma.code).toMatch(/^G15 H3$/m)
    const back = convertNc(toOkuma.code, { source: "okuma", target: "fanuc" })
    expect(back.errors).toEqual([])
    expect(back.program!.workOffset).toBe("G56")
    expect(back.code).toMatch(/^G56$/m)
  })
})

describe("Mazak EIA/ISO post", () => {
  test("synchronous tapping is G84.2 without M29, tool tip control G43.4, Fanuc family otherwise", () => {
    const text = mazakPost.emit(tapProgram())
    expect(text).toMatch(/^G84\.2 G99 /m)
    expect(text).not.toMatch(/\bM29\b/)
    expect(text).toMatch(/^O1000$/m)
    expect(text).toMatch(/^G43 H4$/m)
    expect(postOfController("Mazak SmoothX")).toBe("mazak")
    const run = interpretGcode(text, { dwell: "milliseconds" })
    expect(run.errors).toEqual([])
    expect(run.minZ).toBeCloseTo(-10, 6)
  })

  test("a G84.2 program is refused by the converter (a tap written as moves breaks)", () => {
    const r = convertNc(mazakPost.emit(tapProgram()), { source: "mazak", target: "generic" })
    expect(r.ok).toBe(false)
    expect(r.errors.join()).toMatch(/tapping/)
  })
})

describe("Klartext inch programs and presets", () => {
  test("INCH header, positions in inches, F in 1/10 inch/min, and the replay reads it back to the same path", () => {
    const p = { ...contour(), units: "inch" as const }
    const text = heidenhainPost.emit(p)
    const l = blocks(text)
    expect(l[0]).toBe("BEGIN PGM CONTOUR INCH")
    expect(l[l.length - 1]).toBe("END PGM CONTOUR INCH")
    // 400 mm/min = 15.748 inch/min, written as F157.48.
    expect(l.some((b) => /^L .* F157\.48\b/.test(b))).toBe(true)
    expect(l.some((b) => /X\+0\.7874\b/.test(b))).toBe(true)
    const klartext = interpretGcode(text), iso = interpretGcode(genericPost.emit(contour()))
    expect(klartext.errors).toEqual([])
    expect(Math.abs(klartext.cutLength - iso.cutLength)).toBeLessThan(0.05)
    const feed = (klartext.segments.find((s) => s.kind === "linear" && s.to.x > 19) as { feed: number }).feed
    expect(feed).toBeCloseTo(400, 1)
  })

  test("G54-G59 select preset rows 1-6 with cycle 247; its continuation line has no block number", () => {
    const text = heidenhainPost.emit({ ...contour(), workOffset: "G57" })
    const raw = text.split("\n")
    const at = raw.findIndex((r) => r.endsWith("CYCL DEF 247 PRESETTING ~"))
    expect(at).toBeGreaterThan(0)
    expect(raw[at + 1]).toBe("  Q339=+4 ;PRESET NUMBER")
    expect(Number(raw[at + 2]!.split(" ")[0])).toBe(Number(raw[at]!.split(" ")[0]) + 1)
    expect(at).toBeLessThan(raw.findIndex((r) => r.includes("TOOL CALL")))
    const read = convertNc(text, { source: "heidenhain", target: "fanuc" })
    expect(read.errors).toEqual([])
    expect(read.program!.workOffset).toBe("G57")
  })
})
