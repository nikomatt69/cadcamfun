/**
 * Undo/redo and command tests (spec 06-desktop-ui.md §1 and §3).
 */
import { describe, expect, test } from "bun:test"
import { baseEntity, circle, emptyDrawing, line, type Drawing } from "@cadcamfun/core"
import {
  addEntities,
  batch,
  mirrorEntities,
  removeEntities,
  renameDrawing,
  rotateEntities,
  translateEntities,
  updateEntity,
  updateLayer
} from "../src/shared/state/commands.ts"
import { MAX_HISTORY, createHistory } from "../src/shared/state/history.ts"

const doc = (): Drawing => emptyDrawing("d1", "Part")

describe("commands", () => {
  test("add, update and remove entities bump the version", () => {
    const start = doc()
    const added = addEntities([circle("c1", { x: 0, y: 0 }, 5)]).apply(start)
    expect(added.entities).toHaveLength(1)
    expect(added.version).toBe(start.version + 1)

    const moved = updateEntity("c1", circle("c1", { x: 3, y: 0 }, 5)).apply(added)
    const entity = moved.entities[0]!
    expect(entity._tag).toBe("Circle")
    expect(entity._tag === "Circle" ? entity.center.x : 0).toBe(3)

    const removed = removeEntities(["c1"]).apply(moved)
    expect(removed.entities).toHaveLength(0)
    // The source document is untouched: commands are pure.
    expect(start.entities).toHaveLength(0)
  })

  test("translate, rotate and mirror move the geometry", () => {
    const start = addEntities([line("l1", { x: 0, y: 0 }, { x: 10, y: 0 })]).apply(doc())
    const moved = translateEntities(["l1"], 5, 0).apply(start)
    const l1 = moved.entities[0]!
    expect(l1._tag === "Line" ? l1.start.x : -1).toBe(5)

    // (5,0)-(15,0) rotated 90 degrees counter-clockwise about the origin.
    const rotated = rotateEntities(["l1"], { x: 0, y: 0 }, Math.PI / 2).apply(moved)
    const r1 = rotated.entities[0]!
    expect(r1._tag === "Line" ? Math.round(r1.end.x) : 1).toBe(0)
    expect(r1._tag === "Line" ? Math.round(r1.end.y) : 0).toBe(15)

    const mirrored = mirrorEntities(["l1"], 0).apply(start)
    const m1 = mirrored.entities[0]!
    expect(m1._tag === "Line" ? m1.end.x : 0).toBe(-10)
  })

  test("layer updates and renames are single commands", () => {
    const locked = updateLayer("layer-0", { locked: true }).apply(doc())
    expect(locked.layers[0]?.locked).toBe(true)
    expect(renameDrawing("Renamed").apply(locked).name).toBe("Renamed")
  })

  test("a batch is one undo step and reports every touched entity", () => {
    const cmd = batch("gesture", [
      addEntities([circle("c1", { x: 0, y: 0 }, 2)]),
      translateEntities(["c1"], 1, 1)
    ])
    expect(cmd.touched).toEqual(["c1"])
    const applied = cmd.apply(doc())
    expect(applied.entities).toHaveLength(1)
    const entity = applied.entities[0]!
    expect(entity._tag === "Circle" ? entity.center : { x: 0, y: 0 }).toEqual({ x: 1, y: 1 })
  })
})

describe("history", () => {
  test("undo walks back through snapshots, redo walks forward", () => {
    let history = createHistory(doc())
    const base = history.state.present
    history = history.apply(addEntities([circle("c1", { x: 0, y: 0 }, 1)]))
    history = history.apply(translateEntities(["c1"], 4, 0))

    expect(history.state.present.entities).toHaveLength(1)
    expect(history.state.done).toEqual(["add", "move"])
    expect(history.canUndo).toBe(true)

    history = history.undo()
    expect(history.state.present.entities).toHaveLength(1)
    const entity = history.state.present.entities[0]!
    expect(entity._tag === "Circle" ? entity.center.x : 0).toBe(0)
    expect(history.state.undone).toEqual(["move"])

    history = history.undo()
    expect(history.state.present).toEqual(base)
    expect(history.canUndo).toBe(false)

    history = history.redo().redo()
    const final = history.state.present.entities[0]!
    expect(final._tag === "Circle" ? final.center.x : 0).toBe(4)
  })

  test("a new edit clears the redo branch", () => {
    let history = createHistory(doc())
    history = history.apply(addEntities([circle("c1", { x: 0, y: 0 }, 1)]))
    history = history.undo()
    expect(history.canRedo).toBe(true)
    history = history.apply(addEntities([circle("c2", { x: 1, y: 1 }, 1)]))
    expect(history.canRedo).toBe(false)
    expect(history.state.present.entities).toHaveLength(1)
  })

  test("goto jumps to any recorded index", () => {
    let history = createHistory(doc())
    history = history.apply(addEntities([circle("c1", { x: 0, y: 0 }, 1)]))
    history = history.apply(addEntities([circle("c2", { x: 2, y: 0 }, 1)]))
    history = history.apply(addEntities([circle("c3", { x: 4, y: 0 }, 1)]))
    expect(history.goto(1).state.present.entities).toHaveLength(1)
    expect(history.goto(3).state.present.entities).toHaveLength(3)
    // Out-of-range targets clamp instead of throwing.
    expect(history.goto(99).state.present.entities).toHaveLength(3)
    expect(history.goto(-5).state.present.entities).toHaveLength(0)
  })

  test("the cap drops the oldest steps and reports how many", () => {
    let history = createHistory(doc(), 5)
    for (let i = 0; i < 12; i++) {
      history = history.apply(addEntities([circle(`c${i}`, { x: i, y: 0 }, 1)]))
    }
    expect(history.state.done).toHaveLength(5)
    expect(history.state.dropped).toBe(7)
    // The chain is still walkable to the oldest surviving snapshot.
    let back = history
    for (let i = 0; i < 5; i++) back = back.undo()
    expect(back.canUndo).toBe(false)
    expect(back.state.present.entities).toHaveLength(7)
  })

  test("the default cap is the spec's 200 steps", () => {
    expect(MAX_HISTORY).toBe(200)
    let history = createHistory(doc())
    for (let i = 0; i < 250; i++) history = history.apply(addEntities([circle(`c${i}`, { x: i, y: 0 }, 1)]))
    expect(history.state.done).toHaveLength(MAX_HISTORY)
  })

  test("reset makes the current document the new base", () => {
    let history = createHistory(doc())
    history = history.apply(addEntities([circle("c1", { x: 0, y: 0 }, 1)]))
    history = history.reset()
    expect(history.state.done).toEqual([])
    expect(history.canUndo).toBe(false)
    expect(history.state.present.entities).toHaveLength(1)
  })

  test("undo of a no-op command is still a step (the label is what matters)", () => {
    const entity = { ...baseEntity("e1"), _tag: "Circle" as const, center: { x: 0, y: 0 }, radius: 1 }
    let history = createHistory(doc())
    history = history.apply(addEntities([entity]))
    history = history.undo()
    expect(history.state.present.entities).toHaveLength(0)
  })
})
