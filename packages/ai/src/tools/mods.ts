import { actionsOf } from "../actions/catalogue.ts"
import { defineActionTool } from "./action.ts"

/** What the assistant has built into this installation: the mods it stores and the ones the host has loaded. */
export const modsTool = defineActionTool("mods", actionsOf("mods"))
