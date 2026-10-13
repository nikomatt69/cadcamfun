import { actionsOf } from "../actions/catalogue.ts"
import { defineActionTool } from "./action.ts"

/** Reusable parts: gather elements into a saved component, place one in the drawing and remove it. */
export const partsTool = defineActionTool("parts", actionsOf("parts"))
