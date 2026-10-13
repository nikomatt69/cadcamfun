import { actionsOf } from "../actions/catalogue.ts"
import { defineActionTool } from "./action.ts"

/** Read-only view of what the user owns: reusable components, materials, cutters and machine configurations. */
export const libraryTool = defineActionTool("library", actionsOf("library"))
