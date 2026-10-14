/**
 * `vcs` and `vcs_edit` — the git-style history of the project. Reads are open to every role; starting a change,
 * committing, restoring and opening the pull request belong to the agent that owns the change, and running the
 * project's workflows is a write because a workflow can write anything the project can.
 *
 * The sidecar contributes the implementations (it owns the version-control service); the catalogue owns the ids,
 * the effects and the validation, so a specialist's allow-list and the UI's rename cannot drift from each other.
 */
import { VCS_ACTION_INPUTS as INPUTS } from "@cadcamfun/api"
import { contributedAction, type ActionSpec } from "./action.ts"

export const VCS_ACTIONS: ReadonlyArray<ActionSpec> = [
  contributedAction({ id: "vcs.status", kind: "read", replaces: "vcs_status", contribution: "vcs.status", parameters: INPUTS["vcs.status"] }),
  contributedAction({ id: "vcs.diff", kind: "read", replaces: "vcs_diff", contribution: "vcs.diff", parameters: INPUTS["vcs.diff"] }),
  contributedAction({ id: "vcs.list_pull_requests", kind: "read", replaces: "vcs_list_pull_requests", contribution: "vcs.list_pull_requests", parameters: INPUTS["vcs.list_pull_requests"] })
]

export const VCS_EDIT_ACTIONS: ReadonlyArray<ActionSpec> = [
  contributedAction({ id: "vcs_edit.start_change", kind: "write", replaces: "vcs_start_change", contribution: "vcs_edit.start_change", parameters: INPUTS["vcs_edit.start_change"] }),
  contributedAction({ id: "vcs_edit.commit", kind: "write", replaces: "vcs_commit", contribution: "vcs_edit.commit", parameters: INPUTS["vcs_edit.commit"] }),
  contributedAction({
    // Rolling named entities back to an earlier commit throws work away: destructive, so the tool is `ask`.
    id: "vcs_edit.restore", kind: "destructive", replaces: "vcs_restore_paths", contribution: "vcs_edit.restore",
    parameters: INPUTS["vcs_edit.restore"]
  }),
  contributedAction({
    id: "vcs_edit.open_pull_request", kind: "write", replaces: "vcs_open_pull_request", contribution: "vcs_edit.open_pull_request",
    parameters: INPUTS["vcs_edit.open_pull_request"]
  }),
  contributedAction({
    id: "vcs_edit.run_workflows", kind: "write", replaces: "actions_run", contribution: "vcs_edit.run_workflows",
    parameters: INPUTS["vcs_edit.run_workflows"]
  })
]