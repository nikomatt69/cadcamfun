/**
 * The one place a chat turn's context is acquired (AI-11 Step 6). Before anything stored is read the request is
 * authorised: the actor must reach the project. Then each source is read once, labelled with what it is to the model, and
 * handed to `assembleContext` (`@cadcamfun/ai`), which orders, deduplicates and budgets them and reports a manifest.
 *
 * Disabled context (`includeContext: false`) acquires nothing: only the text the client sent for this turn is delivered.
 * The host's own automatic profile/habits injection is switched off by the `profile-reminder` host patch, so the habits
 * reach the model once, here, and not at all when context is disabled.
 */
import {
  assembleContext, notesByRecency, parseProjectContext, projectContextKey, projectMemoryPrefix, readProjectMemoryFiles,
  renderNotes, renderProjectContext, renderProjectMemory, renderUserHabits, renderWorkspaceContext,
  type AiHost, type ContextAssembly, type ContextRequest, type ContextSource
} from "@cadcamfun/ai"
import { Effect, Option } from "effect"
import type { KvStore } from "./kv.ts"
import type { ProjectRepo } from "../repos/project-repo.ts"

export class ContextAccessDenied extends Error {
  constructor() {
    super("Project not found or inaccessible")
    this.name = "ContextAccessDenied"
  }
}

export interface AiContextDeps {
  readonly kv: KvStore["Service"]
  readonly projects: ProjectRepo["Service"]
  readonly host: Option.Option<AiHost["Service"]>
}

export const makeAiContext = ({ kv, projects, host }: AiContextDeps) => {
  const read = <A>(label: string, effect: Effect.Effect<A, unknown>, fallback: A) =>
    effect.pipe(Effect.catch((error) => Effect.logWarning(`Unable to load ${label}`, error).pipe(Effect.as(fallback))))

  /** Reads the sources the request may see; fails with `ContextAccessDenied` before reading anything it may not. */
  const sources = (request: ContextRequest) => Effect.gen(function*() {
    const out: ContextSource[] = []
    if (request.explicit?.trim()) out.push({ id: "client-observation", kind: "observation", label: "editor state sent with this message", text: request.explicit.trim() })
    if (!request.includeContext) return out
    const projectId = request.projectId
    if (projectId !== undefined && projectId !== "default") {
      const access = yield* projects.find(request.actorId, projectId).pipe(Effect.mapError(() => new ContextAccessDenied()))
      if (!access) return yield* Effect.fail(new ContextAccessDenied())
      const snapshot = yield* read("saved AI context", kv.get(`ai.context.${projectId}`), undefined)
      if (snapshot) out.push({
        id: "workspace-snapshot", kind: "ui-snapshot", label: "saved editor snapshot", at: Date.parse(snapshot.updatedAt),
        text: typeof snapshot.value === "string" ? snapshot.value : renderWorkspaceContext(snapshot.value, { projectId })
      })
      const document = yield* read("the project AI context", kv.get(projectContextKey(projectId)), undefined)
      out.push({ id: "project-rules", kind: "requirement", label: "project rules", text: renderProjectContext(document === undefined ? undefined : parseProjectContext(document.value).text) })
      // Brain's files live in the project's scratch folder; without an embedded host there is no Brain and no habits file.
      if (Option.isSome(host)) {
        const projectHost = yield* read("the project's AI host", host.value.runtime.host(projectId), undefined)
        const files = projectHost === undefined ? undefined
          : yield* read("the project memory files", Effect.tryPromise({ try: () => readProjectMemoryFiles(projectHost), catch: (cause) => cause }), undefined)
        if (files !== undefined) {
          out.push({ id: "brain-memory", kind: "memory", label: "project memory", text: renderProjectMemory(files.memory) })
          out.push({ id: "user-habits", kind: "memory", label: "user habits", text: renderUserHabits(files.habits) })
        }
      }
    }
    const prefix = `ai.memory.${projectMemoryPrefix(projectId ?? "default")}`
    const notes = yield* read("saved AI notes", kv.list(prefix), [])
    out.push({ id: "notes", kind: "memory", label: "saved notes", text: renderNotes(notesByRecency(notes).map((note) => ({ key: note.key.slice(prefix.length), value: note.value }))) })
    return out
  })

  return {
    sources,
    /** The context for one turn: the assembled text and what was included, truncated or left out. */
    assemble: (request: ContextRequest): Effect.Effect<ContextAssembly, ContextAccessDenied> =>
      sources(request).pipe(Effect.map((all) => assembleContext(all, request.budget)))
  }
}
