import { z } from "zod"
import { defineTool } from "./define.ts"

/** What the editor can be told to do besides editing elements: layers, the view, the selection, what is shown. */
export const EDITOR_ACTIONS = [
  "layer_create", "layer_rename", "layer_color", "layer_show", "layer_hide", "layer_lock", "layer_unlock", "layer_delete", "layer_activate",
  "view_3d", "view_2d", "view_fit", "section_on", "section_off", "select", "select_none", "show", "hide", "isolate", "undo", "redo"
] as const

const action = z.object({
  action: z.enum(EDITOR_ACTIONS),
  layer: z.string().optional(),
  newName: z.string().optional(),
  color: z.string().optional(),
  moveTo: z.string().optional(),
  ids: z.array(z.string()).optional(),
  /** section_on: the axis the cut is made along, where on it (mm), and which side is kept. */
  axis: z.enum(["x", "y", "z"]).optional(),
  position: z.number().finite().optional(),
  inverted: z.boolean().optional()
})

const NEEDS_LAYER = new Set(["layer_create", "layer_rename", "layer_color", "layer_show", "layer_hide", "layer_lock", "layer_unlock", "layer_delete", "layer_activate"])
const NEEDS_IDS = new Set(["select", "show", "hide", "isolate"])

export const cadEditor = defineTool("cad_editor", {
  parameters: z.object({ actions: z.array(action).min(1).max(40) }),
  // The layers, the view and the selection live in the open editor, not in the stored drawing: this checks the actions are
  // complete and hands them back; the editor performs them when it reads the result.
  execute: async ({ actions }) => {
    const problems = actions.flatMap((a, index) => {
      if (NEEDS_LAYER.has(a.action) && (a.layer === undefined || a.layer.trim() === "")) return [`actions[${index}] ${a.action} needs "layer"`]
      if (a.action === "layer_rename" && (a.newName === undefined || a.newName.trim() === "")) return [`actions[${index}] layer_rename needs "newName"`]
      if (a.action === "layer_color" && !/^#[0-9a-fA-F]{6}$/.test(a.color ?? "")) return [`actions[${index}] layer_color needs "color" as #rrggbb`]
      if (a.action === "section_on" && a.position === undefined) return [`actions[${index}] section_on needs "position" (mm along the axis)`]
      if (NEEDS_IDS.has(a.action) && (a.ids === undefined || a.ids.length === 0)) return [`actions[${index}] ${a.action} needs "ids"`]
      return []
    })
    if (problems.length > 0) return { ok: false, error: "Nothing was done.", problems }
    return { ok: true, actions, note: "The editor performs these actions as it reads this result." }
  }
})
