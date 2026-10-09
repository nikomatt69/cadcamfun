import { z } from "zod"
import { cam } from "@cadcamfun/core"
import { defineTool, validated } from "./define.ts"
const stock = z.object({ width: z.number().finite().positive(), height: z.number().finite().positive(), depth: z.number().finite().positive(), radius: z.number().finite().nonnegative().default(0), x: z.number().finite().default(0), y: z.number().finite().default(0), topZ: z.number().finite().default(0), allowance: z.number().finite().nonnegative().default(1), material: z.string().max(200).optional(), elementId: z.string().min(1).optional() })
export const camStockInputSchema = z.discriminatedUnion("action", [z.object({ action: z.literal("inspect") }), z.object({ action: z.literal("set"), stock })])
export type CamStockInput = z.infer<typeof camStockInputSchema>
export const camStock = defineTool("cam_stock", {
  parameters: camStockInputSchema,
  execute: (input, { handlers, projectId }) => handlers.stock ? handlers.stock(projectId, input.action === "set" ? { action: "set", stock: validated(cam.generator.StockSchema, input.stock) } : input) : Promise.resolve({ ok: false, error: "Stock management is unavailable in this host." })
})
