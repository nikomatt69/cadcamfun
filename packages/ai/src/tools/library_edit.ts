import { actionsOf } from "../actions/catalogue.ts"
import { defineActionTool } from "./action.ts"

/** Create, replace or remove rows of the user's libraries and set a project's defaults. */
export const libraryEditTool = defineActionTool("library_edit", actionsOf("library_edit"))
