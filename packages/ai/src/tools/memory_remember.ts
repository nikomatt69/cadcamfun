import { projectMemoryPrefix } from "../project-memory.ts"
import { z } from "zod"
import { defineTool } from "./define.ts"

export const memoryRemember = defineTool("memory_remember", {
  parameters: z.object({ key: z.string().regex(/^[A-Za-z0-9_.-]{1,80}$/), value: z.string().min(1).max(2000) }),
  execute: ({ key, value }, { handlers, projectId }) => handlers.remember(`${projectMemoryPrefix(projectId)}${key}`, value)
})
