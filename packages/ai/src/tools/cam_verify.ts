import { actionsOf } from "../actions/catalogue.ts"
import { defineActionTool } from "./action.ts"

/** The verifier's exposure of `cam_edit`: generate and verify an existing operation's program, and nothing else. */
export const camVerifyTool = defineActionTool("cam_verify", actionsOf("cam_verify"))
