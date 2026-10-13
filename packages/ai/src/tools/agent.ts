import { actionsOf } from "../actions/catalogue.ts"
import { defineActionTool } from "./action.ts"

/** Delegation to a specialist agent: start one, list them, read the report, cancel one. */
export const agentTool = defineActionTool("agent", actionsOf("agent"))
