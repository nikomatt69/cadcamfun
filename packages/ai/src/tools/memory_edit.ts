import { actionsOf } from "../actions/catalogue.ts"
import { defineActionTool } from "./action.ts"

/** Save a note or update the project's standing context document. */
export const memoryEditTool = defineActionTool("memory_edit", actionsOf("memory_edit"))
