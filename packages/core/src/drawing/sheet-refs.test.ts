/**
 * Annotations attached to model entities (spec 49, spec 41 N6, spec 72 P4-2): a GD&T frame, a datum and a balloon that name a face
 * or an edge by persistent reference follow it through a parameter edit and a feature inserted upstream; a reference that is lost
 * or split is reported and the annotation is not drawn, never moved to a nearby entity.
 */
import { describe, expect, setDefaultTimeout, test } from "bun:test"
import type { Feature, History } from "../cad/history.ts"
import { generateSheet, type SheetOptions } from "./sheet.ts"

setDefaultTimeout(120_000)

const rect = (id: string, at: [number, number], width: number | string, height: number | string): Feature =>
  ({ id, type: "sketch", plane: "XY", sketch: { entities: [], constraints: [], shapes: [{ id: `${id}-r`, kind: "rectangle", at, width, height }] } }) as unknown as Feature

const plate = (w = 60, t = 10, more: Feature[] = [], upstream: Feature[] = []): History => ({
  parameters: { w, t },
  features: [rect("s", [0, 0], "w", 40), { id: "plate", type: "extrude", sketch: "s", depth: "t", operation: "new" } as Feature, ...upstream, ...more]
})

const TOP = "face:plate|plate.top"
const options = (edge: string): SheetOptions => ({
  views: ["front", "top"],
  datums: [{ letter: "A", ref: "face:plate|plate.bottom", view: "front" }],
  gdt: [{ spec: { kind: "flatness", value: 0.05 }, ref: TOP, view: "front" }, { spec: { kind: "perpendicularity", value: 0.1, datums: ["A"] }, ref: edge, view: "top" }],
  balloons: [{ text: "1", ref: TOP, at: { x: 999, y: 999, z: 999 }, view: "top" }]
})

/** A vertical edge between two side faces, as a reference (the key of the first such edge the sheet's model reports). */
const VERTICAL = "edge:plate|edge(plate.side0.0,plate.side0.1)"

describe("annotations by reference", () => {
  test("every annotation is attached to its entity, and `at` next to a reference is only a hint", () => {
    const sheet = generateSheet(plate(), options(VERTICAL))
    expect(sheet.annotations.map((a) => a.status)).toEqual(["attached", "attached", "attached", "attached"])
    const balloon = sheet.annotations.find((a) => a.kind === "balloon")!
    // The centre of the top face, not the stale hint.
    expect(balloon.at!.z).toBeCloseTo(10, 9)
    expect(balloon.at!.x).toBeCloseTo(30, 9)
    expect(balloon.at!.y).toBeCloseTo(20, 9)
    expect(sheet.annotations.find((a) => a.kind === "datum")!.at!.z).toBeCloseTo(0, 9)
    // The vertical edge's middle is at half the thickness.
    expect(sheet.annotations.find((a) => a.label.startsWith("perpendicularity"))!.at!.z).toBeCloseTo(5, 9)
  })

  test("a parameter edit and a feature inserted upstream: the annotations follow their entities", () => {
    const hole = { id: "extra", type: "hole", plane: "XY", offset: "t", at: [50, 30], diameter: 5, depth: "t" } as unknown as Feature
    for (const [h, w, t] of [[plate(80, 14), 80, 14], [plate(60, 10, [], [hole]), 60, 10]] as const) {
      const sheet = generateSheet(h, options(VERTICAL))
      expect(sheet.annotations.every((a) => a.status === "attached")).toBe(true)
      const balloon = sheet.annotations.find((a) => a.kind === "balloon")!
      expect(balloon.at!.z).toBeCloseTo(t, 9)
      if (w === 80) expect(balloon.at!.x).toBeCloseTo(40, 9)
      expect(sheet.annotations.find((a) => a.label.startsWith("perpendicularity"))!.at!.z).toBeCloseTo(t / 2, 9)
    }
  })

  test("a face split by a slot is reported as split and not drawn; the other annotations still are", () => {
    const slot = [rect("s3", [20, -5], 4, 50), { id: "slot", type: "extrude", sketch: "s3", depth: "t", operation: "subtract" } as Feature]
    const plain = generateSheet(plate(), { views: ["front", "top"], datums: [{ letter: "A", ref: "face:plate|plate.bottom", view: "front" }] })
    const sheet = generateSheet(plate(60, 10, slot), options(VERTICAL))
    const onTop = sheet.annotations.filter((a) => a.ref === TOP)
    expect(onTop.map((a) => a.status)).toEqual(["split", "split"])
    expect(onTop[0]!.reason).toMatch(/split into 2 pieces/)
    expect(onTop[0]!.at).toBeUndefined()
    expect(sheet.warnings.some((w) => /Balloon '1' is not drawn: .*split/.test(w))).toBe(true)
    expect(sheet.annotations.find((a) => a.kind === "datum")!.status).toBe("split")
    expect(plain.annotations[0]!.status).toBe("attached")
    // No balloon circle is drawn for the split face (only the frames that are attached).
    expect(sheet.dimensions.some((d) => d.text === "item 1")).toBe(false)
  })

  test("an entity that a later feature removes is 'lost', naming the feature; a malformed reference is refused up front", () => {
    const cut = { id: "cut", type: "split", plane: "XY", offset: 5, keep: "below" } as Feature
    const sheet = generateSheet(plate(60, 10, [cut]), { views: ["front", "top"], balloons: [{ text: "1", ref: TOP, view: "top" }] })
    expect(sheet.annotations[0]!.status).toBe("lost")
    expect(sheet.annotations[0]!.reason).toMatch(/removed by 'cut'/)
    expect(() => generateSheet(plate(), { balloons: [{ text: "1", ref: "nonsense" }] })).toThrow(/not a reference/)
    expect(() => generateSheet(plate(), { balloons: [{ text: "1" } as never] })).toThrow(/needs a reference/)
  })

  test("a bare mesh has nothing to refer to: the annotation is unresolved", () => {
    const sheet = generateSheet({ mesh: { positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]), indices: new Uint32Array([0, 2, 1, 0, 1, 3, 1, 2, 3, 0, 3, 2]) } }, { views: ["front"], balloons: [{ text: "1", ref: TOP, view: "front" }] })
    expect(sheet.annotations[0]!.status).toBe("unresolved")
  })
})
