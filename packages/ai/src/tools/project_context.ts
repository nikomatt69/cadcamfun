import { applyProjectContextSection, MAX_PROJECT_CONTEXT_CHARS, projectContextKey } from "../project-context.ts"
import { z } from "zod"
import { defineTool } from "./define.ts"

const document = z.object({ text: z.string(), updatedAt: z.string().optional() })

export const projectContext = defineTool("project_context", {
  parameters: z.object({
    action: z.enum(["read", "update"]),
    heading: z.string().trim().min(1).max(80).optional(),
    content: z.string().min(1).max(2_000).optional(),
    confirm: z.boolean().optional()
  }),
  execute: async ({ action, heading, content, confirm }, { handlers, projectId }) => {
    const current = document.safeParse(await handlers.projectContext(projectId))
    const text = current.success ? current.data.text : ""
    const updatedAt = current.success ? current.data.updatedAt : undefined
    if (action === "read") return { ok: true, text, ...(updatedAt !== undefined ? { updatedAt } : {}) }
    if (confirm !== true) return { ok: false, error: "Updating this project's standing rules changes every later conversation. Call it again with confirm: true." }
    if (heading === undefined || content === undefined) return { ok: false, error: "heading and content are required to update the project context." }
    const next = applyProjectContextSection(text, heading, content)
    if (next === undefined) return { ok: false, error: `The section could not be written: an empty body or a document over ${MAX_PROJECT_CONTEXT_CHARS} characters.` }
    const saved = await handlers.saveProjectContext(projectId, next)
    const after = document.safeParse(saved)
    // The store is the source of truth: report what it actually kept, not what this tool intended to write.
    if (!after.success || after.data.text !== next) return { ok: false, error: "The project context was not stored." }
    return { ok: true, text: after.data.text, ...(after.data.updatedAt !== undefined ? { updatedAt: after.data.updatedAt } : {}), changed: true }
  }
})

/** The key the handler stores under; exported so the HTTP layer and this tool cannot drift apart. */
export { projectContextKey }
