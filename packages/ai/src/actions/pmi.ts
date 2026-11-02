/**
 * PMI actions (spec 49 P1): `cad.pmi_list` / `cad.pmi_validate` read, `cad_edit.pmi_set` writes the whole set
 * (validated, compare-and-swap on the drawing content hash in the sidecar handler). No other action may declare these.
 */
import { CAD_ACTION_INPUTS } from "@cadcamfun/api"
import { pmi } from "@cadcamfun/core"
import { defineWireAction, type ActionSpec } from "./action.ts"

export type CadPmiInput = { action: "list" } | { action: "set"; pmi: pmi.PmiSet }

export const PMI_READ_ACTIONS: ReadonlyArray<ActionSpec> = [
  defineWireAction({
    id: "cad.pmi_list", kind: "read", parameters: CAD_ACTION_INPUTS["cad.pmi_list"],
    run: (_input, { handlers, projectId }) =>
      handlers.cadPmi === undefined ? { ok: false, error: "PMI is unavailable in this host." } : handlers.cadPmi(projectId, { action: "list" })
  }),
  defineWireAction({
    id: "cad.pmi_validate", kind: "read", parameters: CAD_ACTION_INPUTS["cad.pmi_validate"],
    run: ({ pmi: candidate }) => {
      const set = pmi.pmiSetOf({ pmi: candidate })
      const issues = pmi.validatePmiSet(candidate as pmi.PmiSet)
      return { ok: true, valid: issues.length === 0, fingerprint: pmi.pmiFingerprint(set), issues }
    }
  })
]

export const PMI_WRITE_ACTIONS: ReadonlyArray<ActionSpec> = [
  defineWireAction({
    id: "cad_edit.pmi_set", kind: "write", parameters: CAD_ACTION_INPUTS["cad_edit.pmi_set"],
    run: ({ pmi: candidate }, { handlers, projectId }) =>
      handlers.cadPmi === undefined ? { ok: false, error: "PMI is unavailable in this host." } : handlers.cadPmi(projectId, { action: "set", pmi: candidate as pmi.PmiSet })
  })
]
