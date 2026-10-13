import { actionsOf } from "../actions/catalogue.ts"
import { defineActionTool } from "./action.ts"

/** Read-only version control: where the project stands, what changed and which pull requests are open. */
export const vcsTool = defineActionTool("vcs", actionsOf("vcs"))
