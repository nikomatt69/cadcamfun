import { actionsOf } from "../actions/catalogue.ts"
import { defineActionTool } from "./action.ts"

/** Every read of the open drawing. Nothing here changes it: describing, inspecting, checking, searching, vision and the parametric reads. */
export const cadTool = defineActionTool("cad", actionsOf("cad"))
