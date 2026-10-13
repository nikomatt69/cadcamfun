import { actionsOf } from "../actions/catalogue.ts"
import { defineActionTool } from "./action.ts"

/** Every read of the machining side: the machine, the operations, the stock, the chain, static analysis and what the verifier says. */
export const camTool = defineActionTool("cam", actionsOf("cam"))
