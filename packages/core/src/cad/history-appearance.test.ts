/**
 * Colour and library material per body and per feature result: carried by the replay, edits, configurations and serialization;
 * mass from the material's density.
 */
import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { rebuild, type Feature, type History } from "./history.ts"
import { rebuildExact } from "./history-brep.ts"
import { bodyMasses, checkAppearance, historyMass, materialDensity, normaliseColor, setBodyAppearance, setConfigurationAppearance, setFeatureAppearance } from "./history-appearance.ts"
import { addConfiguration, activateConfiguration, configurationHistory } from "./history-config.ts"
import { removeFeature, renameFeature, renameParameter, setDimension } from "./history-edit.ts"
import { model } from "./script.ts"

setDefaultTimeout(60_000)

const rect = (id: string, w: number, h: number): Feature =>
  ({ id, type: "sketch", plane: "XY", sketch: { entities: [], constraints: [], shapes: [{ id: `${id}-r`, kind: "rectangle", at: [0, 0], width: w, height: h }] } }) as unknown as Feature

/** Two bodies: a 40 x 30 x 10 aluminium plate (by feature) and a 20 x 20 x 5 block (by body table). */
const two = (): History => ({
  parameters: { t: 10 },
  features: [
    rect("s1", 40, 30),
    { id: "plate", type: "extrude", sketch: "s1", depth: "t", operation: "new", appearance: { color: "#c0c0c0", material: "al-6061-t6" } } as Feature,
    rect("s2", 20, 20),
    { id: "block", type: "extrude", sketch: "s2", depth: 5, operation: "new" } as Feature
  ],
  appearances: { block: { color: "#ff0000", material: "steel-c45" } }
})

describe("material library and colours", () => {
  test("a library id gives a density in g/cm3 from the CAM grades or the FEA materials", () => {
    expect(materialDensity("al-6061-t6")!.density).toBeCloseTo(2.7, 2)
    expect(materialDensity("aluminium-6061-t6")!.density).toBeCloseTo(2.7, 2)
    expect(materialDensity("steel-c45")!.density).toBeCloseTo(7.85, 2)
    expect(materialDensity("unobtainium")).toBeUndefined()
  })

  test("colours are normalised and bad input is refused with the reason", () => {
    expect(normaliseColor("#F0a")).toBe("#ff00aa")
    expect(normaliseColor("red")).toBeUndefined()
    expect(checkAppearance({ color: "#ABCDEF" })).toEqual({ ok: true, appearance: { color: "#abcdef" } })
    expect(checkAppearance({ color: "blue" })).toMatchObject({ ok: false, problem: expect.stringContaining("not a colour") })
    expect(checkAppearance({ material: "unobtainium" })).toMatchObject({ ok: false, problem: expect.stringContaining("not a library material") })
    expect(checkAppearance({})).toMatchObject({ ok: false })
  })
})

describe("appearance through the replay", () => {
  test("a body takes the look of the feature that made it; the per-body table wins and merges field by field", () => {
    const r = rebuild(two())
    expect(r.issues.filter((i) => i.severity === "error")).toEqual([])
    expect(r.bodies.find((b) => b.id === "plate")!.appearance).toEqual({ color: "#c0c0c0", material: "al-6061-t6" })
    expect(r.bodies.find((b) => b.id === "block")!.appearance).toEqual({ color: "#ff0000", material: "steel-c45" })
    // The table overrides one field and keeps the other from the feature.
    const painted = rebuild({ ...two(), appearances: { plate: { color: "#00ff00" } } })
    expect(painted.bodies.find((b) => b.id === "plate")!.appearance).toEqual({ color: "#00ff00", material: "al-6061-t6" })
  })

  test("a later feature that sets a look repaints what it changes; a feature without one leaves it", () => {
    const m = model()
    const a = m.extrude(m.sketch("XY").rectangle([0, 0], 40, 30), { depth: 10 })
    const hole = m.hole({ plane: "XY", offset: 10, at: [20, 15], diameter: 6, depth: 10 })
    const base = m.build()
    const withLook = setFeatureAppearance(base, a, { color: "#112233" }).history
    expect(rebuild(withLook).bodies[0]!.appearance).toEqual({ color: "#112233" })
    // The hole changes the body but sets no look: the plate keeps the extrusion's.
    expect(hole).toBeDefined()
    const painted = setFeatureAppearance(withLook, hole, { material: "steel-c45" }).history
    expect(rebuild(painted).bodies[0]!.appearance).toEqual({ material: "steel-c45" })
  })

  test("copies made by a body pattern take the look of their source", () => {
    const m = model()
    const b = m.extrude(m.sketch("XY").circle([0, 0], 8), { depth: 5 })
    m.pattern({ bodies: [b], kind: "linear", count: 3, step: [20, 0, 0] })
    const history = setBodyAppearance(m.build(), b, { color: "#abcdef", material: "al-6061-t6" }).history
    const r = rebuild(history)
    expect(r.bodies.length).toBe(3)
    // The table is per id: copies are other bodies; the pattern copies the source's look at that point of the replay.
    const feat = setFeatureAppearance(m.build(), b, { color: "#abcdef" }).history
    const rf = rebuild(feat)
    expect(rf.bodies.map((x) => x.appearance?.color)).toEqual(["#abcdef", "#abcdef", "#abcdef"])
  })

  test("the exact replay is aligned by id with the same bodies, so a consumer can look them up", () => {
    const history = two()
    const ex = rebuildExact(history)
    expect(ex.result.bodies.map((b) => [b.id, b.appearance?.material])).toEqual([["plate", "al-6061-t6"], ["block", "steel-c45"]])
  })
})

describe("mass from the material's density", () => {
  test("body masses weigh volume by density; the whole mass needs a material on every body", () => {
    const r = rebuild(two())
    const m = bodyMasses(r)
    const plate = m.bodies.find((b) => b.id === "plate")!, block = m.bodies.find((b) => b.id === "block")!
    expect(plate.volume).toBeCloseTo(12000, 1)
    expect(plate.mass).toBeCloseTo(12000 * 2.7 / 1000, 1)
    expect(block.mass).toBeCloseTo(2000 * 7.85 / 1000, 1)
    expect(m.mass).toBeCloseTo(32.4 + 15.7, 1)
    expect(historyMass(r)).toBeCloseTo(48.1, 1)
    // The exact volume is used when an exact model is given.
    expect(bodyMasses(r, { exact: rebuildExact(two(), r) }).mass).toBeCloseTo(48.1, 1)
  })

  test("a body without a material is unweighted, not zero; a default material weighs it", () => {
    const history: History = { ...two(), appearances: {} }
    const r = rebuild(history)
    expect(bodyMasses(r).unweighted).toEqual(["block"])
    expect(historyMass(r)).toBeUndefined()
    expect(historyMass(r, { defaultMaterial: "steel-c45" })).toBeCloseTo(32.4 + 15.7, 1)
    expect(bodyMasses(r, { defaultMaterial: "no-such-material" }).unweighted).toEqual(["block"])
  })
})

describe("appearance survives edits, serialization and configurations", () => {
  test("parameter edits, a dimension edit, a rename and a feature removal keep every look", () => {
    let h = two()
    h = renameParameter(h, "t", "thick")
    h = setDimension(h, "plate", "depth", 12)
    h = renameFeature(h, "plate", "Base plate")
    expect(h.appearances).toEqual(two().appearances)
    expect(h.features.find((f) => f.id === "plate")!.appearance).toEqual({ color: "#c0c0c0", material: "al-6061-t6" })
    const r = rebuild(h)
    expect(r.bodies.find((b) => b.id === "plate")!.appearance?.material).toBe("al-6061-t6")
    expect(bodyMasses(r).bodies.find((b) => b.id === "plate")!.mass).toBeCloseTo(40 * 30 * 12 * 2.7 / 1000, 1)
    // Removing a feature keeps the table of the other bodies.
    const gone = removeFeature(h, "plate")
    expect(rebuild(gone).bodies.map((b) => b.id)).toEqual(["block"])
  })

  test("a JSON round trip is lossless", () => {
    const h = two()
    expect(JSON.parse(JSON.stringify(h))).toEqual(h)
    expect(rebuild(JSON.parse(JSON.stringify(h)) as History).bodies.map((b) => b.appearance)).toEqual(rebuild(h).bodies.map((b) => b.appearance))
  })

  test("a configuration carries its own look and material per body", () => {
    let h = two()
    h = addConfiguration(h, "Steel plate").history
    h = setBodyAppearance(h, "plate", { color: "#444444", material: "steel-c45" }).history
    const steel = h.configuration!
    h = addConfiguration(h, "Aluminium plate").history
    h = setBodyAppearance(h, "plate", { color: "#c0c0c0", material: "al-6061-t6" }).history
    const alu = h.configuration!
    // Each variant, shown on its own, has its own mass.
    const massOf = (id: string) => bodyMasses(rebuild(configurationHistory(h, id).history)).bodies.find((b) => b.id === "plate")!
    expect(massOf(steel).mass).toBeCloseTo(12000 * 7.85 / 1000, 1)
    expect(massOf(alu).mass).toBeCloseTo(12000 * 2.7 / 1000, 1)
    // Activating writes the variant's table into the history.
    const shown = activateConfiguration(h, steel).history
    expect(shown.appearances!["plate"]).toEqual({ color: "#444444", material: "steel-c45" })
    expect(rebuild(shown).bodies.find((b) => b.id === "plate")!.appearance?.color).toBe("#444444")
    // And the stored history is untouched by looking at a variant.
    expect(h.appearances!["plate"]).toEqual({ color: "#c0c0c0", material: "al-6061-t6" })
  })

  test("a look set on a configuration that is not shown does not touch the live table", () => {
    let h = addConfiguration(two(), "Variant").history
    h = addConfiguration(h, "Other").history
    const first = h.configurations![0]!.id
    const next = setConfigurationAppearance(h, first, "block", { color: "#010203" })
    expect(next.refusal).toBeUndefined()
    expect(next.history.appearances).toEqual(h.appearances)
    expect(next.history.configurations!.find((c) => c.id === first)!.appearances!["block"]).toEqual({ color: "#010203" })
    expect(setConfigurationAppearance(h, "nope", "block", { color: "#010203" }).refusal).toMatch(/no configuration/)
  })

  test("edits are validated: unknown body, feature, colour and material are refused", () => {
    expect(setBodyAppearance(two(), "ghost", { color: "#ffffff" }, ["plate", "block"]).refusal).toMatch(/no body 'ghost'/)
    expect(setBodyAppearance(two(), "plate", { color: "nope" }).refusal).toMatch(/not a colour/)
    expect(setFeatureAppearance(two(), "ghost", { color: "#ffffff" }).refusal).toMatch(/no feature/)
    expect(setFeatureAppearance(two(), "plate", { material: "x" }).refusal).toMatch(/not a library material/)
    // Clearing works.
    expect(setBodyAppearance(two(), "block", undefined).history.appearances).toBeUndefined()
    expect(setFeatureAppearance(two(), "plate", undefined).history.features.find((f) => f.id === "plate")!.appearance).toBeUndefined()
  })
})
