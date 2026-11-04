/**
 * The probing actions of `cam_edit` (spec 73 §3.3): store a probe operation with its program, simulate it on the part and keep the
 * report, write what the report measured into the machine's work offsets. A probe is a sensor: the stored program never starts a
 * spindle, and a program that would is refused here, whatever produced it.
 */
import { CAM_ACTION_INPUTS } from "@cadcamfun/api"
import { defineWireAction, type ActionSpec } from "./action.ts"

const unavailable = { ok: false, error: "Probing is unavailable in this host." }

export const CAM_PROBE_ACTIONS: ReadonlyArray<ActionSpec> = [
  defineWireAction({
    id: "cam_edit.probe", kind: "write", parameters: CAM_ACTION_INPUTS["cam_edit.probe"],
    run: (input, { handlers, projectId }) => handlers.probeOperation?.(projectId, input) ?? unavailable
  }),
  defineWireAction({
    id: "cam_edit.probe_run", kind: "write", parameters: CAM_ACTION_INPUTS["cam_edit.probe_run"],
    run: (input, { handlers, projectId, signal }) => handlers.probeRun?.(projectId, input, signal) ?? unavailable
  }),
  defineWireAction({
    id: "cam_edit.probe_apply", kind: "write", parameters: CAM_ACTION_INPUTS["cam_edit.probe_apply"],
    run: (input, { handlers, projectId }) => handlers.probeApply?.(projectId, input) ?? unavailable
  })
]
