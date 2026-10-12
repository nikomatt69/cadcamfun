import { expect, test } from "bun:test"
import { baseEntity, emptyDrawing, isEntity, type Entity } from "@cadcamfun/core"
import { createHistory } from "../../../shared/state/history.ts"
import { gestureTool, type GestureToolId } from "./annotation-transform.ts"
import { noModifiers } from "./tool.ts"

const line: Entity = { ...baseEntity("line"), _tag: "Line", start: { x: 0, y: 0 }, end: { x: 10, y: 0 } }
for (const id of ["move", "rotate", "scale", "mirror", "text", "dimension"] satisfies GestureToolId[]) {
  test(`${id} previews valid core entities and emits undoable commands`, () => {
    const drawing = { ...emptyDrawing("test", "Test"), entities: [line] }
    let tool = gestureTool(id, () => ({ selection: [line.id], entity: () => line }), () => "Hello")()
    tool = tool.onPointerDown({ point: { x: 0, y: 0 }, modifiers: noModifiers }, tool)
    tool = tool.onPointerMove({ point: { x: 10, y: 10 }, modifiers: noModifiers }, tool)
    expect(tool.preview(tool).every(isEntity)).toBe(true)
    expect(tool.command(tool)).toBeUndefined()
    tool = tool.onPointerUp({ point: { x: 10, y: 10 }, modifiers: noModifiers }, tool)
    const command = tool.command(tool)
    expect(command).toBeDefined()
    if (!command) return
    const history = createHistory(drawing).apply(command)
    expect(history.state.present.entities.every(isEntity)).toBe(true)
    expect(history.undo().state.present).toEqual(drawing)
  })
}
