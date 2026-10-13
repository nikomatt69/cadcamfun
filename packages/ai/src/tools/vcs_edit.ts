import { actionsOf } from "../actions/catalogue.ts"
import { defineActionTool } from "./action.ts"

/** Version control writes: start a change, commit, restore, open the pull request and run the project's workflows. */
export const vcsEditTool = defineActionTool("vcs_edit", actionsOf("vcs_edit"))
