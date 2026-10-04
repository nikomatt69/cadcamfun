import { describe, expect, test } from "bun:test"
import { Effect, Exit } from "effect"
import { Commands, Doc, Elements, Geometry, History, Transform } from "../src"

const run = <A, E>(e: Effect.Effect<A, E>) => Effect.runSync(e)

describe("geometry", () => {
  test("signed area and point in polygon", () => {
    const square = [Geometry.vec2(0, 0), Geometry.vec2(10, 0), Geometry.vec2(10, 10), Geometry.vec2(0, 10)]
    expect(Geometry.signedArea(square)).toBe(100)
    expect(Geometry.pointInPolygon(Geometry.vec2(5, 5), square)).toBe(true)
    expect(Geometry.pointInPolygon(Geometry.vec2(15, 5), square)).toBe(false)
  })
})

describe("elements", () => {
  const doc = Doc.empty()
  const rect = Doc.instantiate(doc, { _tag: "Rectangle", origin: { x: 0, y: 0 }, width: 20, height: 10 })
  const circle = Doc.instantiate(doc, { _tag: "Circle", center: { x: 5, y: 5 }, radius: 2 })

  test("area, perimeter and bounds", () => {
    expect(Elements.area(rect)).toBe(200)
    expect(Elements.perimeter(rect)).toBe(60)
    expect(Elements.perimeter(circle)).toBeCloseTo(4 * Math.PI)
    expect(Elements.boundsOf(circle)).toEqual({ min: { x: 3, y: 3 }, max: { x: 7, y: 7 } })
  })

  test("transforms keep shape class when possible", () => {
    const moved = Transform.apply(rect, Transform.translate(5, 5))
    expect(moved._tag).toBe("Rectangle")
    expect(Elements.boundsOf(moved)).toEqual({ min: { x: 5, y: 5 }, max: { x: 25, y: 15 } })
    const r90 = Transform.apply(rect, Transform.rotate(90))
    expect(r90._tag).toBe("Rectangle")
    expect(Elements.area(r90)).toBeCloseTo(200)
    const r45 = Transform.apply(rect, Transform.rotate(45))
    expect(r45._tag).toBe("Polyline")
    expect(Elements.area(r45)).toBeCloseTo(200)
    const stretched = Transform.apply(circle, Transform.scale(2, 1))
    expect(stretched._tag).toBe("Polyline")
  })
})

describe("commands and history", () => {
  test("add, transform, undo, redo", () => {
    const doc = Doc.empty()
    const rect = Doc.instantiate(doc, { _tag: "Rectangle", origin: { x: 0, y: 0 }, width: 10, height: 10 })
    let h = History.make(doc)
    h = run(History.execute(h, Commands.addElements([rect])))
    expect(h.present.elements).toHaveLength(1)
    expect(h.present.revision).toBe(1)
    h = run(History.execute(h, Commands.transformElements([rect.id], Transform.translate(1, 2))))
    expect(Doc.findElement(h.present, rect.id)).toMatchObject({ origin: { x: 1, y: 2 } })
    h = History.undo(h)
    expect(Doc.findElement(h.present, rect.id)).toMatchObject({ origin: { x: 0, y: 0 } })
    h = History.redo(h)
    expect(Doc.findElement(h.present, rect.id)).toMatchObject({ origin: { x: 1, y: 2 } })
  })

  test("typed errors: missing element, locked layer, atomic batch", () => {
    const doc = Doc.empty()
    const missing = Effect.runSyncExit(Commands.apply(doc, Commands.removeElements(["nope" as never])))
    expect(Exit.isFailure(missing)).toBe(true)

    const locked = run(Commands.apply(doc, { _tag: "UpdateLayer", id: doc.activeLayerId, patch: { locked: true } }))
    const line = Doc.instantiate(locked, { _tag: "Line", start: { x: 0, y: 0 }, end: { x: 1, y: 1 } })
    const exit = Effect.runSyncExit(Commands.apply(locked, Commands.addElements([line])))
    expect(Exit.isFailure(exit) && String(exit.cause)).toContain("LayerLocked")

    const a = Doc.instantiate(doc, { _tag: "Point", position: { x: 0, y: 0 } })
    const batch = Commands.batch([
      { _tag: "AddElements", elements: [a] },
      { _tag: "RemoveElements", ids: ["missing" as never] },
    ])
    expect(Exit.isFailure(Effect.runSyncExit(Commands.apply(doc, batch)))).toBe(true)
  })

  test("documents round-trip through the schema", () => {
    const doc = Doc.empty("Part")
    const withShape = run(
      Commands.apply(
        doc,
        Commands.addElements([
          Doc.instantiate(doc, {
            _tag: "Polyline",
            points: [
              { x: 0, y: 0 },
              { x: 1, y: 1 },
            ],
            closed: false,
          }),
        ]),
      ),
    )
    const encoded = run(Doc.encodeDocument(withShape))
    const decoded = run(Doc.decodeDocument(JSON.parse(JSON.stringify(encoded))))
    expect(decoded).toEqual(withShape)
  })
})
