import { actionsOf } from "../actions/catalogue.ts"
import { defineActionTool } from "./action.ts"

/** Every change to the open drawing: adding, modifying, transforming, grouping, deleting, importing and creating or updating a parametric part. */
export const cadEditTool = defineActionTool("cad_edit", actionsOf("cad_edit"))
