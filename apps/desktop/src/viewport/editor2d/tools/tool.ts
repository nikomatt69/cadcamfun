/**
 * 2D tool contract (spec 06-desktop-ui.md §2).
 *
 * A tool is a small state machine — `{ onPointerDown, onPointerMove, onPointerUp,
 * onKey, preview, command }` — that never mutates the document. It returns
 * `Command`s, which the editor applies through the history. That separation is
 * what makes every tool unit-testable with plain `bun:test`: no canvas, no DOM,
 * no Solid.
 */
import type { Entity, Snap, Vec2 } from "@cadcamfun/core"
import type { Command } from "../../../shared/state/commands.ts"

/** A pointer event in world coordinates, already snapped by the editor. */
export interface PointerEvent {
  /** World position; when `snap` is set this is the snapped position. */
  readonly point: Vec2
  readonly modifiers: {
    readonly shift: boolean
    readonly alt: boolean
    readonly ctrl: boolean
  }
  /** Snap candidate found under the cursor, if any. */
  readonly snap?: Snap
  /** Entity ids under the cursor, nearest first (from the spatial index). */
  readonly hits?: ReadonlyArray<string>
}

export const noModifiers = { shift: false, alt: false, ctrl: false }

/** Tool identifier, also the palette entry key. */
export type ToolId =
  | "select"
  | "line"
  | "polyline"
  | "rectangle"
  | "circle"
  | "arc"
  | "ellipse"
  | "text"
  | "dimension"
  | "move"
  | "rotate"
  | "scale"
  | "mirror"
  | "offset"
  | "trim"
  | "fillet"
  | "chamfer"

/** What a tool is doing right now, for the status bar and the cursor hint. */
export interface ToolStatus {
  readonly hint: string
  /** False once the gesture can be committed. */
  readonly ready: boolean
}

export interface Tool {
  readonly id: ToolId
  /** Called when the editor activates the tool; returns the initial state. */
  start(): Tool
  onPointerDown(event: PointerEvent, tool: Tool): Tool
  onPointerMove(event: PointerEvent, tool: Tool): Tool
  onPointerUp(event: PointerEvent, tool: Tool): Tool
  onKey(key: string, tool: Tool): Tool
  /** Geometry to draw as an overlay while the gesture is in progress. */
  preview(tool: Tool): ReadonlyArray<Entity>
  /** The command the gesture produced, or `undefined` when nothing is complete. */
  command(tool: Tool): Command | undefined
  readonly status: ToolStatus
  /**
   * Tool-specific state, so the editor can read what the gesture produced (the
   * selection, the pending points) without a cast per tool.
   */
  readonly state?: unknown
}

/**
 * Everything a tool needs that is not part of the pointer event: the current
 * selection and the entities it refers to. Tools stay pure — they read the
 * document through this context and still only *return* commands.
 */
export interface ToolContext {
  /** Selected entity ids (select tool, transform tools, trim, ...). */
  readonly selection: ReadonlyArray<string>
  /** Lookup by id; `undefined` for an id that no longer exists. */
  readonly entity: (id: string) => Entity | undefined
}

/** Context with nothing selected, for tools that ignore the selection. */
export const emptyContext: ToolContext = { selection: [], entity: () => undefined }

/** Factory for the immutable tool states; each tool supplies one. */
export type ToolFactory = () => Tool
