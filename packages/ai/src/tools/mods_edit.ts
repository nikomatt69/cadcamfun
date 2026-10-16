import { actionsOf } from "../actions/catalogue.ts"
import { defineActionTool } from "./action.ts"

/**
 * The mods the persona writes, arms and removes. The tool is `destructive` as a whole: `remove` deletes source that
 * nothing can restore, and the host asks the person before a tool whose group contains one, exactly as the effect
 * classes require.
 */
export const modsEditTool = defineActionTool("mods_edit", actionsOf("mods_edit"))
