import { projectMemoryPrefix } from "../project-memory.ts"
import { z } from "zod"
import { defineTool } from "./define.ts"

export const memoryRecall = defineTool("memory_recall", {
  parameters: z.object({ prefix: z.string().optional() }),
  execute: async ({ prefix }, { handlers, projectId }) => {
    const namespace = projectMemoryPrefix(projectId)
    const result = z.array(z.object({ key: z.string(), value: z.unknown() })).safeParse(await handlers.recall(`${namespace}${prefix ?? ""}`))
    if (!result.success) return { ok: false, error: "Project memory returned an invalid result." }
    return result.data.filter((note) => note.key.startsWith(namespace)).map((note) => ({ ...note, key: note.key.slice(namespace.length) }))
  }
})
