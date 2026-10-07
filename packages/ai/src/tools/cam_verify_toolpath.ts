import { Schema } from "effect"
import { z } from "zod"
import { cad, cam } from "@cadcamfun/core"
import { defineTool, validated } from "./define.ts"
import type { VerifyToolOptions } from "./handlers.ts"

const bounds = z.object({ minX: z.number(), maxX: z.number(), minY: z.number(), maxY: z.number(), minZ: z.number(), maxZ: z.number() })

/** Replays an operation's G-code against its stock: removal, collisions, gouges. */
export const camVerifyToolpath = defineTool("cam_verify_toolpath", {
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
  execute: ({ operationId, tool, fixtures, targetSolids, stock, resolution, tolerance }, { handlers, projectId }) => {
    // The handler gets Effect-validated shapes, so zod and Effect cannot drift apart silently.
    const options: VerifyToolOptions = {
      ...(tool !== undefined ? { tool } : {}),
      ...(fixtures !== undefined ? { fixtures: validated(Schema.Array(cam.verify.VerifyFixtureSchema), fixtures) } : {}),
      ...(targetSolids !== undefined ? { targetSolids: validated(Schema.Array(cad.SolidSchema), targetSolids) } : {}),
      ...(stock !== undefined ? { stock: validated(cam.verify.BoundsSchema, stock) } : {}),
      ...(resolution !== undefined ? { resolution } : {}),
      ...(tolerance !== undefined ? { tolerance } : {})
    }
    return handlers.verifyOperation(projectId, operationId, options)
  }
})
