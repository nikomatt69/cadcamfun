/**
 * `cam_edit` — the writes of the machining side: an operation is created, changed, programmed and verified, and the
 * stock is set. Every one of them stores something: a program, a report or the stock itself. That is why the
 * read-only roles have `cam` and never this tool, even though verifying is mostly computation.
 */
import { CAM_ACTION_INPUTS } from "@cadcamfun/api"
import { defineWireAction, type ActionSpec } from "./action.ts"

export const CAM_EDIT_ACTIONS: ReadonlyArray<ActionSpec> = [
  defineWireAction({
    id: "cam_edit.manufacture", kind: "write", parameters: CAM_ACTION_INPUTS["cam_edit.manufacture"],
    run: (input, { handlers, projectId }) => handlers.manufactureOperation?.(projectId, input) ?? { ok: false, error: "Native CAM program storage is unavailable in this host." }
  }),
  defineWireAction({
    id: "cam_edit.create", kind: "write", replaces: "cam_create_operation",
    parameters: CAM_ACTION_INPUTS["cam_edit.create"],
    run: ({ type, params, expectedRevision }, { handlers, projectId }) => handlers.createOperation(projectId, { type, params: params ?? {}, ...(expectedRevision !== undefined ? { expectedRevision } : {}) })
  }),
  defineWireAction({
    id: "cam_edit.update", kind: "write", replaces: "cam_update_operation",
    parameters: CAM_ACTION_INPUTS["cam_edit.update"],
    run: ({ operationId, params, expectedRevision }, { handlers, projectId }) => handlers.updateOperation(projectId, operationId, params, expectedRevision)
  }),
  defineWireAction({
    id: "cam_edit.generate", kind: "write", replaces: "cam_generate_gcode",
    parameters: CAM_ACTION_INPUTS["cam_edit.generate"],
    run: async ({ operationId, maxLines = 40 }, { handlers, projectId }) => {
      const result = await handlers.generateGcode(projectId, operationId)
      if ("_tag" in result) return result
      return { stats: result.stats, preview: result.gcode.split("\n").slice(0, maxLines).join("\n") }
    }
  }),
  defineWireAction({
    // Regenerates the program and stores it with the report on the operation, which is why it is a write.
    id: "cam_edit.verify", kind: "write", replaces: "cam_verify_toolpath",
    parameters: CAM_ACTION_INPUTS["cam_edit.verify"],
    run: ({ operationId, tool, fixtures, targetSolids, stock, resolution, tolerance, start }, { handlers, projectId }) =>
      // The shared contract has already decoded the geometry and verification options.
      handlers.verifyOperation(projectId, operationId, {
        ...(tool !== undefined ? { tool } : {}),
        ...(fixtures !== undefined ? { fixtures } : {}),
        ...(targetSolids !== undefined ? { targetSolids } : {}),
        ...(stock !== undefined ? { stock } : {}),
        ...(resolution !== undefined ? { resolution } : {}),
        ...(tolerance !== undefined ? { tolerance } : {}),
        ...(start !== undefined ? { start } : {})
      })
  }),
  defineWireAction({
    id: "cam_edit.stock_set", kind: "write", replaces: "cam_stock",
    parameters: CAM_ACTION_INPUTS["cam_edit.stock_set"],
    run: ({ stock }, { handlers, projectId }) =>
      handlers.stock === undefined
        ? Promise.resolve({ ok: false, error: "Stock management is unavailable in this host." })
        : handlers.stock(projectId, { action: "set", stock })
  })
]
