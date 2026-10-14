/**
 * `library` and `parts` and `library_edit` — the user's own reusable data: saved components, materials, cutters and
 * machine configurations. Reading is separated from writing because the host's permissions are keyed by tool id:
 * a specialist that may look up the shop's aluminium must not be able to delete a cutter from it.
 *
 * The catalogue owns the identity, the effect and the validation of every one of these actions; the sidecar
 * contributes the implementation (it is the only thing that can reach the repositories). Nothing declares them twice.
 */
import { LIBRARY_ACTION_INPUTS as INPUTS } from "@cadcamfun/api"
import { contributedAction, defineWireAction, type ActionSpec } from "./action.ts"

export const LIBRARY_ACTIONS: ReadonlyArray<ActionSpec> = [
  contributedAction({ id: "library.component_list", kind: "read", replaces: "cad_component_list", contribution: "library.component_list", parameters: INPUTS["library.component_list"] }),
  contributedAction({ id: "library.lookup_component", kind: "read", replaces: "lib_lookup_component", contribution: "library.lookup_component", parameters: INPUTS["library.lookup_component"] }),
  defineWireAction({
    id: "library.lookup_material", kind: "read", replaces: "lib_lookup_material", parameters: INPUTS["library.lookup_material"],
    run: ({ query }, { handlers }) => handlers.lookupMaterial(query)
  }),
  defineWireAction({
    id: "library.lookup_tool", kind: "read", replaces: "lib_lookup_tool", parameters: INPUTS["library.lookup_tool"],
    run: ({ query }, { handlers }) => handlers.lookupTool(query)
  }),
  contributedAction({ id: "library.lookup_machine_config", kind: "read", replaces: "lib_lookup_machine_config", contribution: "library.lookup_machine_config", parameters: INPUTS["library.lookup_machine_config"] })
]

export const PARTS_ACTIONS: ReadonlyArray<ActionSpec> = [
  contributedAction({ id: "parts.save", kind: "write", replaces: "cad_component_save", contribution: "parts.save", parameters: INPUTS["parts.save"] }),
  contributedAction({ id: "parts.insert", kind: "write", replaces: "cad_component_insert", contribution: "parts.insert", parameters: INPUTS["parts.insert"] }),
  // Removing a saved part is the destructive action of the group: the whole tool is registered as `ask`.
  contributedAction({ id: "parts.delete", kind: "destructive", replaces: "cad_component_delete", contribution: "parts.delete", parameters: INPUTS["parts.delete"] })
]

export const LIBRARY_EDIT_ACTIONS: ReadonlyArray<ActionSpec> = [
  contributedAction({ id: "library_edit.upsert_material", kind: "write", replaces: "lib_upsert_material", contribution: "library_edit.upsert_material", parameters: INPUTS["library_edit.upsert_material"] }),
  contributedAction({ id: "library_edit.upsert_tool", kind: "write", replaces: "lib_upsert_tool", contribution: "library_edit.upsert_tool", parameters: INPUTS["library_edit.upsert_tool"] }),
  contributedAction({ id: "library_edit.upsert_machine_config", kind: "write", replaces: "lib_upsert_machine_config", contribution: "library_edit.upsert_machine_config", parameters: INPUTS["library_edit.upsert_machine_config"] }),
  contributedAction({ id: "library_edit.set_default", kind: "write", replaces: "lib_set_default", contribution: "library_edit.set_default", parameters: INPUTS["library_edit.set_default"] }),
  // Removing a library row cannot be undone from the assistant's side.
  contributedAction({ id: "library_edit.delete", kind: "destructive", replaces: "lib_delete", contribution: "library_edit.delete", parameters: INPUTS["library_edit.delete"] })
]
