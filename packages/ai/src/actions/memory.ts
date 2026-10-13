/**
 * `memory` and `memory_edit` — what the assistant keeps between conversations (project notes) and the project's
 * standing context document. Reading and writing are two tools because the notes of the whole product are shared:
 * a read-only specialist may look at what the project decided, never change it.
 */
import { z } from "zod"
import { projectMemoryPrefix } from "../project-memory.ts"
import { applyProjectContextSection, MAX_PROJECT_CONTEXT_CHARS, projectContextKey } from "../project-context.ts"
import { defineAction, type ActionSpec } from "./action.ts"

const document = z.object({ text: z.string(), updatedAt: z.string().optional() })

export const MEMORY_ACTIONS: ReadonlyArray<ActionSpec> = [
  defineAction({
    id: "memory.recall", kind: "read", replaces: "memory_recall",
    parameters: z.object({ prefix: z.string().optional() }),
    run: async ({ prefix }, { handlers, projectId }) => {
      const namespace = projectMemoryPrefix(projectId)
      const result = z.array(z.object({ key: z.string(), value: z.unknown() })).safeParse(await handlers.recall(`${namespace}${prefix ?? ""}`))
      if (!result.success) return { ok: false, error: "Project memory returned an invalid result." }
      return result.data.filter((note) => note.key.startsWith(namespace)).map((note) => ({ ...note, key: note.key.slice(namespace.length) }))
    }
  }),
  defineAction({
    id: "memory.context_read", kind: "read", replaces: "project_context",
    parameters: z.object({}),
    run: async (_input, { handlers, projectId }) => {
      const entry = await handlers.projectContext(projectId)
      // An absent row is an empty document, not a failure: a project that never had rules reads as blank.
      return entry === undefined ? { text: "" } : entry
    }
  })
]

export const MEMORY_EDIT_ACTIONS: ReadonlyArray<ActionSpec> = [
  defineAction({
    id: "memory_edit.remember", kind: "write", replaces: "memory_remember",
    parameters: z.object({ key: z.string().regex(/^[A-Za-z0-9_.-]{1,80}$/), value: z.string().min(1).max(2000) }),
    run: ({ key, value }, { handlers, projectId }) => handlers.remember(`${projectMemoryPrefix(projectId)}${key}`, value)
  }),
  defineAction({
    id: "memory_edit.context_update", kind: "write", replaces: "project_context",
    parameters: z.object({ heading: z.string().trim().min(1).max(80), content: z.string().min(1).max(2_000) }),
    run: async ({ heading, content }, { handlers, projectId }) => {
      const current = document.safeParse(await handlers.projectContext(projectId))
      const next = applyProjectContextSection(current.success ? current.data.text : "", heading, content)
      if (next === undefined) return { ok: false, error: `The section could not be written: an empty body or a document over ${MAX_PROJECT_CONTEXT_CHARS} characters.` }
      const saved = await handlers.saveProjectContext(projectId, next)
      const after = document.safeParse(saved)
      // The store is the source of truth: report what it actually kept, not what this action intended to write.
      if (!after.success || after.data.text !== next) return { ok: false, error: "The project context was not stored." }
      return { ok: true, text: after.data.text, ...(after.data.updatedAt !== undefined ? { updatedAt: after.data.updatedAt } : {}), changed: true }
    }
  })
]

/** The key the handler stores the project's standing context under; exported so the HTTP layer cannot drift from it. */
export { projectContextKey }