import { actionsOf } from "../actions/catalogue.ts"
import { defineActionTool } from "./action.ts"

/** Read the world outside the drawing: a web search and the files attached to the conversation. */
export const researchTool = defineActionTool("research", actionsOf("research"))
