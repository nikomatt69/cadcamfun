/**
 * Command pattern over `Drawing` patches (spec 06-desktop-ui.md §1).
 *
 * Every editor action is a command: a pure `(drawing) => drawing` step plus a
 * label. That is what makes undo/redo trivial, makes the tools testable without
 * a canvas (they *return* commands, they never touch the document), and lets a
 * session replay deterministically.
 */
import {
  type Drawing,
  type Entity,
  type Layer,
  type Vec2,
  mirror,
  rotateEntity,
  translate
} from "@cadcamfun/core"

/** One reversible edit. `apply` must be pure: same input, same output. */
export interface Command {
  readonly label: string
  /** Entities this command touches, used for selective undo and redraw. */
  readonly touched: ReadonlyArray<string>
  apply(drawing: Drawing): Drawing
}

const bump = (drawing: Drawing, entities: ReadonlyArray<Entity>): Drawing => ({
  ...drawing,
  entities: [...entities],
  version: drawing.version + 1
})

/** Appends entities. */
export const addEntities =
  (entities: ReadonlyArray<Entity>, label = "add"): Command => ({
    label,
    touched: entities.map((e) => e.id),
    apply: (drawing) => bump(drawing, [...drawing.entities, ...entities])
  })

/** Replaces one entity by id; a missing id is a no-op. */
export const updateEntity =
  (id: string, entity: Entity, label = "update"): Command => ({
    label,
    touched: [id],
    apply: (drawing) => bump(drawing, drawing.entities.map((e) => (e.id === id ? entity : e)))
  })

/** Removes entities by id; unknown ids are ignored. */
export const removeEntities =
  (ids: ReadonlyArray<string>, label = "remove"): Command => ({
    label,
    touched: ids,
    apply: (drawing) => bump(drawing, drawing.entities.filter((e) => !ids.includes(e.id)))
  })

/** Replaces the whole entity list (paste, import, "clear all"). */
export const replaceEntities =
  (entities: ReadonlyArray<Entity>, label = "replace"): Command => ({
    label,
    touched: entities.map((e) => e.id),
    apply: (drawing) => bump(drawing, entities)
  })

/** Moves entities by a delta (drag tool). */
export const translateEntities =
  (ids: ReadonlyArray<string>, dx: number, dy: number, label = "move"): Command => ({
    label,
    touched: ids,
    apply: (drawing) =>
      bump(
        drawing,
        drawing.entities.map((e) => (ids.includes(e.id) ? translate(e, { x: dx, y: dy }) : e))
      )
  })

/** Rotates entities around `origin` (radians, counter-clockwise). */
export const rotateEntities =
  (ids: ReadonlyArray<string>, origin: Vec2, angle: number, label = "rotate"): Command => ({
    label,
    touched: ids,
    apply: (drawing) =>
      bump(
        drawing,
        drawing.entities.map((e) => (ids.includes(e.id) ? rotateEntity(e, angle, origin) : e))
      )
  })

/**
 * Mirrors entities across the **vertical** line `x = axisX`, i.e. the mirror axis
 * a CAD user picks by dragging a vertical guide. `mirror` reflects about the line
 * through its origin at `angle` radians, so the vertical axis is `π/2`.
 */
export const mirrorEntities =
  (ids: ReadonlyArray<string>, axisX: number, label = "mirror"): Command => ({
    label,
    touched: ids,
    apply: (drawing) =>
      bump(
        drawing,
        drawing.entities.map((e) =>
          ids.includes(e.id) ? mirror(e, { x: axisX, y: 0 }, Math.PI / 2) : e
        )
      )
  })

/** Sets layer visibility, lock state, colour or name. */
export const updateLayer =
  (
    id: string,
    patch: Partial<Pick<Layer, "visible" | "locked" | "color" | "name">>,
    label = "layer"
  ): Command => ({
    label,
    touched: [],
    apply: (drawing) => ({
      ...drawing,
      layers: drawing.layers.map((layer) => (layer.id === id ? { ...layer, ...patch } : layer)),
      version: drawing.version + 1
    })
  })

/** Renames the drawing. */
export const renameDrawing = (name: string): Command => ({
  label: "rename",
  touched: [],
  apply: (drawing) => ({ ...drawing, name, version: drawing.version + 1 })
})

/** Composes commands into one, so a multi-step gesture is a single undo step. */
export const batch = (label: string, commands: ReadonlyArray<Command>): Command => ({
  label,
  touched: [...new Set(commands.flatMap((c) => c.touched))],
  apply: (drawing) => commands.reduce((current, command) => command.apply(current), drawing)
})
