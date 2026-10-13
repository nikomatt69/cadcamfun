import { actionsOf } from "../actions/catalogue.ts"
import { defineActionTool } from "./action.ts"

/** Every write of the machining side: creating and updating operations, generating G-code, verifying a toolpath and setting the stock. */
export const camEditTool = defineActionTool("cam_edit", actionsOf("cam_edit"))
