/**
 * Tool registry (spec 06-desktop-ui.md §2): one factory per palette entry, so
 * the toolbar, the keyboard shortcuts and the tests all address tools by id.
 */
import { selectTool } from "./select.ts"
import { twoPointTool } from "./two-point.ts"
import { arcTool, polylineTool } from "./chained.ts"
import type { ToolFactory, ToolId } from "./tool.ts"
import { emptyContext, type ToolContext } from "./tool.ts"
import { gestureTool } from "./annotation-transform.ts"

export * from "./tool.ts"
export { selectTool, selectionOf, selectionBand, CLICK_SLOP } from "./select.ts"
export type { SelectState } from "./select.ts"
export { twoPointTool, MIN_GESTURE } from "./two-point.ts"
export { polylineTool, arcTool, committed } from "./chained.ts"

/**
 * Only implemented machines appear here; callers can disable unavailable tools.
 */
export const TOOL_FACTORIES: Readonly<Partial<Record<ToolId, ToolFactory>>> = {
  select: selectTool(() => []),
  line: twoPointTool("line"),
  rectangle: twoPointTool("rectangle"),
  circle: twoPointTool("circle"),
  ellipse: twoPointTool("ellipse"),
  polyline: polylineTool(),
  arc: arcTool(),
  text: gestureTool("text", () => emptyContext),
  dimension: gestureTool("dimension", () => emptyContext),
  move: gestureTool("move", () => emptyContext),
  rotate: gestureTool("rotate", () => emptyContext),
  scale: gestureTool("scale", () => emptyContext),
  mirror: gestureTool("mirror", () => emptyContext)
}

/** Tool ids that currently have a working machine. */
export const AVAILABLE_TOOLS: ReadonlyArray<ToolId> = Object.keys(TOOL_FACTORIES) as ReadonlyArray<ToolId>

/** Starts a tool by id, or `undefined` when that tool is not implemented yet. */
export const startTool = (
  id: ToolId,
  lookup?: Parameters<typeof selectTool>[0],
  context: () => ToolContext = () => emptyContext,
  text?: () => string
): ReturnType<ToolFactory> | undefined => {
  if (id === "select" && lookup !== undefined) return selectTool(lookup)()
  if (id === "text" || id === "dimension" || id === "move" || id === "rotate" || id === "scale" || id === "mirror") return gestureTool(id, context, text)()
  return TOOL_FACTORIES[id]?.()
}
