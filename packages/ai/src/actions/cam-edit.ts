/**
 * `cam_edit` — the writes of the machining side: an operation is created, changed, programmed and verified, and the
 * stock is set. Every one of them stores something: a program, a report or the stock itself. That is why the
 * read-only roles have `cam` and never this tool, even though verifying is mostly computation.
 */
import { z } from "zod"
import { cad, cam } from "@cadcamfun/core"
import { Schema } from "effect"
import { validated } from "../tools/define.ts"
import { defineAction, type ActionSpec } from "./action.ts"

const bounds = z.object({ minX: z.number(), maxX: z.number(), minY: z.number(), maxY: z.number(), minZ: z.number(), maxZ: z.number() })

export const CAM_EDIT_ACTIONS: ReadonlyArray<ActionSpec> = [
  defineAction({
    id: "cam_edit.create", kind: "write", replaces: "cam_create_operation",
    parameters: z.object({ type: z.string().min(1), params: z.record(z.string(), z.unknown()).optional() }),
    run: ({ type, params }, { handlers, projectId }) => handlers.createOperation(projectId, { type, params: params ?? {} })
  }),
  defineAction({
    id: "cam_edit.update", kind: "write", replaces: "cam_update_operation",
    parameters: z.object({ operationId: z.string().min(1), params: z.record(z.string(), z.unknown()) }),
    run: ({ operationId, params }, { handlers, projectId }) => handlers.updateOperation(projectId, operationId, params)
  }),
  defineAction({
    id: "cam_edit.generate", kind: "write", replaces: "cam_generate_gcode",
    parameters: z.object({ operationId: z.string().optional(), maxLines: z.number().int().min(1).max(200).optional() }),
    run: async ({ operationId, maxLines = 40 }, { handlers, projectId }) => {
      const result = await handlers.generateGcode(projectId, operationId)
      return { stats: result.stats, preview: result.gcode.split("\n").slice(0, maxLines).join("\n") }
    }
  }),
  defineAction({
    // Regenerates the program and stores it with the report on the operation, which is why it is a write.
    id: "cam_edit.verify", kind: "write", replaces: "cam_verify_toolpath",
    parameters: z.object({
      operationId: z.string().min(1),
      tool: z.object({
        cuttingLength: z.number().positive().optional(), shankDiameter: z.number().positive().optional(), stickout: z.number().positive().optional(),
        holderDiameter: z.number().positive().optional(), holderLength: z.number().positive().optional()
      }).optional(),
      fixtures: z.array(z.object({ id: z.string().min(1), bounds })).max(50).optional(),
      targetSolids: z.array(z.record(z.string(), z.unknown())).max(20).optional(),
      stock: bounds.optional(),
      resolution: z.number().positive().optional(), tolerance: z.number().min(0).optional()
    }),
    run: ({ operationId, tool, fixtures, targetSolids, stock, resolution, tolerance }, { handlers, projectId }) =>
      // The handler gets Effect-validated shapes, so zod and Effect cannot drift apart silently.
      handlers.verifyOperation(projectId, operationId, {
        ...(tool !== undefined ? { tool } : {}),
        ...(fixtures !== undefined ? { fixtures: validated(Schema.Array(cam.verify.VerifyFixtureSchema), fixtures) } : {}),
        ...(targetSolids !== undefined ? { targetSolids: validated(Schema.Array(cad.SolidSchema), targetSolids) } : {}),
        ...(stock !== undefined ? { stock: validated(cam.verify.BoundsSchema, stock) } : {}),
        ...(resolution !== undefined ? { resolution } : {}),
        ...(tolerance !== undefined ? { tolerance } : {})
      })
  }),
  defineAction({
    id: "cam_edit.stock_set", kind: "write", replaces: "cam_stock",
    parameters: z.object({
      stock: z.object({
        width: z.number().finite().positive(), height: z.number().finite().positive(), depth: z.number().finite().positive(),
        radius: z.number().finite().nonnegative().default(0), x: z.number().finite().default(0), y: z.number().finite().default(0),
        topZ: z.number().finite().default(0), allowance: z.number().finite().nonnegative().default(1),
        material: z.string().max(200).optional(), elementId: z.string().min(1).optional()
      })
    }),
    run: ({ stock }, { handlers, projectId }) =>
      handlers.stock === undefined
        ? Promise.resolve({ ok: false, error: "Stock management is unavailable in this host." })
        : handlers.stock(projectId, { action: "set", stock: validated(cam.generator.StockSchema, stock) })
  })
]