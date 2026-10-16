/**
 * `mods` and `mods_edit` — the mods the assistant authors and manages (spec 27 §4.3, RM-11).
 *
 * A mod is a nikcli extension module the host imports from the app's isolated configuration: its hooks can observe and
 * rewrite tool calls, the prompt and the session. The assistant writes one as plain source (`mods_edit.save`), decides
 * whether the host may load it (`mods_edit.set_enabled`) and removes it again (`mods_edit.remove`); `mods` reads the
 * store and what the live host actually loaded.
 *
 * The implementations are contributions: they need the file store *and* the live runtime (`reloadMods`, `loadedMods`),
 * and the runtime is built above the tool handlers. `nikcli/mod-tools.ts` supplies them.
 */
import { MOD_ACTION_INPUTS as INPUTS } from "@cadcamfun/api"
import { contributedAction, type ActionSpec } from "./action.ts"

export const MOD_ACTIONS: ReadonlyArray<ActionSpec> = [
  contributedAction({ id: "mods.list", kind: "read", replaces: "mods_list", contribution: "mods.list", parameters: INPUTS["mods.list"] }),
  contributedAction({ id: "mods.read", kind: "read", replaces: "mods_read", contribution: "mods.read", parameters: INPUTS["mods.read"] })
]

export const MOD_EDIT_ACTIONS: ReadonlyArray<ActionSpec> = [
  contributedAction({ id: "mods_edit.save", kind: "write", replaces: "mods_save", contribution: "mods_edit.save", parameters: INPUTS["mods_edit.save"] }),
  contributedAction({ id: "mods_edit.set_enabled", kind: "write", replaces: "mods_set_enabled", contribution: "mods_edit.set_enabled", parameters: INPUTS["mods_edit.set_enabled"] }),
  // The module is deleted, not disabled: nothing can restore it, so the group asks the person before every call.
  contributedAction({ id: "mods_edit.remove", kind: "destructive", replaces: "mods_remove", contribution: "mods_edit.remove", parameters: INPUTS["mods_edit.remove"] })
]
