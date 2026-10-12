import { describe, expect, test } from "bun:test"
import { analyzeManufacturability } from "./dfm.ts"
import { METRIC_THREADS } from "./fasteners.ts"
import { resolveParameters } from "./expr.ts"
import { historyVolume, rebuild, withParameter, type History } from "./history.ts"
import { RECIPES, buildRecipe, fastenerSizes, recipeNames } from "./recipes.ts"

/** Booleans on thousands of facets are slow on a loaded machine: give the geometry tests room. */
const SLOW = 120_000

const SHAFT = { sections: [{ diameter: 20, length: 30 }, { diameter: 30, length: 50 }, { diameter: 24, length: 40 }] }
/**
 * The default pipe_bend (Ø30, R45 long-radius elbow) sweeps a hollow section along ~90 arc points: a 40 000 triangle Boolean that takes
 * minutes. The tests that rebuild a bend use a small pipe (Ø10 x 1, R8), which is the same geometry in a couple of seconds (more in `recipes-pipe-bend.test.ts`).
 */
const SMALL_PIPE = { outerDiameter: 10, wall: 1, legA: 20, legB: 20, bendRadius: 8 }
const defaults = (name: string): Record<string, unknown> => (name === "stepped_shaft" ? SHAFT : name === "pipe_bend" ? SMALL_PIPE : {})
const errorsOf = (h: History) => rebuild(h).issues.filter((i) => i.severity === "error")
const circleArea = (d: number) => (Math.PI / 4) * d * d
const rel = (got: number, want: number) => Math.abs(got - want) / want

describe("recipe catalogue", () => {
  test("the seven engineering recipes exist, with unique names and documented parameters", () => {
    expect(recipeNames()).toEqual(["mounting_plate", "flange", "l_bracket", "stepped_shaft", "pipe_bend", "duct_transition", "enclosure"])
    expect(new Set(recipeNames()).size).toBe(RECIPES.length)
    for (const r of RECIPES) {
      expect(r.title.length).toBeGreaterThan(3)
      expect(r.description.length).toBeGreaterThan(30)
      expect(r.params.length).toBeGreaterThan(2)
      for (const p of r.params) {
        expect(p.description.length).toBeGreaterThan(3)
        if (typeof p.default === "number") {
          if (p.min !== undefined) expect(p.default).toBeGreaterThanOrEqual(p.min)
          if (p.max !== undefined) expect(p.default).toBeLessThanOrEqual(p.max)
        }
        if (p.options !== undefined && typeof p.default === "string") expect(p.options).toContain(p.default)
      }
    }
  })

  test("the sizes the assistant is told about are the fastener table's", () => {
    expect(fastenerSizes()).toEqual(METRIC_THREADS.map((m) => m.name))
    expect(fastenerSizes()).toContain("M8")
  })

  test("an unknown recipe is a RangeError that lists the known ones", () => {
    expect(() => buildRecipe("rocket")).toThrow(RangeError)
    expect(() => buildRecipe("rocket")).toThrow(/Unknown recipe 'rocket'.*mounting_plate.*flange.*enclosure/)
  })

  test.each(RECIPES.map((r) => r.name))("%s: builds with defaults, one fully constrained body, no rebuild issues, finite derived numbers and a summary", (name) => {
    const result = buildRecipe(name, defaults(name))
    expect(result.recipe).toBe(name)
    expect(result.summary.length).toBeGreaterThan(10)
    expect(result.rules.length).toBeGreaterThan(0)
    for (const v of Object.values(result.derived)) if (typeof v === "number") expect(Number.isFinite(v)).toBe(true)
    const ids = result.history.features.map((f) => f.id)
    expect(new Set(ids).size).toBe(ids.length) // unique feature ids
    const r = rebuild(result.history)
    expect(r.issues).toEqual([])
    expect(r.bodies).toHaveLength(1)
    expect(historyVolume(r)).toBeGreaterThan(0)
    for (const [id, sk] of Object.entries(r.sketches)) expect([id, sk.solve.status]).toEqual([id, "fully-constrained"])
    // every history parameter is a finite number once resolved
    for (const v of Object.values(r.parameters)) expect(Number.isFinite(v)).toBe(true)
  }, SLOW)
})

describe("mounting_plate", () => {
  test("default: 100 x 60 x 10 with four M8 clearance holes (Ø9, ISO 273 medium) 18 mm in from the edges", () => {
    const res = buildRecipe("mounting_plate")
    expect(res.derived).toMatchObject({ holeDiameter: 9, edgeDistance: 18, holeSpacingX: 64, holeSpacingY: 24 })
    const v = historyVolume(rebuild(res.history))
    const exact = 100 * 60 * 10 - 4 * circleArea(9) * 10
    expect(v).toBeGreaterThanOrEqual(exact - 1e-6) // the holes are inscribed polygons, so they remove a little less than the true circles
    expect(rel(v, exact)).toBeLessThan(0.001)
  }, SLOW)

  test("the fit changes the hole: M6 fine = Ø6.4, coarse = Ø7", () => {
    expect(buildRecipe("mounting_plate", { fastener: "M6", fit: "fine" }).derived["holeDiameter"]).toBe(6.4)
    expect(buildRecipe("mounting_plate", { fastener: "M6", fit: "coarse" }).derived["holeDiameter"]).toBe(7)
    expect(buildRecipe("mounting_plate", { fastener: "m6" }).derived["holeDiameter"]).toBe(6.6)
  })

  test("counterbored: each hole also loses the DIN 974 recess (Ø15 x 9 for M8)", () => {
    const res = buildRecipe("mounting_plate", { counterbore: true })
    expect(res.derived).toMatchObject({ counterboreDiameter: 15, counterboreDepth: 9 })
    const v = historyVolume(rebuild(res.history))
    const exact = 100 * 60 * 10 - 4 * (circleArea(9) * 10 + (circleArea(15) - circleArea(9)) * 9)
    expect(rel(v, exact)).toBeLessThan(0.002)
    expect(v).toBeGreaterThanOrEqual(exact - 1e-6)
  }, SLOW)

  test("corner radius and edge chamfer take material off but leave the holes where they were", () => {
    const plain = historyVolume(rebuild(buildRecipe("mounting_plate").history))
    const rounded = rebuild(buildRecipe("mounting_plate", { cornerRadius: 8, edgeChamfer: 1 }).history)
    expect(rounded.issues).toEqual([])
    expect(historyVolume(rounded)).toBeLessThan(plain)
    const cornerOnly = historyVolume(rebuild(buildRecipe("mounting_plate", { cornerRadius: 8 }).history))
    expect(plain - cornerOnly).toBeGreaterThan((4 - Math.PI) * 64 * 10 * 0.95)
    expect(plain - cornerOnly).toBeLessThan((4 - Math.PI) * 64 * 10 * 1.02)
  }, SLOW)

  test("editing the width rebuilds: the plate and the hole spacing follow", () => {
    const h = buildRecipe("mounting_plate").history
    const wide = rebuild(withParameter(h, "width", 140))
    expect(wide.issues).toEqual([])
    expect(historyVolume(wide)).toBeGreaterThan(historyVolume(rebuild(h)) + 38 * 60 * 10)
  }, SLOW)

  test("the default is makeable on a 6 mm cutter", () => {
    const r = analyzeManufacturability(buildRecipe("mounting_plate").history)
    expect(r.issues.filter((i) => i.severity !== "info")).toEqual([])
    expect(r.ok).toBe(true)
  }, SLOW)

  test.each([
    [{ edgeDistance: 10 }, /edge distance/],
    [{ width: 30 }, /closer than 2\.5/],
    [{ depth: 30 }, /closer than 2\.5/],
    [{ counterbore: true, thickness: 5 }, /counterbore is 9 mm deep/],
    [{ cornerRadius: 40 }, /corner radius/],
    [{ edgeChamfer: 5 }, /chamfer/],
    [{ fastener: "M7" }, /Unknown metric thread 'M7'/],
    [{ fit: "loose" }, /'fit' must be one of fine, medium, coarse/],
    [{ width: "wide" }, /'width' must be a number/],
    [{ width: 5 }, /at least 10/],
    [{ thickness: 500 }, /at most 200/]
  ] as const)("breaking a rule is a RangeError that names it: %j", (input, message) => {
    expect(() => buildRecipe("mounting_plate", input)).toThrow(RangeError)
    expect(() => buildRecipe("mounting_plate", input)).toThrow(message)
  })

  test("numbers arrive as strings from a language model: '60' is accepted", () => {
    expect(buildRecipe("mounting_plate", { width: "120", depth: "70" }).history.parameters["width"]).toBe(120)
  })
})

describe("flange", () => {
  test("default: Ø120 x 14 with a Ø40 bore and six M10 bolts (Ø11) on a Ø80 circle", () => {
    const res = buildRecipe("flange")
    expect(res.derived).toMatchObject({ holeDiameter: 11, boltCircleDiameter: 80, rimDistance: 20, boreWeb: 14.5 })
    expect(res.derived["boltSpacing"]).toBeCloseTo(80 * Math.sin(Math.PI / 6), 2)
    const r = rebuild(res.history)
    expect(r.issues).toEqual([])
    const exact = (circleArea(120) - circleArea(40)) * 14 - 6 * circleArea(11) * 14
    expect(rel(historyVolume(r), exact)).toBeLessThan(0.002) // outer / bore facets are inscribed, the bolt holes too: errors partly cancel
  }, SLOW)

  test("a hub adds the ring (hub² - bore²) x height above the flange", () => {
    const res = buildRecipe("flange", { hubDiameter: 60, hubHeight: 20 })
    const r = rebuild(res.history)
    expect(r.issues).toEqual([])
    expect(r.bodies).toHaveLength(1)
    const exact = (circleArea(120) - circleArea(40)) * 14 - 6 * circleArea(11) * 14 + (circleArea(60) - circleArea(40)) * 20
    expect(rel(historyVolume(r), exact)).toBeLessThan(0.002)
  }, SLOW)

  test("editing the bolt count through the parameter takes two holes' worth more material away", () => {
    const h = buildRecipe("flange").history
    const six = historyVolume(rebuild(h))
    const eight = rebuild(withParameter(h, "bolts", 8))
    expect(eight.issues).toEqual([])
    expect(six - historyVolume(eight)).toBeGreaterThan(2 * circleArea(11) * 14 * 0.98)
    expect(six - historyVolume(eight)).toBeLessThan(2 * circleArea(11) * 14 * 1.02)
  }, SLOW)

  test("no bore is a solid disc", () => {
    const r = rebuild(buildRecipe("flange", { boreDiameter: 0, boltCircleDiameter: 84 }).history)
    expect(r.issues).toEqual([])
    expect(rel(historyVolume(r), circleArea(120) * 14 - 6 * circleArea(11) * 14)).toBeLessThan(0.002)
  }, SLOW)

  test("the default is makeable", () => {
    const r = analyzeManufacturability(buildRecipe("flange").history)
    expect(r.issues.filter((i) => i.severity === "error")).toEqual([])
  }, SLOW)

  test.each([
    [{ boltCircleDiameter: 110 }, /from the rim/],
    [{ boltCircleDiameter: 50 }, /between the bolt holes and the bore/],
    [{ boltCount: 20 }, /neighbouring bolts/],
    [{ hubDiameter: 75, hubHeight: 10 }, /hub would cover the bolt holes/],
    [{ hubDiameter: 30, hubHeight: 10 }, /hubDiameter larger than the bore/],
    [{ boreDiameter: 130 }, /bore must be smaller/],
    [{ edgeChamfer: 8 }, /chamfer/],
    [{ boltCount: 6.5 }, /whole number/],
    [{ boltCount: 2 }, /at least 3/],
    [{ fastener: "M99" }, /Unknown metric thread/]
  ] as const)("breaking a rule is a RangeError that names it: %j", (input, message) => {
    expect(() => buildRecipe("flange", input)).toThrow(RangeError)
    expect(() => buildRecipe("flange", input)).toThrow(message)
  })
})

describe("l_bracket", () => {
  test("default: 60 x 50 x 40, 5 mm thick, one M6 hole (Ø6.6) per leg", () => {
    const res = buildRecipe("l_bracket")
    expect(res.derived).toMatchObject({ holeDiameter: 6.6, baseHoleFromBend: 32.5, legHoleFromBend: 27.5 })
    const r = rebuild(res.history)
    expect(r.issues).toEqual([])
    const exact = (60 * 5 + (50 - 5) * 5) * 40 - 2 * circleArea(6.6) * 5
    expect(historyVolume(r)).toBeGreaterThanOrEqual(exact - 1e-6)
    expect(rel(historyVolume(r), exact)).toBeLessThan(0.001)
  }, SLOW)

  test("two holes per leg (a linear pattern across the width): four holes in all", () => {
    const res = buildRecipe("l_bracket", { holesPerLeg: 2 })
    expect(res.derived["holePitch"]).toBe(20)
    const r = rebuild(res.history)
    expect(r.issues).toEqual([])
    const exact = (60 * 5 + 45 * 5) * 40 - 4 * circleArea(6.6) * 5
    expect(rel(historyVolume(r), exact)).toBeLessThan(0.001)
  }, SLOW)

  test("the holes go through the legs, not the bend: the base hole is on the free part of the base (x > thickness)", () => {
    const r = rebuild(buildRecipe("l_bracket").history)
    const base = r.bodies[0]!.mesh.positions
    // no vertex of the body lies inside either hole's cylinder (the hole is empty), i.e. none of the hole-wall vertices is at the plate centre
    let nearHoleAxis = 0
    for (let i = 0; i < base.length; i += 3) if (Math.hypot(base[i]! - 32.5, base[i + 2]! - 20) < 3.2) nearHoleAxis++
    expect(nearHoleAxis).toBe(0)
  }, SLOW)

  test("a corner radius that the tips allow (2 mm on 5 mm legs) takes material off", () => {
    const sharp = historyVolume(rebuild(buildRecipe("l_bracket").history))
    const r = rebuild(buildRecipe("l_bracket", { cornerRadius: 2 }).history)
    expect(r.issues).toEqual([])
    expect(historyVolume(r)).toBeLessThan(sharp)
  }, SLOW)

  test("a rounded bracket is makeable with a cutter that fits the radius (4 mm cutter, R2)", () => {
    // BUG CHECK: needs dfm.ts to honour extrude.corner (see dfm.test.ts).
    const r = analyzeManufacturability(buildRecipe("l_bracket", { cornerRadius: 2 }).history, { toolDiameter: 4 })
    expect(r.issues.filter((i) => i.code === "INTERNAL_CORNER")).toEqual([])
  }, SLOW)

  test("the sharp default is not makeable by milling: the inside bend corner is reported", () => {
    const r = analyzeManufacturability(buildRecipe("l_bracket").history)
    expect(r.issues.filter((i) => i.code === "INTERNAL_CORNER")).toHaveLength(1)
  }, SLOW)

  test.each([
    [{ baseLength: 8 }, /twice the thickness/],
    [{ legHeight: 8 }, /twice the thickness/],
    [{ baseLength: 15 }, /free length of a leg/],
    [{ width: 15 }, /width 15 mm leaves less/],
    [{ holesPerLeg: 2, width: 30 }, /two holes need the width/],
    [{ cornerRadius: 3 }, /corner radius/],
    [{ holesPerLeg: 3 }, /at most 2/],
    [{ fastener: "M7" }, /Unknown metric thread/]
  ] as const)("breaking a rule is a RangeError that names it: %j", (input, message) => {
    expect(() => buildRecipe("l_bracket", input)).toThrow(RangeError)
    expect(() => buildRecipe("l_bracket", input)).toThrow(message)
  })
})

describe("stepped_shaft", () => {
  /** Chamfer 1 at 45 degrees at both ends: the revolved triangle c²/2 at centroid radius R - c/3. */
  const cylinders = (sections: Array<{ diameter: number; length: number }>) => sections.reduce((s, q) => s + circleArea(q.diameter) * q.length, 0)
  const chamferRemoved = (R: number, c: number) => Math.PI * c * c * (R - c / 3)

  test("default chamfer: the sum of the cylinders less the two end chamfers, to the facets", () => {
    const res = buildRecipe("stepped_shaft", SHAFT)
    expect(res.derived["totalLength"]).toBe(120)
    const r = rebuild(res.history)
    expect(r.issues).toEqual([])
    const exact = cylinders(SHAFT.sections) - chamferRemoved(10, 1) - chamferRemoved(12, 1)
    expect(historyVolume(r)).toBeLessThanOrEqual(exact + 1e-6)
    expect(rel(historyVolume(r), exact)).toBeLessThan(0.003)
    const xs = r.bodies[0]!.mesh.positions
    let maxX = -Infinity, minX = Infinity
    for (let i = 0; i < xs.length; i += 3) { maxX = Math.max(maxX, xs[i]!); minX = Math.min(minX, xs[i]!) }
    expect(minX).toBeCloseTo(0, 5)
    expect(maxX).toBeCloseTo(120, 5)
  }, SLOW)

  test("no chamfer is exactly the cylinders; a single section is a plain pin", () => {
    const r = rebuild(buildRecipe("stepped_shaft", { ...SHAFT, chamfer: 0 }).history)
    expect(r.issues).toEqual([])
    expect(rel(historyVolume(r), cylinders(SHAFT.sections))).toBeLessThan(0.003)
    const pin = rebuild(buildRecipe("stepped_shaft", { sections: [{ diameter: 10, length: 50 }], chamfer: 1 }).history)
    expect(pin.issues).toEqual([])
    expect(rel(historyVolume(pin), circleArea(10) * 50 - 2 * chamferRemoved(5, 1))).toBeLessThan(0.003)
  }, SLOW)

  test("every diameter and length is a parameter: lengthening a section lengthens the shaft", () => {
    const h = buildRecipe("stepped_shaft", SHAFT).history
    const longer = rebuild(withParameter(h, "l2", 80))
    expect(longer.issues).toEqual([])
    expect(historyVolume(longer) - historyVolume(rebuild(h))).toBeGreaterThan(circleArea(30) * 30 * 0.99)
    const fatter = rebuild(withParameter(h, "d2", 36))
    expect(fatter.issues).toEqual([])
    expect(historyVolume(fatter)).toBeGreaterThan(historyVolume(rebuild(h)))
  }, SLOW)

  test("a DIN 6885 keyway on the Ø30 section: 8 x 7 key, 4 mm deep in the shaft, 3.3 mm in the hub", () => {
    const res = buildRecipe("stepped_shaft", { ...SHAFT, keywaySection: 1 })
    expect(res.derived).toMatchObject({ keyWidth: 8, keyHeight: 7, shaftKeywayDepth: 4, hubKeywayDepth: 3.3, keyLength: 40 })
    const r = rebuild(res.history)
    expect(r.issues).toEqual([])
    expect(r.bodies).toHaveLength(1)
    // slot volume by numeric integration: depth under the cylinder x length of the rounded-end slot at each lateral offset y
    const R = 15, floor = 11, b = 8, L = 40, rEnd = 4
    let slot = 0
    const steps = 4000
    for (let k = 0; k < steps; k++) {
      const y = -b / 2 + ((k + 0.5) * b) / steps
      slot += (Math.sqrt(R * R - y * y) - floor) * (L - 2 * (rEnd - Math.sqrt(rEnd * rEnd - y * y))) * (b / steps)
    }
    const without = historyVolume(rebuild(buildRecipe("stepped_shaft", SHAFT).history))
    expect(rel(without - historyVolume(r), slot)).toBeLessThan(0.04)
  }, SLOW)

  test("the keyway moves with the section when the lengths change", () => {
    const h = buildRecipe("stepped_shaft", { ...SHAFT, keywaySection: 2 }).history
    const r = rebuild(withParameter(h, "l1", 60))
    expect(r.issues).toEqual([])
    expect(r.bodies).toHaveLength(1)
  }, SLOW)

  test.each([
    [{ sections: [{ diameter: 5, length: 40 }], keywaySection: 0 }, /DIN 6885 has no key for a Ø5 mm shaft/],
    [{ sections: [{ diameter: 80, length: 100 }], keywaySection: 0 }, /DIN 6885 has no key for a Ø80 mm shaft/],
    [{ ...SHAFT, keywaySection: 7 }, /not a section/],
    [{ ...SHAFT, keywaySection: 1, keyLength: 60 }, /does not fit the 50 mm section/],
    [{ sections: [] }, /non-empty array/],
    [{}, /non-empty array/],
    [{ sections: [{ diameter: -4, length: 10 }] }, /positive diameter and length/],
    [{ sections: [{ diameter: 10 }] }, /positive diameter and length/],
    [{ sections: [{ diameter: 10, length: 20 }], chamfer: 6 }, /smaller than the end radius/],
    [{ sections: [{ diameter: 40, length: 3 }], chamfer: 2 }, /shorter than the end section/],
    [{ sections: Array.from({ length: 21 }, () => ({ diameter: 10, length: 5 })) }, /at most 20 sections/]
  ] as const)("breaking a rule is a RangeError that names it: %j", (input, message) => {
    expect(() => buildRecipe("stepped_shaft", input as Record<string, unknown>)).toThrow(RangeError)
    expect(() => buildRecipe("stepped_shaft", input as Record<string, unknown>)).toThrow(message)
  })
})

describe("enclosure", () => {
  test("without bosses: the shell volume is outer rounded box less the cavity above the floor", () => {
    const res = buildRecipe("enclosure", { bosses: false })
    const r = rebuild(res.history)
    expect(r.issues).toEqual([])
    const outerArea = 120 * 80 - (4 - Math.PI) * 36 // R6 corners
    const cavityArea = 114 * 74 - (4 - Math.PI) * 9 // R3 corners (outside radius - wall)
    const exact = outerArea * 40 - cavityArea * (40 - 3)
    expect(rel(historyVolume(r), exact)).toBeLessThan(0.003)
    expect(res.derived).toMatchObject({ cavityLength: 114, cavityWidth: 74, cavityDepth: 37 })
  }, SLOW)

  test("with the four bosses: M3 -> Ø7.2 bosses, 35 mm tall, tap-drill pilots (Ø2.5)", () => {
    const res = buildRecipe("enclosure")
    expect(res.derived).toMatchObject({ bossDiameter: 7.2, pilotDiameter: 2.5, bossHeight: 35, bossInset: 7.1 })
    const r = rebuild(res.history)
    expect(r.issues).toEqual([])
    expect(r.bodies).toHaveLength(1)
    const shell = historyVolume(rebuild(buildRecipe("enclosure", { bosses: false }).history))
    const boss = circleArea(7.2) * 35, pilot = circleArea(2.5) * Number(res.derived["pilotDepth"])
    const v = historyVolume(r)
    expect(v).toBeLessThan(shell + 4 * (boss - pilot) + 1e-6)
    expect(v).toBeGreaterThan(shell + 4 * (boss * 0.7 - pilot)) // the bosses merge a little with the corner walls
  }, SLOW)

  test("walls are uniform: changing the wall parameter changes the cavity", () => {
    const h = buildRecipe("enclosure", { bosses: false }).history
    const thick = rebuild(withParameter(h, "wall", 4))
    expect(thick.issues).toEqual([])
    expect(historyVolume(thick)).toBeGreaterThan(historyVolume(rebuild(h)))
  }, SLOW)

  test("the pilot holes are a drilling a shop can do (not deeper than 10 diameters)", () => {
    // The pilot is a tapped-hole depth (2 d of thread plus drill point), not the full boss height.
    const r = analyzeManufacturability(buildRecipe("enclosure").history)
    expect(r.issues.filter((i) => i.code === "DEEP_HOLE" && i.severity === "error")).toEqual([])
  }, SLOW)

  test("the cavity's R3 inside corners suit a 6 mm cutter", () => {
    // BUG CHECK: needs dfm.ts to honour extrude.corner (see dfm.test.ts).
    const r = analyzeManufacturability(buildRecipe("enclosure", { bosses: false }).history)
    expect(r.issues.filter((i) => i.code === "INTERNAL_CORNER")).toEqual([])
  }, SLOW)

  test.each([
    [{ cornerRadius: 3 }, /must exceed the wall/],
    [{ cornerRadius: 70 }, /half the box/],
    [{ cornerRadius: 0, wall: 10, width: 20 }, /no cavity/],
    [{ height: 10 }, /thread engagement/],
    [{ length: 20, width: 20, cornerRadius: 0, wall: 3 }, /too small for four screw bosses/],
    [{ fastener: "M7" }, /Unknown metric thread/]
  ] as const)("breaking a rule is a RangeError that names it: %j", (input, message) => {
    expect(() => buildRecipe("enclosure", input)).toThrow(RangeError)
    expect(() => buildRecipe("enclosure", input)).toThrow(message)
  })
})

describe("sweep: every recipe either builds cleanly or refuses with a RangeError", () => {
  const grids: Record<string, Array<Record<string, unknown>>> = {
    mounting_plate: [50, 100].flatMap((width) => [4, 12].flatMap((thickness) => ["M5", "M10"].map((fastener) => ({ width, thickness, fastener })))),
    flange: [100, 200].flatMap((outerDiameter) => [4, 8].flatMap((boltCount) => ["M8", "M12"].map((fastener) => ({ outerDiameter, boltCount, fastener })))),
    l_bracket: [40, 80].flatMap((baseLength) => [3, 8].flatMap((thickness) => [1, 2].map((holesPerLeg) => ({ baseLength, thickness, holesPerLeg })))),
    stepped_shaft: [16, 40].flatMap((d) => [0, 2].flatMap((chamfer) => [30, 90].map((length) => ({ sections: [{ diameter: d, length }, { diameter: d + 8, length: 25 }], chamfer })))),
    // Small pipes: each rebuild is a Boolean of ~20 000 triangles.
    pipe_bend: [0, 8].flatMap((bendRadius) => [60, 150].map((bendAngle) => ({ outerDiameter: 10, wall: 1, bendRadius, bendAngle, legA: 20, legB: 20 }))),
    duct_transition: ["rect", "round"].flatMap((shape) => [1, 3].flatMap((wall) => [60, 200].map((length) => ({ shape, wall, length, width1: 80, height1: 60, width2: 40, height2: 30 })))),
    enclosure: [60, 140].flatMap((length) => [1.5, 4].flatMap((wall) => [true, false].map((bosses) => ({ length, wall, bosses, height: 45 }))))
  }

  test.each(Object.keys(grids))("%s", (name) => {
    let built = 0, refused = 0
    for (const input of grids[name]!) {
      let result
      try { result = buildRecipe(name, input) } catch (error) {
        expect(error).toBeInstanceOf(RangeError)
        expect((error as Error).message.length).toBeGreaterThan(10)
        refused++
        continue
      }
      const r = rebuild(result.history)
      expect([JSON.stringify(input), r.issues.filter((i) => i.severity === "error")]).toEqual([JSON.stringify(input), []])
      const v = historyVolume(r)
      expect(Number.isFinite(v)).toBe(true)
      expect(v).toBeGreaterThan(0)
      built++
    }
    expect(built).toBeGreaterThan(0)
    expect(built + refused).toBe(grids[name]!.length)
  }, SLOW)
})

// ---------------------------------------------------------------------------------------------------------------------------------
// pipe_bend (sweep) and duct_transition (loft)

const frustum = (a1: number, a2: number, length: number) => (length / 3) * (a1 + a2 + Math.sqrt(a1 * a2))
const ngonArea = (n: number, r: number) => 0.5 * n * r * r * Math.sin((2 * Math.PI) / n)
const volumeOf = (h: History) => historyVolume(rebuild(h))

/** Centre-line length of a bend of `radius` turning `degrees` between two runs: the runs less two setbacks, plus the arc. */
const bendLength = (legA: number, legB: number, degrees: number, radius: number): number => {
  const turn = (degrees * Math.PI) / 180
  return legA + legB - 2 * radius * Math.tan(turn / 2) + radius * turn
}
const tube = (od: number, wall: number, length: number): number => Math.PI * ((od / 2) ** 2 - (od / 2 - wall) ** 2) * length

describe("pipe_bend", () => {
  test("the default is a long-radius elbow: R = 1.5 x the diameter, the centre line is the runs less two setbacks plus the arc (derived, no rebuild)", () => {
    const res = buildRecipe("pipe_bend")
    expect(res.derived).toMatchObject({ innerDiameter: 24, bendRadius: 45 })
    expect(res.derived["straightSetback"]).toBeCloseTo(45, 3) // R tan(45 degrees)
    expect(res.derived["centrelineLength"]).toBeCloseTo(bendLength(100, 100, 90, 45), 3)
    expect(res.derived["centrelineLength"] as number).toBeCloseTo(180.686, 3)
    expect(res.derived["flowArea"]).toBeCloseTo(Math.PI * 144, 1)
    expect(res.history.parameters["bendRadius"]).toBe(45)
    expect(res.history.features.at(-1)).toMatchObject({ type: "sweep", bendRadius: "bendRadius" })
    expect(res.summary).toContain("R45")
  })

  test("bendRadius 0 is the mitred elbow of before: no bendRadius parameter, no bendRadius on the sweep, centre line L1 + L2 (the volume is checked in recipes-pipe-bend.test.ts)", () => {
    const res = buildRecipe("pipe_bend", { bendRadius: 0 })
    expect(res.derived["centrelineLength"]).toBe(200)
    expect(res.derived).not.toHaveProperty("bendRadius")
    expect(res.history.parameters).not.toHaveProperty("bendRadius")
    expect(res.history.features.at(-1)).not.toHaveProperty("bendRadius")
    expect(res.summary).toContain("Mitred")
      })

  test("the bore stays a tube: the inside diameter is the outside less two walls (an expression of the parameters)", () => {
    const res = buildRecipe("pipe_bend", { outerDiameter: 50, wall: 4 })
    expect(res.history.parameters["id"]).toBe("od - 2 * wall")
    expect(res.derived["bendRadius"]).toBe(75)
    expect(resolveParameters(res.history.parameters).values["id"]).toBe(42) // the expression resolves; the Ø50 elbow itself takes minutes to rebuild
  })

  test("a small bend can be made on a mill (no rule fires)", () => {
    const r = analyzeManufacturability(buildRecipe("pipe_bend", SMALL_PIPE).history)
    expect(r.issues.filter((i) => i.severity !== "info")).toEqual([])
  }, SLOW)

  test("the bend must clear the pipe: a bend radius under the pipe's own radius is refused, naming it", () => {
    expect(() => buildRecipe("pipe_bend", { bendRadius: 10 })).toThrow(RangeError)
    expect(() => buildRecipe("pipe_bend", { bendRadius: 10 })).toThrow(/bend radius 10 mm must exceed the pipe radius \(15 mm\)/)
    expect(() => buildRecipe("pipe_bend", { bendRadius: 15 })).toThrow(/bend radius/) // equal is a bend that folds over itself too
    expect(() => buildRecipe("pipe_bend", { bendRadius: 15.5 })).not.toThrow()
  })

  test("runs shorter than the bend's setback R tan(a/2) are refused with the numbers: the default 45 mm bend at 135 degrees needs 108.64 mm", () => {
    expect(() => buildRecipe("pipe_bend", { bendAngle: 135 })).toThrow(RangeError)
    expect(() => buildRecipe("pipe_bend", { bendAngle: 135 })).toThrow(/bend of 135 degrees needs 108\.64 mm of each straight run; the shorter run is 100 mm/)
    expect(() => buildRecipe("pipe_bend", { legA: 40, legB: 90 })).toThrow(/needs 45 mm of each straight run; the shorter run is 40 mm/)
    expect(() => buildRecipe("pipe_bend", { bendAngle: 135, bendRadius: 20 })).not.toThrow() // 48.28 mm of each run
  })

  test.each([
    [{ wall: 15 }, /wall must be less than the outside radius/],
    [{ legA: 20 }, /at least one pipe diameter/],
    [{ legB: 10 }, /at least one pipe diameter/],
    [{ bendAngle: 5 }, /at least 10/],
    [{ bendAngle: 175 }, /at most 170/],
    [{ bendRadius: -1 }, /at least 0/],
    [{ outerDiameter: 1 }, /at least 2/],
    [{ outerDiameter: "wide" }, /'outerDiameter' must be a number/]
  ] as const)("breaking a rule is a RangeError that names it: %j", (input, message) => {
    expect(() => buildRecipe("pipe_bend", input)).toThrow(RangeError)
    expect(() => buildRecipe("pipe_bend", input)).toThrow(message)
  })
})

describe("duct_transition", () => {
  test("default rectangular 80 x 50 to 40 x 40 over 120 mm, 2 mm wall: the prismatoid L/6 (A1 + 4 Am + A2) of the outside less that of the bore", () => {
    const res = buildRecipe("duct_transition")
    expect(res.derived).toMatchObject({ endArea1: 76 * 46, endArea2: 36 * 36 })
    const r = rebuild(res.history)
    expect(r.issues).toEqual([])
    expect(r.bodies).toHaveLength(1)
    expect(Object.values(r.sketches).map((s) => s.solve.status)).toEqual(["fully-constrained", "fully-constrained", "fully-constrained", "fully-constrained"])
    const prismatoid = (w1: number, h1: number, w2: number, h2: number) => (120 / 6) * (w1 * h1 + 4 * ((w1 + w2) / 2) * ((h1 + h2) / 2) + w2 * h2)
    expect(rel(historyVolume(r), prismatoid(80, 50, 40, 40) - prismatoid(76, 46, 36, 36))).toBeLessThan(0.002)
  }, SLOW)

  test("similar end rectangles (80 x 50 to 40 x 25): the outside is the exact frustum 280000, less a bore that is almost one (within 0.5 %)", () => {
    const r = rebuild(buildRecipe("duct_transition", { width1: 80, height1: 50, width2: 40, height2: 25 }).history)
    expect(r.issues).toEqual([])
    const bore = (120 / 6) * (76 * 46 + 4 * 56 * 33.5 + 36 * 21)
    expect(frustum(80 * 50, 40 * 25, 120)).toBeCloseTo(280000, 6)
    expect(rel(historyVolume(r), 280000 - bore)).toBeLessThan(0.005)
  }, SLOW)

  test("round, Ø100 to Ø50 over 120: the cone frustum of the outside less the frustum of the bore (inscribed 96-gons: within 0.3 %)", () => {
    const r = rebuild(buildRecipe("duct_transition", { shape: "round", width1: 100, width2: 50 }).history)
    expect(r.issues).toEqual([])
    const exact = frustum(Math.PI * 2500, Math.PI * 625, 120) - frustum(Math.PI * 2304, Math.PI * 529, 120)
    expect(rel(historyVolume(r), exact)).toBeLessThan(0.003)
    expect(historyVolume(r)).toBeLessThan(exact)
    const bounds = r.bodies[0]!.mesh.positions
    let minZ = Infinity, maxZ = -Infinity
    for (let i = 2; i < bounds.length; i += 3) { minZ = Math.min(minZ, bounds[i]!); maxZ = Math.max(maxZ, bounds[i]!) }
    expect(minZ).toBeCloseTo(0, 4)
    expect(maxZ).toBeCloseTo(120, 4)
    expect(ngonArea(96, 50)).toBeLessThan(Math.PI * 2500)
  }, SLOW)

  test("a thicker wall leaves more material; a bigger end makes a bigger duct", () => {
    const h = buildRecipe("duct_transition", { shape: "round", width1: 100, width2: 50 }).history
    expect(volumeOf(withParameter(h, "wall", 4))).toBeGreaterThan(volumeOf(h))
    expect(volumeOf(withParameter(h, "w2", 70))).toBeGreaterThan(volumeOf(h))
  }, SLOW)

  test("the length is a parameter: a 200 mm duct is the same taper stretched, with the end still Ø50 (the end section must stay at w2)", () => {
    const h = buildRecipe("duct_transition", { shape: "round", width1: 100, width2: 50 }).history
    const r = rebuild(withParameter(h, "L", 200))
    expect(r.issues).toEqual([])
    const exact = frustum(Math.PI * 2500, Math.PI * 625, 200) - frustum(Math.PI * 2304, Math.PI * 529, 200)
    expect(rel(historyVolume(r), exact)).toBeLessThan(0.005)
  }, SLOW)

  test("the default can be made on a mill: no error, and the thin wall is reported with its number if it is thin", () => {
    const r = analyzeManufacturability(buildRecipe("duct_transition").history)
    expect(r.issues.filter((i) => i.severity === "error")).toEqual([])
  }, SLOW)

  test.each([
    [{ wall: 25 }, /wall must be less than half the smallest section/],
    [{ width2: 3, wall: 2 }, /wall must be less than half the smallest section/],
    [{ shape: "oval" }, /'shape' must be one of rect, round/],
    [{ length: 2 }, /at least 5/],
    [{ wall: 0.1 }, /at least 0\.3/]
  ] as const)("breaking a rule is a RangeError that names it: %j", (input, message) => {
    expect(() => buildRecipe("duct_transition", input)).toThrow(RangeError)
    expect(() => buildRecipe("duct_transition", input)).toThrow(message)
  })
})
