import { z } from "zod"
import { defineTool } from "./define.ts"

export const memoryRecall = defineTool("memory_recall", {
  parameters: z.object({ prefix: z.string().optional() }),
  execute: ({ prefix }, { handlers }) => handlers.recall(prefix)
})
