import { actionsOf } from "../actions/catalogue.ts"
import { defineActionTool } from "./action.ts"

/** What the assistant keeps between conversations: the project's notes and its standing context document. */
export const memoryTool = defineActionTool("memory", actionsOf("memory"))
